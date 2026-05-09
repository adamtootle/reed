# reed Swift Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Swift backend for reed — a CLI that starts a local HTTP server and opens a markdown editor in the browser — in four independently verifiable slices ending with a working binary that watches files and pushes change events over SSE.

**Architecture:** Business logic (gitignore matching, file tree traversal, path validation) is extracted into pure functions so it can be unit-tested without HTTP infrastructure. HTTP handlers in `FileAPI.swift` call those functions and wrap results in Hummingbird `Response` values. `SSEBroadcaster` is a Swift actor; `FileWatcher` uses DispatchSource on macOS.

**Tech Stack:** Swift 6.2, Hummingbird 2.x, swift-argument-parser 1.3.x, XCTest, AppKit (NSWorkspace), Darwin (BSD sockets for port discovery)

---

## File Map

| File | Responsibility |
|---|---|
| `Package.swift` | Dependencies, platform, resources declaration |
| `.gitignore` | Exclude `Sources/reed/Resources/` and `.build/` |
| `Sources/reed/main.swift` | CLI entry (`ParsableCommand`), port discovery, browser open, process keepalive |
| `Sources/reed/Server.swift` | Hummingbird router wiring, starts FileWatcher |
| `Sources/reed/GitIgnore.swift` | Pure gitignore pattern parser and path matcher |
| `Sources/reed/FileTree.swift` | Pure file tree builder — `FileNode`, `buildFileTree()` |
| `Sources/reed/FileAPI.swift` | HTTP handlers for `/api/files` and `/api/file` |
| `Sources/reed/SSE.swift` | `SSEBroadcaster` actor and `/events` route handler |
| `Sources/reed/FileWatcher.swift` | DispatchSource directory watcher (macOS) |
| `Tests/reedTests/GitIgnoreTests.swift` | Unit tests for gitignore parsing and matching |
| `Tests/reedTests/FileTreeTests.swift` | Unit tests for file tree traversal |
| `Tests/reedTests/PathValidationTests.swift` | Unit tests for path traversal protection |

---

## Task 1: Package setup and scaffolding

**Files:**
- Modify: `Package.swift`
- Create: `.gitignore`
- Delete: `Sources/reed/reed.swift`

- [ ] **Step 1: Replace Package.swift**

```swift
// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "reed",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "reed", targets: ["reed"])
    ],
    dependencies: [
        .package(url: "https://github.com/hummingbird-project/hummingbird", from: "2.0.0"),
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.3.0"),
    ],
    targets: [
        .executableTarget(
            name: "reed",
            dependencies: [
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            resources: [
                .copy("Resources")
            ]
        ),
        .testTarget(
            name: "reedTests",
            dependencies: ["reed"]
        ),
    ]
)
```

- [ ] **Step 2: Create .gitignore**

```
.DS_Store
.build/
Sources/reed/Resources/
```

- [ ] **Step 3: Delete the empty placeholder**

```bash
rm Sources/reed/reed.swift
```

- [ ] **Step 4: Create the stub Resources directory** (not committed — gitignored)

```bash
mkdir -p Sources/reed/Resources
cat > Sources/reed/Resources/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>reed</title></head>
<body><h1>reed is running</h1><p>Frontend not built yet.</p></body>
</html>
EOF
```

- [ ] **Step 5: Resolve packages**

```bash
swift package resolve
```

Expected: downloads Hummingbird and swift-argument-parser, writes `Package.resolved`.

- [ ] **Step 6: Commit**

```bash
git add Package.swift Package.resolved .gitignore
git commit -m "chore: add Hummingbird and ArgumentParser dependencies"
```

---

## Task 2: GitIgnore parser (TDD)

**Files:**
- Create: `Sources/reed/GitIgnore.swift`
- Create: `Tests/reedTests/GitIgnoreTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `Tests/reedTests/GitIgnoreTests.swift`:

```swift
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
swift test --filter GitIgnoreTests
```

Expected: compilation error — `GitIgnore` not defined.

- [ ] **Step 3: Create Sources/reed/GitIgnore.swift**

```swift
import Foundation

