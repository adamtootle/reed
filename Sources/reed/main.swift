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

    mutating func run() throws {
        let (root, mode) = try resolveInput(path: path)
        let port = findAvailablePort()
        let server = ReedServer(root: root, mode: mode, port: port)

        print("Listening on http://localhost:\(port)")

        Task {
            do {
                try await server.run()
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
