/** Math parsing, typing, and serialization against the real Milkdown editor. */
import { CrepeBuilder } from '@milkdown/crepe/builder';
import { codeMirror } from '@milkdown/crepe/feature/code-mirror';
import { editorViewCtx } from '@milkdown/kit/core';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { math } from './math';

const live: CrepeBuilder[] = [];

afterEach(async () => {
  for (const editor of live.splice(0)) await editor.destroy();
});

async function open(source: string, enabled = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new CrepeBuilder({ root: host, defaultValue: source })
    .addFeature(codeMirror)
    .addFeature((instance) => math(instance, enabled));
  live.push(editor);
  await editor.create();
  return {
    host,
    markdown: () => editor.getMarkdown(),
    type: (text: string) =>
      editor.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        for (const character of text) {
          const end = view.state.doc.content.size - 1;
          const insert = () => view.state.tr.insertText(character, end);
          if (
            !view.someProp('handleTextInput', (handler) =>
              handler(view, end, end, character, insert),
            )
          )
            view.dispatch(insert());
        }
      }),
  };
}

describe('math', () => {
  it('opts into single dollars while preserving escapes and code', async () => {
    const { host, markdown, type } = await open(
      'Formula $x^2$; literal \\$5 and `code $y$`.\n',
      true,
    );
    expect(host.querySelectorAll('[data-type="math_inline"]')).toHaveLength(1); // dom-contract: parsed formula nodes
    expect(host.textContent).toContain('literal $5');
    expect(host.textContent).toContain('code $y$');
    expect(markdown()).toContain('$x^2$');
    type(' Edited.');
    expect(markdown()).toContain('\\$5');
    const reopened = await open(markdown(), true);
    expect(reopened.host.querySelectorAll('[data-type="math_inline"]')).toHaveLength(1); // dom-contract: save/reopen keeps literal dollars out of formulas
    expect(reopened.host.textContent).toContain('code $y$');
  });

  it.each([false, true])(
    'uses the same delimiter rules for typing (enabled=%s)',
    async (enabled) => {
      const { host, type } = await open('', enabled);
      type('Formula $x$');
      expect(host.querySelectorAll('[data-type="math_inline"]')).toHaveLength(enabled ? 1 : 0); // dom-contract: formula nodes after typing
      type(' and \\$literal\\$');
      expect(host.querySelectorAll('[data-type="math_inline"]')).toHaveLength(enabled ? 1 : 0); // dom-contract: escaped dollars do not create nodes
    },
  );

  it('keeps typed formulas inside inline code literal', async () => {
    const { host, type } = await open('`code $x`', true);
    type('$');
    expect(host.querySelectorAll('[data-type="math_inline"]')).toHaveLength(0); // dom-contract: inline code never becomes a formula
    expect(host.textContent).toContain('code $x$');
  });

  it('leaves single dollars as text, on screen and on save', async () => {
    const source =
      'Reads cost $0.005 each: about $0.10–$0.50 per run ($2.50 at most), users $0.01.\n';
    const { host, markdown } = await open(source);

    expect(host.querySelector('[data-type="math_inline"]')).toBeNull(); // dom-contract: currency stays prose, without math schema nodes.
    expect(host.textContent).toContain('about $0.10–$0.50 per run ($2.50 at most)');
    expect(markdown()).toBe(source);
  });

  it('renders inline math opened by two dollars and saves it unchanged', async () => {
    const source = 'Energy is $$E=mc^2$$ here.\n';
    const { host, markdown } = await open(source);

    // dom-contract: the schema value and KaTeX child prove a formula was rendered.
    const formula = host.querySelector<HTMLElement>('[data-type="math_inline"]');
    expect(formula?.dataset.value).toBe('E=mc^2');
    expect(formula?.querySelector('.katex')).not.toBeNull(); // dom-contract: KaTeX's child proves the formula rendered.
    expect(markdown()).toBe(source);
  });

  it('keeps a $$ block as $$ and a ```latex fence as a fence', async () => {
    const source = '$$\na^2 + b^2 = c^2\n$$\n\n```latex\n\\frac{1}{2}\n```\n';
    const { markdown } = await open(source);

    expect(markdown()).toBe(source);
  });
});