struct GitIgnore {
    private struct Rule {
        let isNegation: Bool
        let directoryOnly: Bool
        let regex: NSRegularExpression
    }

    private let rules: [Rule]

    init(content: String) {
        rules = content
            .components(separatedBy: .newlines)
            .compactMap { Self.parseRule(line: $0) }
    }

    static func load(from directory: URL) -> GitIgnore {
        let url = directory.appendingPathComponent(".gitignore")
        let content = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return GitIgnore(content: content)
    }

    func isIgnored(path: String, isDirectory: Bool = false) -> Bool {
        var ignored = false
        for rule in rules {
            if rule.directoryOnly && !isDirectory { continue }
            let range = NSRange(path.startIndex..., in: path)
            if rule.regex.firstMatch(in: path, range: range) != nil {
                ignored = !rule.isNegation
            }
        }
        return ignored
    }

    private static func parseRule(line: String) -> Rule? {
        var raw = line.trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty, !raw.hasPrefix("#") else { return nil }

        let isNegation = raw.hasPrefix("!")
        if isNegation { raw = String(raw.dropFirst()) }

        let rooted = raw.hasPrefix("/")
        if rooted { raw = String(raw.dropFirst()) }

        let directoryOnly = raw.hasSuffix("/")
        if directoryOnly { raw = String(raw.dropLast()) }

        guard let regex = buildRegex(pattern: raw, rooted: rooted) else { return nil }
        return Rule(isNegation: isNegation, directoryOnly: directoryOnly, regex: regex)
    }

    private static func buildRegex(pattern: String, rooted: Bool) -> NSRegularExpression? {
        var result = ""
        var i = pattern.startIndex

        while i < pattern.endIndex {
            let c = pattern[i]
            let next = pattern.index(after: i)

            switch c {
            case "*":
                if next < pattern.endIndex && pattern[next] == "*" {
                    result += ".*"
                    i = pattern.index(after: next)
                } else {
                    result += "[^/]*"
                    i = next
                }
            case "?":
                result += "[^/]"
                i = next
            case ".", "^", "$", "(", ")", "{", "}", "[", "]", "|", "+", "\\":
                result += "\\\(c)"
                i = next
            default:
                result += String(c)
                i = next
            }
        }

        let anchored = rooted
            ? "^\(result)(/.*)?$"
            : "(^|/)\(result)(/.*)?$"

        return try? NSRegularExpression(pattern: anchored)
    }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
swift test --filter GitIgnoreTests
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add Sources/reed/GitIgnore.swift Tests/reedTests/GitIgnoreTests.swift
git commit -m "feat: add gitignore parser with glob matching"
```

---

## Task 3: File tree builder (TDD)

**Files:**
- Create: `Sources/reed/FileTree.swift`
- Create: `Tests/reedTests/FileTreeTests.swift`

Depth counting: `traverse` is called with `depth: 1` for the root's direct children. Files at `root/a/b/c/d/` are reached at `depth: 5` and included. Files at `root/a/b/c/d/e/` would be at `depth: 6` and are excluded by the `guard depth <= 5` check.

- [ ] **Step 1: Write the failing tests**

Create `Tests/reedTests/FileTreeTests.swift`:

```swift
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
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
swift test --filter FileTreeTests
```

Expected: compilation error — `FileNode`, `buildFileTree`, `buildFileTreeResult` not defined.

- [ ] **Step 3: Create Sources/reed/FileTree.swift**

```swift
import Foundation

enum FileNodeType: String, Encodable {
    case file
    case directory
    case cap
}

struct FileNode: Encodable {
    let name: String
    let path: String
    let type: FileNodeType
    var children: [FileNode]?
    var message: String?
}

struct FileTreeResult {
    let nodes: [FileNode]
    let cappedAt200: Bool
}

func buildFileTree(root: URL, gitIgnore: GitIgnore) -> [FileNode] {
    buildFileTreeResult(root: root, gitIgnore: gitIgnore).nodes
}

func buildFileTreeResult(root: URL, gitIgnore: GitIgnore) -> FileTreeResult {
    var fileCount = 0
    var capped = false

    func traverse(directory: URL, relativePath: String, depth: Int) -> [FileNode] {
        guard depth <= 5, !capped else { return [] }

        let contents: [URL]
        do {
            contents = try FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey],
                options: [.skipsHiddenFiles]
            )
        } catch {
            return []
        }

