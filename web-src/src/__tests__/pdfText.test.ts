import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanPdfSearchText,
  currentPdfPageForViewport,
  exactPageForHighlight,
  findPdfChunkMatch,
  foldPdfText,
  highlightRectsForMatch,
  type FlatPage,
} from '../components/pdfText';

function makeFlatPage(flat: string): FlatPage {
  const compactToFlat: number[] = [];
  let compact = '';
  for (let i = 0; i < flat.length; i += 1) {
    if (/\s/.test(flat[i])) continue;
    compact += flat[i];
    compactToFlat.push(i);
  }
  return {
    flat,
    compact,
    compactToFlat,
    items: [
      { str: flat.slice(0, 12), transform: [1, 0, 0, 12, 20, 80], width: 90, height: 12 },
      { str: flat.slice(12), transform: [1, 0, 0, 12, 112, 80], width: 120, height: 12 },
    ],
    itemStarts: [0, 12],
    viewport1x: { width: 300, height: 120 },
  };
}

test('PDF search text folds typography and strips markdown noise', () => {
  assert.equal(foldPdfText('“Result”—‘ok’'), '"Result"-\'ok\'');
  assert.equal(
    cleanPdfSearchText('## **Figure 1:** [Training loss](#x) `curve`'),
    'Figure 1: Training loss curve',
  );
});

test('PDF reading position selects the final page at the scroll limit', () => {
  const pages = [
    { page: 1, top: -162, bottom: 300 },
    { page: 2, top: 314, bottom: 776 },
  ];
  assert.equal(currentPdfPageForViewport({
    scrollTop: 293.5,
    scrollHeight: 1040,
    clientHeight: 746,
    markerY: 204,
    pages,
  }), 2);
  assert.equal(currentPdfPageForViewport({
    scrollTop: 0,
    scrollHeight: 1040,
    clientHeight: 746,
    markerY: 204,
    pages: [
      { page: 1, top: 58, bottom: 520 },
      { page: 2, top: 534, bottom: 996 },
    ],
  }), 1);
});

test('PDF chunk matching survives whitespace differences from extraction', () => {
  const page = makeFlatPage('Figure 1: Traininglosscurve improves after epoch two');
  const match = findPdfChunkMatch(page, '**Figure 1:** Training loss curve improves');

  assert.ok(match);
  assert.equal(match.idx, 0);
  assert.ok(match.score >= 800);
});

test('PDF highlight rects clamp to page bounds and page hints clamp to document bounds', () => {
  const page = makeFlatPage('Figure 1: Training loss curve improves');
  const match = findPdfChunkMatch(page, 'Figure 1: Training loss');
  assert.ok(match);

  const rects = highlightRectsForMatch(page, match.idx, match.length);
  assert.equal(rects.length, 1);
  assert.ok(rects[0].x >= 0 && rects[0].x <= 1);
  assert.ok(rects[0].y >= 0 && rects[0].y <= 1);
  assert.ok(rects[0].width > 0 && rects[0].width <= 1);
  assert.ok(rects[0].height > 0 && rects[0].height <= 1);
  assert.equal(exactPageForHighlight({ pdfPage: 99 }, 12), 12);
  assert.equal(exactPageForHighlight({ pdfPage: 0 }, 12), null);
});
