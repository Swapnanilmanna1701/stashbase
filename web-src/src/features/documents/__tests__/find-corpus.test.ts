import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFindCorpus, scrollRangeIntoView, type CorpusNode } from '@/features/documents/lib/findIframe.ts';

function el(tagName: string, ...children: CorpusNode[]): CorpusNode {
  for (let i = 0; i < children.length; i++) {
    children[i].nextSibling = children[i + 1] ?? null;
  }
  return { nodeType: 1, tagName, firstChild: children[0] ?? null, nextSibling: null };
}

function text(data: string): CorpusNode {
  return { nodeType: 3, data, firstChild: null, nextSibling: null };
}

test('adjacent raw-HTML blocks do not join into one match', () => {
  const body = el('BODY', el('P', text('foo')), el('P', text('bar')));

  const { joined } = buildFindCorpus(body);

  assert.doesNotMatch(joined, /foobar/);
  assert.match(joined, /foo/);
  assert.match(joined, /bar/);
});

test('inline markup and highlight token spans join', () => {
  const paragraph = el('P', text('key'), el('B', text('bo'), el('I', text('ard'))), text('s'));
  const code = el('PRE', el('CODE',
    el('SPAN', text('const')), text(' answer = '), el('SPAN', text('42')), text(';'),
  ));
  const body = el('BODY', paragraph, code);

  const { joined } = buildFindCorpus(body);

  assert.match(joined, /keyboards/);
  assert.match(joined, /const answer = 42;/);
  assert.doesNotMatch(joined, /keyboardsconst/);
});

test('br, list items, and table cells separate their text', () => {
  const body = el('BODY',
    el('P', text('spaces'), el('BR'), text('backslash')),
    el('UL', el('LI', text('one')), el('LI', text('two'))),
    el('TABLE', el('TR', el('TD', text('a')), el('TD', text('b')))),
  );

  const { joined } = buildFindCorpus(body);

  assert.doesNotMatch(joined, /spacesbackslash/);
  assert.doesNotMatch(joined, /onetwo/);
  assert.doesNotMatch(joined, /(?<![a-z])ab(?![a-z])/);
});

test('script and style subtrees are excluded', () => {
  const body = el('BODY',
    el('P', text('visible')),
    el('SCRIPT', text('alert(1)')),
    el('STYLE', text('body{}')),
  );

  const { joined } = buildFindCorpus(body);

  assert.match(joined, /visible/);
  assert.doesNotMatch(joined, /alert/);
  assert.doesNotMatch(joined, /body\{\}/);
});

test('segment starts map every text node to its corpus offset', () => {
  const first = text('foo');
  const second = text('bar');
  const body = el('BODY', el('P', first), el('P', second));

  const { joined, segments } = buildFindCorpus(body);

  assert.equal(segments.length, 2);
  assert.equal(segments[0].node, first);
  assert.equal(joined.slice(segments[0].start, segments[0].start + 3), 'foo');
  assert.equal(segments[1].node, second);
  assert.equal(joined.slice(segments[1].start, segments[1].start + 3), 'bar');
});

test('find navigation scrolls the supplied document container instead of the window', () => {
  const calls: ScrollToOptions[] = [];
  const container = {
    clientHeight: 200,
    clientWidth: 300,
    getBoundingClientRect: () => ({ top: 100, left: 40 } as DOMRect),
    scrollBy: (options: ScrollToOptions) => calls.push(options),
  } as unknown as HTMLElement;
  const range = {
    getClientRects: () => [{ top: 500, left: 90, width: 20, height: 20 } as DOMRect],
    getBoundingClientRect: () => ({ top: 500, left: 90, width: 20, height: 20 } as DOMRect),
  } as unknown as Range;

  scrollRangeIntoView(null, range, container);

  assert.deepEqual(calls, [{ top: 310, left: -90, behavior: 'auto' }]);
});