        var nodes: [FileNode] = []

        for url in contents.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            guard !capped else { break }

            let name = url.lastPathComponent
            let itemPath = relativePath.isEmpty ? name : "\(relativePath)/\(name)"
            let rv = try? url.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey])
            if rv?.isSymbolicLink == true { continue }

            let isDir = rv?.isDirectory == true

            if gitIgnore.isIgnored(path: itemPath, isDirectory: isDir) { continue }

            if isDir {
                let children = traverse(directory: url, relativePath: itemPath, depth: depth + 1)
                if !children.isEmpty {
                    nodes.append(FileNode(name: name, path: itemPath, type: .directory, children: children))
                }
            } else if url.pathExtension == "md" {
                fileCount += 1
                if fileCount > 200 { capped = true; break }
                nodes.append(FileNode(name: name, path: itemPath, type: .file))
            }
        }

        return nodes
    }

    let nodes = traverse(directory: root, relativePath: "", depth: 1)
    return FileTreeResult(nodes: nodes, cappedAt200: capped)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
swift test --filter FileTreeTests
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add Sources/reed/FileTree.swift Tests/reedTests/FileTreeTests.swift
git commit -m "feat: add file tree builder with depth and count caps"
```

---

## Task 4: Path validator (TDD)

**Files:**
- Create: `Sources/reed/PathValidator.swift`
- Create: `Tests/reedTests/PathValidationTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `Tests/reedTests/PathValidationTests.swift`:

```swift
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
        XCTAssertThrowsError(try validatePath(root: root, relativePath: "docs/../../etc/passwd"))
    }

    func testAbsolutePathRejected() {
        XCTAssertThrowsError(try validatePath(root: root, relativePath: "/etc/passwd"))
    }

    func testEmptyPathRejected() {
        XCTAssertThrowsError(try validatePath(root: root, relativePath: "")) { error in
            XCTAssertEqual(error as? PathValidationError, .emptyPath)
        }
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
swift test --filter PathValidationTests
```

Expected: compilation error — `validatePath`, `PathValidationError` not defined.

- [ ] **Step 3: Create Sources/reed/PathValidator.swift**

```swift
import Foundation

enum PathValidationError: Error, Equatable {
    case outsideRoot
    case emptyPath
}

func validatePath(root: URL, relativePath: String) throws -> URL {
    guard !relativePath.isEmpty else { throw PathValidationError.emptyPath }
    guard !relativePath.hasPrefix("/") else { throw PathValidationError.outsideRoot }

    let rootStandardized = root.standardized
    let resolved = rootStandardized.appendingPathComponent(relativePath).standardized
    let rootPath = rootStandardized.path
    guard resolved.path.hasPrefix(rootPath + "/") || resolved.path == rootPath else {
        throw PathValidationError.outsideRoot
    }
    return resolved
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
swift test --filter PathValidationTests
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
swift test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add Sources/reed/PathValidator.swift Tests/reedTests/PathValidationTests.swift
git commit -m "feat: add path traversal protection"
```

---

## Task 5: HTTP server — Slice 1 complete

**Files:**
- Create: `Sources/reed/main.swift`
- Create: `Sources/reed/Server.swift`

After this task, `swift run reed` opens a browser showing "reed is running."

- [ ] **Step 1: Create Sources/reed/main.swift**

```swift
import ArgumentParser
import AppKit
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
        NSWorkspace.shared.open(URL(string: "http://localhost:\(port)")!)

        Task {
            do {
                try await server.run()
            } catch {
                fputs("reed: server error: \(error)\n", stderr)
                exit(1)
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
```

- [ ] **Step 2: Create Sources/reed/Server.swift**

