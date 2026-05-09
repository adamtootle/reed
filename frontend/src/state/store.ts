import type { AppState } from './types';

export interface Store<T> {
  get(): T;
  set(partial: Partial<T>): void;
  subscribe(listener: (state: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(s: T) => void>();

  return {
    get: () => state,
    set: (partial) => {
      let changed = false;
      for (const k of Object.keys(partial) as Array<keyof T>) {
        if (state[k] !== partial[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type AppStore = Store<AppState>;
