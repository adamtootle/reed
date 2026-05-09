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
