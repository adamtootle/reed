import { EditorView } from '@codemirror/view';
import type { ReedEditor } from './setup';
import type { ViewMode } from '../state/types';
import { markdownDecorations } from './decorations';

export function applyMode(editor: ReedEditor, mode: ViewMode): void {
  const decorations = mode === 'inline' ? markdownDecorations() : [];
  const fontFamily = mode === 'inline'
    ? 'ui-sans-serif, system-ui, sans-serif'
    : 'ui-monospace, SFMono-Regular, Menlo, monospace';

  editor.view.dispatch({
    effects: [
      editor.decorationsCompartment.reconfigure(decorations),
      editor.fontCompartment.reconfigure(EditorView.theme({
        '&': { fontFamily, fontSize: '15px' },
      })),
    ],
  });
}
