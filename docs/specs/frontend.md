# reed — Frontend Spec

The browser UI that consumes the backend's HTTP and SSE routes and gives the user a daily-driver markdown editor. Single CodeMirror 6 editor with two view modes (inline-decorated and split-with-preview), a floating glass pill for controls, and a file-tree sidebar in directory mode.

For the high-level shape, see [`docs/architecture.md`](../architecture.md). For the backend routes the frontend consumes, see [`docs/specs/backend.md`](backend.md). For operational commands, see [`CLAUDE.md`](../../CLAUDE.md).

## Tech stack

- **Build**: Vite + TypeScript
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Editor**: CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/lang-markdown`, `@lezer/markdown`)
- **Markdown rendering**: `markdown-it` + plugins (task lists, footnotes, GitHub alerts, KaTeX via `@vscode/markdown-it-katex`)
- **Math**: KaTeX
- **Diagrams**: Mermaid (lazy-loaded only when a doc contains a `mermaid` block)
- **Code highlighting**: highlight.js (common-language build)
- **Tests**: Vitest + happy-dom

No framework. reed's UI surface is small; vanilla TS with focused modules keeps the bundle minimal.

## Source layout

```
frontend/src/
├── main.ts                # boot sequence, wires the modules
├── api/
│   ├── client.ts          # typed REST wrapper over /api/*
│   ├── sse.ts             # EventSource with exponential backoff
│   └── types.ts           # shared API types
├── editor/
│   ├── setup.ts           # CodeMirror EditorView construction
│   ├── decorations.ts     # Lezer tree walker → Decoration.mark ranges
│   ├── markdownKeymap.ts  # Cmd+B/I/Shift+X/K, list-aware Tab/Shift+Tab
│   └── modes.ts           # applyMode() compartment swap (Inline ↔ Split)
├── preview/
│   ├── markdown.ts        # markdown-it pipeline
│   ├── mermaid.ts         # lazy loader + SVG cache
│   └── scrollSync.ts      # bidirectional line-attribute scroll sync
├── state/
│   ├── store.ts           # pub/sub store with shallow dedup
│   ├── types.ts           # AppState type
│   ├── saveStateMachine.ts # (saveState, sseConnected) → pill status
│   └── debounce.ts        # custom debouncer with trigger/flush/cancel
├── theme/
│   └── theme.ts           # ThemeController (auto/light/dark)
├── ui/
│   ├── pill.ts            # floating glass pill
│   ├── fileTree.ts        # sidebar tree
│   ├── splitter.ts        # split-pane drag handle
│   ├── sidebarCollapse.ts # collapse chevron + edge handle
│   ├── conflictBanner.ts  # external-change conflict UI
│   └── emptyState.ts      # empty/error messages
└── styles/
    └── main.css           # Tailwind v4 entry + custom widget CSS
