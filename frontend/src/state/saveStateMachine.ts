import type { SaveState } from './types';

export interface PillStatus {
  color: 'green' | 'amber' | 'blue' | 'red' | 'orange';
  label: string;
}

export function computePillState(saveState: SaveState, sseConnected: boolean): PillStatus {
  if (!sseConnected) {
    return { color: 'orange', label: 'Reconnecting…' };
  }
  switch (saveState) {
    case 'saved': return { color: 'green', label: 'Saved' };
    case 'unsaved': return { color: 'amber', label: 'Unsaved' };
    case 'saving': return { color: 'blue', label: 'Saving…' };
    case 'saveFailed': return { color: 'red', label: 'Save failed' };
  }
}
