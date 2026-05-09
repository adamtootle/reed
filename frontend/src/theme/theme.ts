import type { ThemeOverride } from '../state/types';

export function resolveDarkMode(override: ThemeOverride, systemDark: boolean): boolean {
  if (override === 'light') return false;
  if (override === 'dark') return true;
  return systemDark;
}

export function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

type Listener = (ev: { matches: boolean }) => void;

export class ThemeController {
  private override: ThemeOverride = 'auto';
  private mql: MediaQueryList | null = null;
  private listener: Listener | null = null;

  start(): void {
    this.mql = window.matchMedia('(prefers-color-scheme: dark)');
    this.listener = (ev) => this.apply(ev.matches);
    this.mql.addEventListener('change', this.listener as EventListener);
    this.apply(this.mql.matches);
  }

  stop(): void {
    if (this.mql && this.listener) {
      this.mql.removeEventListener('change', this.listener as EventListener);
    }
    this.mql = null;
    this.listener = null;
  }

  setOverride(o: ThemeOverride): void {
    this.override = o;
    this.apply(this.mql?.matches ?? false);
  }

  getOverride(): ThemeOverride {
    return this.override;
  }

  private apply(systemDark: boolean): void {
    applyTheme(resolveDarkMode(this.override, systemDark));
  }
}