```

`frontend/tests/setup.ts` configures the Vitest happy-dom environment. Per-module tests live next to the source as `*.test.ts`.

## Application shell

Two top-level layouts driven by `/api/config`'s `mode` field.

### Directory mode (`reed ~/notes` or `reed`)

```
┌─────────────┬───────────────────────────────────────┐
│ ~/notes  ⇤  │                            [pill]     │
│ ─────────── │                                       │
│ readme.md   │                                       │
│ notes.md ●  │   Editor pane                         │
│ ▸ docs      │                                       │
└─────────────┴───────────────────────────────────────┘
```

- Sidebar on the left: header (folder name + collapse chevron) and file tree.
- Editor pane fills the rest of the window.
- Floating pill in the upper-right of the editor pane.

### Single-file mode (`reed notes.md`)

```
┌─────────────────────────────────────────────────────┐
│                                            [pill]   │
│   Editor pane (full window, max-width content)      │
└─────────────────────────────────────────────────────┘
```

No sidebar. Editor pane fills the window with a max-width content column for readability.

## The pill

```
┌─────────────────────────────────────────────┐
│ [Auto · ☀ · ☾] │ [Inline · Split] │ ● Saved │
└─────────────────────────────────────────────┘
```

Three regions separated by 1px vertical dividers:

- **Theme override**: 3-segment toggle `Auto · ☀ · ☾`. Default `Auto` follows `prefers-color-scheme`.
- **View mode**: 2-segment toggle `Inline · Split`.
- **Status**: colored dot + text label driven by the save state machine.

Frosted background (`backdrop-filter: blur(12px)`), soft shadow, 999px border-radius. Anchored to the upper-right of the **editor pane** (~14px top, ~16px right) — in split mode this means the pill stays over the editor, not drifting over the preview.

## Sidebar

Directory mode only. Header shows the root folder name + a collapse chevron; below it is the file tree.

- Collapse chevron collapses the sidebar to zero width.
- A thin always-visible vertical handle on the left edge of the window expands it back.
- `Cmd+\` toggles.
- State is **not** persisted — every launch starts expanded.

## File tree

- **Data source**: `GET /api/files`. Response is a recursive tree of `.md` files honoring `.gitignore`.
- **Sort**: directories first, then files; alphabetical within each group, case-insensitive.
- **Initial state**: all directories collapsed. Single click on a directory row toggles expanded state. State is **not** persisted.
- **File selection**: single click loads the file into the editor. The currently-loaded file is visually highlighted.
- **Refresh**: re-fetched on every SSE `fileChanged` event. Expanded/collapsed state of unaffected directories is preserved across refreshes — the renderer diffs against the previous tree and keeps expand state for nodes that still exist.

## The editor

A single CodeMirror 6 `EditorView` mounted into the editor pane (`editor/setup.ts`):

- `@codemirror/lang-markdown` with the GFM extension provides the Lezer syntax tree.
- Line wrap on; line numbers off.
- Standard editing keymap, plus `markdownKeymap` for markdown-specific shortcuts (see below).
- Two `Compartment`s — one for the decoration `ViewPlugin`, one for the font theme — let `applyMode()` swap mode-specific behavior without reconstructing the editor.
- `.cm-editor` is given `height: 100%` and `.cm-scroller` `overflow: auto` via a static `EditorView.theme`. CodeMirror 6 does not set these by default; without them, long documents grow past the container and clip.
- Centering is done via `.cm-scroller { justify-content: center }`, **not** `margin: 0 auto` on `.cm-content` — auto margins on a flex item break CodeMirror's vertical scroll plumbing.

### Mode A — Inline (default)

- Editor pane is full-width (after the sidebar).
- Proportional sans-serif font (system UI stack).
- The decoration plugin walks the Lezer markdown tree on each visible-range change and emits `Decoration.mark()` ranges:

| Class | Markdown | Visual |
|---|---|---|
| `cm-md-heading-1` … `cm-md-heading-6` | `# H1` … `###### H6` | Larger font + weight (markers stay visible) |
| `cm-md-strong` | `**bold**` | Bold (markers stay visible) |
| `cm-md-emphasis` | `_italic_` / `*italic*` | Italic (markers stay visible) |
| `cm-md-strikethrough` | `~~strike~~` | Line-through (markers stay visible) |
| `cm-md-inline-code` | `` `code` `` | Monospace + soft background |
| `cm-md-fenced-code` | ` ```…``` ` | Block monospace + background |
| `cm-md-blockquote` | `> …` | Left bar + indent |
| `cm-md-list-item` | `- item` / `1. item` | Light bullet/number styling |
| `cm-md-link` | `[text](url)` | Color + underline (markers stay visible) |

The plugin only assigns class names; Tailwind utilities and the entry CSS drive the actual visual styling.

**Not styled in Mode A**: inline images as `<img>`, task list checkbox widgets, math typesetting, frontmatter, horizontal rule rendered as a line. These intentionally only render in Mode B's preview.

### Mode B — Split

- Pane splits 50/50 with a draggable vertical splitter; ratio is **not** persisted.
- Editor's font flips to monospace; decoration plugin disabled via the compartment swap.
- Preview pane on the right renders `markdown-it` output (see Preview pipeline).
- Every editor change re-renders the preview synchronously.
- Bidirectional scroll sync (see Preview pipeline).

