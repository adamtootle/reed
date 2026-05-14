import type { FileNode } from '../api/types';

export interface SpotlightFile {
  name: string;
  path: string;
}

export interface ScoredMatch {
  file: SpotlightFile;
  /** Indices in `file.path` that matched the query (for highlighting). */
  matchIndices: number[];
  score: number;
}

const MAX_RESULTS = 50;

export function flattenFiles(tree: FileNode[]): SpotlightFile[] {
  const out: SpotlightFile[] = [];
  const visit = (nodes: FileNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'file' && n.path && n.name) {
        out.push({ name: n.name, path: n.path });
      } else if (n.type === 'directory' && n.children) {
        visit(n.children);
      }
    }
  };
  visit(tree);
  return out;
}

/**
 * Subsequence fuzzy match. Returns null if the query characters can't be
 * found in order. Score rewards consecutive runs and word-boundary hits.
 */
export function fuzzyScore(query: string, target: string): { score: number; indices: number[] } | null {
  if (query === '') return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let prevMatch = -2;
  let consecutive = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    if (i === prevMatch + 1) {
      consecutive++;
      score += 5 + consecutive;
    } else {
      consecutive = 0;
      score += 1;
    }
    const prev = i === 0 ? '/' : t[i - 1];
    if (prev === '/' || prev === '-' || prev === '_' || prev === '.' || prev === ' ') {
      score += 3;
    }
    indices.push(i);
    prevMatch = i;
    qi++;
  }
  return qi === q.length ? { score, indices } : null;
}

export function rankFiles(files: SpotlightFile[], query: string): ScoredMatch[] {
  if (query === '') {
    return files
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
      .slice(0, MAX_RESULTS)
      .map((file) => ({ file, matchIndices: [], score: 0 }));
  }
  const matches: ScoredMatch[] = [];
  for (const file of files) {
    // Score against full path, but also boost when the match lands in the basename.
    const pathScore = fuzzyScore(query, file.path);
    if (!pathScore) continue;
    const nameStart = file.path.length - file.name.length;
    const basenameHit = pathScore.indices.every((i) => i >= nameStart);
    const score = pathScore.score + (basenameHit ? 25 : 0);
    matches.push({ file, matchIndices: pathScore.indices, score });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.path.localeCompare(b.file.path, undefined, { sensitivity: 'base' });
  });
  return matches.slice(0, MAX_RESULTS);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Returns HTML with `<mark>` around the characters at `indices` in `text`. */
export function renderHighlighted(text: string, indices: number[]): string {
  if (indices.length === 0) return escapeHtml(text);
  const set = new Set(indices);
  let html = '';
  for (let i = 0; i < text.length; i++) {
    const ch = escapeHtml(text[i]);
    html += set.has(i) ? `<mark>${ch}</mark>` : ch;
  }
  return html;
}

export class Spotlight {
  onSelect: ((path: string) => void) | null = null;

  private container: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private list: HTMLElement | null = null;
  private noMatch: HTMLElement | null = null;
  private files: SpotlightFile[] = [];
  private matches: ScoredMatch[] = [];
  private items: HTMLElement[] = [];
  private selectedIndex = 0;
  private mounted = false;

  mount(target: HTMLElement, files: SpotlightFile[]): void {
    this.files = files;
    target.innerHTML = '';
    this.container = document.createElement('div');
    this.container.className = 'reed-spotlight';
    this.container.innerHTML = `
      <div class="reed-spotlight-card">
        <input class="reed-spotlight-input" type="text" placeholder="Find a file…" autocomplete="off" spellcheck="false" />
        <ul class="reed-spotlight-list" role="listbox"></ul>
        <div class="reed-spotlight-empty" hidden>No matches.</div>
      </div>
    `;
    target.appendChild(this.container);

    this.input = this.container.querySelector('.reed-spotlight-input') as HTMLInputElement;
    this.list = this.container.querySelector('.reed-spotlight-list') as HTMLElement;
    this.noMatch = this.container.querySelector('.reed-spotlight-empty') as HTMLElement;

    this.input.addEventListener('input', () => {
      this.selectedIndex = 0;
      this.recompute();
    });
    this.input.addEventListener('keydown', (ev) => this.onKeyDown(ev));

    this.mounted = true;
    this.recompute();
    // Defer focus so any in-flight blur (from prior empty state) settles first.
    queueMicrotask(() => this.input?.focus());
  }

