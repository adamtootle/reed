import Foundation

struct GitIgnore {
    private struct Rule {
        let isNegation: Bool
        let directoryOnly: Bool
        let regex: NSRegularExpression
    }

    private let rules: [Rule]

    init(content: String) {
        rules = content
            .components(separatedBy: .newlines)
            .compactMap { Self.parseRule(line: $0) }
    }

    static func load(from directory: URL) -> GitIgnore {
        let url = directory.appendingPathComponent(".gitignore")
        let content = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return GitIgnore(content: content)
    }

    func isIgnored(path: String, isDirectory: Bool = false) -> Bool {
        decision(path: path, isDirectory: isDirectory) ?? false
    }

    /// Returns the last matching rule's decision (`true` = ignored, `false` = explicitly un-ignored),
    /// or `nil` if no rule in this file matched. Callers cascading multiple gitignore scopes use the
    /// deepest non-nil decision as the final answer.
    func decision(path: String, isDirectory: Bool = false) -> Bool? {
        var result: Bool? = nil
        for rule in rules {
            if rule.directoryOnly && !isDirectory { continue }
            let range = NSRange(path.startIndex..., in: path)
            if rule.regex.firstMatch(in: path, range: range) != nil {
                result = !rule.isNegation
            }
        }
        return result
    }

    private static func parseRule(line: String) -> Rule? {
        var raw = line.trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty, !raw.hasPrefix("#") else { return nil }

        let isNegation = raw.hasPrefix("!")
        if isNegation { raw = String(raw.dropFirst()) }

        let hasLeadingSlash = raw.hasPrefix("/")
        if hasLeadingSlash { raw = String(raw.dropFirst()) }

        let directoryOnly = raw.hasSuffix("/")
        if directoryOnly { raw = String(raw.dropLast()) }

        // Per gitignore spec: a slash anywhere in the pattern (other than trailing) implies rooted
        let rooted = hasLeadingSlash || raw.contains("/")

        guard let regex = buildRegex(pattern: raw, rooted: rooted) else { return nil }
        return Rule(isNegation: isNegation, directoryOnly: directoryOnly, regex: regex)
    }

    private static func buildRegex(pattern: String, rooted: Bool) -> NSRegularExpression? {
        var result = ""
        var i = pattern.startIndex

        while i < pattern.endIndex {
            let c = pattern[i]
            let next = pattern.index(after: i)

            switch c {
            case "*":
                if next < pattern.endIndex && pattern[next] == "*" {
                    // Check for **/ (matches zero or more path components)
                    let afterStars = pattern.index(after: next)
                    if afterStars < pattern.endIndex && pattern[afterStars] == "/" {
                        result += "(.*/)?";
                        i = pattern.index(after: afterStars)
                    } else {
                        result += ".*"
                        i = pattern.index(after: next)
                    }
                } else {
                    result += "[^/]*"
                    i = next
                }
            case "?":
                result += "[^/]"
                i = next
            case ".", "^", "$", "(", ")", "{", "}", "[", "]", "|", "+", "\\":
                result += "\\\(c)"
                i = next
            default:
                result += String(c)
                i = next
            }
        }

        let anchored = rooted
            ? "^\(result)(/.*)?$"
            : "(^|/)\(result)(/.*)?$"

        return try? NSRegularExpression(pattern: anchored)
    }
}
