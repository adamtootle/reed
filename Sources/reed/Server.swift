import AppKit
import Foundation
import Hummingbird

struct ReedServer {
    let root: URL
    let mode: LaunchMode
    let port: UInt16
    let broadcaster = SSEBroadcaster()

    func run() async throws {
        let router = buildRouter()
        let url = URL(string: "http://localhost:\(port)")!
        let app = Application(
            router: router,
            configuration: ApplicationConfiguration(
                address: .hostname("localhost", port: Int(port))
            ),
            onServerRunning: { _ in
                NSWorkspace.shared.open(url)
            }
        )
        try await app.runService()
    }

    private func buildRouter() -> Router<BasicRequestContext> {
        let router = Router(context: BasicRequestContext.self)

        router.get("/") { _, _ -> Response in
            serveResource(name: "index", extension: "html", contentType: "text/html; charset=utf-8")
        }

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

        // Wildcard: serve arbitrary files from root (images, etc. for markdown preview).
        // Registered last so it only catches requests not matched by the routes above.
        router.get("/**") { [root] request, _ -> Response in
            let relativePath = String(request.uri.path.dropFirst()) // strip leading /
            guard !relativePath.isEmpty,
                  let resolved = try? validatePath(root: root, relativePath: relativePath) else {
                return Response(status: .forbidden, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer()))
            }
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: resolved.path, isDirectory: &isDir),
                  !isDir.boolValue,
                  let data = try? Data(contentsOf: resolved) else {
                return Response(status: .notFound, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer()))
            }
            return Response(status: .ok, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer(bytes: data)))
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
            body: ResponseBody(byteBuffer: ByteBuffer(string: "Missing resource: \(filename)"))
        )
    }
    var headers = HTTPFields()
    headers[.contentType] = contentType
    return Response(
        status: .ok,
        headers: headers,
        body: ResponseBody(byteBuffer: ByteBuffer(bytes: data))
    )
}
