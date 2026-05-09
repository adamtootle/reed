import XCTest
import Foundation
@testable import reed

final class PathValidationTests: XCTestCase {
    private let root = URL(fileURLWithPath: "/tmp/test-root")

    func testValidRelativePath() throws {
        let result = try validatePath(root: root, relativePath: "docs/setup.md")
        XCTAssertEqual(result.path, "/tmp/test-root/docs/setup.md")
    }

    func testTraversalAttemptRejected() {
        XCTAssertThrowsError(try validatePath(root: root, relativePath: "../secret.md")) { error in
            XCTAssertEqual(error as? PathValidationError, .outsideRoot)
        }
    }

    func testDoubleTraversalRejected() {
        XCTAssertThrowsError(try validatePath(root: root, relativePath: "docs/../../etc/passwd")) { error in
            XCTAssertEqual(error as? PathValidationError, .outsideRoot)
        }
    }

    func testAbsolutePathRejected() {
        XCTAssertThrowsError(try validatePath(root: root, relativePath: "/etc/passwd")) { error in
            XCTAssertEqual(error as? PathValidationError, .outsideRoot)
        }
    }

    func testEmptyPathRejected() {
        XCTAssertThrowsError(try validatePath(root: root, relativePath: "")) { error in
            XCTAssertEqual(error as? PathValidationError, .emptyPath)
        }
    }
}
