import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeBackoffDelay, SSEClient } from './sse';

describe('computeBackoffDelay', () => {
  it.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [3, 8000],
    [4, 16000],
    [5, 30000],
    [6, 30000],
    [100, 30000],
  ])('attempt %i → %i ms', (attempt, expected) => {
    expect(computeBackoffDelay(attempt)).toBe(expected);
  });
});

describe('SSEClient', () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    readyState = 0;
    onopen: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
    closed = false;
    constructor(url: string) {
      this.url = url;
      FakeEventSource.instances.push(this);
    }
    addEventListener(name: string, cb: (ev: MessageEvent) => void) {
      const arr = this.listeners.get(name) ?? [];
      arr.push(cb);
      this.listeners.set(name, arr);
    }
    close() { this.closed = true; }
    emitOpen() { this.readyState = 1; this.onopen?.(new Event('open')); }
    emitError() { this.onerror?.(new Event('error')); }
    emit(name: string, data: string) {
      const ev = new MessageEvent(name, { data });
      this.listeners.get(name)?.forEach(cb => cb(ev));
    }
  }

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens an EventSource at /events on start', () => {
    const c = new SSEClient();
    c.start();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/events');
  });

  it('fires onConnect when the underlying source opens', () => {
    const c = new SSEClient();
    const onConnect = vi.fn();
    c.onConnect = onConnect;
    c.start();
    FakeEventSource.instances[0].emitOpen();
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('fires onFileChanged when a fileChanged event arrives', () => {
    const c = new SSEClient();
    const onFileChanged = vi.fn();
    c.onFileChanged = onFileChanged;
    c.start();
    FakeEventSource.instances[0].emit('fileChanged', JSON.stringify({ path: 'notes.md' }));
    expect(onFileChanged).toHaveBeenCalledWith('notes.md');
  });

  it('reconnects with exponential backoff on error', () => {
    const c = new SSEClient();
    const onDisconnect = vi.fn();
    c.onDisconnect = onDisconnect;
    c.start();
    FakeEventSource.instances[0].emitError();
    expect(onDisconnect).toHaveBeenCalledOnce();

    // After 1000ms a reconnect attempt opens a new EventSource.
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('stop() prevents pending reconnects', () => {
    const c = new SSEClient();
    c.start();
    FakeEventSource.instances[0].emitError();
    c.stop();
    vi.advanceTimersByTime(60000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('start() called twice does not open a second EventSource', () => {
    const c = new SSEClient();
    c.start();
    c.start();
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
