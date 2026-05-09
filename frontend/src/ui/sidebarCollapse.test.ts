import { describe, it, expect } from 'vitest';
import { SidebarCollapseController } from './sidebarCollapse';

describe('SidebarCollapseController', () => {
  function setup() {
    document.body.innerHTML = `
      <aside id="sidebar" class="flex"></aside>
      <button id="sidebar-collapse"></button>
      <div id="expand-handle" class="hidden"></div>
    `;
    return {
      sidebar: document.getElementById('sidebar') as HTMLElement,
      collapseBtn: document.getElementById('sidebar-collapse') as HTMLButtonElement,
      expandHandle: document.getElementById('expand-handle') as HTMLElement,
    };
  }

  it('collapse hides sidebar and shows expand handle', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.collapse();
    expect(els.sidebar.classList.contains('hidden')).toBe(true);
    expect(els.expandHandle.classList.contains('hidden')).toBe(false);
  });

  it('expand restores sidebar', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.collapse();
    c.expand();
    expect(els.sidebar.classList.contains('hidden')).toBe(false);
    expect(els.expandHandle.classList.contains('hidden')).toBe(true);
  });

  it('clicking the chevron collapses', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.start();
    els.collapseBtn.click();
    expect(els.sidebar.classList.contains('hidden')).toBe(true);
  });

  it('clicking the expand handle expands', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.start();
    c.collapse();
    els.expandHandle.click();
    expect(els.sidebar.classList.contains('hidden')).toBe(false);
  });

  it('Cmd+\\ toggles', () => {
    const els = setup();
    const c = new SidebarCollapseController(els);
    c.start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true }));
    expect(els.sidebar.classList.contains('hidden')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true }));
    expect(els.sidebar.classList.contains('hidden')).toBe(false);
  });
});