```swift
import Foundation
import Hummingbird

struct ReedServer {
    let root: URL
    let mode: LaunchMode
    let port: UInt16

    func run() async throws {
        let router = buildRouter()
        let app = Application(
            router: router,
            configuration: .init(address: .hostname("localhost", port: Int(port)))
        )
        try await app.run()
    }

    private func buildRouter() -> Router<BasicRequestContext> {
        let router = Router(context: BasicRequestContext.self)

        router.get("/") { _, _ -> Response in
            serveResource(name: "index", extension: "html", contentType: "text/html; charset=utf-8")
        }

        return router
    }
}

func serveResource(name: String, extension ext: String, contentType: String) -> Response {
    let filename = "\(name).\(ext)"
    guard
        let url = Bundle.module.url(forResource: name, withExtension: ext, subdirectory: "Resources"),
        let data = try? Data(contentsOf: url)
    else {
        var headers = HTTPFields()
        headers[.contentType] = "text/plain"
        return Response(
            status: .internalServerError,
            headers: headers,
            body: .init(byteBuffer: ByteBuffer(string: "Missing resource: \(filename)"))
        )
    }
    var headers = HTTPFields()
    headers[.contentType] = contentType
    return Response(status: .ok, headers: headers, body: .init(byteBuffer: ByteBuffer(bytes: data)))
}
```

> **Note on Hummingbird API:** If you get compile errors in `Server.swift`, check the exact types by reading `.build/checkouts/hummingbird/Sources/Hummingbird/`. Key types: `Router`, `Application`, `BasicRequestContext`, `HTTPFields`, `ByteBuffer`, `Response`, `ResponseBody`. `ByteBuffer` is from NIO — `import NIOCore` if needed.

- [ ] **Step 3: Build**

```bash
swift build
```

Expected: compiles successfully.

- [ ] **Step 4: Run and verify browser opens**

```bash
swift run reed
```

Expected:
- Terminal prints `Listening on http://localhost:<port>`
- Browser opens to that URL and shows "reed is running"
- Process stays alive (Ctrl+C to stop)

- [ ] **Step 5: Commit**

```bash
git add Sources/reed/main.swift Sources/reed/Server.swift
git commit -m "feat: CLI entry, HTTP server, browser open (slice 1)"
```

---

## Task 6: File API — Slices 2 and 3

**Files:**
- Create: `Sources/reed/FileAPI.swift`
- Modify: `Sources/reed/Server.swift`

- [ ] **Step 1: Create Sources/reed/FileAPI.swift**

> **Note:** If `HTTPResponse.Status` or `HTTPFields` don't compile, add `import HTTPTypes` alongside `import Hummingbird`.

```swift
import Foundation
import Hummingbird

struct FileAPI {
    let root: URL
    private let gitIgnore: GitIgnore

    init(root: URL) {
        self.root = root
        self.gitIgnore = GitIgnore.load(from: root)
    }

    func listFiles() -> Response {
        let result = buildFileTreeResult(root: root, gitIgnore: gitIgnore)
        var nodes = result.nodes
        if result.cappedAt200 {
            nodes.append(FileNode(name: "", path: "", type: .cap, message: "Some files not shown"))
        }
        guard let data = try? JSONEncoder().encode(nodes) else {
            return errorResponse(.internalServerError, "encoding error")
        }
        var headers = HTTPFields()
        headers[.contentType] = "application/json"
        return Response(status: .ok, headers: headers, body: .init(byteBuffer: ByteBuffer(bytes: data)))
    }

    func readFile(relativePath: String) -> Response {
        guard let resolved = try? validatePath(root: root, relativePath: relativePath) else {
            return errorResponse(.forbidden, "forbidden")
        }
        guard let content = try? String(contentsOf: resolved, encoding: .utf8) else {
            return errorResponse(.notFound, "not found")
        }
        var headers = HTTPFields()
        headers[.contentType] = "text/plain; charset=utf-8"
        return Response(status: .ok, headers: headers, body: .init(byteBuffer: ByteBuffer(string: content)))
    }

    func writeFile(relativePath: String, content: String) -> Response {
        guard let resolved = try? validatePath(root: root, relativePath: relativePath) else {
            return errorResponse(.forbidden, "forbidden")
        }
        guard FileManager.default.fileExists(atPath: resolved.path) else {
            return errorResponse(.notFound, "not found")
        }
        guard let data = content.data(using: .utf8),
              (try? data.write(to: resolved, options: .atomic)) != nil else {
            return errorResponse(.internalServerError, "write error")
        }
        return Response(status: .ok, headers: [:], body: .init(byteBuffer: ByteBuffer()))
    }
}

private func errorResponse(_ status: HTTPResponse.Status, _ message: String) -> Response {
    var headers = HTTPFields()
    headers[.contentType] = "text/plain"
    return Response(status: status, headers: headers, body: .init(byteBuffer: ByteBuffer(string: message)))
}
```

