import './styles/main.css';
import { getConfig, getFile, getFiles, putFile } from './api/client';
import { initialAppState } from './state/types';
import { createStore } from './state/store';
import { computePillState } from './state/saveStateMachine';
import { createDebouncer } from './state/debounce';
import { ThemeController } from './theme/theme';
import { Pill } from './ui/pill';
import { FileTree } from './ui/fileTree';
import { createEditor, type ReedEditor } from './editor/setup';
import { applyMode } from './editor/modes';
import { SSEClient } from './api/sse';
import { ConflictBanner } from './ui/conflictBanner';
import { Splitter } from './ui/splitter';
import { renderMarkdown } from './preview/markdown';
import { renderMermaidBlocks } from './preview/mermaid';
import { ScrollSync } from './preview/scrollSync';
import { SidebarCollapseController } from './ui/sidebarCollapse';

const store = createStore(initialAppState);
const theme = new ThemeController();
theme.start();

const sidebar = document.getElementById('sidebar') as HTMLElement;
const sidebarTitle = document.getElementById('sidebar-title') as HTMLElement;
const sidebarTree = document.getElementById('sidebar-tree') as HTMLElement;
const pillRoot = document.getElementById('pill') as HTMLElement;
const editorPane = document.getElementById('editor-pane') as HTMLElement;
const splitContainer = document.getElementById('split-container') as HTMLElement;
const editorSide = document.getElementById('editor-side') as HTMLElement;
const splitHandle = document.getElementById('split-handle') as HTMLElement;
const previewSide = document.getElementById('preview-side') as HTMLElement;
const previewPane = document.getElementById('preview-pane') as HTMLElement;

const sidebarCollapse = new SidebarCollapseController({
  sidebar: document.getElementById('sidebar') as HTMLElement,
  collapseBtn: document.getElementById('sidebar-collapse') as HTMLElement,
  expandHandle: document.getElementById('expand-handle') as HTMLElement,
});
sidebarCollapse.start();

const pill = new Pill(pillRoot);
pill.onThemeChange = (t) => { theme.setOverride(t); store.set({ theme: t }); };
pill.onModeChange = (m) => store.set({ viewMode: m });

const fileTree = new FileTree(sidebarTree);
fileTree.onSelect = (path) => loadFile(path);

let editor: ReedEditor | null = null;
let lastMode: 'inline' | 'split' | null = null;
let scrollSync: ScrollSync | null = null;

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

function renderPreview(): void {
  const s = store.get();
  if (s.viewMode !== 'split' || !editor) return;
  const html = renderMarkdown(editor.getDoc());
  previewPane.innerHTML = html;
  void renderMermaidBlocks(previewPane);
}

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

const saveDebouncer = createDebouncer(performSave, 750);

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
    // Sidebar starts visible; user can collapse via the chevron / Cmd+\
    sidebarTitle.textContent = '~/notes';
  } else {
    sidebar.classList.add('hidden');
  }
}

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
renderPill();
syncSplitChrome();

async function loadFile(path: string): Promise<void> {
  saveDebouncer.flush();
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

window.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'e') {
    ev.preventDefault();
    const next = store.get().viewMode === 'inline' ? 'split' : 'inline';
    store.set({ viewMode: next });
  }
});

window.addEventListener('blur', () => saveDebouncer.flush());
window.addEventListener('beforeunload', () => {
  if (saveDebouncer.isPending()) saveDebouncer.flush();
});

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

(async () => {
  try {
    const config = await getConfig();
    store.set({ config });
    if (config.mode === 'directory') {
      const tree = await getFiles();
      store.set({ fileTree: tree });
      sidebar.classList.remove('hidden');
      sidebar.classList.add('flex');
      editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">Select a file to open.</div>`;
    } else if (config.mode === 'singleFile') {
      await loadFile(config.file);
    }
  } catch (err) {
    editorPane.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">Connection lost — refresh the page when reed is running again.</div>`;
    console.error(err);
  }
})();
