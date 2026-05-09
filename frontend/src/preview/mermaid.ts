const cache = new Map<string, string>();
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let idCounter = 0;

async function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      mod.default.initialize({ startOnLoad: false, theme: 'default' });
      return mod.default;
    });
  }
  return mermaidPromise;
}

export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>('.mermaid-block');
  if (blocks.length === 0) return;

  const decode = (s: string): string => {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  };

  const mermaid = await loadMermaid();

  for (const block of Array.from(blocks)) {
    const source = decode(block.getAttribute('data-source') ?? '');
    if (cache.has(source)) {
      block.innerHTML = cache.get(source)!;
      continue;
    }
    const id = `reed-mermaid-${idCounter++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      cache.set(source, svg);
      block.innerHTML = svg;
    } catch (err) {
      block.innerHTML = `<pre class="mermaid-error">Mermaid error: ${(err as Error).message}</pre>`;
    }
  }
}

export function _resetMermaidForTests(): void {
  cache.clear();
  mermaidPromise = null;
  idCounter = 0;
}
