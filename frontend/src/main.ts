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
