import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store';
import { initialAppState } from './types';

describe('store', () => {
  it('returns the current state', () => {
    const s = createStore(initialAppState);
    expect(s.get()).toEqual(initialAppState);
  });

  it('set merges a partial update', () => {
    const s = createStore(initialAppState);
    s.set({ viewMode: 'split' });
    expect(s.get().viewMode).toBe('split');
    expect(s.get().theme).toBe('auto');
  });

  it('subscribers fire on change', () => {
    const s = createStore(initialAppState);
    const cb = vi.fn();
    s.subscribe(cb);
    s.set({ viewMode: 'split' });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].viewMode).toBe('split');
  });

  it('subscribers do not fire when state is unchanged', () => {
    const s = createStore(initialAppState);
    const cb = vi.fn();
    s.subscribe(cb);
    s.set({ viewMode: 'inline' }); // same as initial
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', () => {
    const s = createStore(initialAppState);
    const cb = vi.fn();
    const off = s.subscribe(cb);
    off();
    s.set({ viewMode: 'split' });
    expect(cb).not.toHaveBeenCalled();
  });
});
