import { Extension, EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

const NODE_TO_CLASS: Record<string, string> = {
  ATXHeading1: 'cm-md-heading-1',
  ATXHeading2: 'cm-md-heading-2',
  ATXHeading3: 'cm-md-heading-3',
  ATXHeading4: 'cm-md-heading-4',
  ATXHeading5: 'cm-md-heading-5',
  ATXHeading6: 'cm-md-heading-6',
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-emphasis',
  Strikethrough: 'cm-md-strikethrough',
  InlineCode: 'cm-md-inline-code',
  FencedCode: 'cm-md-fenced-code',
  Blockquote: 'cm-md-blockquote',
  ListItem: 'cm-md-list-item',
  Link: 'cm-md-link',
  Image: 'cm-md-image',
};

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const className = NODE_TO_CLASS[node.name];
        if (className) {
          builder.add(node.from, node.to, Decoration.mark({ class: className }));
        }
      },
    });
  }
  return builder.finish();
}

export function markdownDecorations(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) {
          this.decorations = buildDecorations(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// Pure helper used in tests: parse `doc`, walk the tree, return the set of distinct
// decoration class names that would be applied. Stand-alone of any EditorView.
export function decorationClassesForRange(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })] });
  const found = new Set<string>();
  syntaxTree(state).iterate({
    enter(node) {
      const className = NODE_TO_CLASS[node.name];
      if (className) found.add(className);
    },
  });
  return [...found];
}