### Mode toggle

`Cmd+E` or pill click. The underlying `EditorState` doesn't change — only the compartments swap — so cursor and selection are preserved across the toggle. Scroll position is approximately preserved.

### Markdown keymap (`editor/markdownKeymap.ts`)

| Shortcut | Action |
|---|---|
| `Cmd+B` | Toggle bold wrap |
| `Cmd+I` | Toggle italic wrap |
| `Cmd+Shift+X` | Toggle strikethrough wrap |
| `Cmd+K` | Toggle link wrap |
| `Tab` (in list) | Indent list item |
| `Shift+Tab` (in list) | Dedent list item |

Wrap toggles are aware of existing markers — re-pressing the same shortcut unwraps.

### Editor lifecycle

- **On file load**: replace the editor's document via `EditorState.create()` with the new content, then `saveDebouncer.cancel()` to suppress the echo-save that would otherwise follow the change event.
- **On file switch**: same, after flushing the pending save for the previously-open file.
- **On external clean reload**: dispatch a transaction that replaces the doc; cursor preserved where possible. Always followed by `saveDebouncer.cancel()`.

## Global keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+E` | Toggle Inline ↔ Split |
| `Cmd+\` | Toggle sidebar (directory mode only) |

No `Cmd+S` — autosave handles saving. CodeMirror's standard keymap handles undo/redo, comment toggle, etc.

## Preview pipeline

Used in Mode B only.

```
editor doc → markdown-it.render(doc, env) → HTML → preview.innerHTML → post-render hooks
```

### markdown-it config

- `html: true` (embedded HTML passes through; these are the user's local trusted files).
- `linkify: true`.
- `typographer: false`.

### Plugins

- `markdown-it-task-lists` — read-only checkboxes (`<input type="checkbox" disabled>`).
- `markdown-it-footnote`.
- `@vscode/markdown-it-katex` — math via KaTeX. **Used instead of `markdown-it-katex`** because the original has an unpatched XSS.
- `markdown-it-github-alerts` — GFM-style `> [!NOTE]` blocks (NOTE / TIP / IMPORTANT / WARNING / CAUTION).
- A small custom rule for `mermaid` fenced blocks — intercepts before highlight, emits `<div class="mermaid-block" data-source="…">` placeholders.
- highlight.js is wired via the markdown-it `highlight` option for non-mermaid fenced code blocks.

### Mermaid — lazy and cached

- The Mermaid bundle is dynamically imported only the first time a doc with a `mermaid` block is rendered:
  ```ts
  const { default: mermaid } = await import('mermaid');
  ```
- Rendered SVG is cached in a `Map<string, string>` keyed by the diagram source string.
- After the preview's HTML is inserted, a post-render pass scans for `.mermaid-block` elements and either pulls cached SVG into the placeholder or calls `mermaid.render()` and caches the result.
- Docs with no mermaid blocks pay zero cost — the bundle is never loaded, no scan runs.

### Link rules

- External (`http://`, `https://`) → `target="_blank" rel="noopener noreferrer"`.
- Internal `.md` links → plain `<a>`. Clicking lets the browser navigate, hitting the backend's wildcard route which returns the raw markdown bytes.

### Image rules

Rendered as `<img src="…">` with the markdown URL as-is. Relative paths resolve against the same origin via the backend's `/**` wildcard route.

### Scroll sync (`preview/scrollSync.ts`)

- During preview render, every block-level token's `data-line` attribute is set to its source range's start line (from `token.map[0]`).
- The `ScrollSync` module installs scroll handlers on both panes:
  - **Editor → Preview**: find the source line at the editor's top visible position; find the nearest `[data-line]` element with `data-line >= line`; scroll the preview to put that element at the same relative top.
  - **Preview → Editor**: symmetric; find the topmost `[data-line]` in the preview viewport, convert to a CodeMirror `scrollTop`, dispatch.
- A small mutex (`syncing` flag, cleared on next `requestAnimationFrame`) prevents the two handlers from feedback-looping.

### Re-render triggers

