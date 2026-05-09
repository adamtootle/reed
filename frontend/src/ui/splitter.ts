export interface SplitterOptions {
  container: HTMLElement;
  left: HTMLElement;
  handle: HTMLElement;
  right: HTMLElement;
}

export class Splitter {
  private dragging = false;

  constructor(private readonly opts: SplitterOptions) {}

  start(): void {
    this.applyRatio(0.5);
    this.opts.handle.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  stop(): void {
    this.opts.handle.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  private onDown = (ev: PointerEvent): void => {
    this.dragging = true;
    this.opts.handle.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  };

  private onMove = (ev: PointerEvent): void => {
    if (!this.dragging) return;
    const rect = this.opts.container.getBoundingClientRect();
    const ratio = Math.max(0.1, Math.min(0.9, (ev.clientX - rect.left) / rect.width));
    this.applyRatio(ratio);
  };

  private onUp = (): void => {
    this.dragging = false;
  };

  private applyRatio(ratio: number): void {
    const leftPct = Math.round(ratio * 100);
    const rightPct = 100 - leftPct;
    this.opts.left.style.flex = `1 1 ${leftPct}%`;
    this.opts.right.style.flex = `1 1 ${rightPct}%`;
  }
}
