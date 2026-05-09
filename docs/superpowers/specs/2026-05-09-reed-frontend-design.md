# reed — Frontend Design (Milestone 2)

**Date:** 2026-05-09
**Scope:** Frontend (Vite + TypeScript + Tailwind + CodeMirror + markdown-it). Plus one small backend addition: `--port` flag and dev/prod default-port behavior.
**Target platform:** macOS (the binary's target). Browser: any modern Chromium / Safari (the user's default browser, opened by `NSWorkspace.shared.open`).

---

## Overview

Reed's backend (Milestone 1) exposes the markdown directory over HTTP: file tree, file read/write, SSE for external changes. Milestone 2 builds the browser UI that consumes those routes and gives the user a daily-driver markdown editor.

Two view modes:
- **Inline (default)** — single-pane CodeMirror editor with markdown decorations applied in-place. Markers stay visible alongside styling. The "writing" mode.
- **Split** — plain CodeMirror on the left, fully-rendered markdown-it preview on the right, scroll-synced. The "see how it'll render" mode.

The UI is intentionally quiet: no top bar, no menus. A floating glass pill in the upper-right of the editor pane carries all global controls (theme, mode, save status). The sidebar carries the file tree and nothing else.

---

## Tech stack

- **Build**: Vite (TypeScript)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Editor**: CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/lang-markdown`)
- **Markdown rendering**: `markdown-it` plus plugins (see Preview section)
- **Math**: KaTeX (via `markdown-it-katex`)
- **Diagrams**: Mermaid (lazy-loaded only when needed)
- **Code highlighting**: highlight.js (common-language build)
- **Tests**: Vitest + happy-dom

No framework (no React/Vue/Solid). reed's UI surface is small; vanilla TS with focused modules is sufficient and keeps the bundle minimal.

---

## Project structure

```
reed/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.ts                # entry point, app boot
│   │   ├── api/                   # API client, SSE client
│   │   ├── editor/                # CodeMirror setup, decoration plugin
│   │   ├── preview/               # markdown-it pipeline, mermaid, scroll sync
│   │   ├── state/                 # app state (mode, current file, save status)
│   │   ├── ui/                    # FileTree, Pill, ConflictBanner, EmptyState
│   │   └── styles/                # tailwind base + custom CSS
│   └── tests/                     # Vitest specs (mirror src/ structure)
├── Sources/reed/Resources/        # gitignored; Vite's build output lands here
├── Sources/reed/...               # existing Swift sources
├── Tests/reedTests/
└── Package.swift
```

`Sources/reed/Resources/` is already gitignored. CI populates it before `swift build`.

---

## Backend integration (one small change)

Frontend uses **relative URLs only**. In production the Swift backend serves both the HTML and the API on the same origin, so relative URLs resolve naturally. In dev the Vite dev server serves the HTML on its own port and proxies non-Vite paths to the Swift backend.

**One backend change required for this milestone:** add a `--port` flag with environment-aware defaults.

```swift
#if DEBUG
let defaultPort: UInt16 = 8765
#else
let defaultPort: UInt16 = 0
#endif
```

Behavior:
- **DEBUG builds** (`swift build`, `swift run`): default port 8765. If 8765 is in use, exit with a clear error (the dev wants to know about port collisions).
- **Release builds** (`swift build -c release`): default port 0 (OS-assigned, never collides — same as today's behavior).
- `--port <n>` overrides the default in both. `--port 0` is the explicit OS-assigned escape hatch.
- Bound port is always printed to stdout as before (`Listening on http://localhost:PORT`).

This is the only Swift-side change for this milestone.

---

## Application shell & layout

Two top-level layouts based on the backend's `/api/config` response:

### Directory mode (`reed ~/notes` or `reed`)

```
┌─────────────┬───────────────────────────────────────┐
│ ~/notes  ⇤  │                            [pill]     │
│ ───────────│                                       │
│ readme.md   │                                       │
│ notes.md ●  │   Editor pane                         │
│ ▸ docs      │                                       │
│             │                                       │
└─────────────┴───────────────────────────────────────┘
```

