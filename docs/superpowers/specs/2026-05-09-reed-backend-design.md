# reed — Swift Backend Design (Milestone 1)

**Date:** 2026-05-09
**Scope:** Swift backend only. Frontend (Vite, CodeMirror, markdown-it) is a separate milestone.
**Target platform:** macOS only (Linux deferred post-v1).

---

## Overview

Build the Swift executable in four independently verifiable slices, each producing a runnable binary with more capability than the last. The frontend for this milestone is a stub `index.html` created manually in `Sources/reed/Resources/` for local development (never committed — that directory is gitignored). CI will populate it with the real Vite build in milestone 2.

---

## Package structure

`Package.swift` updated to swift-tools-version 6.2 (already in repo). Dependencies added:

- `Hummingbird` from `https://github.com/hummingbird-project/hummingbird` (`>= 2.0.0`)
- `swift-argument-parser` from `https://github.com/apple/swift-argument-parser` (`>= 1.3.0`)

Platform minimum: `.macOS(.v13)`.

`Sources/reed/Resources/` is gitignored. For local development, create a stub `index.html` there manually — it is never committed.

### Source layout

```
Sources/reed/
├── main.swift        # CLI entrypoint, ArgumentParser
├── Server.swift      # Hummingbird setup, routing
├── FileAPI.swift     # /api/files, /api/file GET+PUT
├── FileWatcher.swift # DispatchSource directory watcher (macOS)
├── SSE.swift         # SSE broadcaster
└── Resources/        # gitignored — stub HTML for dev, Vite output in CI
    └── index.html
```

---

## Slice 1 — CLI + server startup + browser open

### CLI (`main.swift`)

Uses `swift-argument-parser`. Accepts one optional positional `path` argument.

- If `path` is omitted: root = `FileManager.default.currentDirectoryPath`, mode = `directory`
- If `path` points to a `.md` file: root = parent directory, mode = `singleFile`
- If `path` points to a directory: root = that directory, mode = `directory`
- Any other path: exit with error

Mode is passed to the server to control sidebar visibility in the frontend (no sidebar in `singleFile` mode).

### Port binding (`Server.swift`)

Bind to port 0 — the OS assigns a free port and `getsockname` reads it back. Port 0 never collides, so no retry is needed for EADDRINUSE. If Hummingbird surfaces an unexpected configuration error on startup, print a clear message to stderr and `exit(1)`.

Print `Listening on http://localhost:PORT` to stdout before opening the browser.

### Browser open

```swift
NSWorkspace.shared.open(URL(string: "http://localhost:\(port)")!)
```

### Routing at this slice

- `GET /` → serve `index.html` from `Bundle.module`
- All other routes → 404

Stub `index.html` content: any valid HTML that confirms "reed is running" — enough to verify end-to-end.

---

## Slice 2 — `/api/files` with gitignore support

### Route

`GET /api/files` → JSON array of the file tree.

### Response shape

```json
[
  { "name": "README.md", "path": "README.md", "type": "file" },
  {
    "name": "docs",
    "path": "docs",
    "type": "directory",
    "children": [
      { "name": "setup.md", "path": "docs/setup.md", "type": "file" }
    ]
  }
]
```

If the traversal cap is reached:

```json
{ "type": "cap", "message": "Some files not shown" }
```

appended at the top level.

### Traversal rules

- Only `.md` files included
- Symlinks not followed (`skipSymbolicLinks` in `FileManager` resource keys)
- Cap: depth 5 or 200 `.md` files, whichever comes first
- `.gitignore` rules honored (see below)

### Gitignore glob matching

Parsed once at server start from `<root>/.gitignore` (if present). Stored as `[GitIgnoreRule]`.

```swift
struct GitIgnoreRule {
    let pattern: String
    let isNegation: Bool
    let regex: NSRegularExpression
}
```

Pattern conversion to regex handles:

| Pattern form | Regex equivalent |
|---|---|
| Blank lines, `#comments` | skipped |
| `!pattern` | negation — un-ignores matching paths |
| Leading `/` | anchored to root (`^`) |
| Trailing `/` | directory match only (tested against dir paths) |
| `*` | `[^/]*` (single path segment wildcard) |
| `**` | `.*` (any depth) |
| `.` and other regex metacharacters | escaped |

Rules applied in order during traversal. A path is ignored if the last matching rule is not a negation. Paths are tested as relative strings (e.g. `docs/setup.md`).

---

## Slice 3 — `/api/file` GET and PUT

### Path traversal protection

Applied identically in both handlers before any file I/O:

```swift
let resolved = URL(fileURLWithPath: root)
    .appendingPathComponent(path)
    .standardized
guard resolved.path.hasPrefix(root) else {
    // return 403
}
```

### GET `/api/file?path=`

- Read file with `String(contentsOf: resolved, encoding: .utf8)`
- Respond `200 text/plain` with file contents
- File not found or unreadable → `404`

### PUT `/api/file?path=`

- Accept raw request body as `text/plain`
- Require the file to already exist — if not, return `404` (editor only writes files it discovered via `/api/files`)
- Write with `data.write(to: resolved, options: .atomic)`
- Success → `200`; write failure → `500`

---

## Slice 4 — FileWatcher + SSE

### FileWatcher (`FileWatcher.swift`)

Watches the root directory and all subdirectories (up to the same depth-5 cap as the file tree) using `DispatchSource.makeFileSystemObjectSource`.

- Open a file descriptor per directory with `open(path, O_EVTONLY)`
- Create a `DispatchSource` for `.write` events on each fd
- On event: re-scan the watched directories, compare `.md` file modification dates against a cached `[String: Date]` snapshot
- Call `onChange(relativePath: String)` callback with the changed file's relative path
- When new subdirectories appear, add watches for them dynamically
- On deinit, cancel all sources and close all fds

### SSE broadcaster (`SSE.swift`)

Maintains `[UUID: AsyncStream<String>.Continuation]` — one entry per connected client.

- `GET /events` → open a Hummingbird async response stream, send headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`. Add continuation to the broadcaster. Remove on disconnect/cancellation.
- When `FileWatcher` fires, broadcaster sends to all active continuations:

```
event: fileChanged\ndata: {"path": "relative/path.md"}\n\n
```

- Thread safety: `SSEBroadcaster` is a Swift `actor` — continuation access is serialized by the actor executor. Required for Swift 6.2 strict concurrency.

### Wiring

`Server.swift` creates `FileWatcher` and `SSEBroadcaster`, passes the watcher's `onChange` callback to the broadcaster's send method. Both are started before `Hummingbird.run()`.

---

## What is explicitly out of scope for this milestone

- Frontend (Vite, CodeMirror, Radix Themes, markdown-it, scroll sync)
- Linux file watching (inotify)
- Homebrew formula and GitHub Actions release pipeline
- Configurable autosave timeout, multiple cursors, export
