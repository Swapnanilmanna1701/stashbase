/** Project-aware math parsing and safe formula rendering. */
import { codeBlockConfig } from '@milkdown/kit/component/code-block';
import { parserCtx, remarkStringifyOptionsCtx, type Editor } from '@milkdown/kit/core';
import { codeBlockSchema, inlineCodeSchema } from '@milkdown/kit/preset/commonmark';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { $inputRule, $nodeSchema, $remark, $view } from '@milkdown/kit/utils';
import { renderToString } from 'katex';
import remarkMath from 'remark-math';

/** Crepe's theme styles inline math by this node name. */
const MATH_INLINE = 'math_inline';
const MATH_LANGUAGES = new Set(['latex', 'math']);

const KATEX_OPTIONS = { throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20 };

interface MarkdownNode {
  type: string;
  value?: string;
  lang?: string | null;
  children?: MarkdownNode[];
}

const remarkDoubleDollarMath = $remark('remarkDoubleDollarMath', () => remarkMath, {
  singleDollarTextMath: false,
});

/** A `$$` block arrives as a LaTeX code block, so it edits and previews like
 *  one and saves back as `$$`. */
function mathBlocksToCode(node: MarkdownNode): void {
  node.children?.forEach((child, index, siblings) => {
    if (child.type === 'math') {
      siblings[index] = { type: 'code', lang: 'LaTeX', value: child.value ?? '' };
    } else {
      mathBlocksToCode(child);
    }
  });
}

const remarkMathBlockAsCode = $remark('remarkMathBlockAsCode', () => () => (tree) => {
  mathBlocksToCode(tree as MarkdownNode);
});

const mathInlineSchema = $nodeSchema(MATH_INLINE, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: `span[data-type="${MATH_INLINE}"]`,
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
    },
  ],
  toDOM: (node) => ['span', { 'data-type': MATH_INLINE, 'data-value': node.attrs.value as string }],
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === MATH_INLINE,
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.attrs.value as string);
    },
  },
}));

/** Shows the formula; the source stays in `data-value` for copy and parse. */
const mathInlineView = $view(mathInlineSchema.node, () => (node, view) => {
  const value = node.attrs.value as string;
  const dom = view.dom.ownerDocument.createElement('span');
  dom.dataset.type = MATH_INLINE;
  dom.dataset.value = value;
  dom.innerHTML = renderToString(value, KATEX_OPTIONS);
  return { dom };
});

const mathBlockSchema = codeBlockSchema.extendSchema((previous) => (context) => {
  const base = previous(context);
  return {
    ...base,
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        // Only blocks that arrived as `$$` carry exactly this language, so a
        // ```latex fence keeps its fence.
        if (node.attrs.language !== 'LaTeX') {
          return base.toMarkdown.runner(state, node);
        }
        state.addNode('math', undefined, node.content.firstChild?.text ?? '');
      },
    },
  };
});

const mathInputRule = $inputRule(
  (context) =>
    new InputRule(/(?<!\$)\${1,2}(?:\\.|[^$\\\n])+\${1,2}$/, (state, match, start, end) => {
      if (state.doc.rangeHasMark(start, end, inlineCodeSchema.type(context))) return null;
      const prefix = state.doc.textBetween(state.doc.resolve(start).start(), start);
      if ((prefix.match(/\\+$/)?.[0].length ?? 0) % 2) return null;
      // The parser owns delimiter and escape rules for both typing and loading.
      const parsed = context.get(parserCtx)(match[0]);
      const paragraph = parsed?.firstChild;
      const formula = paragraph?.firstChild;
      if (
        parsed?.childCount !== 1 ||
        paragraph?.childCount !== 1 ||
        formula?.type.name !== MATH_INLINE
      )
        return null;
      return state.tr.replaceWith(start, end, formula);
    }),
);

/** Add after `codeMirror`, whose preview hook this wraps. */
export function math(editor: Editor, enabled = false): void {
  editor
    .config((context) => {
      context.set(remarkDoubleDollarMath.options.key, { singleDollarTextMath: enabled });
      if (enabled)
        context.update(remarkStringifyOptionsCtx, (previous) => ({
          ...previous,
          handlers: {
            ...previous.handlers,
            // Milkdown's trailing-space shortcut skips escaping literal dollars.
            text: (node, parent, state, info) =>
              node.value.includes('$')
                ? state.safe(node.value, { ...info, encode: [] })
                : (previous.handlers?.text?.(node, parent, state, info) ??
                  state.safe(node.value, info)),
          },
        }));
      context.update(codeBlockConfig.key, (previous) => ({
        ...previous,
        renderPreview: (language, content, applyPreview) =>
          MATH_LANGUAGES.has(language.toLowerCase()) && content.length > 0
            ? renderToString(content, { ...KATEX_OPTIONS, displayMode: true })
            : previous.renderPreview(language, content, applyPreview),
      }));
    })
    .use(remarkDoubleDollarMath)
    .use(remarkMathBlockAsCode)
    .use(mathInlineSchema)
    .use(mathInlineView)
    .use(mathInputRule)
    .use(mathBlockSchema);
}
