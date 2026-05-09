import Foundation

final class FileWatcher: @unchecked Sendable {
    typealias ChangeHandler = @Sendable (String) -> Void

    private let root: URL
    private let queue = DispatchQueue(label: "reed.filewatcher", qos: .utility)
    private var sources: [DispatchSourceFileSystemObject] = []
    private var modSnapshot: [String: Date] = [:]
    private var watchedPaths: Set<String> = []
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
        watchedPaths.removeAll()
    }

    deinit {
        stop()
    }

    private func addWatch(for directory: URL) {
        let path = directory.path
        guard !watchedPaths.contains(path) else { return }
        let fd = Darwin.open(path, O_EVTONLY)
        guard fd >= 0 else { return }
        watchedPaths.insert(path)
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
        // Add watches for any new subdirectories that appeared
        for dir in collectWatchedDirectories() {
            addWatch(for: dir)
        }
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
