# reed Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser-based markdown editor UI defined in `docs/superpowers/specs/2026-05-09-reed-frontend-design.md`, plus add a `--port` CLI flag to the existing Swift backend so the dev workflow has a predictable URL.

**Architecture:** Vite + TypeScript + Tailwind v4 + vanilla TS + CodeMirror 6 + markdown-it. Same-origin in production (Swift binary serves both HTML and API); Vite dev server with proxy to a pinned Swift port (8765) in development. Zero UI-state persistence — each launch is a clean slate. Two view modes: Inline (decorated CodeMirror, single pane, default) and Split (plain CodeMirror + rendered preview with bidirectional scroll sync). All global controls live in one floating glass pill in the upper-right of the editor pane.

**Tech Stack:**
- Backend (existing, with one tweak): Swift 6.2, Hummingbird 2, ArgumentParser, XCTest
- Frontend: Vite 6, TypeScript, Tailwind CSS v4, CodeMirror 6, markdown-it (+ plugins), KaTeX, highlight.js, Mermaid (lazy)
- Frontend tests: Vitest + happy-dom

---

## File Structure

**Backend changes (one file):**

| File | Responsibility |
|---|---|
| `Sources/reed/main.swift` (modify) | Add `--port` flag; introduce `defaultPort()` and `resolvePort(requested:)` helpers using `#if DEBUG` for the dev/prod default |
| `Tests/reedTests/PortResolutionTests.swift` (new) | Unit-test the port-resolution helpers |

**Frontend (all new):**

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json, tsconfig.node.json
├── vitest.config.ts
├── index.html
├── .gitignore
├── src/
│   ├── main.ts                          # app entry; orchestrates boot
│   ├── api/
│   │   ├── types.ts                     # shared API types (LaunchMode, FileNode)
│   │   ├── client.ts                    # fetch wrappers for /api/config, /api/files, /api/file
│   │   ├── client.test.ts
│   │   ├── sse.ts                       # EventSource wrapper with backoff
│   │   └── sse.test.ts
│   ├── state/
│   │   ├── types.ts                     # AppState, ViewMode, SaveState
│   │   ├── store.ts                     # tiny pub/sub store
│   │   ├── store.test.ts
│   │   ├── saveStateMachine.ts          # pure FSM for save/SSE indicator
│   │   ├── saveStateMachine.test.ts
│   │   ├── debounce.ts                  # autosave debounce timer
│   │   └── debounce.test.ts
│   ├── theme/
│   │   ├── theme.ts                     # Auto/Light/Dark + prefers-color-scheme listener
│   │   └── theme.test.ts
│   ├── editor/
│   │   ├── setup.ts                     # CodeMirror EditorView creation, doc replacement
│   │   ├── decorations.ts               # ViewPlugin emitting Mode A decorations
│   │   ├── decorations.test.ts
│   │   ├── modes.ts                     # Compartment for swapping decorations & font
│   │   └── modes.test.ts
│   ├── preview/
│   │   ├── markdown.ts                  # markdown-it pipeline + plugins (incl. mermaid placeholder rule)
│   │   ├── markdown.test.ts
│   │   ├── mermaid.ts                   # lazy load + render + cache
│   │   ├── mermaid.test.ts
│   │   ├── scrollSync.ts                # bidirectional scroll sync
│   │   └── scrollSync.test.ts
│   ├── ui/
│   │   ├── pill.ts                      # floating pill: theme · mode · status
│   │   ├── pill.test.ts
│   │   ├── fileTree.ts                  # sidebar tree
│   │   ├── fileTree.test.ts
│   │   ├── conflictBanner.ts            # external-change conflict UI
│   │   ├── conflictBanner.test.ts
│   │   ├── emptyState.ts                # empty/error placeholders
│   │   ├── splitter.ts                  # draggable Mode B splitter
│   │   ├── splitter.test.ts
│   │   ├── sidebarCollapse.ts           # collapse/expand sidebar
│   │   └── sidebarCollapse.test.ts
│   └── styles/
│       └── main.css                     # Tailwind import + custom CSS (dark variant, pill, decorations)
└── tests/
    └── setup.ts                         # vitest global setup (happy-dom DOM env)
```

**Build output target:** `Sources/reed/Resources/` (already gitignored). Vite is configured with `build.outDir = '../Sources/reed/Resources'`.

---

## Conventions

- **Test runner**: `npx vitest run <path>` for a single file; `npm test` for all.
- **Commit prefix**: `feat:` for new features, `fix:` for bug fixes, `chore:` for tooling/config, `test:` is folded into `feat:` (no separate test commits).
- **Working dir for `npm` commands**: `frontend/` unless specified otherwise.

---

## Tasks

### Task 1: Add `--port` flag and dev/prod defaults to the Swift CLI

**Files:**
- Modify: `Sources/reed/main.swift` (currently 91 lines)
- Create: `Tests/reedTests/PortResolutionTests.swift`

- [ ] **Step 1: Write the failing test**

Create `Tests/reedTests/PortResolutionTests.swift`:

```swift
import XCTest
@testable import reed

final class PortResolutionTests: XCTestCase {
    func testDefaultPortInDebugBuild() {
        // Tests run under the debug configuration; default port should be 8765.
        XCTAssertEqual(defaultPort(), 8765)
    }

    func testResolvePortNilUsesDefault() throws {
        let port = try resolvePort(requested: nil)
        XCTAssertEqual(port, 8765)
    }

    func testResolvePortZeroUsesOsAssigned() throws {
        let port = try resolvePort(requested: 0)
        XCTAssertGreaterThan(port, 0)
    }

    func testResolvePortExplicitPortBindable() throws {
        // Pick a high random port likely free, ask resolvePort to validate it.
        // We intentionally use OS-assigned discovery first to find a free one.
        let probe = findAvailablePort()
        let port = try resolvePort(requested: probe)
        XCTAssertEqual(port, probe)
    }

    func testResolvePortInUseThrows() throws {
        // Bind a real socket to a probe port, then ensure resolvePort throws.
        let probe = findAvailablePort()
        let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        XCTAssertGreaterThanOrEqual(sock, 0)
        defer { Darwin.close(sock) }
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = probe.bigEndian
        addr.sin_addr = in_addr(s_addr: INADDR_ANY)
        let bindResult = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        XCTAssertEqual(bindResult, 0)

        XCTAssertThrowsError(try resolvePort(requested: probe))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `swift test --filter PortResolutionTests`
Expected: COMPILATION ERROR — `defaultPort` and `resolvePort` are not defined.

- [ ] **Step 3: Add `defaultPort()` and `resolvePort(requested:)` to `main.swift`**

Edit `Sources/reed/main.swift`. Replace the `// MARK: - Helpers` block at the bottom with:

```swift
// MARK: - Helpers

func resolveInput(path: String?) throws -> (root: URL, mode: LaunchMode) {
    let inputPath = path ?? FileManager.default.currentDirectoryPath
    let url = URL(fileURLWithPath: inputPath).standardized

    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
        throw ValidationError("Path does not exist: \(url.path)")
    }

    if isDirectory.boolValue {
        return (url, .directory)
    } else if url.pathExtension == "md" {
        return (url.deletingLastPathComponent(), .singleFile(url.lastPathComponent))
    } else {
        throw ValidationError("Path must be a .md file or a directory, got: \(url.path)")
    }
}

func defaultPort() -> UInt16 {
    #if DEBUG
    return 8765
    #else
    return 0
    #endif
}

struct PortInUseError: Error, CustomStringConvertible {
    let port: UInt16
    var description: String { "port \(port) is already in use" }
}

func resolvePort(requested: UInt16?) throws -> UInt16 {
    let candidate = requested ?? defaultPort()
    if candidate == 0 {
        return findAvailablePort()
    }
    let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    precondition(sock >= 0, "socket() failed")
    defer { Darwin.close(sock) }

    var reuse: Int32 = 1
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = candidate.bigEndian
    addr.sin_addr = in_addr(s_addr: INADDR_ANY)

    let bindResult = withUnsafePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            Darwin.bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
    if bindResult != 0 {
        throw PortInUseError(port: candidate)
    }
    return candidate
}

func findAvailablePort() -> UInt16 {
    let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    precondition(sock >= 0, "socket() failed")
    defer { Darwin.close(sock) }

    var reuse: Int32 = 1
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = 0
    addr.sin_addr = in_addr(s_addr: INADDR_ANY)

    let bindResult = withUnsafePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            Darwin.bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
    precondition(bindResult == 0, "bind() failed")

    var len = socklen_t(MemoryLayout<sockaddr_in>.size)
    withUnsafeMutablePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            getsockname(sock, $0, &len)
        }
    }
    return UInt16(bigEndian: addr.sin_port)
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `swift test --filter PortResolutionTests`
Expected: 5 tests pass.

- [ ] **Step 5: Wire `--port` into the `Reed` ParsableCommand**

Edit `Sources/reed/main.swift` — replace the `Reed` struct:

```swift
struct Reed: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "reed",
        abstract: "Local markdown editor"
    )

    @Argument(help: "Markdown file or directory (defaults to current directory)")
    var path: String?

    @Option(name: .long, help: "Port to bind (default: 8765 in dev, OS-assigned in release; 0 = OS-assigned)")
    var port: UInt16?

    mutating func run() throws {
        let (root, mode) = try resolveInput(path: path)
        let resolvedPort: UInt16
        do {
            resolvedPort = try resolvePort(requested: port)
        } catch let error as PortInUseError {
            fputs("reed: \(error.description)\n", stderr)
            throw ExitCode.failure
        }
        let server = ReedServer(root: root, mode: mode, port: resolvedPort)

        print("Listening on http://localhost:\(resolvedPort)")

        Task {
            do {
                try await server.run()
                Darwin.exit(0)
            } catch {
                fputs("reed: server error: \(error)\n", stderr)
                Darwin.exit(1)
            }
        }

        RunLoop.main.run()
    }
}
```

- [ ] **Step 6: Manual smoke check**

Run: `swift run reed` (in any directory containing a `.md` file)
Expected: stdout shows `Listening on http://localhost:8765`. Browser opens.

Then run a second instance from another terminal: `swift run reed --port 8765`
Expected: exits non-zero with `reed: port 8765 is already in use` on stderr.

- [ ] **Step 7: Run full test suite**

Run: `swift test`
Expected: all tests pass (existing + new `PortResolutionTests`).

- [ ] **Step 8: Commit**

```bash
git add Sources/reed/main.swift Tests/reedTests/PortResolutionTests.swift
git commit -m "feat: add --port flag with dev/prod defaults"
```

---

### Task 2: Initialize the Vite + TypeScript frontend project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.ts`
- Create: `frontend/.gitignore`

- [ ] **Step 1: Create `frontend/.gitignore`**

```
node_modules
dist
*.log
.DS_Store
```

- [ ] **Step 2: Create `frontend/package.json`**

```json
{
  "name": "reed-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/markdown-it": "^14.1.2",
    "happy-dom": "^15.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "@codemirror/lang-markdown": "^6.3.0",
    "@codemirror/language": "^6.10.0",
    "@codemirror/state": "^6.4.0",
    "@codemirror/view": "^6.34.0",
    "@lezer/markdown": "^1.3.0",
    "highlight.js": "^11.10.0",
    "katex": "^0.16.11",
    "markdown-it": "^14.1.0",
    "markdown-it-footnote": "^4.0.0",
    "markdown-it-github-alerts": "^1.0.0",
    "markdown-it-katex": "^2.0.3",
    "markdown-it-task-lists": "^2.1.1",
    "mermaid": "^11.4.0"
  }
}
```

- [ ] **Step 3: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals"],
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: Create `frontend/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: '../Sources/reed/Resources',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8765',
      '/events': {
        target: 'http://localhost:8765',
        changeOrigin: true,
        ws: false,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 6: Create `frontend/tests/setup.ts`**

```ts
// Empty for now — vitest's happy-dom env handles DOM globals.
// Add any global polyfills here as the test suite grows.
export {};
```

- [ ] **Step 7: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>reed</title>
    <link rel="stylesheet" href="/src/styles/main.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `frontend/src/main.ts`**

```ts
const root = document.getElementById('app');
if (root) {
  root.textContent = 'reed loading…';
}
```

- [ ] **Step 9: Create `frontend/src/styles/main.css`**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

html, body, #app {
  height: 100%;
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
```

- [ ] **Step 10: Install deps & verify build**

Run: `cd frontend && npm install`
Expected: success.

Run: `npm run build`
Expected: produces `Sources/reed/Resources/{index.html, assets/...}` with no errors.

Run: `npm test`
Expected: "No test files found" — this is fine, we have no tests yet.

- [ ] **Step 11: Commit**

```bash
git add frontend
git commit -m "chore: scaffold Vite + Tailwind v4 + Vitest frontend project"
```

