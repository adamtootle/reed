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
