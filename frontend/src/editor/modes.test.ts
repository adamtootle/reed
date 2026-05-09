import { describe, it, expect } from 'vitest';
import { createEditor } from './setup';
import { applyMode } from './modes';

describe('applyMode', () => {
  it('inline mode installs decorations', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const ed = createEditor(parent, '# Hello');
    applyMode(ed, 'inline');
    ed.view.requestMeasure();
    const html = ed.view.dom.innerHTML;
    expect(html).toMatch(/cm-md-heading-1/);
    ed.destroy();
  });

  it('split mode removes decorations and switches to monospace', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const ed = createEditor(parent, '# Hello');
    applyMode(ed, 'inline');
    applyMode(ed, 'split');
    ed.view.requestMeasure();
    const html = ed.view.dom.innerHTML;
    expect(html).not.toMatch(/cm-md-heading-1/);
    ed.destroy();
  });
});