- Sidebar on the left: header (folder name + collapse chevron) + file tree
- Editor pane fills the rest of the window
- Floating pill in the upper-right of the editor pane

### Single-file mode (`reed notes.md`)

```
┌─────────────────────────────────────────────────────┐
│                                            [pill]   │
│                                                     │
│   Editor pane (full window)                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- No sidebar at all
- Editor pane fills the window with a max-width content column for readability
- Floating pill in the upper-right

### The pill (always present, identical content in both modes)

```
┌─────────────────────────────────────────────┐
│ [Auto · ☀ · ☾] │ [Inline · Split] │ ● Saved │
└─────────────────────────────────────────────┘
```

- Three regions separated by 1px vertical dividers:
  - **Theme override**: 3-segment toggle `Auto · ☀ · ☾`
  - **View mode**: 2-segment toggle `Inline · Split`
  - **Status**: colored dot + text label
- Frosted background (`backdrop-filter: blur(12px)`), soft shadow, 999px border-radius
- Detached from window edges (~14px from top, ~16px from right of the editor pane)
- In Mode B (split), the pill is anchored to the upper-right of the **editor pane** (not the window), so it doesn't drift over the preview

### Sidebar collapse (directory mode only)

- Collapse chevron in the sidebar header collapses the sidebar to zero width
- A thin always-visible vertical handle on the left edge of the window expands it back
- `Cmd+\` toggles
- State is **not** persisted — every launch starts expanded

### Mode B split

- Editor on left, preview on right
- Draggable vertical splitter, default 50/50
- Ratio is **not** persisted — every launch starts at 50/50

### Global keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+E` | Toggle Inline ↔ Split |
| `Cmd+\` | Toggle sidebar (directory mode only) |

(No `Cmd+S` — autosave handles saving. CodeMirror's standard editing keymap handles undo/redo, comment toggle, etc.)

---

## File tree (sidebar)

Used in directory mode only.

- **Data source**: `GET /api/files` (Milestone 1 endpoint). Response is a recursive tree of `.md` files honoring `.gitignore`.
- **Sort**: directories first, then files; alphabetical within each group; case-insensitive.
- **Initial state**: all directories collapsed. Single click on a directory row toggles its expanded state. State is **not** persisted.
- **File selection**: single click on a file row loads it into the editor. The currently-loaded file is visually highlighted.
- **Refresh**: re-fetched on every SSE `fileChanged` event so additions/deletions appear without manual reload. Expanded/collapsed state of unaffected directories is preserved across refreshes (compute the diff against the previous tree, keep expand state for nodes that still exist).
- **Keyboard navigation**: not in v1 (mouse only). Captured as a follow-up.

This baseline may be tweaked during implementation as the interaction surface gets exercised.

---

## The editor

A single CodeMirror 6 instance mounted into the editor pane. Configured with:

- `@codemirror/lang-markdown` (provides the Lezer syntax tree)
- Line wrap **on**
- Line numbers **off**
- Standard editing keymap
- A custom `ViewPlugin` produces the inline decorations for Mode A
- An `EditorState` compartment wraps the decoration plugin so it can be swapped in/out when toggling modes

### Mode A — Inline (default)

- Editor pane is full-width (after sidebar)
- Font: proportional sans-serif (system UI font stack)
- Decoration plugin walks the Lezer tree on each visible-range change and emits `Decoration.mark()` ranges with these classes:

| Class | Markdown | Effect |
|---|---|---|
| `cm-md-heading-1` … `cm-md-heading-6` | `# H1` … `###### H6` | Larger font + weight (`#` markers stay visible) |
| `cm-md-strong` | `**bold**` | Bold (markers stay visible) |
| `cm-md-emphasis` | `_italic_` / `*italic*` | Italic (markers stay visible) |
| `cm-md-strikethrough` | `~~strike~~` | Line-through (markers stay visible) |
| `cm-md-inline-code` | `` `code` `` | Monospace + soft background |
| `cm-md-fenced-code` | ` ```...``` ` | Block-level monospace + background |
| `cm-md-blockquote` | `> ...` | Left bar + indent |
| `cm-md-list-item` | `- item` / `1. item` | Light bullet/number styling |
| `cm-md-link` | `[text](url)` | Color, underline (markers stay visible) |

