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
