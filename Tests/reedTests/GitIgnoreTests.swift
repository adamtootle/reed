import XCTest
@testable import reed

final class GitIgnoreTests: XCTestCase {
    func testWildcardExtension() {
        let gi = GitIgnore(content: "*.log\n")
        XCTAssertTrue(gi.isIgnored(path: "error.log"))
        XCTAssertTrue(gi.isIgnored(path: "subdir/error.log"))
        XCTAssertFalse(gi.isIgnored(path: "error.txt"))
    }

    func testExactFilename() {
        let gi = GitIgnore(content: ".DS_Store\n")
        XCTAssertTrue(gi.isIgnored(path: ".DS_Store"))
        XCTAssertTrue(gi.isIgnored(path: "docs/.DS_Store"))
        XCTAssertFalse(gi.isIgnored(path: "DS_Store"))
    }

    func testDirectoryPattern() {
        let gi = GitIgnore(content: "node_modules/\n")
        XCTAssertTrue(gi.isIgnored(path: "node_modules", isDirectory: true))
        XCTAssertFalse(gi.isIgnored(path: "node_modules", isDirectory: false))
        XCTAssertFalse(gi.isIgnored(path: "not_node_modules", isDirectory: true))
    }

    func testRootedPattern() {
        let gi = GitIgnore(content: "/build\n")
        XCTAssertTrue(gi.isIgnored(path: "build"))
        XCTAssertFalse(gi.isIgnored(path: "src/build"))
    }

    func testNegationPattern() {
        let gi = GitIgnore(content: "*.log\n!important.log\n")
        XCTAssertTrue(gi.isIgnored(path: "error.log"))
        XCTAssertFalse(gi.isIgnored(path: "important.log"))
    }

    func testDoubleStarPattern() {
        let gi = GitIgnore(content: "**/temp\n")
        XCTAssertTrue(gi.isIgnored(path: "temp"))
        XCTAssertTrue(gi.isIgnored(path: "a/b/temp"))
        XCTAssertFalse(gi.isIgnored(path: "temporary"))
    }

    func testCommentsAndBlankLinesIgnored() {
        let gi = GitIgnore(content: "# comment\n\n*.log\n")
        XCTAssertTrue(gi.isIgnored(path: "error.log"))
        XCTAssertFalse(gi.isIgnored(path: "README.md"))
    }

    func testEmptyGitignore() {
        let gi = GitIgnore(content: "")
        XCTAssertFalse(gi.isIgnored(path: "anything.md"))
    }
}
