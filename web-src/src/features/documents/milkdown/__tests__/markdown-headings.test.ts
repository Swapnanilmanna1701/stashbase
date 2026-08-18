import assert from 'node:assert/strict';
import test from 'node:test';
import { Schema } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import { activeHeadingId, extractDocumentHeadings, outlineScrollTop } from '@/features/documents/milkdown/headings';
import { outlineDepth, outlineHasChildren, visibleOutlineHeadings } from '@/common/lib/documentOutline';
import { scrollOutlineToHeading, type HeadingNodeView } from '@/features/documents/milkdown/outlineNavigation';

const outlineSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    heading: { attrs: { level: { default: 1 } }, content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
});

test('outline headings keep hierarchy and stable duplicate Unicode targets', () => {
  const nodes = [
    { type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'Résumé' },
    { type: { name: 'paragraph' }, attrs: {}, textContent: '# not a heading' },
    { type: { name: 'heading' }, attrs: { level: 3 }, textContent: 'Résumé' },
    { type: { name: 'heading' }, attrs: { level: 6 }, textContent: '日本語!' },
  ];
  const doc = { descendants: (visit: (node: typeof nodes[number], position: number) => void) => nodes.forEach((node, index) => visit(node, index * 10)) };
  assert.deepEqual(extractDocumentHeadings(doc), [
    { id: 'resume', level: 1, text: 'Résumé', position: 0 },
    { id: 'resume-1', level: 3, text: 'Résumé', position: 20 },
    { id: '日本語', level: 6, text: '日本語!', position: 30 },
  ]);
});

test('live heading changes, active tracking, and large documents remain predictable', () => {
  const documentWith = (text: string) => ({ descendants: (visit: (node: { type: { name: string }; attrs: { level: number }; textContent: string }, position: number) => void) => visit({ type: { name: 'heading' }, attrs: { level: 2 }, textContent: text }, 7) });
  assert.deepEqual(extractDocumentHeadings(documentWith('Before')), [{ id: 'before', level: 2, text: 'Before', position: 7 }]);
  const updated = extractDocumentHeadings(documentWith('After'));
  assert.deepEqual(updated, [{ id: 'after', level: 2, text: 'After', position: 7 }]);
  assert.equal(activeHeadingId(updated, [{ id: 'after', top: 20 }], 30), 'after');
  assert.equal(outlineScrollTop(100, 300, 180), 380);
  assert.equal(outlineScrollTop(100, 0, 20), 0);
  const large = { descendants: (visit: (node: { type: { name: string }; attrs: { level: number }; textContent: string }, position: number) => void) => { for (let i = 0; i < 2000; i++) visit({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: `Section ${i}` }, i); } };
  assert.equal(extractDocumentHeadings(large).length, 2000);
});

test('outline collapse hides only a heading’s descendants and supports skipped levels', () => {
  const headings = [
    { id: 'one', level: 1, text: 'One', position: 0 },
    { id: 'two', level: 2, text: 'Two', position: 1 },
    { id: 'three', level: 3, text: 'Three', position: 2 },
    { id: 'four', level: 2, text: 'Four', position: 3 },
    { id: 'five', level: 1, text: 'Five', position: 4 },
  ];
  assert.equal(outlineHasChildren(headings, 0), true);
  assert.equal(outlineHasChildren(headings, 3), false);
  assert.deepEqual(headings.map((_heading, index) => outlineDepth(headings, index)), [0, 1, 2, 1, 0]);
  assert.deepEqual(visibleOutlineHeadings(headings, new Set(['two'])).map(({ id }) => id), ['one', 'two', 'four', 'five']);
  assert.deepEqual(visibleOutlineHeadings(headings, new Set(['one'])).map(({ id }) => id), ['one', 'five']);
});

