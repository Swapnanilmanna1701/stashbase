import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentOutline } from '@/common/components/DocumentOutline';

test('outline entries are keyboard buttons with active and full-label accessibility state', () => {
  const markup = renderToStaticMarkup(createElement(DocumentOutline, {
    headings: [
      { id: 'overview', level: 1, text: 'Overview', position: 0 },
      { id: 'section', level: 3, text: '', position: 1 },
    ],
    activeId: 'overview',
    onSelect: () => {},
  }));
  assert.match(markup, /aria-label="Document outline"/);
  assert.match(markup, /<button[^>]*aria-label="Heading level 1: Overview"[^>]*aria-current="location"/);
  assert.match(markup, /<button[^>]*aria-label="Heading level 3: Untitled section 1"/);
  assert.doesNotMatch(markup, />H1</);
  // Base indent 10px puts a depth-0 label on the sidebar's shared 38px
  // label gutter (see the DocumentOutline comment).
  assert.match(markup, /class="tree-row active" style="padding-left:10px"/);
});

test('outline is list-only — the empty state belongs to the sidebar section', () => {
  const markup = renderToStaticMarkup(createElement(DocumentOutline, {
    headings: [], activeId: null, onSelect: () => {},
  }));
  // The sidebar renders its own note without loading this lazy chunk, so
  // a second empty state here would be a duplicate that never shows.
  assert.doesNotMatch(markup, /tree-row/);
  assert.doesNotMatch(markup, /No headings/);
});