---

### Task 3: Verify dev workflow end-to-end

**Files:** None — manual verification step. No commit unless changes are needed.

- [ ] **Step 1: Start the Swift backend on its dev port**

In one terminal: `swift run reed --port 8765 .`
Expected: `Listening on http://localhost:8765`. Default browser opens.

- [ ] **Step 2: Start the Vite dev server**

In another terminal: `cd frontend && npm run dev`
Expected: Vite prints something like `Local: http://localhost:5173/`.

- [ ] **Step 3: Open the Vite URL in the browser**

Open `http://localhost:5173` manually.
Expected: page shows "reed loading…".

- [ ] **Step 4: Verify proxy works**

In the browser DevTools console, run: `fetch('/api/config').then(r => r.json()).then(console.log)`
Expected: console logs `{ mode: 'directory' }` (or singleFile depending on what was passed to `swift run`).

- [ ] **Step 5: If anything fails, fix and re-verify before continuing**

Common fixes:
- Port mismatch between Swift `--port` and Vite `proxy` target
- Vite's `port` already taken — change `port: 5173` in `vite.config.ts`

No commit unless a config change was needed; if so:

```bash
git add frontend/vite.config.ts
git commit -m "chore: tune dev server config"
```

---

### Task 4: API types and client

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/client.test.ts`

- [ ] **Step 1: Create `frontend/src/api/types.ts`**

```ts
export type LaunchMode =
  | { mode: 'directory' }
  | { mode: 'singleFile'; file: string };

export type FileNodeType = 'file' | 'directory' | 'cap';

export interface FileNode {
  name?: string;
  path?: string;
  type: FileNodeType;
  message?: string;
  children?: FileNode[];
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/api/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConfig, getFiles, getFile, putFile } from './client';

describe('api/client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getConfig parses the directory mode response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'directory' }),
    }));
    const config = await getConfig();
    expect(config).toEqual({ mode: 'directory' });
    expect(fetch).toHaveBeenCalledWith('/api/config');
  });

  it('getConfig parses the singleFile mode response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'singleFile', file: 'notes.md' }),
    }));
    const config = await getConfig();
    expect(config).toEqual({ mode: 'singleFile', file: 'notes.md' });
  });

  it('getFiles returns the tree', async () => {
    const tree = [{ type: 'file', name: 'a.md', path: 'a.md' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => tree,
    }));
    const result = await getFiles();
    expect(result).toEqual(tree);
    expect(fetch).toHaveBeenCalledWith('/api/files');
  });

  it('getFile reads a file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# hi',
    }));
    const content = await getFile('readme.md');
    expect(content).toBe('# hi');
    expect(fetch).toHaveBeenCalledWith('/api/file?path=readme.md');
  });

  it('getFile url-encodes the path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'x',
    }));
    await getFile('docs/My Notes.md');
    expect(fetch).toHaveBeenCalledWith('/api/file?path=docs%2FMy%20Notes.md');
  });

  it('putFile sends the body as text/plain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await putFile('readme.md', 'hello');
    expect(fetch).toHaveBeenCalledWith('/api/file?path=readme.md', expect.objectContaining({
      method: 'PUT',
      body: 'hello',
      headers: expect.objectContaining({ 'Content-Type': 'text/plain; charset=utf-8' }),
    }));
  });

  it('putFile rejects on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(putFile('missing.md', 'x')).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — "Cannot find module './client'".

- [ ] **Step 4: Implement `frontend/src/api/client.ts`**

```ts
import type { LaunchMode, FileNode } from './types';

export async function getConfig(): Promise<LaunchMode> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
  return res.json() as Promise<LaunchMode>;
}

export async function getFiles(): Promise<FileNode[]> {
  const res = await fetch('/api/files');
  if (!res.ok) throw new Error(`getFiles failed: ${res.status}`);
  return res.json() as Promise<FileNode[]>;
}

export async function getFile(path: string): Promise<string> {
  const url = `/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`);
  return res.text();
}

export async function putFile(path: string, content: string): Promise<void> {
  const url = `/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: content,
    keepalive: true,
  });
  if (!res.ok) throw new Error(`putFile failed: ${res.status}`);
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/api/client.test.ts`
Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api
git commit -m "feat: api client with getConfig, getFiles, getFile, putFile"
```

---

### Task 5: SSE client with backoff

**Files:**
- Create: `frontend/src/api/sse.ts`
- Create: `frontend/src/api/sse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/sse.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeBackoffDelay, SSEClient } from './sse';

describe('computeBackoffDelay', () => {
  it.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [3, 8000],
    [4, 16000],
    [5, 30000],
    [6, 30000],
    [100, 30000],
  ])('attempt %i → %i ms', (attempt, expected) => {
    expect(computeBackoffDelay(attempt)).toBe(expected);
  });
});

describe('SSEClient', () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    readyState = 0;
    onopen: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
    closed = false;
    constructor(url: string) {
      this.url = url;
      FakeEventSource.instances.push(this);
    }
    addEventListener(name: string, cb: (ev: MessageEvent) => void) {
      const arr = this.listeners.get(name) ?? [];
      arr.push(cb);
      this.listeners.set(name, arr);
    }
    close() { this.closed = true; }
    emitOpen() { this.readyState = 1; this.onopen?.(new Event('open')); }
    emitError() { this.onerror?.(new Event('error')); }
    emit(name: string, data: string) {
      const ev = new MessageEvent(name, { data });
      this.listeners.get(name)?.forEach(cb => cb(ev));
    }
  }

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens an EventSource at /events on start', () => {
    const c = new SSEClient();
    c.start();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/events');
  });

  it('fires onConnect when the underlying source opens', () => {
    const c = new SSEClient();
    const onConnect = vi.fn();
    c.onConnect = onConnect;
    c.start();
    FakeEventSource.instances[0].emitOpen();
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('fires onFileChanged when a fileChanged event arrives', () => {
    const c = new SSEClient();
    const onFileChanged = vi.fn();
    c.onFileChanged = onFileChanged;
    c.start();
    FakeEventSource.instances[0].emit('fileChanged', JSON.stringify({ path: 'notes.md' }));
    expect(onFileChanged).toHaveBeenCalledWith('notes.md');
  });

  it('reconnects with exponential backoff on error', () => {
    const c = new SSEClient();
    const onDisconnect = vi.fn();
    c.onDisconnect = onDisconnect;
    c.start();
    FakeEventSource.instances[0].emitError();
    expect(onDisconnect).toHaveBeenCalledOnce();

    // After 1000ms a reconnect attempt opens a new EventSource.
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('stop() prevents pending reconnects', () => {
    const c = new SSEClient();
    c.start();
    FakeEventSource.instances[0].emitError();
    c.stop();
    vi.advanceTimersByTime(60000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/api/sse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/api/sse.ts`**

```ts
const SCHEDULE = [1000, 2000, 4000, 8000, 16000, 30000];

export function computeBackoffDelay(attempt: number): number {
  if (attempt < 0) return SCHEDULE[0];
  if (attempt >= SCHEDULE.length) return SCHEDULE[SCHEDULE.length - 1];
  return SCHEDULE[attempt];
}

export class SSEClient {
  onConnect: (() => void) | null = null;
  onDisconnect: (() => void) | null = null;
  onFileChanged: ((path: string) => void) | null = null;

  private source: EventSource | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.source?.close();
    this.source = null;
  }

  private open(): void {
    const source = new EventSource('/events');
    this.source = source;
    source.onopen = () => {
      this.attempt = 0;
      this.onConnect?.();
    };
    source.onerror = () => {
      this.handleError();
    };
    source.addEventListener('fileChanged', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { path: string };
        this.onFileChanged?.(data.path);
      } catch {
        // ignore malformed payloads
      }
    });
  }

  private handleError(): void {
    if (this.stopped) return;
    this.source?.close();
    this.source = null;
    this.onDisconnect?.();
    const delay = computeBackoffDelay(this.attempt);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/api/sse.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/sse.ts frontend/src/api/sse.test.ts
git commit -m "feat: SSE client with exponential backoff reconnection"
```

---

### Task 6: State types and pub/sub store

**Files:**
- Create: `frontend/src/state/types.ts`
- Create: `frontend/src/state/store.ts`
- Create: `frontend/src/state/store.test.ts`

- [ ] **Step 1: Create `frontend/src/state/types.ts`**

```ts
import type { LaunchMode, FileNode } from '../api/types';

export type ViewMode = 'inline' | 'split';
export type ThemeOverride = 'auto' | 'light' | 'dark';
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'saveFailed';

export interface ConflictState {
  diskContent: string;
}

export interface AppState {
  config: LaunchMode | null;
  fileTree: FileNode[] | null;
  currentFile: string | null;
  loadedContent: string | null;     // last-loaded-from-disk content for the current file
  viewMode: ViewMode;
  theme: ThemeOverride;
  saveState: SaveState;
  sseConnected: boolean;
  conflict: ConflictState | null;
  sidebarCollapsed: boolean;
}

export const initialAppState: AppState = {
  config: null,
  fileTree: null,
  currentFile: null,
  loadedContent: null,
  viewMode: 'inline',
  theme: 'auto',
  saveState: 'saved',
  sseConnected: false,
  conflict: null,
  sidebarCollapsed: false,
};
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/state/store.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store';
import { initialAppState } from './types';

describe('store', () => {
  it('returns the current state', () => {
    const s = createStore(initialAppState);
    expect(s.get()).toEqual(initialAppState);
  });

  it('set merges a partial update', () => {
    const s = createStore(initialAppState);
    s.set({ viewMode: 'split' });
    expect(s.get().viewMode).toBe('split');
    expect(s.get().theme).toBe('auto');
  });

  it('subscribers fire on change', () => {
    const s = createStore(initialAppState);
    const cb = vi.fn();
    s.subscribe(cb);
    s.set({ viewMode: 'split' });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].viewMode).toBe('split');
  });

  it('subscribers do not fire when state is unchanged', () => {
    const s = createStore(initialAppState);
    const cb = vi.fn();
    s.subscribe(cb);
    s.set({ viewMode: 'inline' }); // same as initial
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', () => {
    const s = createStore(initialAppState);
    const cb = vi.fn();
    const off = s.subscribe(cb);
    off();
    s.set({ viewMode: 'split' });
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run src/state/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `frontend/src/state/store.ts`**

```ts
import type { AppState } from './types';