test('outline depth follows structure when Markdown skips heading levels', () => {
  const headings = [
    { id: 'parent', level: 2, text: 'Parent', position: 0 },
    { id: 'child', level: 4, text: 'Child', position: 1 },
    { id: 'sibling', level: 3, text: 'Sibling', position: 2 },
  ];
  assert.deepEqual(headings.map((_heading, index) => outlineDepth(headings, index)), [0, 1, 1]);
});

test('outline selection re-resolves the current ProseMirror position when Milkdown rewrites punctuation IDs', () => {
  const headingText = 'P13 — 生产级挑战：多租户 / 过滤 / 冷启动 21:00–22:30 ★ 建立信任';
  const headingNode = outlineSchema.node('heading', { level: 2 }, outlineSchema.text(headingText));
  const selectedHeading = extractDocumentHeadings(outlineSchema.node('doc', null, [headingNode]))[0];
  const prefix = outlineSchema.node('paragraph', null, outlineSchema.text('Inserted before the selected heading.'));
  const currentDocument = outlineSchema.node('doc', null, [prefix, headingNode]);
  const currentHeading = extractDocumentHeadings(currentDocument)[0];
  assert.notEqual(currentHeading.position, selectedHeading.position);

  const scrollCalls: ScrollToOptions[] = [];
  const scroller = {
    scrollTop: 300,
    getBoundingClientRect: () => ({ top: 100 }),
    scrollTo: (options: ScrollToOptions) => scrollCalls.push(options),
  } as unknown as HTMLElement;
  const renderedHeading = {
    tagName: 'H2',
    id: 'p13-—-生产级挑战：多租户-/-过滤-/-冷启动-21:00–22:30-★-建立信任',
    getBoundingClientRect: () => ({ top: 180 }),
  } as unknown as HTMLElement;
  assert.notEqual(renderedHeading.id, selectedHeading.id);
  const host = {
    querySelector: (selector: string) => selector === '.milkdown' ? scroller : null,
  } as unknown as HTMLElement;
  const requestedPositions: number[] = [];
  const view = {
    state: { doc: currentDocument },
    nodeDOM: (position: number) => {
      requestedPositions.push(position);
      return position === currentHeading.position ? renderedHeading as unknown as Node : null;
    },
  } satisfies HeadingNodeView;

  const navigated = scrollOutlineToHeading(host, selectedHeading, view, true);

  assert.equal(navigated, true);
  assert.deepEqual(requestedPositions, [currentHeading.position]);
  assert.deepEqual(scrollCalls, [{ top: 380, behavior: 'auto' }]);
});

test('outline selection disambiguates repeated headings that share one immutable ProseMirror node', () => {
  const sharedHeading = outlineSchema.node('heading', { level: 2 }, outlineSchema.text('Duplicate'));
  const initialDocument = outlineSchema.node('doc', null, [sharedHeading]);
  const initialState = EditorState.create({ doc: initialDocument });
  const currentDocument = initialState.apply(
    initialState.tr.insert(initialDocument.content.size, sharedHeading),
  ).doc;
  const currentHeadings = extractDocumentHeadings(currentDocument);
  const selectedHeading = currentHeadings[1];

  const requestedPositions: number[] = [];
  const renderedHeadings = currentHeadings.map((heading) => ({
    tagName: 'H2',
    getBoundingClientRect: () => ({ top: heading.position + 100 }),
  } as unknown as HTMLElement));
  const scroller = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTo: () => {},
  } as unknown as HTMLElement;
  const host = {
    querySelector: (selector: string) => selector === '.milkdown' ? scroller : null,
  } as unknown as HTMLElement;
  const view = {
    state: { doc: currentDocument },
    nodeDOM: (position: number) => {
      requestedPositions.push(position);
      const index = currentHeadings.findIndex((heading) => heading.position === position);
      return index >= 0 ? renderedHeadings[index] as unknown as Node : null;
    },
  } satisfies HeadingNodeView;

  const navigated = scrollOutlineToHeading(host, selectedHeading, view, true);

  assert.equal(navigated, true);
  assert.deepEqual(requestedPositions, [selectedHeading.position]);
});
