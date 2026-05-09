import XCTest
import Foundation
@testable import reed

final class FileTreeTests: XCTestCase {
    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    private func makeFile(_ relativePath: String) {
        let url = tempDir.appendingPathComponent(relativePath)
        try! FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: url.path, contents: Data())
    }

    private func flatten(_ nodes: [FileNode]) -> [FileNode] {
        nodes.flatMap { [$0] + flatten($0.children ?? []) }
    }

    func testSingleFileAtRoot() {
        makeFile("README.md")
        let tree = buildFileTree(root: tempDir, gitIgnore: GitIgnore(content: ""))
        XCTAssertEqual(tree.count, 1)
        XCTAssertEqual(tree[0].name, "README.md")
        XCTAssertEqual(tree[0].path, "README.md")
        XCTAssertEqual(tree[0].type, .file)
    }

    func testNonMarkdownFilesExcluded() {
        makeFile("README.md")
        makeFile("image.png")
        makeFile("script.js")
        let tree = buildFileTree(root: tempDir, gitIgnore: GitIgnore(content: ""))
        XCTAssertEqual(tree.count, 1)
        XCTAssertEqual(tree[0].name, "README.md")
    }

    func testNestedDirectory() {
        makeFile("README.md")
        makeFile("docs/setup.md")
        let tree = buildFileTree(root: tempDir, gitIgnore: GitIgnore(content: ""))
        XCTAssertEqual(tree.count, 2)
        let dir = tree.first { $0.type == .directory }
        XCTAssertEqual(dir?.children?.count, 1)
        XCTAssertEqual(dir?.children?.first?.name, "setup.md")
    }

    func testGitignoreRulesApplied() {
        makeFile("README.md")
        makeFile("error.log.md")
        let gi = GitIgnore(content: "*.log.md\n")
        let tree = buildFileTree(root: tempDir, gitIgnore: gi)
        XCTAssertEqual(tree.count, 1)
        XCTAssertEqual(tree[0].name, "README.md")
    }

    func testDepthCapAt5() {
        // depth 5 in traversal = 4 directories deep from root
        makeFile("d1/d2/d3/d4/deep.md")
        // depth 6 = 5 directories deep — excluded
        makeFile("d1/d2/d3/d4/d5/toodeep.md")
        let tree = buildFileTree(root: tempDir, gitIgnore: GitIgnore(content: ""))
        let files = flatten(tree).filter { $0.type == .file }
        XCTAssertTrue(files.contains { $0.name == "deep.md" })
        XCTAssertFalse(files.contains { $0.name == "toodeep.md" })
    }

    func testCapSentinelAt200Files() {
        for i in 1...201 { makeFile("file\(i).md") }
        let result = buildFileTreeResult(root: tempDir, gitIgnore: GitIgnore(content: ""))
        XCTAssertTrue(result.cappedAt200)
        XCTAssertEqual(result.nodes.count, 200)
    }
}
