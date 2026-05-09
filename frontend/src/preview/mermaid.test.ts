import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderMermaidBlocks, _resetMermaidForTests } from './mermaid';

describe('renderMermaidBlocks', () => {
  let mockRender: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetMermaidForTests();
    mockRender = vi.fn(async (id: string, src: string) => ({ svg: `<svg data-id="${id}" data-src="${src}"/>` }));
    vi.doMock('mermaid', () => ({
      default: {
        initialize: vi.fn(),
        render: mockRender,
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('mermaid');
  });

  it('does nothing if there are no mermaid blocks', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>no diagrams here</p>';
    await renderMermaidBlocks(root);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('renders each mermaid block once', async () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="mermaid-block" data-source="graph TD; A-->B"></div>
      <div class="mermaid-block" data-source="graph LR; X-->Y"></div>
    `;
    await renderMermaidBlocks(root);
    expect(mockRender).toHaveBeenCalledTimes(2);
    expect(root.innerHTML).toContain('<svg');
  });

  it('caches rendered SVG by source', async () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="mermaid-block" data-source="graph TD; A-->B"></div>`;
    await renderMermaidBlocks(root);

    const root2 = document.createElement('div');
    root2.innerHTML = `<div class="mermaid-block" data-source="graph TD; A-->B"></div>`;
    await renderMermaidBlocks(root2);

    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
