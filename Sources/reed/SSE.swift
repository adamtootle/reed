import Foundation
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
