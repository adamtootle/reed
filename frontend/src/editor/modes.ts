import { EditorView } from '@codemirror/view';
import type { ReedEditor } from './setup';
import { markdownDecorations } from './decorations';

export function applyMode(editor: ReedEditor): void {
  editor.view.dispatch({
    effects: [
      editor.decorationsCompartment.reconfigure(markdownDecorations()),
      editor.fontCompartment.reconfigure(EditorView.theme({
        '&': { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '15px' },
      })),
    ],
  });
}
