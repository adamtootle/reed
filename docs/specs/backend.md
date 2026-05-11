# reed — Backend Spec

The Swift backend is a single executable that serves the markdown directory over HTTP, watches it for external changes, and broadcasts those changes to connected browser clients. macOS only.

For the high-level shape and how the backend fits with the frontend, see [`docs/architecture.md`](../architecture.md). For operational commands, see [`CLAUDE.md`](../../CLAUDE.md).

## Package

- `swift-tools-version: 6.2`
- Platform: `.macOS(.v14)`
- Dependencies:
  - [Hummingbird](https://github.com/hummingbird-project/hummingbird) `>= 2.0.0` — HTTP server and routing
  - [swift-argument-parser](https://github.com/apple/swift-argument-parser) `>= 1.3.0` — CLI parsing
- Resources: `Sources/reed/Resources/` is bundled via `.copy("Resources")`. The directory is gitignored; `npm run build` from `frontend/` populates it.

## Source layout

```
Sources/reed/
├── main.swift        # CLI entry, port resolution, input mode detection
├── Server.swift      # Hummingbird setup, routing, browser launch
├── FileAPI.swift     # /api/config, /api/files, /api/file
├── FileTree.swift    # Recursive .md tree builder
├── GitIgnore.swift   # .gitignore pattern matcher
├── PathValidator.swift # Path traversal guard
├── FileWatcher.swift # kqueue-based recursive watcher
├── SSE.swift         # SSEBroadcaster actor
└── Resources/        # gitignored — Vite build output
```

Each module has one job. Test coverage is selective — see [Testing](#testing) below.

## CLI

```
reed [path] [--port N]
```

- No `path` → root = current working directory, mode = `directory`
- `path` is a directory → root = that directory, mode = `directory`
- `path` is a `.md` file → root = parent directory, mode = `singleFile(filename)`
- Any other path → exit with `ValidationError`

`LaunchMode` is surfaced to the frontend via `/api/config` so the UI can hide the sidebar in single-file mode.

### Port resolution

```swift
#if DEBUG
defaultPort = 8765
#else
defaultPort = 0   // OS-assigned
#endif
```

- `--port N` overrides the default. `--port 0` is an explicit OS-assign escape hatch.
- For a non-zero requested port, `resolvePort()` probes by binding-then-closing a temp socket on `AF_INET / SOCK_STREAM`. If the bind fails, exit with `PortInUseError`.
- For port 0 (or no requested port in release), `findAvailablePort()` binds to `:0`, reads back the OS-assigned port via `getsockname`, and returns it.
- The bound port is printed as `Listening on http://localhost:PORT` before the browser opens.

There is a TOCTOU window between probe and real bind. Accepted — reed is single-user and local; the worst case is a confusing startup error.

### Signal handling

Hummingbird's graceful shutdown waits for in-flight responses to drain, and the long-lived SSE connection at `/events` never does, so Ctrl-C gets stuck once a browser is connected. `SignalHandling.installForceExit()` installs `DispatchSource` handlers for `SIGINT`/`SIGTERM` that call `Darwin._exit(0)` unconditionally. Safe because file writes are atomic and there's no server-side state to flush.

### Browser launch

`Server.swift` opens the bound URL via `NSWorkspace.shared.open(url)` after startup completes.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Serve `index.html` from `Bundle.module` |
| GET | `/api/config` | Return `{ mode, file?, rootName }` |
| GET | `/api/files` | Return the file tree as JSON |
| GET | `/api/file?path=` | Read a `.md` file |
| PUT | `/api/file?path=` | Write a `.md` file |
| GET | `/events` | Server-sent events stream |
| GET | `/**` | Wildcard static-file route (images, etc.) |

The wildcard route is **registered last** so explicit routes win. It exists so that relative asset references in markdown (`![](./image.png)`) resolve correctly under the split-pane preview.

## File API

### `/api/files`

Returns a JSON array. Nodes are either files or directories with `children`. If the traversal cap fires, a `{ "type": "cap" }` marker is appended at the top level.

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

Traversal rules:
- Only `.md` files included
- Symlinks not followed (`skipSymbolicLinks` in `FileManager` resource keys)
- Cap: depth 5 or 200 `.md` files, whichever comes first
- `.gitignore` rules applied (see below)

### `/api/file`

- **GET**: returns the file as `200 text/plain`; missing or unreadable → `404`.
- **PUT**: accepts raw `text/plain`. Requires the file to already exist — the editor only writes files it discovered via `/api/files`, so a `404` here means "not your file." Writes use `.atomic`. Write failure → `500`.
- Path is validated via `PathValidator` before any I/O (see below).
- Reads/writes are restricted to `.md` files (or `README.*` for convenience).

## Path safety (`PathValidator.swift`)

```swift
let resolved = URL(fileURLWithPath: root)
    .appendingPathComponent(path)
    .standardized
guard resolved.path.hasPrefix(root) else { /* 403 */ }
```

`URL.standardized` is pure — it doesn't touch the disk — which is intentional. Symlinks pointing outside root are **not** blocked by the validator: `FileTree` skips symlinks during traversal so they can never be discovered through `/api/files`, and `FileAPI` further restricts reads/writes to `.md`-class files. The wildcard route runs the same validator and serves anything that passes.

## Gitignore matching (`GitIgnore.swift`)

`.gitignore` is parsed once at server startup. Rules are stored ordered and applied during file-tree traversal — a path is ignored if the last matching rule is non-negating.

```swift
struct GitIgnoreRule {
    let pattern: String
    let isNegation: Bool
    let regex: NSRegularExpression
}
```

Pattern → regex conversion:

| Pattern form | Behavior |
|---|---|
| Blank lines, `# comments` | skipped |
| `!pattern` | negation — un-ignores matches |
| Leading `/` | anchored to root |
| Trailing `/` | directory-only match |
| `*` | single path segment (`[^/]*`) |
| `**` | any depth (`.*`) |
| `.` and other metacharacters | escaped |

Paths are tested as relative strings (e.g. `docs/setup.md`).

## File watcher (`FileWatcher.swift`)

A `DispatchSource.makeFileSystemObjectSource`-based recursive watcher built on kqueue.

- One file descriptor per watched directory (`open(path, O_EVTONLY)`).
- One `DispatchSource` per fd, listening for `.write` events.
- On any event, re-scan the watched directories and compare `.md` mod times against an in-memory `[String: Date]` snapshot. The dispatch source only tells us "something changed in this directory" — the snapshot diff tells us which file.
- New subdirectories are picked up by re-scanning and adding watches as they appear.
- Recursion cap: depth 5 (same as `FileTree`). Symlinks are not followed.
- `onChange(relativePath:)` fires per changed `.md` file; the broadcaster picks it up from there.
- On deinit, all sources are cancelled and all fds closed.

Linux file watching (inotify) is not implemented. See [Future work](#future-work).

## SSE broadcaster (`SSE.swift`)

`SSEBroadcaster` is a Swift `actor` — required for Swift 6.2 strict concurrency. It holds `[UUID: AsyncStream<ByteBuffer>.Continuation]`, one per connected client.

- `GET /events` opens a Hummingbird response stream with headers `Content-Type: text/event-stream` and `Cache-Control: no-cache`, adds a continuation, and removes it on disconnect or cancellation.
- When `FileWatcher` fires, the broadcaster sends to every active continuation:

  ```
  event: fileChanged
  data: {"path": "relative/path.md"}

  ```

  (one `\n` between header lines, blank line terminator)

The frontend treats the event as a *hint* — it always re-fetches `/api/file` to get the disk content. Self-writes and external writes flow through the same path; the comparison after the fetch is what distinguishes them. This means we don't need event payloads to be reliable across reconnects.

## Wiring (`Server.swift`)

On startup, `ReedServer.run()`:

1. Constructs the `FileWatcher` over `root`, with `SSEBroadcaster.broadcast` as its `onChange` callback.
2. Constructs the Hummingbird `Application`, registers explicit routes, registers the wildcard last.
3. Launches the browser with `NSWorkspace.shared.open(...)`.
4. Calls `app.run()` to enter the Hummingbird event loop.

## Testing

XCTest under `Tests/reedTests/`. Run with `swift test`. Suites:

- `ConfigTests` — `/api/config` mode and filename serialization
- `FileTreeTests` — sort order, nesting, depth/count cap, symlink skip
- `GitIgnoreTests` — pattern-to-regex conversion, negation, anchoring
- `PathValidationTests` — traversal attempts, edge cases (relative paths, `..`)
- `PortResolutionTests` — DEBUG vs release default selection, explicit overrides, port-in-use handling

## Future work

- **Linux file watching (inotify)**. macOS is the only supported platform today; broader support requires reimplementing `FileWatcher` against inotify.
- **Homebrew tap and formula**. Release pipeline already exists; tap is a separate repo. Documented in [`docs/publishing.md`](../publishing.md).
- **Developer ID signing + notarization**. Currently ad-hoc signed; would unlock browser-download installs without `xattr` cleanup.
