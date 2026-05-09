import MarkdownIt from 'markdown-it';
// @ts-expect-error no type declarations for markdown-it-task-lists
import taskLists from 'markdown-it-task-lists';
// @ts-expect-error no type declarations for markdown-it-footnote
import footnote from 'markdown-it-footnote';
import katex from '@vscode/markdown-it-katex';
import githubAlerts from 'markdown-it-github-alerts';
import hljs from 'highlight.js/lib/common';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<pre><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
    } catch {
      // fall through to plain
    }
  }
  return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
}

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight: (code, lang) => {
    if (lang === 'mermaid') {
      return `<div class="mermaid-block" data-source="${escapeHtml(code)}"></div>`;
    }
    return highlight(code, lang);
  },
});

md.use(taskLists, { enabled: false });
md.use(footnote);
md.use(katex);
md.use(githubAlerts);

// Custom rule: replace fenced ```mermaid blocks with placeholder divs (belt-and-suspenders
// alongside the highlight option above; the renderer-level rule wins when present).
const defaultFenceRender = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === 'mermaid') {
    return `<div class="mermaid-block" data-source="${escapeHtml(token.content)}"></div>`;
  }
  return defaultFenceRender(tokens, idx, options, env, self);
};

// Custom link_open rule: external (http/https) links get target="_blank".
const defaultLinkOpen: NonNullable<typeof md.renderer.rules.link_open> =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') ?? '';
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Annotate top-level block tokens with `data-line` for scroll sync.
const blockTags = new Set([
  'paragraph_open', 'heading_open', 'blockquote_open', 'bullet_list_open',
  'ordered_list_open', 'fence', 'code_block', 'table_open', 'hr',
]);
md.core.ruler.push('add_data_line', (state) => {
  for (const token of state.tokens) {
    if (blockTags.has(token.type) && token.map) {
      token.attrSet('data-line', String(token.map[0]));
    }
  }
  return false;
});

export function renderMarkdown(input: string): string {
  return md.render(input);
}

export function getMarkdownIt(): MarkdownIt {
  return md;
}
