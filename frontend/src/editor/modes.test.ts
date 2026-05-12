import { describe, it, expect } from 'vitest';
import { createEditor } from './setup';
import { applyMode } from './modes';

describe('applyMode', () => {
  it('installs markdown decorations', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const ed = createEditor(parent, { initialDoc: '# Hello' });
    applyMode(ed);
    ed.view.requestMeasure();
    const html = ed.view.dom.innerHTML;
    expect(html).toMatch(/cm-md-heading-1/);
    ed.destroy();
  });
});
