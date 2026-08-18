import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAppearance } from '@/features/settings/lib/appearance';

test('appearance preferences become the renderer presentation state', () => {
  const originalDocument = globalThis.document;
  const root = { dataset: {} as DOMStringMap };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: root },
  });
  try {
    applyAppearance({ theme: 'dark', uiScale: 'large', readingTextSize: 'small' });
    assert.deepEqual(root.dataset, {
      theme: 'dark',
      uiScale: 'large',
      readingTextSize: 'small',
    });
  } finally {
    if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  }
});
