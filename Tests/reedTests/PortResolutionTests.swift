import XCTest
@testable import reed

final class PortResolutionTests: XCTestCase {
    func testDefaultPortInDebugBuild() {
        // Tests run under the debug configuration; default port should be 8765.
        XCTAssertEqual(defaultPort(), 8765)
    }

    func testResolvePortNilUsesDefault() throws {
        let port = try resolvePort(requested: nil)
        XCTAssertEqual(port, 8765)
    }

    func testResolvePortZeroUsesOsAssigned() throws {
        let port = try resolvePort(requested: 0)
        XCTAssertGreaterThan(port, 0)
    }

    func testResolvePortExplicitPortBindable() throws {
        // Pick a high random port likely free, ask resolvePort to validate it.
        // We intentionally use OS-assigned discovery first to find a free one.
        let probe = findAvailablePort()
        let port = try resolvePort(requested: probe)
        XCTAssertEqual(port, probe)
    }

    func testResolvePortInUseThrows() throws {
        // Bind a real socket to a probe port, then ensure resolvePort throws.
        let probe = findAvailablePort()
        let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        XCTAssertGreaterThanOrEqual(sock, 0)
        defer { Darwin.close(sock) }
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = probe.bigEndian
        addr.sin_addr = in_addr(s_addr: INADDR_ANY)
        let bindResult = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        XCTAssertEqual(bindResult, 0)

        XCTAssertThrowsError(try resolvePort(requested: probe)) { error in
            XCTAssertTrue(error is PortInUseError, "expected PortInUseError, got \(type(of: error))")
        }
    }
}
