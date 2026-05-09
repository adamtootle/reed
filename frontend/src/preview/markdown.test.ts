import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings', () => {
    expect(renderMarkdown('# Hi')).toMatch(/<h1[^>]*>Hi<\/h1>/);
  });

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n');
    // table gets data-line attribute injected, so match <table with optional attrs
    expect(html).toMatch(/<table[\s>]/);
    expect(html).toMatch(/<th>a<\/th>/);
  });

  it('renders strikethrough', () => {
    expect(renderMarkdown('~~gone~~')).toMatch(/<s>gone<\/s>/);
  });

  it('renders task list checkboxes (read-only)', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toMatch(/disabled/);
  });

  it('renders fenced code with highlight.js classes', () => {
    const html = renderMarkdown('```js\nconst x = 1\n```');
    expect(html).toMatch(/class="hljs/);
  });

  it('renders footnotes', () => {
    const html = renderMarkdown('Hello[^1]\n\n[^1]: A footnote');
    expect(html).toMatch(/footnote/i);
  });

  it('renders github alerts (NOTE)', () => {
    const html = renderMarkdown('> [!NOTE]\n> Useful info');
    expect(html).toMatch(/class="[^"]*alert/);
  });

  it('renders mermaid blocks as placeholders', () => {
    const html = renderMarkdown('```mermaid\ngraph TD; A-->B\n```');
    expect(html).toMatch(/class="mermaid-block"/);
    expect(html).toMatch(/data-source="/);
  });

  it('emits data-line attributes on top-level blocks', () => {
    const html = renderMarkdown('para1\n\npara2');
    expect(html).toMatch(/data-line="0"/);
    expect(html).toMatch(/data-line="2"/);
  });

  it('opens external links in a new tab', () => {
    const html = renderMarkdown('[ext](https://example.com)');
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });

  it('does not modify internal links', () => {
    const html = renderMarkdown('[doc](other.md)');
    expect(html).not.toMatch(/target="_blank"/);
  });
});
