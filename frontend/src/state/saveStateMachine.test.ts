import { describe, it, expect } from 'vitest';
import { computePillState } from './saveStateMachine';
import type { SaveState } from './types';

describe('computePillState', () => {
  const cases: Array<[
    { saveState: SaveState; sseConnected: boolean },
    { color: string; label: string },
  ]> = [
    [{ saveState: 'saved', sseConnected: true }, { color: 'green', label: 'Saved' }],
    [{ saveState: 'unsaved', sseConnected: true }, { color: 'amber', label: 'Unsaved' }],
    [{ saveState: 'saving', sseConnected: true }, { color: 'blue', label: 'Saving…' }],
    [{ saveState: 'saveFailed', sseConnected: true }, { color: 'red', label: 'Save failed' }],
    [{ saveState: 'saved', sseConnected: false }, { color: 'orange', label: 'Reconnecting…' }],
    [{ saveState: 'unsaved', sseConnected: false }, { color: 'orange', label: 'Reconnecting…' }],
    [{ saveState: 'saving', sseConnected: false }, { color: 'orange', label: 'Reconnecting…' }],
  ];
  it.each(cases)('saveState=%j sseConnected=%j', (input, expected) => {
    expect(computePillState(input.saveState, input.sseConnected)).toEqual(expected);
  });
});
