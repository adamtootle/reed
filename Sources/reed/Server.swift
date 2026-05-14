import AppKit
import Foundation
import Hummingbird
import Logging
import UniformTypeIdentifiers

struct ReedServer {
    let root: URL
    let mode: LaunchMode
    let port: UInt16
    let broadcaster = SSEBroadcaster()

    func run() async throws {
        let watcher = FileWatcher(root: root)
        watcher.onChange = { [broadcaster] relativePath in
            let payload = ["path": relativePath]
            guard let data = try? JSONEncoder().encode(payload),
                  let json = String(data: data, encoding: .utf8) else { return }
            Task {
                await broadcaster.broadcast(event: "fileChanged", data: json)
            }
        }
        watcher.start()
        defer { watcher.stop() }

        let router = buildRouter()
        let url = URL(string: "http://localhost:\(port)")!
        // Hummingbird logs its own "Server started…" line at info. Bump to .critical
        // so reed's own startup banner is the only thing the user sees.
        var logger = Logger(label: "reed")
        logger.logLevel = .critical
        let app = Application(
            router: router,
            configuration: ApplicationConfiguration(
                address: .hostname("localhost", port: Int(port))
            ),
            onServerRunning: { [root, mode] _ in
                printStartupBanner(url: url, root: root, mode: mode)
                NSWorkspace.shared.open(url)
            },
            logger: logger
        )
        try await app.runService()
    }

    private func buildRouter() -> Router<BasicRequestContext> {
        let router = Router(context: BasicRequestContext.self)

        router.get("/") { _, _ -> Response in
            serveResource(name: "index", extension: "html", contentType: "text/html; charset=utf-8")
        }

        router.get("/api/config") { [mode, root] _, _ -> Response in
            var obj: [String: String] = ["rootName": root.lastPathComponent]
            switch mode {
            case .directory:
                obj["mode"] = "directory"
            case .singleFile(let filename):
                obj["mode"] = "singleFile"
                obj["file"] = filename
            }
            guard let data = try? JSONEncoder().encode(obj) else {
                return Response(status: .internalServerError, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer()))
            }
            var headers = HTTPFields()
            headers[.contentType] = "application/json"
            return Response(status: .ok, headers: headers, body: ResponseBody(byteBuffer: ByteBuffer(bytes: data)))
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
            // Prime the stream so headers + first byte flush right away. Without this the
            // client's EventSource.onopen does not fire until the first real event, which
            // leaves the UI stuck in "Connecting…" / "Reconnecting…" until the first file
            // change. `:` introduces an SSE comment line (a no-op for the parser).
            continuation.yield(ByteBuffer(string: ":\n\n"))

            var headers = HTTPFields()
            headers[.contentType] = "text/event-stream"
            headers[.cacheControl] = "no-cache"
            return Response(
                status: .ok,
                headers: headers,
                body: ResponseBody(asyncSequence: stream)
            )
        }

        // Bundled JS/CSS/fonts emitted by `vite build` into Sources/reed/Resources/assets.
        // These are referenced by the bundled index.html (e.g. `/assets/index-<hash>.js`),
        // so without an explicit route the production page loads but stays blank.
        router.get("/assets/**") { request, _ -> Response in
            let relativePath = String(request.uri.path.dropFirst())
            return serveBundledAsset(relativePath: relativePath, in: Bundle.module.resourceURL?.standardized)
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
            var responseHeaders = HTTPFields()
            let ext = resolved.pathExtension
            if !ext.isEmpty, let mime = UTType(filenameExtension: ext)?.preferredMIMEType {
                responseHeaders[.contentType] = mime
            }
            return Response(status: .ok, headers: responseHeaders, body: ResponseBody(byteBuffer: ByteBuffer(bytes: data)))
        }

        return router
    }
}

func serveBundledAsset(relativePath: String, in bundleRoot: URL?) -> Response {
    guard let bundleRoot else {
        return Response(status: .notFound, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer()))
    }
    let target = bundleRoot.appendingPathComponent(relativePath).standardized
    guard target.path.hasPrefix(bundleRoot.path + "/") else {
        return Response(status: .forbidden, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer()))
    }
    guard let data = try? Data(contentsOf: target) else {
        return Response(status: .notFound, headers: [:], body: ResponseBody(byteBuffer: ByteBuffer()))
    }
    var headers = HTTPFields()
    let ext = target.pathExtension
    if !ext.isEmpty, let mime = UTType(filenameExtension: ext)?.preferredMIMEType {
        headers[.contentType] = mime
    }
    return Response(status: .ok, headers: headers, body: ResponseBody(byteBuffer: ByteBuffer(bytes: data)))
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

func printStartupBanner(url: URL, root: URL, mode: LaunchMode) {
    let servingPath: String = {
        switch mode {
        case .directory:
            return root.path
        case .singleFile(let filename):
            return root.appendingPathComponent(filename).path
        }
    }()
    let displayPath = (servingPath as NSString).abbreviatingWithTildeInPath
    print("reed \(ReedVersion.current) → \(url.absoluteString)")
    print("serving \(displayPath)")
    // When stdout is redirected (e.g. piped to a file or to a launcher's log),
    // it switches from line-buffered to block-buffered and the banner sits
    // in the buffer until the process exits or fills 4 KB. Flush so users
    // watching a log see the banner the moment the server is up.
    fflush(stdout)
}
