const SCHEDULE = [1000, 2000, 4000, 8000, 16000, 30000];

export function computeBackoffDelay(attempt: number): number {
  if (attempt < 0) return SCHEDULE[0];
  if (attempt >= SCHEDULE.length) return SCHEDULE[SCHEDULE.length - 1];
  return SCHEDULE[attempt];
}

export class SSEClient {
  onConnect: (() => void) | null = null;
  onDisconnect: (() => void) | null = null;
  onFileChanged: ((path: string) => void) | null = null;

  private source: EventSource | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.source?.close();
    this.source = null;
  }

  private open(): void {
    const source = new EventSource('/events');
    this.source = source;
    source.onopen = () => {
      this.attempt = 0;
      this.onConnect?.();
    };
    source.onerror = () => {
      this.handleError();
    };
    source.addEventListener('fileChanged', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { path: string };
        this.onFileChanged?.(data.path);
      } catch {
        // ignore malformed payloads
      }
    });
  }

  private handleError(): void {
    if (this.stopped) return;
    this.source?.close();
    this.source = null;
    this.onDisconnect?.();
    const delay = computeBackoffDelay(this.attempt);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }
}
