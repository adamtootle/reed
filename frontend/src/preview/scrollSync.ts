import type { EditorView } from '@codemirror/view';

export function findNearestLineElement(preview: HTMLElement, line: number): HTMLElement | null {
  const candidates = preview.querySelectorAll<HTMLElement>('[data-line]');
  for (const el of Array.from(candidates)) {
    const l = Number(el.getAttribute('data-line'));
    if (l >= line) return el;
  }
  return null;
}

export function computeRatio(scroll: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, scroll / max));
}

export interface ScrollSyncOptions {
  view: EditorView;
  preview: HTMLElement;
}

export class ScrollSync {
  private syncing = false;

  constructor(private readonly opts: ScrollSyncOptions) {}

  start(): void {
    this.opts.view.scrollDOM.addEventListener('scroll', this.onEditorScroll);
    this.opts.preview.addEventListener('scroll', this.onPreviewScroll);
  }

  stop(): void {
    this.opts.view.scrollDOM.removeEventListener('scroll', this.onEditorScroll);
    this.opts.preview.removeEventListener('scroll', this.onPreviewScroll);
  }

  private onEditorScroll = (): void => {
    if (this.syncing) return;
    this.syncing = true;
    requestAnimationFrame(() => { this.syncing = false; });

    const view = this.opts.view;
    const blockInfo = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const line = view.state.doc.lineAt(blockInfo.from).number - 1;
    const target = findNearestLineElement(this.opts.preview, line);
    if (!target) return;
    this.opts.preview.scrollTop = target.offsetTop;
  };

  private onPreviewScroll = (): void => {
    if (this.syncing) return;
    this.syncing = true;
    requestAnimationFrame(() => { this.syncing = false; });

    const preview = this.opts.preview;
    const candidates = preview.querySelectorAll<HTMLElement>('[data-line]');
    let topEl: HTMLElement | null = null;
    for (const el of Array.from(candidates)) {
      if (el.offsetTop >= preview.scrollTop) { topEl = el; break; }
    }
    if (!topEl) return;
    const line = Number(topEl.getAttribute('data-line'));
    const view = this.opts.view;
    const linePos = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, line + 1)));
    const blockInfo = view.lineBlockAt(linePos.from);
    view.scrollDOM.scrollTop = blockInfo.top;
  };
}
