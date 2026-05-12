# reed

A local markdown editor served in your browser. Launch it from the CLI against a directory or a single `.md` file, and it opens an editor in your default browser. Edits autosave; external changes propagate via SSE.

## Install

```bash
brew install adamtootle/reed/reed
```

macOS arm64 and x86_64 binaries from the [tap](https://github.com/adamtootle/homebrew-reed).

## Usage

```bash
reed                # current directory in directory mode
reed ~/notes        # specific directory
reed notes.md       # single-file mode (no sidebar)
reed --port 9000 .  # pin to a specific port
```

The release binary defaults to an OS-assigned port. Pass `--port <n>` to pin one.

## Development

Two terminals:

```bash
# Terminal 1 — Swift backend (DEBUG builds default to port 8765)
swift run reed --port 8765 ~/path/to/notes

# Terminal 2 — Vite dev server with proxy to the backend
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). The Vite dev server proxies `/api/*`, `/events`, and other non-asset paths to the Swift backend on 8765, so HMR works while the backend handles all data.

### Test suites

```bash
# Frontend (Vitest + happy-dom)
cd frontend && npm test

# Backend (XCTest)
swift test
```

## Production build

```bash
cd frontend && npm ci && npm run build
swift build -c release
.build/release/reed ~/path/to/notes
```

`npm run build` emits the bundled assets into `Sources/reed/Resources/` (gitignored). `swift build -c release` packages them into the binary via `Bundle.module`.

## Architecture

- **Backend** — Swift 6.2, [Hummingbird](https://github.com/hummingbird-project/hummingbird) 2, ArgumentParser. Serves `/api/config`, `/api/files`, `/api/file` (GET/PUT), `/events` (SSE), and `/**` (static asset wildcard).
- **Frontend** — Vite + TypeScript + Tailwind v4 + vanilla TS. CodeMirror 6 with a custom decoration plugin for the inline ("Mode A") view, markdown-it pipeline for the rendered preview ("Mode B"), with KaTeX, GitHub-style alerts, footnotes, GFM tables/strike/task-lists, and lazy-loaded Mermaid.

See `docs/superpowers/specs/2026-05-09-reed-frontend-design.md` for the full design.
