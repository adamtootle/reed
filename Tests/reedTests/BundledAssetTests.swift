import Foundation
import XCTest
@testable import reed

final class BundledAssetTests: XCTestCase {
    private var bundleRoot: URL!

    override func setUp() {
        super.setUp()
        bundleRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("reed-bundled-asset-tests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: bundleRoot, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: bundleRoot)
        super.tearDown()
    }

    private func writeAsset(_ relativePath: String, contents: String) throws {
        let url = bundleRoot.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try contents.write(to: url, atomically: true, encoding: .utf8)
    }

    func testServesFileWithMimeType() throws {
        try writeAsset("assets/index-abc.js", contents: "console.log('hi');")
        let response = serveBundledAsset(relativePath: "assets/index-abc.js", in: bundleRoot)
        XCTAssertEqual(response.status, .ok)
        XCTAssertEqual(response.headers[.contentType], "text/javascript")
    }

    func testServesCssWithMimeType() throws {
        try writeAsset("assets/index-abc.css", contents: ".a { color: red; }")
        let response = serveBundledAsset(relativePath: "assets/index-abc.css", in: bundleRoot)
        XCTAssertEqual(response.status, .ok)
        XCTAssertEqual(response.headers[.contentType], "text/css")
    }

    func testReturns404ForMissingFile() {
        let response = serveBundledAsset(relativePath: "assets/nope.js", in: bundleRoot)
        XCTAssertEqual(response.status, .notFound)
    }

    func testReturns403ForPathTraversal() throws {
        let sibling = bundleRoot.deletingLastPathComponent().appendingPathComponent("secret.txt")
        try "leaked".write(to: sibling, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: sibling) }

        let response = serveBundledAsset(relativePath: "../secret.txt", in: bundleRoot)
        XCTAssertEqual(response.status, .forbidden)
    }

    func testReturns403ForDeepTraversal() {
        let response = serveBundledAsset(relativePath: "assets/../../etc/passwd", in: bundleRoot)
        XCTAssertEqual(response.status, .forbidden)
    }

    func testReturns404WhenBundleRootIsNil() {
        let response = serveBundledAsset(relativePath: "assets/anything.js", in: nil)
        XCTAssertEqual(response.status, .notFound)
    }

    func testOmitsContentTypeForExtensionlessFile() throws {
        try writeAsset("LICENSE", contents: "MIT")
        let response = serveBundledAsset(relativePath: "LICENSE", in: bundleRoot)
        XCTAssertEqual(response.status, .ok)
        XCTAssertNil(response.headers[.contentType])
    }
}
