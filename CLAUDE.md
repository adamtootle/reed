# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Dev (both servers in one command)
```bash
swift run dev                           # spawn backend + Vite for the current directory
swift run dev ~/notes                   # ...against a specific directory
```
`swift run dev` is the default dev workflow. It builds reed, spawns the Swift backend on `:8765` (with `--no-open`) and Vite on `:5173`, prefixes their output `[reed]` / `[vite]`, opens the Vite URL once it's ready, and tears both children down on Ctrl+C. First run also does `npm install` in `frontend/` if `node_modules` is missing. The orchestrator lives at `Sources/dev/main.swift` as a second `.executableTarget` — it's not packaged in release builds.

### Backend (Swift)
```bash
swift run reed --port 8765 ~/notes      # run backend alone; opens default browser at the bound URL
swift run reed --no-open --port 8765 .  # same but skip the browser (used by `swift run dev`)
swift test                              # run the XCTest suite
swift test --filter <TestName>          # run a single test or test class
swift build -c release                  # production build (uses bundled frontend assets)
```

### Frontend (Vite + TS)
```bash
cd frontend
npm install
npm run dev                             # Vite dev server on :5173, proxies /api + /events to :8765
npm test                                # vitest run (one-shot)
npm run test:watch                      # vitest in watch mode
npx vitest run path/to/file.test.ts     # single test file
npx vitest run -t "pattern"             # by test name
npm run build                           # tsc -b && vite build → outputs to ../Sources/reed/Resources
```

### Two-terminal fallback
If you'd rather run the servers separately (e.g. to attach a debugger to one side), do it the long way: `swift run reed --port 8765 <path>` in one terminal, `npm run dev` (in `frontend/`) in another, then open the Vite URL. Vite's proxy forwards `/api/*` and `/events` to the backend so HMR works on the frontend while the backend serves data. Production runs from a single binary (Swift serves the bundled assets via `Bundle.module`).

### Dev launcher internals (`Sources/dev/main.swift`)
Two non-obvious bits that came up while building this:
- **Signal handling uses `sigaction` with a `@convention(c)` handler, not `DispatchSource`.** The dispatch-source version silently failed to fire on `kill -INT` and left both children orphaned. The C handler uses only async-signal-safe calls (`kill`, `write`, `nanosleep`, `_exit`); child PIDs live as `nonisolated(unsafe)` module-level vars because the C function can't capture.
- **Pre-build reed before launching it**, so `[reed]` output is just runtime logs. If you let `swift run reed` build inside the orchestrator, SPM's build progress gets line-prefixed and looks awful.

## Architecture

### Backend — `Sources/reed/`
Swift 6.2 + Hummingbird 2 + ArgumentParser. Single-binary CLI that opens a web UI in the user's default browser.

- **`main.swift`** — CLI entry. Two non-obvious bits:
  - Port resolution: `defaultPort()` returns `8765` in DEBUG and `0` (OS-assigned) in release. `--port` overrides. `resolvePort()` probes the requested port via a temp socket bind to fail fast; there's a TOCTOU window between probe and real bind, accepted because reed is a single-user local tool.
  - Launch detection: `resolveInput()` distinguishes "directory mode" from "single-file mode" by whether the path is a dir or a `.md` file.
- **`Server.swift`** — Hummingbird router. Routes: `/api/config`, `/api/files`, `/api/file` (GET/PUT), `/events` (SSE), and a `/**` wildcard for arbitrary file serving (images for preview). The wildcard is **registered last on purpose** — it catches anything not matched by the explicit routes. On startup, opens the default browser via `NSWorkspace.shared.open(url)`.
- **`FileWatcher.swift`** — kqueue-based recursive watcher (`DispatchSourceFileSystemObject`). Snapshots mod-times to detect changes vs. just dir-write events. Caps recursion at 5 levels and skips symlinks. Only `.md` files are tracked.
- **`SSE.swift`** — `SSEBroadcaster` actor; broadcasts `event: fileChanged\ndata: {path}` to all connected clients.
- **`PathValidator.swift`** — uses `URL.standardized` (pure, no disk I/O) rather than `resolvingSymlinksInPath`. Symlinks pointing outside root are not blocked here; the file-tree builder skips symlinks during traversal so they cannot be discovered via `/api/files`. `FileAPI` further restricts reads/writes to `.md` (or `README.*`) files.
- **`Resources/`** — built frontend assets (gitignored). Populated by `npm run build`; packaged into the binary via `Package.swift`'s `.copy("Resources")`.

### Frontend — `frontend/src/`
Vite + TypeScript + Tailwind v4 + vanilla TS (no framework). Vitest + happy-dom for tests.