Tailwind utility classes drive the actual visual styling; the plugin only assigns class names.

**Out of scope for Mode A decorations**: inline images rendered as `<img>`, task list checkbox widgets, math typesetting, frontmatter styling, horizontal rule rendered as a line.

### Mode B — Split

- Pane splits 50/50 with a draggable vertical splitter
- Editor's font flips to monospace (matches "you're working with source" feel)
- Decoration plugin disabled via the compartment swap (clean source view)
- Preview pane on the right renders HTML output of `markdown-it` (see Preview Pipeline)
- Live update: every editor change re-renders the preview synchronously
- Bidirectional scroll sync (see Preview Pipeline)

### Mode toggle behavior

- `Cmd+E` or pill click swaps modes
- Editor cursor and selection preserved across the swap (the underlying `EditorState` doesn't change — only the decoration compartment toggles)
- Scroll position approximately preserved

### Editor lifecycle

- **On file load**: replace the editor's document via a `EditorState.create()` with the new content
- **On file switch**: same, after flushing the pending save for the current file
- **On external clean reload**: `dispatch` a transaction that replaces the doc; cursor preserved if possible

---

## Preview pipeline

Used in Mode B only.

### Pipeline

```
editor doc → markdown-it.render(doc, env) → HTML → preview.innerHTML → post-render hooks
```

### markdown-it config

- `html: true` (embedded HTML passes through; these are local trusted files)
- `linkify: true`
- `typographer: false`

### Plugins

- `markdown-it-task-lists` — read-only checkboxes (`<input type="checkbox" disabled>`)
- `markdown-it-footnote`
- `markdown-it-katex` — math via KaTeX
- `markdown-it-github-alerts` — GFM-style `> [!NOTE]` blocks (NOTE / TIP / IMPORTANT / WARNING / CAUTION)
- A small custom rule for `mermaid` fenced code blocks (intercepts before the highlight pass; emits `<div class="mermaid-block" data-source="...">` placeholders)
- highlight.js wired via the markdown-it `highlight` option for non-mermaid fenced code blocks

### Mermaid — lazy & cached

- The bundle is dynamically imported only the first time a doc with a `mermaid` block is rendered:
  ```ts
  const { default: mermaid } = await import('mermaid');
  ```
- Rendered SVG is cached in a `Map<string, string>` keyed by the diagram source.
- After the preview's HTML is inserted, a post-render pass scans for `.mermaid-block` elements and either pulls the cached SVG into the placeholder or calls `mermaid.render()` and caches the result.
- Documents with no mermaid blocks pay zero cost — bundle is never loaded, no scan runs.

### Link rules

- External (`http://`, `https://`) → rendered with `target="_blank" rel="noopener noreferrer"`
- Internal `.md` links → plain `<a>`, no special handling. Clicking lets the browser navigate (which hits the wildcard route on the backend and renders the raw markdown bytes).

### Image rules

- Rendered as `<img src="...">` with the markdown's URL as-is. Relative paths resolve against the same origin via the backend's `/**` wildcard route.

### Scroll sync

Used in Mode B only.

- During preview render, every block-level token's `data-line` attribute is set to the start line of its source range (markdown-it's `token.map[0]` provides this).
- A `ScrollSync` module installs scroll handlers on both panes:
  - **Editor → Preview**: on editor scroll, find the source line at the editor's top visible position; find the nearest `[data-line]` element with `data-line >= line`; scroll the preview to put that element at the same relative top.
  - **Preview → Editor**: symmetric — find the topmost `[data-line]` element in the preview viewport; convert its line to a CodeMirror scrollTop and dispatch.
- A small mutex flag (`syncing`) prevents the two handlers from feedback-looping (handler sets it before scrolling the opposite pane; clears on next animation frame).

### Re-render triggers

- Every editor change → re-render preview synchronously
- Performance budget: docs up to ~100KB should render in <50ms on a typical M-series Mac. If measurement shows jank, add a 50ms `requestIdleCallback` throttle.

