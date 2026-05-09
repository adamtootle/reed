import ArgumentParser
import Darwin
import Foundation

enum LaunchMode: Sendable {
    case directory
    case singleFile(String)
}

struct Reed: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "reed",
        abstract: "Local markdown editor"
    )

    @Argument(help: "Markdown file or directory (defaults to current directory)")
    var path: String?

    @Option(name: .long, help: "Port to bind (default: 8765 in dev, OS-assigned in release; 0 = OS-assigned)")
    var port: UInt16?

    mutating func run() throws {
        let (root, mode) = try resolveInput(path: path)
        let resolvedPort: UInt16
        do {
            resolvedPort = try resolvePort(requested: port)
        } catch let error as PortInUseError {
            fputs("reed: \(error.description)\n", stderr)
            throw ExitCode.failure
        }
        let server = ReedServer(root: root, mode: mode, port: resolvedPort)

        print("Listening on http://localhost:\(resolvedPort)")

        Task {
            do {
                try await server.run()
                Darwin.exit(0)
            } catch {
                fputs("reed: server error: \(error)\n", stderr)
                Darwin.exit(1)
            }
        }

        RunLoop.main.run()
    }
}

Reed.main()

// MARK: - Helpers

func resolveInput(path: String?) throws -> (root: URL, mode: LaunchMode) {
    let inputPath = path ?? FileManager.default.currentDirectoryPath
    let url = URL(fileURLWithPath: inputPath).standardized

    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
        throw ValidationError("Path does not exist: \(url.path)")
    }

    if isDirectory.boolValue {
        return (url, .directory)
    } else if url.pathExtension == "md" {
        return (url.deletingLastPathComponent(), .singleFile(url.lastPathComponent))
    } else {
        throw ValidationError("Path must be a .md file or a directory, got: \(url.path)")
    }
}

func defaultPort() -> UInt16 {
    #if DEBUG
    return 8765
    #else
    return 0
    #endif
}

struct PortInUseError: Error, CustomStringConvertible {
    let port: UInt16
    var description: String { "port \(port) is already in use" }
}

/// Validates that `requested` (or the build-default if nil) can be bound,
/// and returns the resolved port.
///
/// Note: probes the port by binding-then-closing a temp socket. There is a small
/// TOCTOU window where another process could claim the port between the probe and
/// the real server bind. Accepted because reed runs locally for a single user;
/// the consequence is at worst a confusing error at server startup.
func resolvePort(requested: UInt16?) throws -> UInt16 {
    let candidate = requested ?? defaultPort()
    if candidate == 0 {
        return findAvailablePort()
    }
    let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    precondition(sock >= 0, "socket() failed")
    defer { Darwin.close(sock) }

    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = candidate.bigEndian
    addr.sin_addr = in_addr(s_addr: INADDR_ANY)

    let bindResult = withUnsafePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            Darwin.bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
    if bindResult != 0 {
        throw PortInUseError(port: candidate)
    }
    return candidate
}

func findAvailablePort() -> UInt16 {
    let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    precondition(sock >= 0, "socket() failed")
    defer { Darwin.close(sock) }

    var reuse: Int32 = 1
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = 0
    addr.sin_addr = in_addr(s_addr: INADDR_ANY)

    let bindResult = withUnsafePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            Darwin.bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
    precondition(bindResult == 0, "bind() failed")

    var len = socklen_t(MemoryLayout<sockaddr_in>.size)
    withUnsafeMutablePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            getsockname(sock, $0, &len)
        }
    }
    return UInt16(bigEndian: addr.sin_port)
}