Every editor change re-renders synchronously. Performance budget: docs up to ~100KB render in <50ms on a typical M-series Mac. If profiling shows jank, add a 50ms `requestIdleCallback` throttle.

### Sanitization

We don't sanitize. These are the user's local trusted files.

## Save and sync

### Autosave debounce

- 750ms idle timer after the last edit. Each edit cancels and restarts.
- Also flushes on:
  - **Blur** — window/tab loses focus.
  - **File switch** — clicked another file in the tree.
  - **Unload** — `beforeunload` flushes with `fetch(..., { keepalive: true })`. `keepalive` has a 64KB body cap — that's why regular saves use plain `fetch`.
- No `Cmd+S` shortcut.

### Save state machine (`state/saveStateMachine.ts`)

The pill's status indicator is derived from `(saveState, sseConnected)`:

| State | Color | Label | Trigger |
|---|---|---|---|
| Saved | green | `Saved` | Boot, or successful save with no pending edits |
| Unsaved | amber | `Unsaved` | User typed; debounce timer running |
| Saving | blue | `Saving…` | PUT in flight |
| Save failed | red | `Save failed` | PUT returned non-2xx; auto-retries on next edit |
| Reconnecting | orange | `Reconnecting…` | SSE connection dropped |

`Reconnecting…` overrides the save states when both are happening — if SSE drops while a save is mid-flight, the user sees `Reconnecting…` until SSE is back, then the save state takes over again.

### External change handling (SSE → editor)

Every `fileChanged` event for the currently-open file:

1. `GET /api/file?path=<current>` — fetch fresh disk content.
2. Compare to the editor's current content.
3. **Equal** → no-op. This is our own write echoing back; expected and silent.
4. **Different + editor is clean** → silently dispatch a CodeMirror transaction replacing the doc with disk content. Cursor preserved where possible. Always followed by `saveDebouncer.cancel()`.
5. **Different + editor has unsaved changes** → show a non-blocking conflict banner at the top of the editor pane:

   > *This file changed on disk.* [**Reload from disk**] [**Keep my version**]
   - **Reload from disk**: replaces editor content with disk content; user loses unsaved local edits.
   - **Keep my version**: dismisses the banner; the next debounced save overwrites disk.

### SSE → tree refresh

Any `fileChanged` event (regardless of which file) triggers a `/api/files` refresh, so the sidebar reflects additions and deletions.

### SSE connection management (`api/sse.ts`)

- `EventSource` wrapped to give us explicit control over reconnect timing.
- On disconnect: pill status flips to `Reconnecting…`; reconnect with backoff `[1s, 2s, 4s, 8s, 16s, 30s]`.
- On successful reconnect: refresh `/api/files` and reconcile the current file (catch up on anything missed during the outage).
- A double-start guard prevents two concurrent EventSources.

### Self-write detection

Step 1 above (the fetch) is the protection against our own writes echoing back. The fetch is the source of truth; we never trust the SSE event payload alone. Cost is one extra `GET` per save against a local backend — trivial.

## Boot sequence

Every page load (initial or refresh) follows the same sequence:

1. `GET /api/config` → learn launch mode (`directory` or `singleFile`) and filename (if any).
2. **Single-file mode**: `GET /api/file?path=<filename>` → load editor with that file.
3. **Directory mode**: `GET /api/files` → render the sidebar with all directories collapsed; editor pane shows the empty state ("Select a file to open"); user clicks to load.
4. Open `EventSource` to `/events`.

The backend process is independent of frontend lifecycle. Refreshing the browser resets all frontend state; the backend (root, mode, file watcher, broadcaster) is unaffected.

## State and persistence

**Zero UI-state persistence by design.**

| State | Boot value |
|---|---|
| Theme override | Auto (system-follow) |
| View mode | Inline |
| Sidebar collapsed | Expanded (directory mode only) |
| Splitter ratio | 50/50 |
| File tree expand state | All directories collapsed |

The reasoning: in release builds the port is OS-assigned, so each launch is a different origin — `localStorage` wouldn't survive anyway. Adding persistence requires reconsidering that choice, not retrofitting `localStorage` ad-hoc.