- **`main.ts`** — integration layer. Wires the store, editor, file tree, SSE client, save debouncer, and conflict banner.
- **`state/`** — single `AppState` (see `state/types.ts`) with a small pub/sub `store`. Subscribers do shallow reference-equality dedup. `saveStateMachine.ts` derives the pill's status indicator from `(saveState, sseConnected)`. `debounce.ts` is a custom debouncer with `trigger`/`flush`/`cancel`/`isPending`.
- **`api/`** — `client.ts` is the typed REST wrapper; `sse.ts` wraps `EventSource` with exponential backoff `[1s, 2s, 4s, 8s, 16s, 30s]` and a double-start guard.
- **`editor/`** — CodeMirror 6 setup. Two `Compartment`s let `applyMode()` swap the decoration ViewPlugin and font theme between Mode A (inline, sans-serif, decorated) and Mode B (split, monospace, plain). `decorations.ts` walks the Lezer markdown tree (with GFM extensions) and maps node names → CSS classes. `markdownKeymap.ts` adds `Cmd+B/I/Shift+X/K` wrap-with-toggle and list-aware `Tab/Shift+Tab`.
- **`preview/`** — `markdown.ts` is the markdown-it pipeline (GFM tables/strike/task-lists, footnotes, KaTeX via `@vscode/markdown-it-katex`, GitHub alerts, highlight.js). Mermaid is **lazy-loaded** via dynamic `import('mermaid')` only when `.mermaid-block` placeholders exist; rendered SVG is cached by source string. `scrollSync.ts` does line-attribute-based bidirectional scroll sync with a `requestAnimationFrame` mutex.
- **`ui/`** — discrete widgets: floating `pill` (theme/mode/status), `fileTree`, `splitter`, `conflictBanner`, `sidebarCollapse`, `emptyState`.
- **`theme/`** — `ThemeController` reads `prefers-color-scheme` and supports manual override (auto/light/dark); applies/removes `.dark` class on `<html>`.
- **`styles/main.css`** — single Tailwind v4 entry (`@import "tailwindcss"`). All custom widget styles live here.

### State and persistence
**Zero UI-state persistence by design.** Theme override, view mode, sidebar collapse, splitter position all reset on reload. Reasoning: in release builds the port is OS-assigned, so each launch is a different origin → `localStorage` wouldn't survive anyway. Don't add `localStorage` without revisiting this.

### Save flow
1. CodeMirror `onDocChange` → `store.set({ saveState: 'unsaved' })` and `saveDebouncer.trigger()` (750ms debounce).
2. Debounce fires → `performSave()` → `PUT /api/file` → `saveState: 'saved'`.
3. **Blur** flushes the debouncer with regular fetch (`unload: false`).
4. **`beforeunload`** flushes with `keepalive: true` (which has a 64KB cap — that's why we don't use it for normal saves).
5. After any `editor.setDoc(...)` call, **always call `saveDebouncer.cancel()`** to prevent an echo-save of programmatically-set content.

### SSE flow and self-write echo
- On any `fileChanged` event, the frontend re-fetches `/api/files` (tree refresh) and then calls `reconcileFile(path)` for the current file.
- `reconcileFile` fetches the file and compares to editor content. If equal → no-op (this silently absorbs the echo from our own writes).
- If different and editor is clean → silent reload via `setDoc`.
- If different and editor is dirty → show conflict banner ("Reload from disk" / "Keep my version").
- On SSE reconnect, both tree refresh and current-file reconcile run (catch-up after disconnect).

### CodeMirror 6 layout gotcha
CM6 does **not** set `.cm-editor { height: 100% }` or `.cm-scroller { overflow: auto }` by default. Without both, long docs grow the editor beyond its container and get clipped. We add a static `EditorView.theme` for both in `editor/setup.ts`. If you change centering/padding, **don't use `margin: 0 auto` on `.cm-content`** — auto margins on a flex item interfere with CM's vertical scroll height plumbing. Center via `.cm-scroller { justify-content: center }` instead.

### GFM consistency
The Lezer markdown parser used in the editor **must** be configured with the same extensions as the test helper that walks the tree. Both `editor/setup.ts` (via `markdown({ extensions: [GFM] })`) and `editor/decorations.ts` enable GFM. If you add another extension (e.g. footnotes), enable it in both places.

### Vite/Vitest config
`vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`) so the `test:` block typechecks. The `tailwindcss()` plugin is cast `as any` because its plugin export type is slightly broader than vitest/config's re-exported `Plugin` type — this is a known cost of co-configuring vite and vitest in one file.

## Tests
- Backend: XCTest under `Tests/reedTests/`. Run with `swift test`.
- Frontend: Vitest with **happy-dom** (not jsdom — happy-dom 20+ to avoid CVEs in older releases). Tests live next to source as `*.test.ts`.
- KaTeX dependency: `@vscode/markdown-it-katex` is intentionally used instead of the original `markdown-it-katex` (which has an unpatched XSS).

## Specs and plans
**Specs are living docs, not dated snapshots.** Save specs to `docs/specs/<topic>.md` (no date prefix) and edit them in place as the system evolves — they are the canonical source of truth for design decisions. Do not create new dated files for revisions; update the existing topic file. This overrides the default `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` convention from the brainstorming skill.

Plans keep dates: save to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`. Plans are point-in-time execution artifacts (one plan per implementation push) and may legitimately repeat against the same spec years apart.

## Pull request titles
Use conventional-commit prefixes in PR titles (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `ci:`, `test:`). The repo squash-merges, so GitHub uses the PR title as the merge commit's subject, and release-please reads that subject (not the squashed body) to decide version bumps. A PR titled `Add foo and bar` produces a non-conventional squash subject and gets skipped by release-please even if individual branch commits used proper prefixes. `feat:` → minor, `fix:` → patch, `feat!:` or `BREAKING CHANGE:` footer → major; the rest don't trigger a release.
