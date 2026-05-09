export interface Debouncer {
  trigger(): void;
  flush(): void;
  cancel(): void;
  isPending(): boolean;
}

export function createDebouncer(callback: () => void, delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    trigger() {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delayMs);
    },
    flush() {
      if (timer !== null) {
        cancel();
        callback();
      }
    },
    cancel,
    isPending: () => timer !== null,
  };
}