- [ ] **Step 2: Register file API routes in Server.swift**

Add these routes inside `buildRouter()`, after the `GET /` route and before the `return router` line:

```swift
let fileAPI = FileAPI(root: root)

router.get("/api/files") { _, _ in
    fileAPI.listFiles()
}

router.get("/api/file") { request, _ in
    let path = request.uri.queryParameters.get("path") ?? ""
    return fileAPI.readFile(relativePath: path)
}

router.put("/api/file") { request, _ in
    let bodyBuffer = try await request.body.collect(upTo: 50 * 1024 * 1024)
    let content = String(bytes: bodyBuffer.readableBytesView, encoding: .utf8) ?? ""
    let path = request.uri.queryParameters.get("path") ?? ""
    return fileAPI.writeFile(relativePath: path, content: content)
}
```

- [ ] **Step 3: Add wildcard static file route to Server.swift**

Add this route **last** inside `buildRouter()`, after the `/api/file` PUT route and before `return router`. It must be last so it only catches requests that didn't match any API route.

```swift
router.get("**") { [root] request, _ -> Response in
    let relativePath = String(request.uri.path.dropFirst()) // strip leading /
    guard !relativePath.isEmpty,
          let resolved = try? validatePath(root: root, relativePath: relativePath) else {
        return Response(status: .forbidden, headers: [:], body: .init(byteBuffer: ByteBuffer()))
    }
    var isDir: ObjCBool = false
    guard FileManager.default.fileExists(atPath: resolved.path, isDirectory: &isDir),
          !isDir.boolValue,
          let data = try? Data(contentsOf: resolved) else {
        return Response(status: .notFound, headers: [:], body: .init(byteBuffer: ByteBuffer()))
    }
    return Response(status: .ok, headers: [:], body: .init(byteBuffer: ByteBuffer(bytes: data)))
}
```

> **Note:** In Hummingbird 2.x the catch-all pattern may be `"**"` or `"{path+}"` — check which the installed version supports. If neither compiles, read `.build/checkouts/hummingbird/` for the correct wildcard syntax.

- [ ] **Step 4: Build**

```bash
swift build
```

Expected: compiles successfully.

- [ ] **Step 6: Manual verification**

Run reed pointing at a directory that has `.md` files and at least one image, then in another terminal:

```bash
PORT=<port from reed output>

# List files
curl "http://localhost:$PORT/api/files" | python3 -m json.tool

# Read a file (replace README.md with an actual file from the tree)
curl "http://localhost:$PORT/api/file?path=README.md"

# Verify path traversal is blocked
curl -v "http://localhost:$PORT/api/file?path=../secret"
# Expected: HTTP 403

# Write a file
curl -X PUT "http://localhost:$PORT/api/file?path=README.md" \
  -H "Content-Type: text/plain" \
  --data-binary "# Updated content"
# Expected: HTTP 200

# Wildcard: fetch an image (replace with a real file in your test directory)
curl -o /tmp/test.png "http://localhost:$PORT/image.png"
# Expected: file bytes returned, same size as the source file
```

- [ ] **Step 7: Commit**

```bash
git add Sources/reed/FileAPI.swift Sources/reed/Server.swift
git commit -m "feat: add /api/files, /api/file, and wildcard static file routes (slices 2 and 3)"
```

---

