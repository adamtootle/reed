import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

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
      markdown({ extensions: [GFM] }),
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
