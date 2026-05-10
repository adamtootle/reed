import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { markdownShortcuts } from './markdownKeymap';

interface Harness {
  view: EditorView;
  parent: HTMLElement;
  fire: (key: string) => boolean;
  doc: () => string;
  selRange: () => { from: number; to: number };
}

function makeView(initial: string, selection?: { anchor: number; head?: number }): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc: initial,
    selection: selection
      ? EditorSelection.single(selection.anchor, selection.head ?? selection.anchor)
      : undefined,
    extensions: [keymap.of(markdownShortcuts)],
  });
  const view = new EditorView({ state, parent });
  return {
    view,
    parent,
    fire: (k: string) => {
      // Find binding by key string and invoke its run() directly (jsdom-style synth events
      // don't reliably reach CM's keymap on all envs, so this is the safer test path).
      const binding = markdownShortcuts.find(b => b.key === k);
      if (!binding || !binding.run) throw new Error(`no binding for ${k}`);
      return binding.run(view);
    },
    doc: () => view.state.doc.toString(),
    selRange: () => {
      const r = view.state.selection.main;
      return { from: r.from, to: r.to };
    },
  };
}

describe('markdownShortcuts', () => {
  let h: Harness | null = null;
  beforeEach(() => { h = null; });
  afterEach(() => { h?.view.destroy(); h?.parent.remove(); });

  describe('Mod-b (bold)', () => {
    it('inserts ** and places cursor between when selection is empty', () => {
      h = makeView('hello', { anchor: 5 });
      h.fire('Mod-b');
      expect(h.doc()).toBe('hello****');
      expect(h.selRange()).toEqual({ from: 7, to: 7 });
    });

    it('wraps a non-empty selection with **', () => {
      h = makeView('hello world', { anchor: 6, head: 11 });
      h.fire('Mod-b');
      expect(h.doc()).toBe('hello **world**');
      expect(h.selRange()).toEqual({ from: 8, to: 13 });
    });

    it('toggles off when selection is already wrapped in **', () => {
      h = makeView('hello **world**', { anchor: 6, head: 15 });
      h.fire('Mod-b');
      expect(h.doc()).toBe('hello world');
      expect(h.selRange()).toEqual({ from: 6, to: 11 });
    });

    it('toggles off when selection is the inner text and ** sits just outside', () => {
      // doc: **hello** (length 9), selection of "hello" at [2..7]
      h = makeView('**hello**', { anchor: 2, head: 7 });
      h.fire('Mod-b');
      expect(h.doc()).toBe('hello');
      expect(h.selRange()).toEqual({ from: 0, to: 5 });
    });

    it('toggles off mid-document inner selection', () => {
      h = makeView('see **hello** world', { anchor: 6, head: 11 });
      h.fire('Mod-b');
      expect(h.doc()).toBe('see hello world');
      expect(h.selRange()).toEqual({ from: 4, to: 9 });
    });
  });

  describe('Mod-i (italic)', () => {
    it('wraps a selection with single *', () => {
      h = makeView('a b c', { anchor: 2, head: 3 });
      h.fire('Mod-i');
      expect(h.doc()).toBe('a *b* c');
    });

    it('toggles off when wrapped in *', () => {
      h = makeView('a *b* c', { anchor: 2, head: 5 });
      h.fire('Mod-i');
      expect(h.doc()).toBe('a b c');
    });

    it('toggles off when selection is the inner text and * sits just outside', () => {
      // doc: *hello* (length 7), selection of "hello" at [1..6]
      h = makeView('*hello*', { anchor: 1, head: 6 });
      h.fire('Mod-i');
      expect(h.doc()).toBe('hello');
      expect(h.selRange()).toEqual({ from: 0, to: 5 });
    });

    it('does NOT strip a * that is part of ** when toggling italic on bold inner text', () => {
      // doc: **hello** — inner "hello" is bold, not italic. Cmd+I should
      // wrap with * (producing bold+italic), not strip one of the **.
      h = makeView('**hello**', { anchor: 2, head: 7 });
      h.fire('Mod-i');
      expect(h.doc()).toBe('***hello***');
    });
  });

  describe('Mod-Shift-x (strike)', () => {
    it('wraps in ~~', () => {
      h = makeView('hello', { anchor: 0, head: 5 });
      h.fire('Mod-Shift-x');
      expect(h.doc()).toBe('~~hello~~');
    });

    it('toggles off when selection is the inner text and ~~ sits just outside', () => {
      h = makeView('~~hello~~', { anchor: 2, head: 7 });
      h.fire('Mod-Shift-x');
      expect(h.doc()).toBe('hello');
      expect(h.selRange()).toEqual({ from: 0, to: 5 });
    });
  });

  describe('Mod-k (link)', () => {
    it('inserts [](url) and selects "url" when no selection', () => {
      h = makeView('', { anchor: 0 });
      h.fire('Mod-k');
      expect(h.doc()).toBe('[](url)');
      // urlStart = 0 + 1 + 0 + 2 = 3
      expect(h.selRange()).toEqual({ from: 3, to: 6 });
    });

    it('wraps selection as link text and selects "url"', () => {
      h = makeView('see docs', { anchor: 4, head: 8 });
      h.fire('Mod-k');
      expect(h.doc()).toBe('see [docs](url)');
      // urlStart = 4 + 1 + 4 + 2 = 11
      expect(h.selRange()).toEqual({ from: 11, to: 14 });
    });
  });

  describe('Tab / Shift-Tab in lists', () => {
    it('Tab indents a list line by 2 spaces', () => {
      h = makeView('- one', { anchor: 0 });
      const handled = h.fire('Tab');
      expect(handled).toBe(true);
      expect(h.doc()).toBe('  - one');
    });

    it('Tab returns false outside lists', () => {
      h = makeView('plain text', { anchor: 0 });
      const handled = h.fire('Tab');
      expect(handled).toBe(false);
      expect(h.doc()).toBe('plain text');
    });

    it('Shift-Tab outdents a list line by 2 spaces', () => {
      h = makeView('  - nested', { anchor: 0 });
      h.fire('Shift-Tab');
      expect(h.doc()).toBe('- nested');
    });

    it('Shift-Tab is a no-op on a list line with no leading space', () => {
      h = makeView('- top', { anchor: 0 });
      h.fire('Shift-Tab');
      expect(h.doc()).toBe('- top');
    });

    it('Tab indents all selected list lines', () => {
      h = makeView('- one\n- two\n- three', { anchor: 0, head: 19 });
      h.fire('Tab');
      expect(h.doc()).toBe('  - one\n  - two\n  - three');
    });

    it('handles ordered list lines', () => {
      h = makeView('1. one', { anchor: 0 });
      const handled = h.fire('Tab');
      expect(handled).toBe(true);
      expect(h.doc()).toBe('  1. one');
    });
  });
});