## Empty and error states

- **No `.md` files in the directory** (directory mode): editor pane shows *"No markdown files in this folder."*
- **Backend unreachable** (initial config fetch fails or SSE never connects after multiple retries): *"Connection lost — refresh the page when reed is running again."*
- **File not found** (clicked a file that's been deleted between tree refreshes): *"File no longer exists"* and clear the selection. The tree updates on the next SSE event.
- **No file selected** (directory mode, fresh boot): *"Select a file to open."*

## Build pipeline

### Vite config

`frontend/vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`) so the `test:` block typechecks. The `tailwindcss()` plugin is cast `as any` because its exported plugin type is slightly broader than vitest/config's re-exported `Plugin` type — a known cost of co-configuring vite and vitest in one file.

```ts
export default defineConfig({
  plugins: [tailwindcss() as any],
  build: {
    outDir: '../Sources/reed/Resources',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8765',
      '/events': { target: 'http://localhost:8765', changeOrigin: true, ws: false },
    },
  },
  test: { /* … */ },
});
```

`outDir` points directly into the Swift bundle resources path — `npm run build` writes there with no `cp` step in CI.

### Tailwind v4

- Class-based dark variant declared via `@custom-variant dark (&:where(.dark, .dark *))` in `styles/main.css`.
- `theme/theme.ts` listens to `prefers-color-scheme` and toggles `class="dark"` on `<html>`:
  - `Auto` → matches `prefers-color-scheme`.
  - `☀` (Light) → never `dark`.
  - `☾` (Dark) → always `dark`.

### Dev workflow

Two terminals:
- Terminal 1: `swift run reed --port 8765 ~/notes`
- Terminal 2: `cd frontend && npm run dev`

Open the Vite URL printed in Terminal 2 (e.g. `http://localhost:5173`). HMR works for all frontend code; API and SSE proxy through to the Swift backend.

### Prod build

```bash
cd frontend && npm ci && npm run build   # writes Sources/reed/Resources/
swift build -c release                    # bundles via .copy("Resources")
```

The release binary is self-contained; no Vite involvement at runtime.

## Testing

Vitest with **happy-dom** (not jsdom — happy-dom 20+ to avoid CVEs in older releases). Tests live next to source as `*.test.ts`.

Pure logic (TDD-friendly):
- `state/debounce.ts` — deterministic timing with fake timers.
- `state/saveStateMachine.ts` — input combinations to derived status.
- `preview/scrollSync.ts` — line-to-position math.
- `ui/fileTree.ts` — path list → nested tree.
- `editor/markdownKeymap.ts` — wrap-toggle and list-indent behavior.

Components in isolation (happy-dom):
- `pill.ts`, `fileTree.ts`, `conflictBanner.ts`, `splitter.ts`, `sidebarCollapse.ts`.

Editor glue:
- Mount CodeMirror on a fixture node; assert the decoration plugin produces expected `Decoration.mark` ranges given a known doc.
- Assert `modes.applyMode()` toggles decorations on/off correctly.

Markdown pipeline:
- Input markdown → expected HTML output (regression suite covering each plugin: tables, task lists, footnotes, math, alerts, mermaid placeholders).
- Scroll-sync `data-line` attributes are set on block-level elements.

API/SSE clients:
- `client.ts` tested with mocked `fetch`.
- `sse.ts` tested with a mocked `EventSource` (delivers events, simulates disconnects, verifies backoff schedule).

End-to-end browser testing (Playwright) is not in scope. See Future work.

## Future work

- **File CRUD** — creating, renaming, deleting files. Currently blocked on the backend not supporting these operations.
- **Search across files.**
- **Tabs / multi-document editing.**
- **Mobile / touch UI.**
- **Plugin system / user customization.**
- **Configurable autosave timing.**
- **Alternative keymaps** — Vim, Emacs.
- **Math equation editing helpers** (KaTeX preview-during-editing).
- **Mermaid theme switching** synced to the system theme.
- **End-to-end browser tests** (Playwright). Vitest unit/component coverage is the current floor.
