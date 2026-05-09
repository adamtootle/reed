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
        return Response(
            status: .ok,
            headers: headers,
            body: ResponseBody(byteBuffer: ByteBuffer(bytes: data))
        )
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
        return Response(
            status: .ok,
            headers: headers,
            body: ResponseBody(byteBuffer: ByteBuffer(string: content))
        )
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
        return Response(status: .ok, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer()))
    }
}

private func errorResponse(_ status: HTTPResponse.Status, _ message: String) -> Response {
    var headers = HTTPFields()
    headers[.contentType] = "text/plain"
    return Response(
        status: status,
        headers: headers,
        body: ResponseBody(byteBuffer: ByteBuffer(string: message))
    )
}
