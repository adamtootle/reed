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
            configuration: ApplicationConfiguration(
                address: .hostname("localhost", port: Int(port))
            )
        )
        try await app.runService()
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
