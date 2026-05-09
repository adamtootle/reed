export class ConflictBanner {
  onReload: (() => void) | null = null;
  onKeep: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.classList.add('reed-conflict-banner');
  }

  show(): void {
    this.root.innerHTML = `
      <div class="reed-conflict-content">
        <span>This file changed on disk.</span>
        <button data-action="reload" class="reed-conflict-btn">Reload from disk</button>
        <button data-action="keep" class="reed-conflict-btn">Keep my version</button>
      </div>
    `;
    this.root.querySelector('[data-action="reload"]')?.addEventListener('click', () => this.onReload?.());
    this.root.querySelector('[data-action="keep"]')?.addEventListener('click', () => this.onKeep?.());
  }

  hide(): void {
    this.root.innerHTML = '';
  }
}
