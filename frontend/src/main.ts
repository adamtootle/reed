import './styles/main.css';
import { getConfig, getFile, getFiles } from './api/client';
import { initialAppState } from './state/types';
import { createStore } from './state/store';
import { computePillState } from './state/saveStateMachine';
import { ThemeController } from './theme/theme';
import { Pill } from './ui/pill';
import { FileTree } from './ui/fileTree';
import { createEditor, type ReedEditor } from './editor/setup';
import { applyMode } from './editor/modes';

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
let lastMode: 'inline' | 'split' | null = null;

function ensureEditor(): ReedEditor {
  if (editor) return editor;
  editorPane.innerHTML = '';
  editor = createEditor(editorPane, '');
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
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex');
    sidebarTitle.textContent = '~/notes';
  } else {
    sidebar.classList.add('hidden');
    sidebar.classList.remove('flex');
  }
}

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

window.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'e') {
    ev.preventDefault();
    const next = store.get().viewMode === 'inline' ? 'split' : 'inline';
    store.set({ viewMode: next });
  }
});

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
