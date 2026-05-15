import AppKit
import Darwin
import Dispatch
import Foundation

// `swift run dev [path]` — spawn the Swift backend and the Vite dev server side by side,
// prefix their stdout/stderr so they're distinguishable, open the Vite URL when ready, and
// tear both children down cleanly on Ctrl+C.

let args = CommandLine.arguments
let pathArg = args.count >= 2 ? args[1] : FileManager.default.currentDirectoryPath
let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let frontendDir = cwd.appendingPathComponent("frontend")

guard FileManager.default.fileExists(atPath: frontendDir.path) else {
    fputs("dev: frontend/ not found — run `swift run dev` from the repo root\n", stderr)
    exit(1)
}

let nodeModules = frontendDir.appendingPathComponent("node_modules")
if !FileManager.default.fileExists(atPath: nodeModules.path) {
    print("[dev] frontend/node_modules missing — running `npm install`…")
    fflush(stdout)
    let install = Process()
    install.currentDirectoryURL = frontendDir
    install.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    install.arguments = ["npm", "install"]
    install.standardOutput = FileHandle.standardOutput
    install.standardError = FileHandle.standardError
    do {
        try install.run()
    } catch {
        fputs("dev: failed to start npm install: \(error)\n", stderr)
        exit(1)
    }
    install.waitUntilExit()
    if install.terminationStatus != 0 {
        fputs("dev: `npm install` failed (exit \(install.terminationStatus))\n", stderr)
        exit(1)
    }
}

// Pre-build reed so its build output isn't interleaved with the [reed] runtime prefix —
// SPM's progress bar would look terrible filtered through our line-prefixer.
print("[dev] building reed…")
fflush(stdout)
let build = Process()
build.executableURL = URL(fileURLWithPath: "/usr/bin/env")
build.arguments = ["swift", "build", "--product", "reed"]
build.standardOutput = FileHandle.standardOutput
build.standardError = FileHandle.standardError
do {
    try build.run()
} catch {
    fputs("dev: failed to start swift build: \(error)\n", stderr)
    exit(1)
}
build.waitUntilExit()
if build.terminationStatus != 0 {
    fputs("dev: `swift build --product reed` failed (exit \(build.terminationStatus))\n", stderr)
    exit(1)
}

let reedBinary = cwd.appendingPathComponent(".build/debug/reed")
guard FileManager.default.isExecutableFile(atPath: reedBinary.path) else {
    fputs("dev: built reed binary not found at \(reedBinary.path)\n", stderr)
    exit(1)
}

// Buffers partial output between reads and emits whole lines with a fixed prefix.
final class LineReader: @unchecked Sendable {
    let prefix: String
    private var buffer = Data()
    private let lock = NSLock()
    var onReady: ((String) -> Void)?

    init(prefix: String) { self.prefix = prefix }

    func handle(_ data: Data) {
        lock.lock()
        defer { lock.unlock() }
        buffer.append(data)
        while let nl = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer.subdata(in: buffer.startIndex..<nl)
            buffer.removeSubrange(buffer.startIndex...nl)
            guard let line = String(data: lineData, encoding: .utf8) else { continue }
            FileHandle.standardOutput.write(Data("\(prefix) \(line)\n".utf8))
            if let cb = onReady, line.contains("Local:") && line.contains("http") {
                onReady = nil
                cb(line)
            }
        }
    }
}

let backendReader = LineReader(prefix: "[reed]")
let frontendReader = LineReader(prefix: "[vite]")

// Strip ANSI escape sequences so we can pull a clean URL out of Vite's colored ready line.
func stripAnsi(_ s: String) -> String {
    var out = ""
    out.reserveCapacity(s.count)
    var i = s.startIndex
    while i < s.endIndex {
        let c = s[i]
        if c == "\u{1B}" {
            // ESC [ ... letter
            var j = s.index(after: i)
            if j < s.endIndex && s[j] == "[" {
                j = s.index(after: j)
                while j < s.endIndex {
                    let ch = s[j]
                    j = s.index(after: j)
                    if ch.isLetter { break }
                }
                i = j
                continue
            }
        }
        out.append(c)
        i = s.index(after: i)
    }
    return out
}

