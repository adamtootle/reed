import { EditorSelection } from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';
import { EditorView } from '@codemirror/view';

function wrapWithMarker(view: EditorView, marker: string): boolean {
  const closing = marker;
  const docLen = view.state.doc.length;

  // For single-char markers (e.g. `*`), an identical adjacent char means the
  // marker we matched is actually part of a longer delimiter (`**`). Reject
  // the unwrap in that case so Cmd+I on inner text of `**hello**` doesn't
  // accidentally strip one of the bold markers.
  const isMarkerExtension = (char: string): boolean =>
    marker.length === 1 && char === marker;

  const tx = view.state.changeByRange((range) => {
    if (range.empty) {
      const insert = marker + closing;
      return {
        changes: { from: range.from, insert },
        range: EditorSelection.cursor(range.from + marker.length),
      };
    }
    const text = view.state.sliceDoc(range.from, range.to);

    // Case 1: selection is the inner text and markers sit just outside it.
    if (range.from >= marker.length && range.to + closing.length <= docLen) {
      const before = view.state.sliceDoc(range.from - marker.length, range.from);
      const after = view.state.sliceDoc(range.to, range.to + closing.length);
      if (before === marker && after === closing) {
        const oneOutBefore = range.from - marker.length > 0
          ? view.state.sliceDoc(range.from - marker.length - 1, range.from - marker.length)
          : '';
        const oneOutAfter = range.to + closing.length < docLen
          ? view.state.sliceDoc(range.to + closing.length, range.to + closing.length + 1)
          : '';
        if (!isMarkerExtension(oneOutBefore) && !isMarkerExtension(oneOutAfter)) {
          return {
            changes: [
              { from: range.from - marker.length, to: range.from, insert: '' },
              { from: range.to, to: range.to + closing.length, insert: '' },
            ],
            range: EditorSelection.range(range.from - marker.length, range.to - marker.length),
          };
        }
      }
    }

    // Case 2: selection itself includes the markers.
    const wrapped =
      text.length >= marker.length + closing.length &&
      text.startsWith(marker) &&
      text.endsWith(closing);
    if (wrapped) {
      const inner = text.slice(marker.length, text.length - closing.length);
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(range.from, range.from + inner.length),
      };
    }

    // Case 3: plain wrap.
    return {
      changes: { from: range.from, to: range.to, insert: marker + text + closing },
      range: EditorSelection.range(range.from + marker.length, range.to + marker.length),
    };
  });
  view.dispatch(tx);
  return true;
}

function wrapAsLink(view: EditorView): boolean {
  const tx = view.state.changeByRange((range) => {
    const text = range.empty ? '' : view.state.sliceDoc(range.from, range.to);
    const insert = `[${text}](url)`;
    const urlStart = range.from + 1 + text.length + 2;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  });
  view.dispatch(tx);
  return true;
}

const LIST_LINE = /^(\s*)([-*+]|\d+\.)\s/;

function indentList(view: EditorView, outdent: boolean): boolean {
  const { state } = view;
  const lineNumbers = new Set<number>();
  let anyList = false;
  for (const range of state.selection.ranges) {
    const start = state.doc.lineAt(range.from).number;
    const end = state.doc.lineAt(range.to).number;
    for (let n = start; n <= end; n++) {
      lineNumbers.add(n);
      if (LIST_LINE.test(state.doc.line(n).text)) anyList = true;
    }
  }
  // Only handle Tab when the selection touches a list item. Otherwise return false
  // so the next binding (indentWithTab) can run.
  if (!anyList) return false;

  const changes: { from: number; to?: number; insert: string }[] = [];
  for (const n of lineNumbers) {
    const line = state.doc.line(n);
    if (outdent) {
      if (line.text.startsWith('  ')) {
        changes.push({ from: line.from, to: line.from + 2, insert: '' });
      } else if (line.text.startsWith(' ')) {
        changes.push({ from: line.from, to: line.from + 1, insert: '' });
      }
    } else {
      changes.push({ from: line.from, insert: '  ' });
    }
  }
  if (changes.length === 0) return true;
  view.dispatch({ changes });
  return true;
}

export const markdownShortcuts: KeyBinding[] = [
  { key: 'Mod-b', run: (v) => wrapWithMarker(v, '**') },
  { key: 'Mod-i', run: (v) => wrapWithMarker(v, '*') },
  { key: 'Mod-Shift-x', run: (v) => wrapWithMarker(v, '~~') },
  { key: 'Mod-k', run: wrapAsLink },
  { key: 'Tab', run: (v) => indentList(v, false) },
  { key: 'Shift-Tab', run: (v) => indentList(v, true) },
];
