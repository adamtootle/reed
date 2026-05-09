import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDebouncer } from './debounce';

describe('createDebouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not fire before the delay', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    vi.advanceTimersByTime(749);
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires after the delay', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    vi.advanceTimersByTime(750);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('resets the delay on subsequent triggers', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    vi.advanceTimersByTime(700);
    d.trigger(); // resets
    vi.advanceTimersByTime(700);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('flush fires immediately if pending', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    d.flush();
    expect(cb).toHaveBeenCalledOnce();
  });

  it('flush is a no-op if no pending trigger', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.flush();
    expect(cb).not.toHaveBeenCalled();
  });

  it('cancel prevents the pending fire', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    d.trigger();
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('isPending reflects state', () => {
    const cb = vi.fn();
    const d = createDebouncer(cb, 750);
    expect(d.isPending()).toBe(false);
    d.trigger();
    expect(d.isPending()).toBe(true);
    d.flush();
    expect(d.isPending()).toBe(false);
  });
});
