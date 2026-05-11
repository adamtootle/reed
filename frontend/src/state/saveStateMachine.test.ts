import { describe, it, expect } from 'vitest';
import { computePillState } from './saveStateMachine';
import type { SaveState, SSEStatus } from './types';

describe('computePillState', () => {
  const cases: Array<[
    { saveState: SaveState; sseStatus: SSEStatus; hasCurrentFile: boolean },
    { color: string; label: string },
  ]> = [
    // Pre-connect: always "Connecting…" regardless of save state or open file
    [{ saveState: 'saved', sseStatus: 'connecting', hasCurrentFile: false }, { color: 'orange', label: 'Connecting…' }],
    [{ saveState: 'unsaved', sseStatus: 'connecting', hasCurrentFile: true }, { color: 'orange', label: 'Connecting…' }],

    // Dropped connection: "Reconnecting…"
    [{ saveState: 'saved', sseStatus: 'reconnecting', hasCurrentFile: false }, { color: 'orange', label: 'Reconnecting…' }],
    [{ saveState: 'unsaved', sseStatus: 'reconnecting', hasCurrentFile: true }, { color: 'orange', label: 'Reconnecting…' }],

    // Connected, no file open → Ready (regardless of saveState — the default 'saved' is incidental)
    [{ saveState: 'saved', sseStatus: 'connected', hasCurrentFile: false }, { color: 'zinc', label: 'Ready' }],

    // Connected with a file open → save-state-driven labels
    [{ saveState: 'saved', sseStatus: 'connected', hasCurrentFile: true }, { color: 'green', label: 'Saved' }],
    [{ saveState: 'unsaved', sseStatus: 'connected', hasCurrentFile: true }, { color: 'amber', label: 'Unsaved' }],
    [{ saveState: 'saving', sseStatus: 'connected', hasCurrentFile: true }, { color: 'blue', label: 'Saving…' }],
    [{ saveState: 'saveFailed', sseStatus: 'connected', hasCurrentFile: true }, { color: 'red', label: 'Save failed' }],
  ];
  it.each(cases)('saveState=%j sseStatus=%j hasCurrentFile=%j', (input, expected) => {
    expect(
      computePillState(input.saveState, input.sseStatus, input.hasCurrentFile),
    ).toEqual(expected);
  });
});
