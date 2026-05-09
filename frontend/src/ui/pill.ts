import type { ThemeOverride, ViewMode } from '../state/types';
import type { PillStatus } from '../state/saveStateMachine';

export interface PillProps {
  theme: ThemeOverride;
  viewMode: ViewMode;
  status: PillStatus;
}

export class Pill {
  onThemeChange: ((theme: ThemeOverride) => void) | null = null;
  onModeChange: ((mode: ViewMode) => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.classList.add('reed-pill');
  }

  update(props: PillProps): void {
    this.root.innerHTML = `
      <div class="reed-seg" role="group" aria-label="Theme">
        ${this.segButton('auto', 'Auto', props.theme === 'auto')}
        ${this.segButton('light', '☀', props.theme === 'light')}
        ${this.segButton('dark', '☾', props.theme === 'dark')}
      </div>
      <div class="reed-pill-divider"></div>
      <div class="reed-seg" role="group" aria-label="View mode">
        ${this.segButton('inline', 'Inline', props.viewMode === 'inline')}
        ${this.segButton('split', 'Split', props.viewMode === 'split')}
      </div>
      <div class="reed-pill-divider"></div>
      <span class="reed-status" data-color="${props.status.color}">${props.status.label}</span>
    `;

    const [themeSeg, modeSeg] = this.root.querySelectorAll('.reed-seg');
    themeSeg.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button');
      if (!btn) return;
      const value = btn.getAttribute('data-value') as ThemeOverride;
      this.onThemeChange?.(value);
    });
    modeSeg.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button');
      if (!btn) return;
      const value = btn.getAttribute('data-value') as ViewMode;
      this.onModeChange?.(value);
    });
  }

  private segButton(value: string, label: string, active: boolean): string {
    return `<button data-value="${value}" class="${active ? 'active' : ''}">${label}</button>`;
  }
}