frontendReader.onReady = { line in
    let clean = stripAnsi(line)
    // Pull the first http(s) URL from the line. Vite prints e.g. "  ➜  Local:   http://localhost:5173/"
    let pattern = #"https?://[^\s]+"#
    let url: URL? = {
        if let range = clean.range(of: pattern, options: .regularExpression),
           let parsed = URL(string: String(clean[range])) {
            return parsed
        }
        return URL(string: "http://localhost:5173")
    }()
    if let url {
        FileHandle.standardOutput.write(Data("[dev] opening \(url.absoluteString)\n".utf8))
        NSWorkspace.shared.open(url)
    }
}

// Spawn backend
let backend = Process()
backend.executableURL = reedBinary
backend.arguments = ["--no-open", "--port", "8765", pathArg]
let backendPipe = Pipe()
backend.standardOutput = backendPipe
backend.standardError = backendPipe

// Spawn frontend
let frontend = Process()
frontend.currentDirectoryURL = frontendDir
frontend.executableURL = URL(fileURLWithPath: "/usr/bin/env")
frontend.arguments = ["npm", "run", "dev"]
let frontendPipe = Pipe()
frontend.standardOutput = frontendPipe
frontend.standardError = frontendPipe

backendPipe.fileHandleForReading.readabilityHandler = { handle in
    let data = handle.availableData
    if data.isEmpty { return }
    backendReader.handle(data)
}
frontendPipe.fileHandleForReading.readabilityHandler = { handle in
    let data = handle.availableData
    if data.isEmpty { return }
    frontendReader.handle(data)
}

// Module-level mutable state for the signal handler — async-signal-safe handlers
// can't capture, so the child PIDs live as nonisolated(unsafe) globals.
nonisolated(unsafe) var backendPid: pid_t = 0
nonisolated(unsafe) var frontendPid: pid_t = 0

// @convention(c) signal handler. Only async-signal-safe calls allowed inside:
// kill(2), write(2), nanosleep(2), _exit(2). No printf, no Foundation, no
// DispatchQueue. Crucially, no waitpid — Foundation's Process also reaps the
// children on its own thread and a parallel waitpid here would race it.
// The kernel reaps any unwaited children when we _exit, so no zombies.
let onSignal: @convention(c) (Int32) -> Void = { _ in
    let msg = "\n[dev] shutting down\n"
    msg.withCString { ptr in
        _ = write(STDOUT_FILENO, ptr, strlen(ptr))
    }
    if backendPid > 0 { kill(backendPid, SIGTERM) }
    if frontendPid > 0 { kill(frontendPid, SIGTERM) }
    var ts = timespec(tv_sec: 1, tv_nsec: 0)
    nanosleep(&ts, nil)
    if backendPid > 0 { kill(backendPid, SIGKILL) }
    if frontendPid > 0 { kill(frontendPid, SIGKILL) }
    _exit(0)
}

var sa = sigaction()
sa.__sigaction_u.__sa_handler = onSignal
sigemptyset(&sa.sa_mask)
sa.sa_flags = 0
sigaction(SIGINT, &sa, nil)
sigaction(SIGTERM, &sa, nil)

// If a child dies on its own (crash, manual kill), take the other one down with it.
backend.terminationHandler = { _ in
    FileHandle.standardOutput.write(Data("[dev] reed exited — stopping vite\n".utf8))
    backendPid = 0
    if frontendPid > 0 { kill(frontendPid, SIGTERM) }
    DispatchQueue.global().asyncAfter(deadline: .now() + 1) { Darwin._exit(0) }
}
frontend.terminationHandler = { _ in
    FileHandle.standardOutput.write(Data("[dev] vite exited — stopping reed\n".utf8))
    frontendPid = 0
    if backendPid > 0 { kill(backendPid, SIGTERM) }
    DispatchQueue.global().asyncAfter(deadline: .now() + 1) { Darwin._exit(0) }
}

do {
    try backend.run()
    backendPid = backend.processIdentifier
} catch {
    fputs("dev: failed to spawn reed: \(error)\n", stderr)
    exit(1)
}
do {
    try frontend.run()
    frontendPid = frontend.processIdentifier
} catch {
    fputs("dev: failed to spawn vite: \(error)\n", stderr)
    backend.terminate()
    exit(1)
}

print("[dev] reed: http://localhost:8765 · vite: http://localhost:5173 (the one you want)")
fflush(stdout)

RunLoop.main.run()