### Sanitization

We do not sanitize. These are the user's local files; trust is fine.

---

## Save & sync

### Autosave debounce

- 750ms idle timer after the last edit. Each edit cancels and restarts the timer.
- Triggers also fire on:
  - **Blur** — window/tab loses focus
  - **File switch** — clicked another file in the tree
  - **Unload** — `beforeunload` flushes the pending save via `fetch(..., { keepalive: true })` (PUT — `sendBeacon` doesn't support PUT)
- No `Cmd+S` shortcut.

### Status indicator state machine

The `●` and label in the pill:

| State | Color | Label | Trigger |
|---|---|---|---|
| Saved | green | `Saved` | Boot, or successful save with no pending edits |
| Unsaved | amber | `Unsaved` | User typed; debounce timer running |
| Saving | blue | `Saving…` | PUT in flight |
| Save failed | red | `Save failed` | PUT returned non-2xx; auto-retries on next edit |
| Reconnecting | orange | `Reconnecting…` | SSE connection dropped |

Save state and SSE connection state are tracked independently. `Reconnecting…` overrides the save states when both are happening — if the SSE drops while a save is mid-flight, the user sees `Reconnecting…` until the SSE is back, then the save state takes over again.

### External change handling (SSE → editor)

Every `fileChanged` event for the currently-open file triggers:

1. `GET /api/file?path=<current>` — fetch fresh disk content
2. Compare to editor's current content
3. **Equal** → no-op (this was our own write echoing back; expected and silent)
4. **Different + editor is "clean"** (no in-flight save, content matches last-loaded-from-disk) → silently dispatch a CodeMirror transaction that replaces the doc with disk content. Cursor preserved as best as the transaction system allows.
5. **Different + editor has unsaved changes** → show a non-blocking conflict banner at the top of the editor pane:

   > *This file changed on disk.* [**Reload from disk**] [**Keep my version**]
   - **Reload from disk**: replaces editor content with disk content; user loses their unsaved local edits
   - **Keep my version**: dismisses the banner; the next debounced save overwrites disk

### SSE → tree refresh

Any `fileChanged` event (regardless of whether it's for the current file) triggers a `/api/files` refresh, so the sidebar reflects new files, deletions, etc.

### SSE connection management

- `EventSource` with a custom backoff wrapper (browser auto-reconnect timing is unpredictable; we want explicit control)
- On disconnect: pill status flips to `Reconnecting…`; reconnect with backoff: 1s, 2s, 4s, 8s, capped at 30s. Reset on successful connection.
- On successful reconnect: refresh `/api/files` and re-fetch the current file (catch up on anything missed during the outage). Apply the same change-handling logic as a regular SSE event.

### Self-write detection

The fetch in step 3 above is the protection against our own writes echoing back. The fetch is the source of truth; we never trust the SSE event payload alone. Cost: one extra GET per save. Local backend; trivial.

---

## Boot sequence

Every page load (initial or refresh) follows the same sequence:

1. `GET /api/config` → learn launch mode (`directory` or `singleFile`) and filename (if any)
2. **Single-file mode**: also `GET /api/file?path=<filename>` → load editor with that file
3. **Directory mode**: `GET /api/files` → render sidebar with the tree fully collapsed; editor pane shows the empty state ("Select a file to open"); user clicks to load
4. Open `EventSource` to `/events`

The backend process is independent of frontend lifecycle. Refreshing the browser resets all frontend state but the backend (root directory, mode, file watcher, broadcaster) is unaffected.

---

## Persistence

**Zero persistence.** No localStorage, no cookies, no backend preferences endpoint.

| State | Boot value |
|---|---|
| Theme override | Auto (system-follow) |
| View mode | Inline |
| Sidebar collapsed | Expanded (directory mode only) |
| Splitter ratio | 50/50 |
| File tree expand state | All directories collapsed |

Each launch is a clean slate. This matches reed's ephemeral CLI-launched mental model. We can revisit if real friction emerges.

---

## Empty & error states

- **No `.md` files in the directory** (directory mode): editor pane shows a centered message: *"No markdown files in this folder."*
- **Backend unreachable** (initial config fetch fails or SSE never connects after multiple retries): editor pane shows: *"Connection lost — refresh the page when reed is running again."*
- **File not found** (clicked a file that's been deleted between tree refreshes): editor shows *"File no longer exists"* and clears the selection. The tree will update on the next SSE event.
- **No file selected** (directory mode, fresh boot): editor pane shows *"Select a file to open."*

---

## Build pipeline

### Vite config

```ts
// frontend/vite.config.ts
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: '../Sources/reed/Resources',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8765',
      '/events': { target: 'http://localhost:8765', changeOrigin: true, ws: false },
      // wildcard static-file route (images, etc.) — proxy anything not handled by Vite
      // (Vite serves the SPA and frontend assets; everything else goes to the backend)
    },
  },
});
```

(The `/**` wildcard is more nuanced — Vite needs to serve its own assets but proxy other paths. The `vite-plugin-proxy` pattern or a small custom middleware in `configureServer` handles this; the implementation plan will detail it.)

### Tailwind v4

- Class-based dark variant (Tailwind v4 declares this via a `@custom-variant dark (&:where(.dark, .dark *))` rule in the entry CSS)
- Frontend listens to `prefers-color-scheme` and toggles `class="dark"` on `<html>` based on the theme override:
  - `Auto` → matches `prefers-color-scheme`
  - `☀` (Light) → never `dark`
  - `☾` (Dark) → always `dark`

### Dev workflow

Two terminals:
- Terminal 1: `swift run reed --port 8765 ~/notes`
- Terminal 2: `cd frontend && npm run dev`

Open the Vite URL printed in Terminal 2 (e.g. `http://localhost:5173`). HMR works for all frontend code; API and SSE proxy through to the Swift backend.

### Prod build

Matches the existing `docs/publishing.md` pipeline:

```bash
cd frontend && npm ci && npm run build
# Sources/reed/Resources/{index.html, assets/...}
swift build -c release
```

The release binary is self-contained; no Vite involvement at runtime.

---

## Testing

### Frontend (Vitest + happy-dom)

Pure logic (TDD):
- Autosave debounce timer (deterministic timing tests with fake timers)
- Scroll-sync line→position math
- File-tree builder (path list → nested tree)
- Conflict-resolution state machine
- Status-indicator state machine
- SSE backoff schedule (1s, 2s, 4s, 8s, capped at 30s)

Components in isolation (happy-dom):
- `FileTree` renders a given dataset with correct nesting and active-item highlighting
- `Pill` renders the right state for each input (theme, mode, status combinations)
- `ConflictBanner` renders and dismisses on action
- `EmptyState` shows the right message for each case

Editor glue:
- Mount CodeMirror on a fixture node; assert the decoration plugin produces expected `Decoration.mark` ranges given a known doc
- Assert mode swap toggles decorations on/off (compartment swap behavior)

Markdown pipeline:
- Input markdown → expected HTML output (regression suite covering each plugin: tables, task lists, footnotes, math, alerts, mermaid placeholders)
- Scroll-sync `data-line` attributes are set on block-level elements

API/SSE clients:
- Thin fetch wrapper tested with mocked `fetch`
- SSE client tested with a mocked `EventSource` (delivers events, simulates disconnects)

### Backend

Existing XCTest suite remains. One new test for the `--port` default behavior (DEBUG vs release default selection — controllable via test target compilation flags).

---

## Out of scope for v1

To keep v1 shippable:

- Creating, renaming, or deleting files (backend doesn't support these operations)
- Search across files
- Tabs / multi-document editing
- Mobile / touch UI
- Plugin system / user customization
- Configurable autosave timing
- Vim/Emacs keybindings
- Math equation editing helpers (KaTeX renders only)
- Mermaid theme switching synced to system theme
- Persisted UI state (sidebar, mode, splitter — confirmed reset every launch)
- End-to-end browser testing (Playwright). Vitest unit/component coverage only.
- Manual `Cmd+S` save (autosave covers it)