## Task 7: SSE broadcaster — Slice 4, part 1

**Files:**
- Create: `Sources/reed/SSE.swift`
- Modify: `Sources/reed/Server.swift`

- [ ] **Step 1: Create Sources/reed/SSE.swift**

```swift
import Foundation
import NIOCore
import Hummingbird

actor SSEBroadcaster {
    private var clients: [UUID: AsyncStream<ByteBuffer>.Continuation] = [:]

    func add(id: UUID, continuation: AsyncStream<ByteBuffer>.Continuation) {
        clients[id] = continuation
    }

    func remove(id: UUID) {
        clients.removeValue(forKey: id)
    }

    func broadcast(event: String, data: String) {
        let message = "event: \(event)\ndata: \(data)\n\n"
        let buffer = ByteBuffer(string: message)
        for continuation in clients.values {
            continuation.yield(buffer)
        }
    }
}
```

- [ ] **Step 2: Add broadcaster property and /events route to Server.swift**

Add `let broadcaster = SSEBroadcaster()` as a stored property on `ReedServer`:

```swift
struct ReedServer {
    let root: URL
    let mode: LaunchMode
    let port: UInt16
    let broadcaster = SSEBroadcaster()
    // ...
}
```

Add the `/events` route inside `buildRouter()`:

```swift
router.get("/events") { [broadcaster] _, _ -> Response in
    let id = UUID()
    let (stream, continuation) = AsyncStream<ByteBuffer>.makeStream()
    continuation.onTermination = { _ in
        Task { await broadcaster.remove(id: id) }
    }
    await broadcaster.add(id: id, continuation: continuation)

    var headers = HTTPFields()
    headers[.contentType] = "text/event-stream"
    headers[.cacheControl] = "no-cache"
    return Response(
        status: .ok,
        headers: headers,
        body: ResponseBody(asyncSequence: stream)
    )
}
```

> **Note:** If `ResponseBody(asyncSequence:)` does not compile, check whether Hummingbird wraps its streaming body differently. The relevant type to check: `ResponseBody` in `.build/checkouts/hummingbird/Sources/HummingbirdCore/`.

- [ ] **Step 3: Build**

```bash
swift build
```

Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add Sources/reed/SSE.swift Sources/reed/Server.swift
git commit -m "feat: add SSE broadcaster and /events route"
```

---

## Task 8: File watcher — Slice 4, part 2

**Files:**
- Create: `Sources/reed/FileWatcher.swift`
- Modify: `Sources/reed/Server.swift`

- [ ] **Step 1: Create Sources/reed/FileWatcher.swift**

```swift
import Foundation

final class FileWatcher: @unchecked Sendable {
    typealias ChangeHandler = @Sendable (String) -> Void

    private let root: URL
    private let queue = DispatchQueue(label: "reed.filewatcher", qos: .utility)
    private var sources: [DispatchSourceFileSystemObject] = []
    private var modSnapshot: [String: Date] = [:]
    var onChange: ChangeHandler?

    init(root: URL) {
        self.root = root
    }

    func start() {
        modSnapshot = buildSnapshot()
        for dir in collectWatchedDirectories() {
            addWatch(for: dir)
        }
    }

    func stop() {
        sources.forEach { $0.cancel() }
        sources.removeAll()
    }