export interface Store<T> {
  get(): T;
  set(partial: Partial<T>): void;
  subscribe(listener: (state: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(s: T) => void>();

  return {
    get: () => state,
    set: (partial) => {
      let changed = false;
      for (const k of Object.keys(partial) as Array<keyof T>) {
        if (state[k] !== partial[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type AppStore = Store<AppState>;
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/state/store.test.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/state
git commit -m "feat: app state types and tiny pub/sub store"
```

---

### Task 7: Save state machine

**Files:**
- Create: `frontend/src/state/saveStateMachine.ts`
- Create: `frontend/src/state/saveStateMachine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/state/saveStateMachine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computePillState } from './saveStateMachine';
import type { SaveState } from './types';

describe('computePillState', () => {
  const cases: Array<[
    { saveState: SaveState; sseConnected: boolean },
    { color: string; label: string },
  ]> = [
    [{ saveState: 'saved', sseConnected: true }, { color: 'green', label: 'Saved' }],
    [{ saveState: 'unsaved', sseConnected: true }, { color: 'amber', label: 'Unsaved' }],
    [{ saveState: 'saving', sseConnected: true }, { color: 'blue', label: 'Saving…' }],
    [{ saveState: 'saveFailed', sseConnected: true }, { color: 'red', label: 'Save failed' }],
    [{ saveState: 'saved', sseConnected: false }, { color: 'orange', label: 'Reconnecting…' }],
    [{ saveState: 'unsaved', sseConnected: false }, { color: 'orange', label: 'Reconnecting…' }],
    [{ saveState: 'saving', sseConnected: false }, { color: 'orange', label: 'Reconnecting…' }],
  ];
  it.each(cases)('saveState=%j sseConnected=%j', (input, expected) => {
    expect(computePillState(input.saveState, input.sseConnected)).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/state/saveStateMachine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/state/saveStateMachine.ts`**

```ts
import type { SaveState } from './types';

export interface PillStatus {
  color: 'green' | 'amber' | 'blue' | 'red' | 'orange';
  label: string;
}

export function computePillState(saveState: SaveState, sseConnected: boolean): PillStatus {
  if (!sseConnected) {
    return { color: 'orange', label: 'Reconnecting…' };
  }
  switch (saveState) {
    case 'saved': return { color: 'green', label: 'Saved' };
    case 'unsaved': return { color: 'amber', label: 'Unsaved' };
    case 'saving': return { color: 'blue', label: 'Saving…' };
    case 'saveFailed': return { color: 'red', label: 'Save failed' };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/state/saveStateMachine.test.ts`
Expected: 7 cases pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/state/saveStateMachine.ts frontend/src/state/saveStateMachine.test.ts
git commit -m "feat: save/SSE pill state machine"
```

---

### Task 8: Autosave debounce timer

**Files:**
- Create: `frontend/src/state/debounce.ts`
- Create: `frontend/src/state/debounce.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/state/debounce.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDebouncer } from './debounce';

describe('createDebouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not fire before the delay', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    vi.advanceTimersByTime(749);
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires after the delay', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    vi.advanceTimersByTime(750);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('resets the delay on subsequent triggers', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    vi.advanceTimersByTime(700);
    d.trigger(); // resets
    vi.advanceTimersByTime(700);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('flush fires immediately if pending', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    d.flush();
    expect(cb).toHaveBeenCalledOnce();
  });

  it('flush is a no-op if no pending trigger', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.flush();
    expect(cb).not.toHaveBeenCalled();
  });

  it('cancel prevents the pending fire', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('isPending reflects state', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    expect(d.isPending()).toBe(false);
    d.trigger();
    expect(d.isPending()).toBe(true);
    d.flush();
    expect(d.isPending()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/state/debounce.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/state/debounce.ts`**

```ts
export interface Debouncer {
  trigger(): void;
  flush(): void;
  cancel(): void;
  isPending(): boolean;
}

export function createDebouncer(callback: () => void, delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    trigger() {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delayMs);
    },
    flush() {
      if (timer !== null) {
        cancel();
        callback();
      }
    },
    cancel,
    isPending: () => timer !== null,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/state/debounce.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/state/debounce.ts frontend/src/state/debounce.test.ts
git commit -m "feat: autosave debouncer with trigger/flush/cancel"
```

---

### Task 9: Theme module (Auto / Light / Dark)

**Files:**
- Create: `frontend/src/theme/theme.ts`
- Create: `frontend/src/theme/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/theme/theme.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveDarkMode, applyTheme, ThemeController } from './theme';

describe('resolveDarkMode', () => {
  it.each([
    ['auto', true, true],
    ['auto', false, false],
    ['light', true, false],
    ['light', false, false],
    ['dark', true, true],
    ['dark', false, true],
  ] as const)('override=%s systemDark=%s → %s', (override, systemDark, expected) => {
    expect(resolveDarkMode(override, systemDark)).toBe(expected);
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('adds .dark class when dark', () => {
    applyTheme(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes .dark class when light', () => {
    document.documentElement.classList.add('dark');
    applyTheme(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('ThemeController', () => {
  let mqlListeners: Array<(ev: { matches: boolean }) => void>;
  let mqlMatches: boolean;

  beforeEach(() => {
    mqlListeners = [];
    mqlMatches = false;
    document.documentElement.className = '';
    vi.stubGlobal('matchMedia', (_q: string) => ({
      get matches() { return mqlMatches; },
      addEventListener: (_n: string, cb: (ev: { matches: boolean }) => void) => mqlListeners.push(cb),
      removeEventListener: () => { /* noop */ },
    }));
  });

  afterEach(() => vi.restoreAllMocks());

  it('boots in auto mode and follows system', () => {
    mqlMatches = true;
    const c = new ThemeController();
    c.start();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('overriding to light forces light', () => {
    mqlMatches = true;
    const c = new ThemeController();
    c.start();
    c.setOverride('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reacts to system changes when in auto', () => {
    mqlMatches = false;
    const c = new ThemeController();
    c.start();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    mqlMatches = true;
    mqlListeners.forEach(cb => cb({ matches: true }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores system changes when overridden', () => {
    mqlMatches = false;
    const c = new ThemeController();
    c.start();
    c.setOverride('light');
    mqlMatches = true;
    mqlListeners.forEach(cb => cb({ matches: true }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/theme/theme.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/theme/theme.ts`**

```ts
import type { ThemeOverride } from '../state/types';

export function resolveDarkMode(override: ThemeOverride, systemDark: boolean): boolean {
  if (override === 'light') return false;
  if (override === 'dark') return true;
  return systemDark;
}

export function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

type Listener = (ev: { matches: boolean }) => void;

export class ThemeController {
  private override: ThemeOverride = 'auto';
  private mql: MediaQueryList | null = null;
  private listener: Listener | null = null;

  start(): void {
    this.mql = window.matchMedia('(prefers-color-scheme: dark)');
    this.listener = (ev) => this.apply(ev.matches);
    this.mql.addEventListener('change', this.listener as EventListener);
    this.apply(this.mql.matches);
  }

  stop(): void {
    if (this.mql && this.listener) {
      this.mql.removeEventListener('change', this.listener as EventListener);
    }
    this.mql = null;
    this.listener = null;
  }

  setOverride(o: ThemeOverride): void {
    this.override = o;
    this.apply(this.mql?.matches ?? false);
  }

  getOverride(): ThemeOverride {
    return this.override;
  }

  private apply(systemDark: boolean): void {
    applyTheme(resolveDarkMode(this.override, systemDark));
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/theme/theme.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/theme
git commit -m "feat: theme controller (Auto/Light/Dark + prefers-color-scheme)"
```

---

### Task 10: Layout shell HTML and Tailwind base styles

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/styles/main.css`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Replace `frontend/index.html` with the layout shell**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>reed</title>
    <link rel="stylesheet" href="/src/styles/main.css" />
  </head>
  <body class="h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
    <div id="app" class="h-full">
      <div id="layout" class="h-full flex"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `frontend/src/styles/main.css`**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

html, body, #app {
  height: 100%;
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* Pill (floating control cluster) */
.reed-pill {
  position: absolute;
  top: 14px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(228, 228, 231, 0.9);
  border-radius: 999px;
  padding: 3px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
  font-size: 11px;
  z-index: 30;
}
.dark .reed-pill {
  background: rgba(24, 24, 27, 0.86);
  border-color: rgba(63, 63, 70, 0.9);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3);
}
.reed-seg {
  display: inline-flex;
  background: rgb(244, 244, 245);
  border-radius: 999px;
  padding: 2px;
}
.dark .reed-seg {
  background: rgb(39, 39, 42);
}
.reed-seg button {
  all: unset;
  padding: 3px 10px;
  border-radius: 999px;
  cursor: pointer;
  color: rgb(82, 82, 91);
  font-weight: 500;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
}
.dark .reed-seg button {
  color: rgb(161, 161, 170);
}
.reed-seg button.active {
  background: rgb(255, 255, 255);
  color: rgb(24, 24, 27);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.dark .reed-seg button.active {
  background: rgb(63, 63, 70);
  color: rgb(244, 244, 245);
}
.reed-pill-divider {
  width: 1px;
  height: 14px;
  background: rgb(228, 228, 231);
  margin: 0 8px;
}
.dark .reed-pill-divider {
  background: rgb(63, 63, 70);
}
.reed-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px 0 4px;
  color: rgb(82, 82, 91);
  font-size: 11px;
}
.dark .reed-status {
  color: rgb(161, 161, 170);
}
.reed-status::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(22, 163, 74);
}
.reed-status[data-color="amber"]::before { background: rgb(217, 119, 6); }
.reed-status[data-color="blue"]::before { background: rgb(37, 99, 235); }
.reed-status[data-color="red"]::before { background: rgb(220, 38, 38); }
.reed-status[data-color="orange"]::before { background: rgb(234, 88, 12); }
.reed-status[data-color="green"]::before { background: rgb(22, 163, 74); }
```

- [ ] **Step 3: Stub `frontend/src/main.ts` (boot will be wired in a later task)**

```ts
import './styles/main.css';

const layout = document.getElementById('layout');
if (layout) {
  layout.innerHTML = `<div class="flex-1 flex items-center justify-center text-zinc-500">reed loading…</div>`;
}
```

- [ ] **Step 4: Verify dev server still works**

Run (one terminal): `swift run reed --port 8765 .`
Run (another): `cd frontend && npm run dev`
Open `http://localhost:5173`. Expected: "reed loading…" centered in a light or dark background depending on system theme.

- [ ] **Step 5: Run tests to confirm nothing broke**

Run: `npm test`
Expected: existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/src/styles/main.css frontend/src/main.ts
git commit -m "feat: layout shell and pill styles"
```

---

### Task 11: Pill component

**Files:**
- Create: `frontend/src/ui/pill.ts`
- Create: `frontend/src/ui/pill.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/ui/pill.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { Pill } from './pill';

describe('Pill', () => {
  it('renders three segments and the status', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const segs = root.querySelectorAll('.reed-seg');
    expect(segs).toHaveLength(2);
    expect(root.querySelector('.reed-status')?.textContent).toContain('Saved');
  });

  it('marks the active theme button', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'dark', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const active = root.querySelectorAll('.reed-seg')[0].querySelector('.active');
    expect(active?.getAttribute('data-value')).toBe('dark');
  });

  it('marks the active mode button', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'auto', viewMode: 'split', status: { color: 'green', label: 'Saved' } });
    const active = root.querySelectorAll('.reed-seg')[1].querySelector('.active');
    expect(active?.getAttribute('data-value')).toBe('split');
  });

  it('reflects status color via data-color attribute', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'orange', label: 'Reconnecting…' } });
    expect(root.querySelector('.reed-status')?.getAttribute('data-color')).toBe('orange');
  });

  it('emits theme-change when a theme button is clicked', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    const onThemeChange = vi.fn();
    pill.onThemeChange = onThemeChange;
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const dark = root.querySelector('.reed-seg [data-value="dark"]') as HTMLButtonElement;
    dark.click();
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('emits mode-change when a mode button is clicked', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    const onModeChange = vi.fn();
    pill.onModeChange = onModeChange;
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const split = root.querySelector('.reed-seg [data-value="split"]') as HTMLButtonElement;
    split.click();
    expect(onModeChange).toHaveBeenCalledWith('split');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/ui/pill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/ui/pill.ts`**

```ts
import type { ThemeOverride, ViewMode } from '../state/types';
import type { PillStatus } from '../state/saveStateMachine';

export interface PillProps {
  theme: ThemeOverride;
  viewMode: ViewMode;
  status: PillStatus;
}

export class Pill {
  onThemeChange: ((theme: ThemeOverride) => void) | null = null;
  onModeChange: ((mode: ViewMode) => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.classList.add('reed-pill');
  }

  update(props: PillProps): void {
    this.root.innerHTML = `
      <div class="reed-seg" role="group" aria-label="Theme">
        ${this.segButton('auto', 'Auto', props.theme === 'auto')}
        ${this.segButton('light', '☀', props.theme === 'light')}
        ${this.segButton('dark', '☾', props.theme === 'dark')}
      </div>
      <div class="reed-pill-divider"></div>
      <div class="reed-seg" role="group" aria-label="View mode">
        ${this.segButton('inline', 'Inline', props.viewMode === 'inline')}
        ${this.segButton('split', 'Split', props.viewMode === 'split')}
      </div>
      <div class="reed-pill-divider"></div>
      <span class="reed-status" data-color="${props.status.color}">${props.status.label}</span>
    `;

    const [themeSeg, modeSeg] = this.root.querySelectorAll('.reed-seg');
    themeSeg.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button');
      if (!btn) return;
      const value = btn.getAttribute('data-value') as ThemeOverride;
      this.onThemeChange?.(value);
    });
    modeSeg.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button');
      if (!btn) return;
      const value = btn.getAttribute('data-value') as ViewMode;
      this.onModeChange?.(value);
    });
  }

  private segButton(value: string, label: string, active: boolean): string {
    return `<button data-value="${value}" class="${active ? 'active' : ''}">${label}</button>`;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/ui/pill.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/pill.ts frontend/src/ui/pill.test.ts
git commit -m "feat: pill component with theme · mode · status"
```

---

### Task 12: File tree component (sidebar)

**Files:**
- Create: `frontend/src/ui/fileTree.ts`
- Create: `frontend/src/ui/fileTree.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/ui/fileTree.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { FileTree, sortNodes } from './fileTree';
import type { FileNode } from '../api/types';

describe('sortNodes', () => {
  it('puts directories before files, alphabetic case-insensitive within group', () => {
    const input: FileNode[] = [
      { type: 'file', name: 'beta.md', path: 'beta.md' },
      { type: 'directory', name: 'Zeta', path: 'Zeta', children: [] },
      { type: 'file', name: 'Alpha.md', path: 'Alpha.md' },
      { type: 'directory', name: 'apple', path: 'apple', children: [] },
    ];
    const sorted = sortNodes(input).map(n => n.name);
    expect(sorted).toEqual(['apple', 'Zeta', 'Alpha.md', 'beta.md']);
  });

  it('drops cap nodes from the sort and treats them as a sentinel returned alone', () => {
    const input: FileNode[] = [
      { type: 'file', name: 'a.md', path: 'a.md' },
      { type: 'cap', message: 'Some files not shown' },
    ];
    const sorted = sortNodes(input);
    expect(sorted).toHaveLength(2);
    expect(sorted[1].type).toBe('cap');
  });
});

describe('FileTree', () => {
  const sample: FileNode[] = [
    { type: 'directory', name: 'docs', path: 'docs', children: [
      { type: 'file', name: 'guide.md', path: 'docs/guide.md' },
    ] },
    { type: 'file', name: 'readme.md', path: 'readme.md' },
  ];

  it('renders the top-level rows', () => {
    const root = document.createElement('div');
    const tree = new FileTree(root);
    tree.render(sample, null);
    const rows = root.querySelectorAll('[data-row]');
    expect(rows.length).toBe(2);
    const rowPaths = Array.from(rows).map(r => r.getAttribute('data-path'));
    expect(rowPaths).toContain('docs');
    expect(rowPaths).toContain('readme.md');
  });

  it('directories are collapsed by default — children are not in the DOM', () => {
    const root = document.createElement('div');
    const tree = new FileTree(root);
    tree.render(sample, null);
    expect(root.querySelector('[data-path="docs/guide.md"]')).toBeNull();
  });

  it('clicking a directory expands it', () => {
    const root = document.createElement('div');
    const tree = new FileTree(root);
    tree.render(sample, null);
    const dir = root.querySelector('[data-row][data-path="docs"]') as HTMLElement;
    dir.click();
    expect(root.querySelector('[data-path="docs/guide.md"]')).not.toBeNull();
  });

  it('clicking a file calls onSelect with its path', () => {
    const root = document.createElement('div');
    const tree = new FileTree(root);
    const onSelect = vi.fn();
    tree.onSelect = onSelect;
    tree.render(sample, null);
    const file = root.querySelector('[data-row][data-path="readme.md"]') as HTMLElement;
    file.click();
    expect(onSelect).toHaveBeenCalledWith('readme.md');
  });

  it('marks the active file', () => {
    const root = document.createElement('div');
    const tree = new FileTree(root);
    tree.render(sample, 'readme.md');
    const file = root.querySelector('[data-row][data-path="readme.md"]') as HTMLElement;
    expect(file.classList.contains('active')).toBe(true);
  });

  it('preserves expanded state across re-render', () => {
    const root = document.createElement('div');
    const tree = new FileTree(root);
    tree.render(sample, null);
    (root.querySelector('[data-row][data-path="docs"]') as HTMLElement).click();
    // Re-render with new data (e.g., file added under docs)
    const updated: FileNode[] = [
      { type: 'directory', name: 'docs', path: 'docs', children: [
        { type: 'file', name: 'guide.md', path: 'docs/guide.md' },
        { type: 'file', name: 'newfile.md', path: 'docs/newfile.md' },
      ] },
      { type: 'file', name: 'readme.md', path: 'readme.md' },
    ];
    tree.render(updated, null);
    expect(root.querySelector('[data-path="docs/newfile.md"]')).not.toBeNull();
    expect(root.querySelector('[data-path="docs/guide.md"]')).not.toBeNull();
  });

  it('renders a cap sentinel row when present', () => {
    const root = document.createElement('div');
    const tree = new FileTree(root);
    tree.render([
      { type: 'file', name: 'a.md', path: 'a.md' },
      { type: 'cap', message: 'Some files not shown' },
    ], null);
    expect(root.textContent).toContain('Some files not shown');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/ui/fileTree.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/ui/fileTree.ts`**

```ts
import type { FileNode } from '../api/types';

export function sortNodes(nodes: FileNode[]): FileNode[] {
  const dirs: FileNode[] = [];
  const files: FileNode[] = [];
  const caps: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === 'directory') dirs.push(n);
    else if (n.type === 'cap') caps.push(n);
    else files.push(n);
  }
  const byName = (a: FileNode, b: FileNode) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  dirs.sort(byName);
  files.sort(byName);
  return [...dirs, ...files, ...caps];
}

export class FileTree {
  onSelect: ((path: string) => void) | null = null;

  private expanded = new Set<string>();
  private source: FileNode[] = [];
  private activePath: string | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.classList.add('reed-filetree');
  }

  render(nodes: FileNode[], activePath: string | null): void {
    this.source = nodes;
    this.activePath = activePath;
    this.repaint();
  }

  private repaint(): void {
    this.root.innerHTML = '';
    for (const node of sortNodes(this.source)) {
      this.root.appendChild(this.renderNode(node, 0));
    }
  }

  private renderNode(node: FileNode, depth: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.paddingLeft = `${depth * 12}px`;

    if (node.type === 'cap') {
      const cap = document.createElement('div');
      cap.className = 'reed-filetree-cap text-xs text-zinc-400 italic px-1 py-0.5';
      cap.textContent = node.message ?? 'Some files not shown';
      wrap.appendChild(cap);
      return wrap;
    }

    const row = document.createElement('div');
    row.setAttribute('data-row', '');
    row.setAttribute('data-path', node.path ?? '');
    row.className = 'reed-filetree-row cursor-pointer rounded px-1.5 py-0.5 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60';
    if (node.type === 'directory') {
      const arrow = this.expanded.has(node.path ?? '') ? '▾' : '▸';
      row.textContent = `${arrow} ${node.name ?? ''}`;
      row.addEventListener('click', () => this.toggle(node));
    } else {
      row.textContent = node.name ?? '';
      if (this.activePath && node.path === this.activePath) {
        row.classList.add('active', 'bg-zinc-200', 'dark:bg-zinc-700');
      }
      row.addEventListener('click', () => {
        if (node.path) this.onSelect?.(node.path);
      });
    }
    wrap.appendChild(row);

    if (node.type === 'directory' && this.expanded.has(node.path ?? '')) {
      const kids = sortNodes(node.children ?? []);
      const container = document.createElement('div');
      for (const child of kids) container.appendChild(this.renderNode(child, depth + 1));
      wrap.appendChild(container);
    }
    return wrap;
  }

  private toggle(node: FileNode): void {
    if (!node.path) return;
    if (this.expanded.has(node.path)) this.expanded.delete(node.path);
    else this.expanded.add(node.path);
    this.repaint();
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/ui/fileTree.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/fileTree.ts frontend/src/ui/fileTree.test.ts
git commit -m "feat: file tree sidebar with sort, expand/collapse, active row"
```

---

### Task 13: Boot sequence — wiring config, file tree, pill, theme

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Update `frontend/index.html` to add named layout regions**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>reed</title>
    <link rel="stylesheet" href="/src/styles/main.css" />
  </head>
  <body class="h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
    <div id="app" class="h-full">
      <div id="layout" class="h-full flex">
        <aside id="sidebar" class="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 hidden flex-col">
          <header id="sidebar-header" class="px-3 py-2 text-xs font-semibold flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
            <span id="sidebar-title" class="flex-1 truncate"></span>
            <button id="sidebar-collapse" class="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300" aria-label="Collapse sidebar">⇤</button>
          </header>
          <div id="sidebar-tree" class="flex-1 overflow-auto px-1 py-2 text-sm"></div>
        </aside>
        <main id="main" class="flex-1 relative overflow-hidden">
          <div id="pill"></div>
          <div id="editor-pane" class="h-full"></div>
        </main>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `frontend/src/main.ts` with the boot wiring**

```ts
import './styles/main.css';
import { getConfig, getFiles } from './api/client';
import { initialAppState } from './state/types';
import { createStore } from './state/store';
import { computePillState } from './state/saveStateMachine';
import { ThemeController } from './theme/theme';
import { Pill } from './ui/pill';
import { FileTree } from './ui/fileTree';

const store = createStore(initialAppState);
const theme = new ThemeController();
theme.start();

const sidebar = document.getElementById('sidebar') as HTMLElement;
const sidebarTitle = document.getElementById('sidebar-title') as HTMLElement;
const sidebarTree = document.getElementById('sidebar-tree') as HTMLElement;
const pillRoot = document.getElementById('pill') as HTMLElement;
const editorPane = document.getElementById('editor-pane') as HTMLElement;

const pill = new Pill(pillRoot);
pill.onThemeChange = (t) => {
  theme.setOverride(t);
  store.set({ theme: t });
};
pill.onModeChange = (m) => store.set({ viewMode: m });

const fileTree = new FileTree(sidebarTree);
fileTree.onSelect = (path) => store.set({ currentFile: path });

function renderPill(): void {
  const s = store.get();
  pill.update({
    theme: s.theme,
    viewMode: s.viewMode,
    status: computePillState(s.saveState, s.sseConnected),
  });
}

function renderTree(): void {
  const s = store.get();
  if (s.fileTree) fileTree.render(s.fileTree, s.currentFile);
}

function renderShell(): void {
  const s = store.get();
  if (s.config?.mode === 'directory') {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex');
    sidebarTitle.textContent = '~/notes'; // placeholder; backend doesn't expose root path
  } else {
    sidebar.classList.add('hidden');
    sidebar.classList.remove('flex');
  }
}

store.subscribe(() => {
  renderPill();
  renderTree();
  renderShell();
});

renderPill();

editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">Loading…</div>`;

(async () => {
  try {
    const config = await getConfig();
    store.set({ config });
    if (config.mode === 'directory') {
      const tree = await getFiles();
      store.set({ fileTree: tree, sseConnected: true });
    } else {
      store.set({ sseConnected: true });
    }
  } catch (err) {
    editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">Connection lost — refresh the page when reed is running again.</div>`;
    console.error(err);
  }
})();
```

- [ ] **Step 3: Manual verify**

Both terminals running. Open `http://localhost:5173`.
Expected: in directory mode, you see the sidebar with the file tree, the pill in the upper-right, and "Loading…" in the editor pane. Clicking a file logs nothing (next task wires it).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: existing tests pass; no new tests added in this task.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html frontend/src/main.ts
git commit -m "feat: boot sequence wires config, file tree, pill, theme"
```

---

### Task 14: CodeMirror editor (plain — Mode B baseline)

**Files:**
- Create: `frontend/src/editor/setup.ts`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Create `frontend/src/editor/setup.ts`**

```ts
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';

export interface ReedEditor {
  view: EditorView;
  decorationsCompartment: Compartment;
  fontCompartment: Compartment;
  setDoc(content: string): void;
  getDoc(): string;
  destroy(): void;
}

export function createEditor(parent: HTMLElement, initialDoc: string): ReedEditor {
  const decorationsCompartment = new Compartment();
  const fontCompartment = new Compartment();

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      decorationsCompartment.of([]),
      fontCompartment.of(EditorView.theme({
        '&': { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '15px' },
      })),
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    decorationsCompartment,
    fontCompartment,
    setDoc(content: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    },
    getDoc() {
      return view.state.doc.toString();
    },
    destroy() {
      view.destroy();
    },
  };
}

// Re-export so callers don't need to import from @codemirror/view directly.
export { EditorView, lineNumbers, highlightActiveLine };
```

- [ ] **Step 2: Wire the editor into the boot sequence**

Edit `frontend/src/main.ts` — replace the bottom IIFE block and the editor placeholder. The full updated file:

```ts
import './styles/main.css';
import { getConfig, getFile, getFiles } from './api/client';
import { initialAppState } from './state/types';
import { createStore } from './state/store';
import { computePillState } from './state/saveStateMachine';
import { ThemeController } from './theme/theme';
import { Pill } from './ui/pill';
import { FileTree } from './ui/fileTree';
import { createEditor, type ReedEditor } from './editor/setup';

const store = createStore(initialAppState);
const theme = new ThemeController();
theme.start();

const sidebar = document.getElementById('sidebar') as HTMLElement;
const sidebarTitle = document.getElementById('sidebar-title') as HTMLElement;
const sidebarTree = document.getElementById('sidebar-tree') as HTMLElement;
const pillRoot = document.getElementById('pill') as HTMLElement;
const editorPane = document.getElementById('editor-pane') as HTMLElement;

const pill = new Pill(pillRoot);
pill.onThemeChange = (t) => { theme.setOverride(t); store.set({ theme: t }); };
pill.onModeChange = (m) => store.set({ viewMode: m });

const fileTree = new FileTree(sidebarTree);
fileTree.onSelect = (path) => loadFile(path);

let editor: ReedEditor | null = null;

function ensureEditor(): ReedEditor {
  if (editor) return editor;
  editorPane.innerHTML = '';
  editor = createEditor(editorPane, '');
  return editor;
}

function renderPill(): void {
  const s = store.get();
  pill.update({
    theme: s.theme,
    viewMode: s.viewMode,
    status: computePillState(s.saveState, s.sseConnected),
  });
}

function renderTree(): void {
  const s = store.get();
  if (s.fileTree) fileTree.render(s.fileTree, s.currentFile);
}

function renderShell(): void {
  const s = store.get();
  if (s.config?.mode === 'directory') {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex');
    sidebarTitle.textContent = '~/notes';
  } else {
    sidebar.classList.add('hidden');
    sidebar.classList.remove('flex');
  }
}

store.subscribe(() => { renderPill(); renderTree(); renderShell(); });
renderPill();

async function loadFile(path: string): Promise<void> {
  try {
    const content = await getFile(path);
    const ed = ensureEditor();
    ed.setDoc(content);
    store.set({ currentFile: path, loadedContent: content, saveState: 'saved' });
  } catch (err) {
    console.error('loadFile failed', err);
    editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">File no longer exists.</div>`;
    store.set({ currentFile: null, loadedContent: null });
  }
}

editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">Loading…</div>`;

(async () => {
  try {
    const config = await getConfig();
    store.set({ config });
    if (config.mode === 'directory') {
      const tree = await getFiles();
      store.set({ fileTree: tree, sseConnected: true });
      editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">Select a file to open.</div>`;
    } else if (config.mode === 'singleFile') {
      store.set({ sseConnected: true });
      await loadFile(config.file);
    }
  } catch (err) {
    editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">Connection lost — refresh the page when reed is running again.</div>`;
    console.error(err);
  }
})();
```

- [ ] **Step 3: Manual verify**

Both terminals running. Open `http://localhost:5173`.
Expected: in directory mode, clicking a file in the sidebar loads it into a CodeMirror editor with line wrap on, no line numbers.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor/setup.ts frontend/src/main.ts
git commit -m "feat: CodeMirror editor with markdown lang and file loading"
```

---

### Task 15: Mode A decoration plugin

**Files:**
- Create: `frontend/src/editor/decorations.ts`
- Create: `frontend/src/editor/decorations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/editor/decorations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decorationClassesForRange } from './decorations';

describe('decorationClassesForRange', () => {
  it('classifies a heading line', () => {
    const classes = decorationClassesForRange('# Hello');
    expect(classes).toContain('cm-md-heading-1');
  });

  it('classifies bold and emphasis spans', () => {
    const classes = decorationClassesForRange('**bold** and _italic_ text');
    expect(classes).toContain('cm-md-strong');
    expect(classes).toContain('cm-md-emphasis');
  });

  it('classifies inline code', () => {
    const classes = decorationClassesForRange('a `code` span');
    expect(classes).toContain('cm-md-inline-code');
  });

  it('classifies fenced code blocks', () => {
    const classes = decorationClassesForRange('```\nfoo\n```');
    expect(classes).toContain('cm-md-fenced-code');
  });

  it('classifies blockquotes', () => {
    const classes = decorationClassesForRange('> a quote');
    expect(classes).toContain('cm-md-blockquote');
  });

  it('classifies links', () => {
    const classes = decorationClassesForRange('[text](http://example.com)');
    expect(classes).toContain('cm-md-link');
  });

  it('classifies strikethrough', () => {
    const classes = decorationClassesForRange('~~strike~~');
    expect(classes).toContain('cm-md-strikethrough');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/editor/decorations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/editor/decorations.ts`**

```ts
import { Extension, EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';

const NODE_TO_CLASS: Record<string, string> = {
  ATXHeading1: 'cm-md-heading-1',
  ATXHeading2: 'cm-md-heading-2',
  ATXHeading3: 'cm-md-heading-3',
  ATXHeading4: 'cm-md-heading-4',
  ATXHeading5: 'cm-md-heading-5',
  ATXHeading6: 'cm-md-heading-6',
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-emphasis',
  Strikethrough: 'cm-md-strikethrough',
  InlineCode: 'cm-md-inline-code',
  FencedCode: 'cm-md-fenced-code',
  Blockquote: 'cm-md-blockquote',
  ListItem: 'cm-md-list-item',
  Link: 'cm-md-link',
  Image: 'cm-md-image',
};

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const className = NODE_TO_CLASS[node.name];
        if (className) {
          builder.add(node.from, node.to, Decoration.mark({ class: className }));
        }
      },
    });
  }
  return builder.finish();
}

export function markdownDecorations(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) {
          this.decorations = buildDecorations(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// Pure helper used in tests: parse `doc`, walk the tree, return the set of distinct
// decoration class names that would be applied. Stand-alone of any EditorView.
export function decorationClassesForRange(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdown()] });
  const found = new Set<string>();
  syntaxTree(state).iterate({
    enter(node) {
      const className = NODE_TO_CLASS[node.name];
      if (className) found.add(className);
    },
  });
  return [...found];
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/editor/decorations.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Add CSS for the decoration classes**

Append to `frontend/src/styles/main.css`:

```css
.cm-md-heading-1 { font-size: 1.6em; font-weight: 700; }
.cm-md-heading-2 { font-size: 1.4em; font-weight: 700; }
.cm-md-heading-3 { font-size: 1.2em; font-weight: 600; }
.cm-md-heading-4 { font-size: 1.1em; font-weight: 600; }
.cm-md-heading-5 { font-size: 1.05em; font-weight: 600; }
.cm-md-heading-6 { font-size: 1em; font-weight: 600; color: rgb(82, 82, 91); }
.cm-md-strong { font-weight: 700; }
.cm-md-emphasis { font-style: italic; }
.cm-md-strikethrough { text-decoration: line-through; }
.cm-md-inline-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgba(228, 228, 231, 0.6);
  padding: 0 3px;
  border-radius: 3px;
}
.dark .cm-md-inline-code { background: rgba(63, 63, 70, 0.6); }
.cm-md-fenced-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgba(244, 244, 245, 0.7);
}
.dark .cm-md-fenced-code { background: rgba(39, 39, 42, 0.7); }
.cm-md-blockquote {
  border-left: 3px solid rgb(212, 212, 216);
  padding-left: 8px;
  color: rgb(82, 82, 91);
}
.dark .cm-md-blockquote { border-left-color: rgb(63, 63, 70); color: rgb(161, 161, 170); }
.cm-md-link { color: rgb(37, 99, 235); text-decoration: underline; }
.dark .cm-md-link { color: rgb(96, 165, 250); }
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editor/decorations.ts frontend/src/editor/decorations.test.ts frontend/src/styles/main.css
git commit -m "feat: Mode A markdown decoration plugin and CSS"
```

---

### Task 16: Mode toggle (compartment swap + keyboard shortcut)

**Files:**
- Create: `frontend/src/editor/modes.ts`
- Create: `frontend/src/editor/modes.test.ts`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/editor/modes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createEditor } from './setup';
import { applyMode } from './modes';

describe('applyMode', () => {
  it('inline mode installs decorations', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const ed = createEditor(parent, '# Hello');
    applyMode(ed, 'inline');
    // The decorations field is internal; assert via DOM class presence after a flush.
    ed.view.requestMeasure(); // force layout
    const html = ed.view.dom.innerHTML;
    expect(html).toMatch(/cm-md-heading-1/);
    ed.destroy();
  });

  it('split mode removes decorations and switches to monospace', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const ed = createEditor(parent, '# Hello');
    applyMode(ed, 'inline');
    applyMode(ed, 'split');
    ed.view.requestMeasure();
    const html = ed.view.dom.innerHTML;
    expect(html).not.toMatch(/cm-md-heading-1/);
    ed.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/editor/modes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/editor/modes.ts`**

```ts
import { EditorView } from '@codemirror/view';
import type { ReedEditor } from './setup';
import type { ViewMode } from '../state/types';
import { markdownDecorations } from './decorations';

export function applyMode(editor: ReedEditor, mode: ViewMode): void {
  const decorations = mode === 'inline' ? markdownDecorations() : [];
  const fontFamily = mode === 'inline'
    ? 'ui-sans-serif, system-ui, sans-serif'
    : 'ui-monospace, SFMono-Regular, Menlo, monospace';

  editor.view.dispatch({
    effects: [
      editor.decorationsCompartment.reconfigure(decorations),
      editor.fontCompartment.reconfigure(EditorView.theme({
        '&': { fontFamily, fontSize: '15px' },
      })),
    ],
  });
}
```

- [ ] **Step 4: Wire into `main.ts`**

In `frontend/src/main.ts`, add the import and apply the mode whenever the store's `viewMode` changes. Edit the existing file — find the `pill.onModeChange` line and the `store.subscribe(...)` block:

```ts
// At the top with other imports:
import { applyMode } from './editor/modes';

// Replace the existing onModeChange:
pill.onModeChange = (m) => store.set({ viewMode: m });

// Add after editor is ensured (in ensureEditor or after first load), apply current mode.
// Add near the bottom, replacing the existing subscribe:
let lastMode: 'inline' | 'split' | null = null;
store.subscribe(() => {
  renderPill();
  renderTree();
  renderShell();
  const s = store.get();
  if (editor && s.viewMode !== lastMode) {
    applyMode(editor, s.viewMode);
    lastMode = s.viewMode;
  }
});

// Also after ensureEditor() creates a new editor, apply the mode immediately:
// Replace ensureEditor with:
function ensureEditor(): ReedEditor {
  if (editor) return editor;
  editorPane.innerHTML = '';
  editor = createEditor(editorPane, '');
  applyMode(editor, store.get().viewMode);
  lastMode = store.get().viewMode;
  return editor;
}

// Add a global Cmd+E shortcut to toggle:
window.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'e') {
    ev.preventDefault();
    const next = store.get().viewMode === 'inline' ? 'split' : 'inline';
    store.set({ viewMode: next });
  }
});
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Manual verify**

Both terminals running. Open `http://localhost:5173`. Click a file. Click the pill's `Split` button → editor switches to monospace, decorations removed. Click `Inline` → decorations come back. Press Cmd+E → toggles.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editor/modes.ts frontend/src/editor/modes.test.ts frontend/src/main.ts
git commit -m "feat: mode toggle via compartment swap + Cmd+E shortcut"
```

---

### Task 17: Autosave wiring (editor changes → debounced PUT, status indicator)

**Files:**
- Modify: `frontend/src/editor/setup.ts`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Modify `frontend/src/editor/setup.ts` to accept an `onDocChange` callback**

Replace `frontend/src/editor/setup.ts` with:

```ts
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';

export interface ReedEditor {
  view: EditorView;
  decorationsCompartment: Compartment;
  fontCompartment: Compartment;
  setDoc(content: string): void;
  getDoc(): string;
  destroy(): void;
}

export interface CreateEditorOptions {
  initialDoc: string;
  onDocChange?: () => void;
}

export function createEditor(parent: HTMLElement, opts: CreateEditorOptions): ReedEditor {
  const decorationsCompartment = new Compartment();
  const fontCompartment = new Compartment();

  const updateListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onDocChange?.();
  });

  const state = EditorState.create({
    doc: opts.initialDoc,
    extensions: [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      decorationsCompartment.of([]),
      fontCompartment.of(EditorView.theme({
        '&': { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '15px' },
      })),
      updateListener,
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    decorationsCompartment,
    fontCompartment,
    setDoc(content: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    },
    getDoc() {
      return view.state.doc.toString();
    },
    destroy() {
      view.destroy();
    },
  };
}
```

- [ ] **Step 2: Wire autosave in `main.ts`**

Edit `frontend/src/main.ts`. Add imports and replace the relevant blocks:

```ts
// At the top with other imports, add:
import { putFile } from './api/client';
import { createDebouncer } from './state/debounce';

// Replace ensureEditor with the version that wires onDocChange:
function ensureEditor(): ReedEditor {
  if (editor) return editor;
  editorPane.innerHTML = '';
  editor = createEditor(editorPane, {
    initialDoc: '',
    onDocChange: () => {
      const s = store.get();
      if (s.currentFile === null) return;
      store.set({ saveState: 'unsaved' });
      saveDebouncer.trigger();
    },
  });
  applyMode(editor, store.get().viewMode);
  lastMode = store.get().viewMode;
  return editor;
}

// After store/editor declarations, add:
const saveDebouncer = createDebouncer(performSave, 750);

async function performSave(): Promise<void> {
  const s = store.get();
  if (!s.currentFile || !editor) return;
  const content = editor.getDoc();
  store.set({ saveState: 'saving' });
  try {
    await putFile(s.currentFile, content);
    store.set({ saveState: 'saved', loadedContent: content });
  } catch (err) {
    console.error('save failed', err);
    store.set({ saveState: 'saveFailed' });
  }
}

// Save on blur:
window.addEventListener('blur', () => saveDebouncer.flush());

// Save on file switch — modify loadFile to flush first:
async function loadFile(path: string): Promise<void> {
  saveDebouncer.flush();
  // (then the existing body)
  try {
    const content = await getFile(path);
    const ed = ensureEditor();
    ed.setDoc(content);
    store.set({ currentFile: path, loadedContent: content, saveState: 'saved' });
  } catch (err) {
    console.error('loadFile failed', err);
    editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">File no longer exists.</div>`;
    store.set({ currentFile: null, loadedContent: null });
  }
}

// Save on unload (best-effort):
window.addEventListener('beforeunload', () => {
  if (saveDebouncer.isPending()) saveDebouncer.flush();
});
```

- [ ] **Step 3: Manual verify**

Both terminals running. Click a `.md` file. Type some characters. Wait ~1s. Verify the content changed on disk (check the file in another terminal or editor). Verify the pill status flashes `Unsaved` → `Saving…` → `Saved`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor/setup.ts frontend/src/main.ts
git commit -m "feat: autosave with debounce, blur-flush, save-on-file-switch"
```

---

### Task 18: SSE wiring + conflict banner

**Files:**
- Create: `frontend/src/ui/conflictBanner.ts`
- Create: `frontend/src/ui/conflictBanner.test.ts`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/styles/main.css`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/ui/conflictBanner.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ConflictBanner } from './conflictBanner';

describe('ConflictBanner', () => {
  it('renders message and two action buttons', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    b.show();
    expect(root.textContent).toMatch(/changed on disk/i);
    expect(root.querySelector('[data-action="reload"]')).not.toBeNull();
    expect(root.querySelector('[data-action="keep"]')).not.toBeNull();
  });

  it('hide clears the banner', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    b.show();
    b.hide();
    expect(root.innerHTML).toBe('');
  });

  it('clicking reload calls onReload', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    const onReload = vi.fn();
    b.onReload = onReload;
    b.show();
    (root.querySelector('[data-action="reload"]') as HTMLButtonElement).click();
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('clicking keep calls onKeep', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    const onKeep = vi.fn();
    b.onKeep = onKeep;
    b.show();
    (root.querySelector('[data-action="keep"]') as HTMLButtonElement).click();
    expect(onKeep).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/ui/conflictBanner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/ui/conflictBanner.ts`**

```ts
export class ConflictBanner {
  onReload: (() => void) | null = null;
  onKeep: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.classList.add('reed-conflict-banner');
  }

  show(): void {
    this.root.innerHTML = `
      <div class="reed-conflict-content">
        <span>This file changed on disk.</span>
        <button data-action="reload" class="reed-conflict-btn">Reload from disk</button>
        <button data-action="keep" class="reed-conflict-btn">Keep my version</button>
      </div>
    `;
    this.root.querySelector('[data-action="reload"]')?.addEventListener('click', () => this.onReload?.());
    this.root.querySelector('[data-action="keep"]')?.addEventListener('click', () => this.onKeep?.());
  }

  hide(): void {
    this.root.innerHTML = '';
  }
}
```

- [ ] **Step 4: Add banner styles to `frontend/src/styles/main.css`**

Append:

```css
.reed-conflict-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
}
.reed-conflict-banner:empty { display: none; }
.reed-conflict-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(254, 243, 199, 0.96);
  color: rgb(120, 53, 15);
  border-bottom: 1px solid rgba(252, 211, 77, 0.8);
  font-size: 13px;
}
.dark .reed-conflict-content {
  background: rgba(120, 53, 15, 0.9);
  color: rgb(254, 243, 199);
  border-bottom-color: rgba(180, 83, 9, 0.8);
}
.reed-conflict-btn {
  all: unset;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-weight: 500;
}
.dark .reed-conflict-btn { background: rgba(255, 255, 255, 0.15); }
.reed-conflict-btn:hover { background: rgba(255, 255, 255, 0.9); }
.dark .reed-conflict-btn:hover { background: rgba(255, 255, 255, 0.25); }
```

- [ ] **Step 5: Add the banner element to `index.html`**

Edit `frontend/index.html` — inside `<main id="main">`, before `<div id="pill">`:

```html
        <main id="main" class="flex-1 relative overflow-hidden">
          <div id="conflict-banner"></div>
          <div id="pill"></div>
          <div id="editor-pane" class="h-full"></div>
        </main>
```

- [ ] **Step 6: Wire SSE + conflict logic in `main.ts`**

Edit `frontend/src/main.ts`. Add imports and SSE wiring at the bottom of the file (before the closing IIFE or alongside it):

```ts
// At the top:
import { SSEClient } from './api/sse';
import { ConflictBanner } from './ui/conflictBanner';

// After existing constants:
const conflictBanner = new ConflictBanner(document.getElementById('conflict-banner') as HTMLElement);
conflictBanner.onReload = () => {
  const s = store.get();
  if (s.conflict && editor) {
    editor.setDoc(s.conflict.diskContent);
    store.set({ loadedContent: s.conflict.diskContent, conflict: null, saveState: 'saved' });
    conflictBanner.hide();
  }
};
conflictBanner.onKeep = () => {
  store.set({ conflict: null });
  conflictBanner.hide();
};

const sse = new SSEClient();
sse.onConnect = () => store.set({ sseConnected: true });
sse.onDisconnect = () => store.set({ sseConnected: false });
sse.onFileChanged = async (path: string) => {
  // Always refresh the tree
  if (store.get().config?.mode === 'directory') {
    try {
      const tree = await getFiles();
      store.set({ fileTree: tree });
    } catch (e) {
      console.error('tree refresh failed', e);
    }
  }
  // If the changed file is the currently-open one, fetch and reconcile
  const s = store.get();
  if (s.currentFile !== path || !editor) return;
  let disk: string;
  try {
    disk = await getFile(path);
  } catch (e) {
    console.error('refetch on change failed', e);
    return;
  }
  if (disk === editor.getDoc()) return; // self-write echo or otherwise no diff
  const isClean = !saveDebouncer.isPending() && s.saveState === 'saved' && editor.getDoc() === s.loadedContent;
  if (isClean) {
    editor.setDoc(disk);
    store.set({ loadedContent: disk });
  } else {
    store.set({ conflict: { diskContent: disk } });
    conflictBanner.show();
  }
};
sse.start();
window.addEventListener('beforeunload', () => sse.stop());
```

Also remove the `store.set({ sseConnected: true })` calls in the existing config-fetch block — `sseConnected` is now governed by the SSE client.

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Manual verify**

Open `http://localhost:5173` with a directory mode launch.
- Edit a file in the editor and save (autosave). Observe pill states.
- In another editor (e.g., `nano` or VS Code), modify the same file and save. Reed should silently reload it (clean state).
- Now type something in reed, and while pill says "Unsaved", modify the same file from another editor. Reed should show the conflict banner with both buttons working.
- Stop the Swift server. Pill should switch to "Reconnecting…". Restart the Swift server with `--port 8765`. Pill returns to "Saved".

- [ ] **Step 9: Commit**

```bash
git add frontend/index.html frontend/src/main.ts frontend/src/styles/main.css frontend/src/ui/conflictBanner.ts frontend/src/ui/conflictBanner.test.ts
git commit -m "feat: SSE-driven external change handling with conflict banner"
```

---

### Task 19: Markdown preview pipeline (markdown-it + plugins, except Mermaid + KaTeX heavy parts)

**Files:**
- Create: `frontend/src/preview/markdown.ts`
- Create: `frontend/src/preview/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/preview/markdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings', () => {
    expect(renderMarkdown('# Hi')).toMatch(/<h1[^>]*>Hi<\/h1>/);
  });

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toMatch(/<table>/);
    expect(html).toMatch(/<th>a<\/th>/);
  });

  it('renders strikethrough', () => {
    expect(renderMarkdown('~~gone~~')).toMatch(/<s>gone<\/s>/);
  });

  it('renders task list checkboxes (read-only)', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toMatch(/disabled/);
  });

  it('renders fenced code with highlight.js classes', () => {
    const html = renderMarkdown('```js\nconst x = 1\n```');
    expect(html).toMatch(/class="hljs/); // highlight.js wraps with this class
  });

  it('renders footnotes', () => {
    const html = renderMarkdown('Hello[^1]\n\n[^1]: A footnote');
    expect(html).toMatch(/footnote/i);
  });

  it('renders github alerts (NOTE)', () => {
    const html = renderMarkdown('> [!NOTE]\n> Useful info');
    expect(html.toLowerCase()).toMatch(/note/);
    // The plugin emits a class like markdown-alert or similar; assert class presence:
    expect(html).toMatch(/class="[^"]*alert/);
  });

  it('renders mermaid blocks as placeholders', () => {
    const html = renderMarkdown('```mermaid\ngraph TD; A-->B\n```');
    expect(html).toMatch(/class="mermaid-block"/);
    expect(html).toMatch(/data-source="/);
  });

  it('emits data-line attributes on top-level blocks', () => {
    const html = renderMarkdown('para1\n\npara2');
    expect(html).toMatch(/data-line="0"/);
    expect(html).toMatch(/data-line="2"/);
  });

  it('opens external links in a new tab', () => {
    const html = renderMarkdown('[ext](https://example.com)');
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });

  it('does not modify internal links', () => {
    const html = renderMarkdown('[doc](other.md)');
    expect(html).not.toMatch(/target="_blank"/);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/preview/markdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/preview/markdown.ts`**

```ts
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import katex from 'markdown-it-katex';
import githubAlerts from 'markdown-it-github-alerts';
import hljs from 'highlight.js/lib/common';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<pre><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
    } catch {
      // fall through
    }
  }
  return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
}

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight: (code, lang) => {
    if (lang === 'mermaid') {
      // Replaced by the custom rule below; this branch shouldn't fire if the rule fires first,
      // but as a safety net we still emit the placeholder.
      return `<div class="mermaid-block" data-source="${escapeHtml(code)}"></div>`;
    }
    return highlight(code, lang);
  },
});

md.use(taskLists, { enabled: false });
md.use(footnote);
md.use(katex);
md.use(githubAlerts);

// Custom rule: replace fenced ```mermaid blocks with placeholder divs.
const defaultFenceRender = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === 'mermaid') {
    return `<div class="mermaid-block" data-source="${escapeHtml(token.content)}"></div>`;
  }
  return defaultFenceRender(tokens, idx, options, env, self);
};

// Custom link_open rule: external links get target="_blank".
const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') ?? '';
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Annotate top-level block tokens with `data-line` for scroll sync.
const blockTags = new Set([
  'paragraph_open', 'heading_open', 'blockquote_open', 'bullet_list_open',
  'ordered_list_open', 'fence', 'code_block', 'table_open', 'hr',
]);
md.core.ruler.push('add_data_line', (state) => {
  for (const token of state.tokens) {
    if (blockTags.has(token.type) && token.map) {
      token.attrSet('data-line', String(token.map[0]));
    }
  }
});

export function renderMarkdown(input: string): string {
  return md.render(input);
}

export function getMarkdownIt(): MarkdownIt {
  return md;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/preview/markdown.test.ts`
Expected: all tests pass.

(If the GitHub-alerts plugin's emitted class name differs from `alert`, adjust the regex in the test to match what the plugin actually emits. Check by running `console.log(renderMarkdown('> [!NOTE]\n> Hi'))` once and updating the test assertion to match the real output.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/preview/markdown.ts frontend/src/preview/markdown.test.ts
git commit -m "feat: markdown-it preview pipeline with GFM/highlight.js/footnotes/katex/alerts"
```

---

### Task 20: Mermaid lazy loader and cache

**Files:**
- Create: `frontend/src/preview/mermaid.ts`
- Create: `frontend/src/preview/mermaid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/preview/mermaid.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderMermaidBlocks, _resetMermaidForTests } from './mermaid';

describe('renderMermaidBlocks', () => {
  let mockRender: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetMermaidForTests();
    mockRender = vi.fn(async (id: string, src: string) => ({ svg: `<svg data-id="${id}" data-src="${src}"/>` }));
    // Stub dynamic import('mermaid'):
    vi.doMock('mermaid', () => ({
      default: {
        initialize: vi.fn(),
        render: mockRender,
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('mermaid');
  });

  it('does nothing if there are no mermaid blocks', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>no diagrams here</p>';
    await renderMermaidBlocks(root);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('renders each mermaid block once', async () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="mermaid-block" data-source="graph TD; A-->B"></div>
      <div class="mermaid-block" data-source="graph LR; X-->Y"></div>
    `;
    await renderMermaidBlocks(root);
    expect(mockRender).toHaveBeenCalledTimes(2);
    expect(root.innerHTML).toContain('<svg');
  });

  it('caches rendered SVG by source', async () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="mermaid-block" data-source="graph TD; A-->B"></div>`;
    await renderMermaidBlocks(root);

    const root2 = document.createElement('div');
    root2.innerHTML = `<div class="mermaid-block" data-source="graph TD; A-->B"></div>`;
    await renderMermaidBlocks(root2);

    // Render only called once total because second call hits cache
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/preview/mermaid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/preview/mermaid.ts`**

```ts
const cache = new Map<string, string>();
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let idCounter = 0;

async function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      mod.default.initialize({ startOnLoad: false, theme: 'default' });
      return mod.default;
    });
  }
  return mermaidPromise;
}

export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>('.mermaid-block');
  if (blocks.length === 0) return;

  // Decode HTML-escaped source attribute to original mermaid text
  const decode = (s: string): string => {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  };

  const mermaid = await loadMermaid();

  for (const block of Array.from(blocks)) {
    const source = decode(block.getAttribute('data-source') ?? '');
    if (cache.has(source)) {
      block.innerHTML = cache.get(source)!;
      continue;
    }
    const id = `reed-mermaid-${idCounter++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      cache.set(source, svg);
      block.innerHTML = svg;
    } catch (err) {
      block.innerHTML = `<pre class="mermaid-error">Mermaid error: ${(err as Error).message}</pre>`;
    }
  }
}

export function _resetMermaidForTests(): void {
  cache.clear();
  mermaidPromise = null;
  idCounter = 0;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/preview/mermaid.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/preview/mermaid.ts frontend/src/preview/mermaid.test.ts
git commit -m "feat: lazy-loaded mermaid renderer with source-keyed cache"
```

---

### Task 21: Mode B split — preview pane, splitter, live render

**Files:**
- Create: `frontend/src/ui/splitter.ts`
- Create: `frontend/src/ui/splitter.test.ts`
- Modify: `frontend/index.html`
- Modify: `frontend/src/styles/main.css`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/ui/splitter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Splitter } from './splitter';

describe('Splitter', () => {
  function setup() {
    const container = document.createElement('div');
    container.style.width = '1000px';
    document.body.appendChild(container);
    const left = document.createElement('div');
    const handle = document.createElement('div');
    const right = document.createElement('div');
    container.appendChild(left);
    container.appendChild(handle);
    container.appendChild(right);
    return { container, left, handle, right };
  }

  it('starts at 50/50', () => {
    const { container, left, handle, right } = setup();
    new Splitter({ container, left, handle, right }).start();
    expect(left.style.flex).toBe('1 1 50%');
    expect(right.style.flex).toBe('1 1 50%');
  });

  it('updates ratio on pointer drag', () => {
    const { container, left, handle, right } = setup();
    const s = new Splitter({ container, left, handle, right });
    s.start();
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 1000, width: 1000 }),
    });
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, pointerId: 1 }));
    expect(left.style.flex).toBe('1 1 70%');
    expect(right.style.flex).toBe('1 1 30%');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/ui/splitter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/ui/splitter.ts`**

```ts
export interface SplitterOptions {
  container: HTMLElement;
  left: HTMLElement;
  handle: HTMLElement;
  right: HTMLElement;
}

export class Splitter {
  private dragging = false;

  constructor(private readonly opts: SplitterOptions) {}

  start(): void {
    this.applyRatio(0.5);
    this.opts.handle.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  stop(): void {
    this.opts.handle.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  private onDown = (ev: PointerEvent): void => {
    this.dragging = true;
    this.opts.handle.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  };

  private onMove = (ev: PointerEvent): void => {
    if (!this.dragging) return;
    const rect = this.opts.container.getBoundingClientRect();
    const ratio = Math.max(0.1, Math.min(0.9, (ev.clientX - rect.left) / rect.width));
    this.applyRatio(ratio);
  };

  private onUp = (): void => {
    this.dragging = false;
  };

  private applyRatio(ratio: number): void {
    const leftPct = Math.round(ratio * 100);
    const rightPct = 100 - leftPct;
    this.opts.left.style.flex = `1 1 ${leftPct}%`;
    this.opts.right.style.flex = `1 1 ${rightPct}%`;
  }
}
```

- [ ] **Step 4: Update `frontend/index.html` to add the split-pane structure**

Replace the `<main id="main">` block with:

```html
        <main id="main" class="flex-1 relative overflow-hidden">
          <div id="conflict-banner"></div>
          <div id="split-container" class="h-full flex">
            <div id="editor-side" class="relative h-full overflow-hidden" style="flex: 1 1 100%;">
              <div id="pill"></div>
              <div id="editor-pane" class="h-full"></div>
            </div>
            <div id="split-handle" class="hidden w-1 cursor-col-resize bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"></div>
            <div id="preview-side" class="hidden h-full overflow-auto" style="flex: 1 1 0%;">
              <div id="preview-pane" class="prose prose-zinc dark:prose-invert px-6 py-6 max-w-none"></div>
            </div>
          </div>
        </main>
```

- [ ] **Step 5: Wire splitter + preview render in `main.ts`**

Add to `frontend/src/main.ts`:

```ts
// At the top:
import { Splitter } from './ui/splitter';
import { renderMarkdown } from './preview/markdown';
import { renderMermaidBlocks } from './preview/mermaid';

// After existing element refs:
const splitContainer = document.getElementById('split-container') as HTMLElement;
const editorSide = document.getElementById('editor-side') as HTMLElement;
const splitHandle = document.getElementById('split-handle') as HTMLElement;
const previewSide = document.getElementById('preview-side') as HTMLElement;
const previewPane = document.getElementById('preview-pane') as HTMLElement;

const splitter = new Splitter({
  container: splitContainer,
  left: editorSide,
  handle: splitHandle,
  right: previewSide,
});
splitter.start();

let lastSplitMode: 'inline' | 'split' | null = null;

function syncSplitChrome(): void {
  const s = store.get();
  if (s.viewMode === 'split') {
    splitHandle.classList.remove('hidden');
    previewSide.classList.remove('hidden');
    editorSide.style.flex = '1 1 50%';
    previewSide.style.flex = '1 1 50%';
  } else {
    splitHandle.classList.add('hidden');
    previewSide.classList.add('hidden');
    editorSide.style.flex = '1 1 100%';
  }
}

function renderPreview(): void {
  const s = store.get();
  if (s.viewMode !== 'split' || !editor) return;
  const html = renderMarkdown(editor.getDoc());
  previewPane.innerHTML = html;
  void renderMermaidBlocks(previewPane);
}

// Hook into existing onDocChange in ensureEditor:
// Replace ensureEditor with:
function ensureEditor(): ReedEditor {
  if (editor) return editor;
  editorPane.innerHTML = '';
  editor = createEditor(editorPane, {
    initialDoc: '',
    onDocChange: () => {
      const s = store.get();
      if (s.currentFile === null) return;
      store.set({ saveState: 'unsaved' });
      saveDebouncer.trigger();
      if (s.viewMode === 'split') renderPreview();
    },
  });
  applyMode(editor, store.get().viewMode);
  lastMode = store.get().viewMode;
  return editor;
}

// Update store.subscribe to also sync split chrome and render preview when entering split mode:
store.subscribe(() => {
  renderPill();
  renderTree();
  renderShell();
  syncSplitChrome();
  const s = store.get();
  if (editor && s.viewMode !== lastMode) {
    applyMode(editor, s.viewMode);
    lastMode = s.viewMode;
  }
  if (s.viewMode === 'split' && lastSplitMode !== 'split') {
    renderPreview();
  }
  lastSplitMode = s.viewMode;
});

// Initial sync
syncSplitChrome();
```

- [ ] **Step 6: Add prose typography styles to `main.css`**

Append:

```css
/* Preview pane typography. Tailwind v4 doesn't ship typography by default;
   we provide minimal manual styles to keep dependencies lean. */
#preview-pane h1 { font-size: 1.875em; font-weight: 700; margin: 0 0 0.5em; }
#preview-pane h2 { font-size: 1.5em; font-weight: 700; margin: 1em 0 0.5em; }
#preview-pane h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
#preview-pane p { margin: 0 0 0.75em; line-height: 1.6; }
#preview-pane ul, #preview-pane ol { margin: 0 0 0.75em; padding-left: 1.5em; line-height: 1.6; }
#preview-pane li > p { margin: 0; }
#preview-pane code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: rgba(228,228,231,0.6); padding: 0 4px; border-radius: 4px; }
.dark #preview-pane code { background: rgba(63,63,70,0.6); }
#preview-pane pre { background: rgb(244,244,245); padding: 12px; border-radius: 6px; overflow-x: auto; }
.dark #preview-pane pre { background: rgb(39,39,42); }
#preview-pane pre code { background: transparent; padding: 0; }
#preview-pane blockquote { border-left: 3px solid rgb(212,212,216); padding-left: 12px; color: rgb(82,82,91); margin: 0 0 0.75em; }
.dark #preview-pane blockquote { border-left-color: rgb(63,63,70); color: rgb(161,161,170); }
#preview-pane table { border-collapse: collapse; margin: 0 0 0.75em; }
#preview-pane th, #preview-pane td { border: 1px solid rgb(228,228,231); padding: 6px 10px; }
.dark #preview-pane th, .dark #preview-pane td { border-color: rgb(63,63,70); }
#preview-pane a { color: rgb(37, 99, 235); text-decoration: underline; }
.dark #preview-pane a { color: rgb(96, 165, 250); }
#preview-pane img { max-width: 100%; }
.mermaid-block { margin: 0.75em 0; }
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Manual verify**

Open `http://localhost:5173`, click a `.md` file. Click `Split`. The preview pane appears on the right, rendered. Type in the editor — the preview updates live. Drag the splitter — ratio changes. Test a doc containing a ```mermaid block — diagram renders.

- [ ] **Step 9: Commit**

```bash
git add frontend/index.html frontend/src/main.ts frontend/src/styles/main.css frontend/src/ui/splitter.ts frontend/src/ui/splitter.test.ts
git commit -m "feat: Mode B split pane with live preview, splitter, mermaid"
```

---

### Task 22: Scroll sync (Mode B)

**Files:**
- Create: `frontend/src/preview/scrollSync.ts`
- Create: `frontend/src/preview/scrollSync.test.ts`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/preview/scrollSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findNearestLineElement, computeRatio } from './scrollSync';

describe('findNearestLineElement', () => {
  function makePreview(lines: number[]): HTMLElement {
    const el = document.createElement('div');
    for (const l of lines) {
      const c = document.createElement('div');
      c.setAttribute('data-line', String(l));
      el.appendChild(c);
    }
    return el;
  }

  it('returns the first element with data-line >= target', () => {
    const el = makePreview([0, 5, 12, 30]);
    expect(findNearestLineElement(el, 10)?.getAttribute('data-line')).toBe('12');
  });

  it('returns null if all elements are before the target', () => {
    const el = makePreview([0, 5]);
    expect(findNearestLineElement(el, 100)).toBeNull();
  });

  it('returns the first element if target is 0 and first element is at 0', () => {
    const el = makePreview([0, 5]);
    expect(findNearestLineElement(el, 0)?.getAttribute('data-line')).toBe('0');
  });
});

describe('computeRatio', () => {
  it('clamps to [0, 1]', () => {
    expect(computeRatio(-5, 100)).toBe(0);
    expect(computeRatio(150, 100)).toBe(1);
    expect(computeRatio(50, 100)).toBe(0.5);
  });

  it('returns 0 when scroll height is 0', () => {
    expect(computeRatio(50, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/preview/scrollSync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/preview/scrollSync.ts`**

```ts
import type { EditorView } from '@codemirror/view';

export function findNearestLineElement(preview: HTMLElement, line: number): HTMLElement | null {
  const candidates = preview.querySelectorAll<HTMLElement>('[data-line]');
  for (const el of Array.from(candidates)) {
    const l = Number(el.getAttribute('data-line'));
    if (l >= line) return el;
  }
  return null;
}

export function computeRatio(scroll: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, scroll / max));
}

export interface ScrollSyncOptions {
  view: EditorView;
  preview: HTMLElement;
}

export class ScrollSync {
  private syncing = false;

  constructor(private readonly opts: ScrollSyncOptions) {}

  start(): void {
    this.opts.view.scrollDOM.addEventListener('scroll', this.onEditorScroll);
    this.opts.preview.addEventListener('scroll', this.onPreviewScroll);
  }

  stop(): void {
    this.opts.view.scrollDOM.removeEventListener('scroll', this.onEditorScroll);
    this.opts.preview.removeEventListener('scroll', this.onPreviewScroll);
  }

  private onEditorScroll = (): void => {
    if (this.syncing) return;
    this.syncing = true;
    requestAnimationFrame(() => { this.syncing = false; });

    const view = this.opts.view;
    const blockInfo = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const line = view.state.doc.lineAt(blockInfo.from).number - 1;
    const target = findNearestLineElement(this.opts.preview, line);
    if (!target) return;
    this.opts.preview.scrollTop = target.offsetTop;
  };

  private onPreviewScroll = (): void => {
    if (this.syncing) return;
    this.syncing = true;
    requestAnimationFrame(() => { this.syncing = false; });

    const preview = this.opts.preview;
    const candidates = preview.querySelectorAll<HTMLElement>('[data-line]');
    let topEl: HTMLElement | null = null;
    for (const el of Array.from(candidates)) {
      if (el.offsetTop >= preview.scrollTop) { topEl = el; break; }
    }
    if (!topEl) return;
    const line = Number(topEl.getAttribute('data-line'));
    const view = this.opts.view;
    const linePos = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, line + 1)));
    const blockInfo = view.lineBlockAt(linePos.from);
    view.scrollDOM.scrollTop = blockInfo.top;
  };
}
```

- [ ] **Step 4: Wire ScrollSync into `main.ts`**

Add to `frontend/src/main.ts`:

```ts
import { ScrollSync } from './preview/scrollSync';

let scrollSync: ScrollSync | null = null;

// Modify syncSplitChrome to start/stop scroll sync:
function syncSplitChrome(): void {
  const s = store.get();
  if (s.viewMode === 'split') {
    splitHandle.classList.remove('hidden');
    previewSide.classList.remove('hidden');
    editorSide.style.flex = '1 1 50%';
    previewSide.style.flex = '1 1 50%';
    if (editor && !scrollSync) {
      scrollSync = new ScrollSync({ view: editor.view, preview: previewSide });
      scrollSync.start();
    }
  } else {
    splitHandle.classList.add('hidden');
    previewSide.classList.add('hidden');
    editorSide.style.flex = '1 1 100%';
    if (scrollSync) {
      scrollSync.stop();
      scrollSync = null;
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Manual verify**

Open a long markdown file, switch to Split mode, scroll either pane — the other follows.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/preview/scrollSync.ts frontend/src/preview/scrollSync.test.ts frontend/src/main.ts
git commit -m "feat: bidirectional scroll sync between editor and preview"
```

---

### Task 23: Sidebar collapse (chevron, edge handle, Cmd+\\)

**Files:**
- Create: `frontend/src/ui/sidebarCollapse.ts`
- Create: `frontend/src/ui/sidebarCollapse.test.ts`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/styles/main.css`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/ui/sidebarCollapse.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { SidebarCollapseController } from './sidebarCollapse';

describe('SidebarCollapseController', () => {
  function setup() {
    document.body.innerHTML = `
      <aside id="sidebar" class="flex"></aside>
      <button id="sidebar-collapse"></button>
      <div id="expand-handle" class="hidden"></div>
    `;
    return {
      sidebar: document.getElementById('sidebar') as HTMLElement,
      collapseBtn: document.getElementById('sidebar-collapse') as HTMLButtonElement,
      expandHandle: document.getElementById('expand-handle') as HTMLElement,
    };
  }

  it('collapse hides sidebar and shows expand handle', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.collapse();
    expect(els.sidebar.classList.contains('hidden')).toBe(true);
    expect(els.expandHandle.classList.contains('hidden')).toBe(false);
  });

  it('expand restores sidebar', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.collapse();
    c.expand();
    expect(els.sidebar.classList.contains('hidden')).toBe(false);
    expect(els.expandHandle.classList.contains('hidden')).toBe(true);
  });

  it('clicking the chevron collapses', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.start();
    els.collapseBtn.click();
    expect(els.sidebar.classList.contains('hidden')).toBe(true);
  });

  it('clicking the expand handle expands', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.start();
    c.collapse();
    els.expandHandle.click();
    expect(els.sidebar.classList.contains('hidden')).toBe(false);
  });

  it('Cmd+\\ toggles', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true }));
    expect(els.sidebar.classList.contains('hidden')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true }));
    expect(els.sidebar.classList.contains('hidden')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/ui/sidebarCollapse.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/ui/sidebarCollapse.ts`**

```ts
export interface SidebarCollapseElements {
  sidebar: HTMLElement;
  collapseBtn: HTMLElement;
  expandHandle: HTMLElement;
}

export class SidebarCollapseController {
  constructor(private readonly els: SidebarCollapseElements) {}

  start(): void {
    this.els.collapseBtn.addEventListener('click', () => this.collapse());
    this.els.expandHandle.addEventListener('click', () => this.expand());
    window.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === '\\') {
        ev.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(): void {
    if (this.els.sidebar.classList.contains('hidden')) this.expand();
    else this.collapse();
  }

  collapse(): void {
    this.els.sidebar.classList.add('hidden');
    this.els.expandHandle.classList.remove('hidden');
  }

  expand(): void {
    this.els.sidebar.classList.remove('hidden');
    this.els.expandHandle.classList.add('hidden');
  }
}
```

- [ ] **Step 4: Add the expand handle to `index.html`**

Inside `<div id="layout">`, before `<aside id="sidebar">`, add:

```html
        <div id="expand-handle" class="hidden w-2 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Expand sidebar (⌘\)">
          <div class="h-full w-full flex items-center justify-center text-zinc-400 select-none">›</div>
        </div>
```

- [ ] **Step 5: Wire into `main.ts`**

Add to `frontend/src/main.ts`:

```ts
import { SidebarCollapseController } from './ui/sidebarCollapse';

const sidebarCollapse = new SidebarCollapseController({
  sidebar: document.getElementById('sidebar') as HTMLElement,
  collapseBtn: document.getElementById('sidebar-collapse') as HTMLElement,
  expandHandle: document.getElementById('expand-handle') as HTMLElement,
});
sidebarCollapse.start();
```

Also remove the existing `if (s.config?.mode === 'directory') sidebar.classList.remove('hidden')` toggling — since collapse is its own concern, instead set the initial visibility once after config loads:

```ts
function renderShell(): void {
  const s = store.get();
  if (s.config?.mode === 'directory') {
    // Sidebar starts visible; user can collapse
    sidebarTitle.textContent = '~/notes';
  } else {
    sidebar.classList.add('hidden');
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Manual verify**

Click the collapse chevron — sidebar disappears, edge handle appears. Click the handle — sidebar returns. Cmd+\\ toggles.

- [ ] **Step 8: Commit**

```bash
git add frontend/index.html frontend/src/main.ts frontend/src/ui/sidebarCollapse.ts frontend/src/ui/sidebarCollapse.test.ts
git commit -m "feat: sidebar collapse with chevron, edge handle, Cmd+\\\\ shortcut"
```

---

### Task 24: Empty/error states polish

**Files:**
- Create: `frontend/src/ui/emptyState.ts`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Implement `frontend/src/ui/emptyState.ts`**

```ts
export type EmptyStateKind =
  | { kind: 'select-file' }
  | { kind: 'no-markdown' }
  | { kind: 'connection-lost' }
  | { kind: 'file-deleted' };

export function renderEmptyState(target: HTMLElement, state: EmptyStateKind): void {
  const messages: Record<EmptyStateKind['kind'], string> = {
    'select-file': 'Select a file to open.',
    'no-markdown': 'No markdown files in this folder.',
    'connection-lost': 'Connection lost — refresh the page when reed is running again.',
    'file-deleted': 'File no longer exists.',
  };
  target.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">${messages[state.kind]}</div>`;
}
```

- [ ] **Step 2: Replace inline empty-state strings in `main.ts`**

Find every place `editorPane.innerHTML = '<div class="h-full flex...>X</div>'` is set and replace with a call to `renderEmptyState`.

```ts
import { renderEmptyState } from './ui/emptyState';

// In the failing-config branch:
renderEmptyState(editorPane, { kind: 'connection-lost' });

// In the directory-mode initial state:
renderEmptyState(editorPane, { kind: 'select-file' });

// In loadFile catch:
renderEmptyState(editorPane, { kind: 'file-deleted' });

// After getFiles, if the tree has zero file nodes (recursively), show no-markdown.
// Add this helper near the top of main.ts:
import type { FileNode } from './api/types';

function treeIsEmpty(nodes: FileNode[]): boolean {
  const visit = (arr: FileNode[]): boolean => {
    for (const n of arr) {
      if (n.type === 'file') return true;
      if (n.type === 'directory' && n.children && visit(n.children)) return true;
    }
    return false;
  };
  return !visit(nodes);
}

// And in the directory-mode block, after `const tree = await getFiles();`:
if (treeIsEmpty(tree)) {
  renderEmptyState(editorPane, { kind: 'no-markdown' });
}
```

- [ ] **Step 3: Manual verify**

- Run reed against an empty folder → "No markdown files in this folder."
- Stop the Swift backend before opening the page → "Connection lost…"
- Click on a file then delete it from disk before SSE refreshes the tree → "File no longer exists."

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/emptyState.ts frontend/src/main.ts
git commit -m "feat: centralize empty/error state messages"
```

---

### Task 25: Production build verification

**Files:** None — manual verification + a one-line README addendum if desired.

- [ ] **Step 1: Run the production frontend build**

Run: `cd frontend && npm run build`
Expected: clean build, output in `Sources/reed/Resources/{index.html, assets/}`.

- [ ] **Step 2: Build the release Swift binary**

Run: `swift build -c release`
Expected: clean build.

- [ ] **Step 3: Run the release binary against a sample folder**

Run: `.build/release/reed ~/notes` (or any directory with `.md` files)
Expected:
- stdout shows `Listening on http://localhost:<some-port>` (likely a random port — release default is OS-assigned).
- Browser opens to that URL.
- The app works: file tree, mode toggle, edit, autosave, preview, theme toggle.
- No console errors in DevTools.

- [ ] **Step 4: Sanity-check bundle size**

Run: `ls -la Sources/reed/Resources/assets/`
Expected: total size under ~600 KB gzipped, under ~2 MB uncompressed (Mermaid is the largest single dep but it's lazy-loaded; verify it's a separate chunk).

- [ ] **Step 5: Commit (only if any tweaks were needed)**

If everything works without changes, no commit. Otherwise commit any production-only fixes with `fix: ...`.

---

### Task 26: README addendum (dev workflow)

**Files:**
- Modify: existing `README.md` if present, or create one

- [ ] **Step 1: Check whether `README.md` exists**

Run: `ls README.md`

- [ ] **Step 2: Create or append the dev-workflow section**

If creating: a minimal README with project description and dev steps. If appending: just the dev-steps section.

```markdown
## Development

Two terminals:

```bash
# Terminal 1 — Swift backend (pinned to port 8765 in dev)
swift run reed --port 8765 ~/path/to/notes

# Terminal 2 — Vite dev server with proxy to backend
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

### Production build

```bash
cd frontend && npm ci && npm run build
swift build -c release
.build/release/reed ~/path/to/notes
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: dev and prod build workflow"
```

---

## Self-Review

Done before saving. Findings:

**1. Spec coverage:**
- Backend `--port` flag → Task 1 ✓
- Vite + Tailwind + Vitest scaffold → Task 2 ✓
- Dev workflow proxy → Task 3 ✓
- API client → Task 4 ✓
- SSE client + backoff → Task 5 ✓
- App state store → Task 6 ✓
- Save state machine → Task 7 ✓
- Autosave debouncer → Task 8 ✓
- Theme controller → Task 9 ✓
- Layout shell + pill styles → Task 10 ✓
- Pill component → Task 11 ✓
- File tree → Task 12 ✓
- Boot sequence wiring → Task 13 ✓
- CodeMirror editor → Task 14 ✓
- Mode A decorations → Task 15 ✓
- Mode toggle (Cmd+E) → Task 16 ✓
- Autosave wiring → Task 17 ✓
- SSE + conflict banner → Task 18 ✓
- markdown-it pipeline → Task 19 ✓
- Mermaid lazy → Task 20 ✓
- Mode B split + preview + splitter → Task 21 ✓
- Scroll sync → Task 22 ✓
- Sidebar collapse + Cmd+\\ → Task 23 ✓
- Empty/error states → Task 24 ✓
- Prod build verification → Task 25 ✓
- Dev README → Task 26 ✓

**2. Placeholder scan:** No "TBD"/"TODO" placeholders. No "fill in details" or "similar to Task N" stubs. Each task contains complete code blocks for the changes it directs.

**3. Type consistency:** Spot-checked:
- `LaunchMode`, `FileNode`, `ViewMode`, `ThemeOverride`, `SaveState`, `AppState`, `PillStatus`, `ReedEditor`, `EmptyStateKind` are defined once and referenced consistently.
- `getFile`, `putFile`, `getConfig`, `getFiles` signatures stable across tasks.
- `createDebouncer` returns a `Debouncer` interface consistently used.
- `SSEClient` callback names (`onConnect`, `onDisconnect`, `onFileChanged`) match across Task 5 and Task 18.

**4. Scope check:** Single-milestone — this is the right size for one plan. The 26 tasks each ship a small testable change, and the order builds the app incrementally (each task leaves the app runnable in some form).
