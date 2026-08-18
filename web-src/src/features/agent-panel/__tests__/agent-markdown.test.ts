import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentMarkdown, isHttpUrl, localAssistantLinkPath } from '@/features/agent-panel/components/AgentMarkdown.tsx';
import { AgentMathMarkdownCore } from '@/features/agent-panel/components/AgentMathMarkdownCore.tsx';
import { turnReplyText } from '@/features/agent-panel/lib/turnModel.ts';
import { normalizeAgentMathDelimiters } from '@/features/agent-panel/lib/agentMath.ts';

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement(AgentMathMarkdownCore, {
      markdown: normalizeAgentMathDelimiters(markdown),
      onOpenArtifact: () => {},
    }),
  );
}

function renderPlainMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement(AgentMarkdown, { markdown, onOpenArtifact: () => {} }),
  );
}

test('agent Markdown keeps GFM content but renders raw HTML as text', () => {
  const html = renderPlainMarkdown('- [x] done\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>');

  assert.match(html, /type="checkbox"/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('agent Markdown link policy only opens local files and HTTP(S) URLs', () => {
  assert.equal(localAssistantLinkPath('notes/hello%20world.md'), 'notes/hello world.md');
  assert.equal(localAssistantLinkPath('#heading'), null);
  assert.equal(localAssistantLinkPath('javascript:alert(1)'), null);
  assert.equal(localAssistantLinkPath('//example.com/file.md'), null);
  assert.equal(isHttpUrl('https://example.com'), true);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);

  const html = renderPlainMarkdown('[local](notes/a.md) [bad](javascript:alert(1)) ![remote](https://example.com/a.png)');
  assert.match(html, /href="notes\/a.md"/);
  assert.doesNotMatch(html, /javascript:|<img/);
});

test('agent Markdown renders both inline and display math delimiter families', () => {
  const html = renderMarkdown(String.raw`Inline $x^2$ and \(y + 1\).

$$\frac{a}{b}$$

\[\boxed{z \approx 3}\]`);

  assert.equal(html.match(/class="katex"/g)?.length, 4);
  assert.equal(html.match(/class="katex-display"/g)?.length, 2);
  assert.match(html, /<math/);
  assert.match(html, /application\/x-tex/);
});

test('agent Markdown renders the valuation formula with currency, percentages, and CJK text', () => {
  const html = renderMarkdown(String.raw`\[
\boxed{\text{估值} = \frac{\$13.26 \times 28}{1 + 13\%} \approx \$328.57}
\]`);

  assert.match(html, /class="katex-display"/);
  assert.match(html, /估值/);
  assert.match(html, /328\.57/);
  assert.match(html, /13%/);
});

test('agent math normalization leaves code, escapes, incomplete streams, and currency prose literal', () => {
  const source = [
    'The price is $328.57 and tax is $5.00.',
    '',
    'Inline code: `\\(x + 1\\)`',
    '',
    '~~~',
    String.raw`\[not math\]`,
    '~~~',
    '',
    String.raw`Escaped: \\(not math\\)`,
    '',
    String.raw`Escaped dollar: \$20`,
    '',
    String.raw`Streaming: \(\frac{1}{2}`,
    '',
    String.raw`Unmatched close: \) and \]`,
  ].join('\n');
  const normalized = normalizeAgentMathDelimiters(source);

  assert.ok(normalized.includes(String.raw`\$328.57`));
  assert.ok(normalized.includes(String.raw`\$5.00`));
  assert.ok(normalized.includes('`\\(x + 1\\)`'));
  assert.ok(normalized.includes(String.raw`\[not math\]`));
  assert.ok(normalized.includes(String.raw`\\(not math\\)`));
  assert.ok(normalized.includes(String.raw`\$20`));
  assert.ok(normalized.includes(String.raw`\\(\frac{1}{2}`));
  assert.ok(normalized.includes(String.raw`\\) and \\]`));

  const html = renderPlainMarkdown(source);
  assert.doesNotMatch(html, /class="katex"/);
  assert.ok(html.includes('$328.57'));
  assert.ok(html.includes(String.raw`\(x + 1\)`));
  assert.ok(html.includes(String.raw`\[not math\]`));
  assert.ok(html.includes(String.raw`\(\frac{1}{2}`));
  assert.ok(html.includes(String.raw`\) and \]`));
});

test('agent Markdown keeps adjacent currency amounts and ranges as prose', () => {
  const source = [
    'Revenue was USD$328.57 in 2024 and USD$400.00 in 2025.',
    'The compact range is $328.57-$400.00.',
    'The spaced range is $328.57 - $400.00.',
  ].join('\n');
  const html = renderMarkdown(source);

  assert.doesNotMatch(html, /class="katex(?:-error)?"/);
  assert.match(html, /USD\$328\.57 in 2024 and USD\$400\.00/);
  assert.match(html, /\$328\.57-\$400\.00/);
  assert.match(html, /\$328\.57 - \$400\.00/);
});

test('agent Markdown keeps unsafe content inert beside math and degrades invalid TeX visibly', () => {
  const html = renderMarkdown(String.raw`$x + 1$ <script>alert(1)</script>

[bad](javascript:alert(2)) ![remote](https://example.com/tracker.png)

$\notARealCommand{$`);

  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-error"/);
  assert.match(html, /notARealCommand/);
  assert.match(html, /color:var\(--status-danger\)/);
  assert.doesNotMatch(html, /#cc0000/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|javascript:|<img/);
});

test('copy reply retains the original Markdown and LaTeX source', () => {
  const source = String.raw`\[\frac{future\ EPS}{1 + r}\]`;
  const copied = turnReplyText({
    key: 'turn-1',
    head: null,
    body: [{ kind: 'assistant', id: 'assistant-1', text: source }],
  });

  assert.equal(copied, source);
  assert.notEqual(normalizeAgentMathDelimiters(source), source);
});

test('agent display math owns narrow-panel overflow and offline KaTeX assets', () => {
  const css = fs.readFileSync('web-src/src/features/agent-panel/agent-panel.css', 'utf8');
  const mathRenderer = fs.readFileSync('web-src/src/features/agent-panel/components/AgentMathMarkdown.tsx', 'utf8');

  assert.match(mathRenderer, /import 'katex\/dist\/katex\.min\.css'/);
  assert.match(css, /\.agent-prose \.katex-display\s*\{[^}]*max-width: 100%/s);
  assert.match(css, /\.agent-prose \.katex-display\s*\{[^}]*overflow-x: auto/s);
});
