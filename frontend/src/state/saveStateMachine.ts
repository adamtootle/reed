import type { SaveState, SSEStatus } from './types';

export interface PillStatus {
  color: 'green' | 'amber' | 'blue' | 'red' | 'orange' | 'zinc';
  label: string;
}

export function computePillState(
  saveState: SaveState,
  sseStatus: SSEStatus,
  hasCurrentFile: boolean,
): PillStatus {
  if (sseStatus === 'connecting') {
    return { color: 'orange', label: 'Connecting…' };
  }
  if (sseStatus === 'reconnecting') {
    return { color: 'orange', label: 'Reconnecting…' };
  }
  if (!hasCurrentFile) {
    return { color: 'zinc', label: 'Ready' };
  }
  switch (saveState) {
    case 'saved': return { color: 'green', label: 'Saved' };
    case 'unsaved': return { color: 'amber', label: 'Unsaved' };
    case 'saving': return { color: 'blue', label: 'Saving…' };
    case 'saveFailed': return { color: 'red', label: 'Save failed' };
  }
}
