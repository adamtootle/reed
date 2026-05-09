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
