import Foundation

enum PathValidationError: Error, Equatable {
    case outsideRoot
    case emptyPath
}

// Uses URL.standardized (pure, no disk I/O) rather than resolvingSymlinksInPath.
// Symlinks inside the root pointing outside are not blocked here; the file tree builder
// skips symlinks during traversal, so they cannot be discovered via /api/files.
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