  unmount(): void {
    if (!this.mounted) return;
    this.container?.remove();
    this.container = null;
    this.input = null;
    this.list = null;
    this.noMatch = null;
    this.matches = [];
    this.selectedIndex = 0;
    this.mounted = false;
  }

  isMounted(): boolean {
    return this.mounted;
  }

  updateFiles(files: SpotlightFile[]): void {
    if (!this.mounted) return;
    this.files = files;
    this.recompute();
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (this.matches.length === 0) return;
      this.setSelected((this.selectedIndex + 1) % this.matches.length, true);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (this.matches.length === 0) return;
      this.setSelected((this.selectedIndex - 1 + this.matches.length) % this.matches.length, true);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const pick = this.matches[this.selectedIndex];
      if (pick) this.onSelect?.(pick.file.path);
    } else if (ev.key === 'Escape') {
      // Spotlight convention: Esc clears the query; second Esc would dismiss,
      // but reed needs a file selected before this view goes away, so just clear.
      if (this.input && this.input.value !== '') {
        ev.preventDefault();
        this.input.value = '';
        this.selectedIndex = 0;
        this.recompute();
      }
    }
  }

  private recompute(): void {
    const query = this.input?.value ?? '';
    this.matches = rankFiles(this.files, query);
    if (this.selectedIndex >= this.matches.length) {
      this.selectedIndex = Math.max(0, this.matches.length - 1);
    }
    this.renderList();
  }

  private renderList(): void {
    if (!this.list || !this.noMatch) return;
    this.items = [];
    if (this.matches.length === 0) {
      this.list.innerHTML = '';
      this.list.setAttribute('hidden', '');
      this.noMatch.removeAttribute('hidden');
      return;
    }
    this.noMatch.setAttribute('hidden', '');
    this.list.removeAttribute('hidden');
    this.list.innerHTML = '';
    for (let i = 0; i < this.matches.length; i++) {
      const m = this.matches[i];
      const li = document.createElement('li');
      li.className = 'reed-spotlight-item';
      if (i === this.selectedIndex) li.classList.add('active');
      li.setAttribute('role', 'option');
      const nameStart = m.file.path.length - m.file.name.length;
      const nameIndices = m.matchIndices
        .filter((idx) => idx >= nameStart)
        .map((idx) => idx - nameStart);
      const dirPath = m.file.path.slice(0, Math.max(0, nameStart - 1));
      const dirIndices = m.matchIndices.filter((idx) => idx < nameStart);
      li.innerHTML = `
        <span class="reed-spotlight-name">${renderHighlighted(m.file.name, nameIndices)}</span>
        ${dirPath ? `<span class="reed-spotlight-dir">${renderHighlighted(dirPath, dirIndices)}</span>` : ''}
      `;
      // mouseenter only toggles the .active class — don't rerender. Rerendering
      // here would destroy the <li> mid-click sequence (mousedown on the old
      // node, mouseup on the new one) and the browser then skips the click.
      li.addEventListener('mouseenter', () => this.setSelected(i, false));
      // mousedown fires before the input's blur and won't get cancelled if
      // focus shifts during the click — safer than `click` for this UI.
      li.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.onSelect?.(m.file.path);
      });
      this.items.push(li);
      this.list.appendChild(li);
    }
  }

  private setSelected(index: number, scroll: boolean): void {
    if (index === this.selectedIndex) return;
    const prev = this.items[this.selectedIndex];
    prev?.classList.remove('active');
    this.selectedIndex = index;
    const next = this.items[index];
    next?.classList.add('active');
    if (scroll) next?.scrollIntoView({ block: 'nearest' });
  }
}
