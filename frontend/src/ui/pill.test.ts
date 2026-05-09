import { describe, it, expect, vi } from 'vitest';
import { Pill } from './pill';

describe('Pill', () => {
  it('renders three segments and the status', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const segs = root.querySelectorAll('.reed-seg');
    expect(segs).toHaveLength(2);
    expect(root.querySelector('.reed-status')?.textContent).toContain('Saved');
  });

  it('marks the active theme button', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'dark', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const active = root.querySelectorAll('.reed-seg')[0].querySelector('.active');
    expect(active?.getAttribute('data-value')).toBe('dark');
  });

  it('marks the active mode button', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'auto', viewMode: 'split', status: { color: 'green', label: 'Saved' } });
    const active = root.querySelectorAll('.reed-seg')[1].querySelector('.active');
    expect(active?.getAttribute('data-value')).toBe('split');
  });

  it('reflects status color via data-color attribute', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'orange', label: 'Reconnecting…' } });
    expect(root.querySelector('.reed-status')?.getAttribute('data-color')).toBe('orange');
  });

  it('emits theme-change when a theme button is clicked', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    const onThemeChange = vi.fn();
    pill.onThemeChange = onThemeChange;
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const dark = root.querySelector('.reed-seg [data-value="dark"]') as HTMLButtonElement;
    dark.click();
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('emits mode-change when a mode button is clicked', () => {
    const root = document.createElement('div');
    const pill = new Pill(root);
    const onModeChange = vi.fn();
    pill.onModeChange = onModeChange;
    pill.update({ theme: 'auto', viewMode: 'inline', status: { color: 'green', label: 'Saved' } });
    const split = root.querySelector('.reed-seg [data-value="split"]') as HTMLButtonElement;
    split.click();
    expect(onModeChange).toHaveBeenCalledWith('split');
  });
});
