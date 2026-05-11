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

private struct ScopedGitIgnore {
    /// Relative path from the tree root to the directory containing this `.gitignore`.
    /// Empty string for the root scope.
    let anchor: String
    let gitIgnore: GitIgnore
}

func buildFileTree(root: URL, gitIgnore: GitIgnore) -> [FileNode] {
    buildFileTreeResult(root: root, gitIgnore: gitIgnore).nodes
}

func buildFileTreeResult(root: URL, gitIgnore: GitIgnore) -> FileTreeResult {
    var fileCount = 0
    var capped = false

    func traverse(directory: URL, relativePath: String, depth: Int, scopes: [ScopedGitIgnore]) -> [FileNode] {
        guard depth <= 5, !capped else { return [] }

        // Pick up a nested `.gitignore` in this directory. Skip the root because the caller
        // already supplied it as the initial scope.
        var effectiveScopes = scopes
        if !relativePath.isEmpty {
            let nestedURL = directory.appendingPathComponent(".gitignore")
            if let content = try? String(contentsOf: nestedURL, encoding: .utf8) {
                effectiveScopes.append(
                    ScopedGitIgnore(anchor: relativePath, gitIgnore: GitIgnore(content: content)))
            }
        }

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

            if isIgnored(itemPath: itemPath, isDirectory: isDir, scopes: effectiveScopes) { continue }

            if isDir {
                let children = traverse(
                    directory: url, relativePath: itemPath, depth: depth + 1, scopes: effectiveScopes)
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

    let rootScopes = [ScopedGitIgnore(anchor: "", gitIgnore: gitIgnore)]
    let nodes = traverse(directory: root, relativePath: "", depth: 1, scopes: rootScopes)
    return FileTreeResult(nodes: nodes, cappedAt200: capped)
}

/// Cascade scopes from outermost to innermost; the deepest matching decision wins.
private func isIgnored(itemPath: String, isDirectory: Bool, scopes: [ScopedGitIgnore]) -> Bool {
    var ignored = false
    for scope in scopes {
        let relative: String
        if scope.anchor.isEmpty {
            relative = itemPath
        } else {
            relative = String(itemPath.dropFirst(scope.anchor.count + 1))
        }
        if let d = scope.gitIgnore.decision(path: relative, isDirectory: isDirectory) {
            ignored = d
        }
    }
    return ignored
}
