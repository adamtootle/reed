import { describe, it, expect } from 'vitest';
import { decorationClassesForRange } from './decorations';

describe('decorationClassesForRange', () => {
  it('classifies a heading line', () => {
    const classes = decorationClassesForRange('# Hello');
    expect(classes).toContain('cm-md-heading-1');
  });

  it('classifies bold and emphasis spans', () => {
    const classes = decorationClassesForRange('**bold** and _italic_ text');
    expect(classes).toContain('cm-md-strong');
    expect(classes).toContain('cm-md-emphasis');
  });

  it('classifies inline code', () => {
    const classes = decorationClassesForRange('a `code` span');
    expect(classes).toContain('cm-md-inline-code');
  });

  it('classifies fenced code blocks', () => {
    const classes = decorationClassesForRange('```\nfoo\n```');
    expect(classes).toContain('cm-md-fenced-code');
  });

  it('classifies blockquotes', () => {
    const classes = decorationClassesForRange('> a quote');
    expect(classes).toContain('cm-md-blockquote');
  });

  it('classifies links', () => {
    const classes = decorationClassesForRange('[text](http://example.com)');
    expect(classes).toContain('cm-md-link');
  });

  it('classifies strikethrough', () => {
    const classes = decorationClassesForRange('~~strike~~');
    expect(classes).toContain('cm-md-strikethrough');
  });
});
