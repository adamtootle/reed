import { describe, it, expect } from 'vitest';
import { Splitter } from './splitter';

describe('Splitter', () => {
  function setup() {
    const container = document.createElement('div');
    container.style.width = '1000px';
    document.body.appendChild(container);
    const left = document.createElement('div');
    const handle = document.createElement('div');
    const right = document.createElement('div');
    container.appendChild(left);
    container.appendChild(handle);
    container.appendChild(right);
    return { container, left, handle, right };
  }

  it('starts at 50/50', () => {
    const { container, left, handle, right } = setup();
    new Splitter({ container, left, handle, right }).start();
    expect(left.style.flex).toBe('1 1 50%');
    expect(right.style.flex).toBe('1 1 50%');
  });

  it('updates ratio on pointer drag', () => {
    const { container, left, handle, right } = setup();
    const s = new Splitter({ container, left, handle, right });
    s.start();
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 1000, width: 1000 }),
    });
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, pointerId: 1 }));
    expect(left.style.flex).toBe('1 1 70%');
    expect(right.style.flex).toBe('1 1 30%');
  });
});
