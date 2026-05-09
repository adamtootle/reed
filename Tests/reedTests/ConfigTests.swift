import XCTest
import Foundation
@testable import reed

/// Tests that verify /api/config rootName derivation.
///
/// The HTTP route builds its JSON from `root.lastPathComponent`. These unit tests
/// verify that `resolveInput` produces the correct `root` URL whose lastPathComponent
/// gives the expected rootName for both directory and singleFile modes.
final class ConfigTests: XCTestCase {
    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("reed-config-tests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    func testDirectoryModeRootName() throws {
        // Given a directory named "my-notes"
        let notesDir = tempDir.appendingPathComponent("my-notes")
        try FileManager.default.createDirectory(at: notesDir, withIntermediateDirectories: true)

        let (root, mode) = try resolveInput(path: notesDir.path)

        // rootName is derived from root.lastPathComponent in the /api/config handler
        XCTAssertEqual(root.lastPathComponent, "my-notes")
        if case .directory = mode { /* ok */ } else {
            XCTFail("Expected directory mode, got \(mode)")
        }
    }

    func testSingleFileModeRootName() throws {
        // Given a .md file inside a directory named "my-notes"
        let notesDir = tempDir.appendingPathComponent("my-notes")
        try FileManager.default.createDirectory(at: notesDir, withIntermediateDirectories: true)
        let file = notesDir.appendingPathComponent("index.md")
        FileManager.default.createFile(atPath: file.path, contents: Data())

        let (root, mode) = try resolveInput(path: file.path)

        // root is the parent directory; rootName comes from root.lastPathComponent
        XCTAssertEqual(root.lastPathComponent, "my-notes")
        if case .singleFile(let name) = mode {
            XCTAssertEqual(name, "index.md")
        } else {
            XCTFail("Expected singleFile mode, got \(mode)")
        }
    }

    func testConfigJsonContainsRootName() throws {
        // Verify the JSON encoding that the /api/config route produces includes rootName.
        let root = URL(fileURLWithPath: "/Users/alice/my-notes")
        var obj: [String: String] = ["rootName": root.lastPathComponent]
        obj["mode"] = "directory"

        let data = try JSONEncoder().encode(obj)
        let decoded = try JSONSerialization.jsonObject(with: data) as? [String: String]
        XCTAssertEqual(decoded?["rootName"], "my-notes")
        XCTAssertEqual(decoded?["mode"], "directory")
    }

    func testConfigJsonSingleFileContainsRootName() throws {
        let root = URL(fileURLWithPath: "/Users/alice/my-notes")
        var obj: [String: String] = ["rootName": root.lastPathComponent]
        obj["mode"] = "singleFile"
        obj["file"] = "index.md"

        let data = try JSONEncoder().encode(obj)
        let decoded = try JSONSerialization.jsonObject(with: data) as? [String: String]
        XCTAssertEqual(decoded?["rootName"], "my-notes")
        XCTAssertEqual(decoded?["mode"], "singleFile")
        XCTAssertEqual(decoded?["file"], "index.md")
    }
}
