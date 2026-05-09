import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveDarkMode, applyTheme, ThemeController } from './theme';

describe('resolveDarkMode', () => {
  it.each([
    ['auto', true, true],
    ['auto', false, false],
    ['light', true, false],
    ['light', false, false],
    ['dark', true, true],
    ['dark', false, true],
  ] as const)('override=%s systemDark=%s → %s', (override, systemDark, expected) => {
    expect(resolveDarkMode(override, systemDark)).toBe(expected);
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('adds .dark class when dark', () => {
    applyTheme(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes .dark class when light', () => {
    document.documentElement.classList.add('dark');
    applyTheme(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('ThemeController', () => {
  let mqlListeners: Array<(ev: { matches: boolean }) => void>;
  let mqlMatches: boolean;

  beforeEach(() => {
    mqlListeners = [];
    mqlMatches = false;
    document.documentElement.className = '';
    vi.stubGlobal('matchMedia', (_q: string) => ({
      get matches() { return mqlMatches; },
      addEventListener: (_n: string, cb: (ev: { matches: boolean }) => void) => mqlListeners.push(cb),
      removeEventListener: () => { /* noop */ },
    }));
  });

  afterEach(() => vi.restoreAllMocks());

  it('boots in auto mode and follows system', () => {
    mqlMatches = true;
    const c = new ThemeController();
    c.start();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('overriding to light forces light', () => {
    mqlMatches = true;
    const c = new ThemeController();
    c.start();
    c.setOverride('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reacts to system changes when in auto', () => {
    mqlMatches = false;
    const c = new ThemeController();
    c.start();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    mqlMatches = true;
    mqlListeners.forEach(cb => cb({ matches: true }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores system changes when overridden', () => {
    mqlMatches = false;
    const c = new ThemeController();
    c.start();
    c.setOverride('light');
    mqlMatches = true;
    mqlListeners.forEach(cb => cb({ matches: true }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
