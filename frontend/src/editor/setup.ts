import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { markdownShortcuts } from './markdownKeymap';

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
      markdown({ extensions: [GFM] }),
      keymap.of([...markdownShortcuts, ...defaultKeymap, ...historyKeymap, indentWithTab]),
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