    private func addWatch(for directory: URL) {
        let fd = Darwin.open(directory.path, O_EVTONLY)
        guard fd >= 0 else { return }

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: .write,
            queue: queue
        )
        source.setEventHandler { [weak self] in self?.handleEvent() }
        source.setCancelHandler { Darwin.close(fd) }
        source.resume()
        sources.append(source)
    }

    private func handleEvent() {
        let newSnapshot = buildSnapshot()
        for (path, date) in newSnapshot where modSnapshot[path] != date {
            onChange?(path)
        }
        modSnapshot = newSnapshot
    }

    private func buildSnapshot() -> [String: Date] {
        var snapshot: [String: Date] = [:]

        func walk(_ dir: URL, relativePath: String, depth: Int) {
            guard depth <= 5 else { return }
            guard let contents = try? FileManager.default.contentsOfDirectory(
                at: dir,
                includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey],
                options: [.skipsHiddenFiles]
            ) else { return }

            for url in contents {
                let name = url.lastPathComponent
                let rel = relativePath.isEmpty ? name : "\(relativePath)/\(name)"
                let rv = try? url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey])
                if rv?.isSymbolicLink == true { continue }
                if rv?.isDirectory == true {
                    walk(url, relativePath: rel, depth: depth + 1)
                } else if url.pathExtension == "md", let date = rv?.contentModificationDate {
                    snapshot[rel] = date
                }
            }
        }

        walk(root, relativePath: "", depth: 1)
        return snapshot
    }

    private func collectWatchedDirectories() -> [URL] {
        var dirs: [URL] = [root]

        func walk(_ dir: URL, depth: Int) {
            guard depth <= 5 else { return }
            guard let contents = try? FileManager.default.contentsOfDirectory(
                at: dir,
                includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
                options: [.skipsHiddenFiles]
            ) else { return }
            for url in contents {
                let rv = try? url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
                if rv?.isSymbolicLink == true { continue }
                if rv?.isDirectory == true {
                    dirs.append(url)
                    walk(url, depth: depth + 1)
                }
            }
        }

        walk(root, depth: 1)
        return dirs
    }
}
```

- [ ] **Step 2: Wire FileWatcher into Server.swift**

Update `ReedServer.run()` to start the watcher and connect it to the broadcaster:

```swift
func run() async throws {
    let watcher = FileWatcher(root: root)
    watcher.onChange = { [broadcaster] relativePath in
        let escaped = relativePath.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        Task {
            await broadcaster.broadcast(event: "fileChanged", data: "{\"path\":\"\(escaped)\"}")
        }
    }
    watcher.start()
    defer { watcher.stop() }

    let router = buildRouter()
    let app = Application(
        router: router,
        configuration: .init(address: .hostname("localhost", port: Int(port)))
    )
    try await app.run()
}
```

- [ ] **Step 3: Build the complete project**

```bash
swift build
```

Expected: compiles with no errors.

- [ ] **Step 4: Full end-to-end verification**

Open two terminals. In terminal 1, run reed on a directory with `.md` files:

```bash
swift run reed /path/to/some/md/directory
```

In terminal 2, subscribe to events:

```bash
curl -N http://localhost:<port>/events
```

Back in terminal 1 (or a third terminal), modify a `.md` file:

```bash
echo " " >> /path/to/some/md/directory/README.md
```

Expected in terminal 2:
```
event: fileChanged
data: {"path":"README.md"}
```

- [ ] **Step 5: Commit**

```bash
git add Sources/reed/FileWatcher.swift Sources/reed/Server.swift
git commit -m "feat: file watcher and SSE push for external changes (slice 4)"
```

---

## Self-Review Checklist

- [x] Package.swift with Hummingbird, swift-argument-parser, Resources copy rule — Task 1
- [x] .gitignore covers Resources/ and .build/ — Task 1
- [x] Gitignore: *, **, /, rooted, negation, comments — Task 2
- [x] File tree: .md only, no symlinks, depth 5, count 200, cap sentinel — Task 3
- [x] Path traversal protection (403 on ../) — Task 4
- [x] CLI: optional path arg, singleFile vs directory mode — Task 5
- [x] Port 0 discovery via throwaway socket — Task 5
- [x] NSWorkspace browser open — Task 5
- [x] GET /api/files → JSON tree — Task 6
- [x] GET /api/file?path= → text/plain — Task 6
- [x] PUT /api/file?path= → write (file must exist) — Task 6
- [x] GET /** → serve arbitrary files from root (images, etc.) with path traversal protection — Task 6
- [x] GET /events → SSE stream, text/event-stream, no-cache — Task 7
- [x] SSEBroadcaster actor for thread safety — Task 7
- [x] FileWatcher DispatchSource .write events — Task 8
- [x] SSE event shape: `event: fileChanged\ndata: {"path":"..."}` — Task 8
- [x] watcher.stop() on server shutdown — Task 8
