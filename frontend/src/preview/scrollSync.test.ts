import { describe, it, expect } from 'vitest';
import { findNearestLineElement, computeRatio } from './scrollSync';

describe('findNearestLineElement', () => {
  function makePreview(lines: number[]): HTMLElement {
    const el = document.createElement('div');
    for (const l of lines) {
      const c = document.createElement('div');
      c.setAttribute('data-line', String(l));
      el.appendChild(c);
    }
    return el;
  }

  it('returns the first element with data-line >= target', () => {
    const el = makePreview([0, 5, 12, 30]);
    expect(findNearestLineElement(el, 10)?.getAttribute('data-line')).toBe('12');
  });

  it('returns null if all elements are before the target', () => {
    const el = makePreview([0, 5]);
    expect(findNearestLineElement(el, 100)).toBeNull();
  });

  it('returns the first element if target is 0 and first element is at 0', () => {
    const el = makePreview([0, 5]);
    expect(findNearestLineElement(el, 0)?.getAttribute('data-line')).toBe('0');
  });
});

describe('computeRatio', () => {
  it('clamps to [0, 1]', () => {
    expect(computeRatio(-5, 100)).toBe(0);
    expect(computeRatio(150, 100)).toBe(1);
    expect(computeRatio(50, 100)).toBe(0.5);
  });

  it('returns 0 when scroll height is 0', () => {
    expect(computeRatio(50, 0)).toBe(0);
  });
});
