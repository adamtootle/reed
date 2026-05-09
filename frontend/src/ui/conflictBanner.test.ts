import { describe, it, expect, vi } from 'vitest';
import { ConflictBanner } from './conflictBanner';

describe('ConflictBanner', () => {
  it('renders message and two action buttons', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    b.show();
    expect(root.textContent).toMatch(/changed on disk/i);
    expect(root.querySelector('[data-action="reload"]')).not.toBeNull();
    expect(root.querySelector('[data-action="keep"]')).not.toBeNull();
  });

  it('hide clears the banner', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    b.show();
    b.hide();
    expect(root.innerHTML).toBe('');
  });

  it('clicking reload calls onReload', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    const onReload = vi.fn();
    b.onReload = onReload;
    b.show();
    (root.querySelector('[data-action="reload"]') as HTMLButtonElement).click();
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('clicking keep calls onKeep', () => {
    const root = document.createElement('div');
    const b = new ConflictBanner(root);
    const onKeep = vi.fn();
    b.onKeep = onKeep;
    b.show();
    (root.querySelector('[data-action="keep"]') as HTMLButtonElement).click();
    expect(onKeep).toHaveBeenCalledOnce();
  });
});
