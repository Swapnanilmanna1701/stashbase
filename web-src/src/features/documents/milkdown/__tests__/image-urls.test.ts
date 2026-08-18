import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLocalImageUrl } from '@/features/documents/milkdown/imageUrls.ts';

test('relative uploaded images resolve below the owning note asset directory', () => {
  assert.equal(
    resolveLocalImageUrl('photo%20one.png', '/asset/__window/window-1/notes/', 'http://localhost:8090'),
    'http://localhost:8090/asset/__window/window-1/notes/photo%20one.png',
  );
});

test('remote image sources remain inert', () => {
  assert.equal(resolveLocalImageUrl('https://example.com/photo.png', '/asset/__window/window-1/notes/', 'http://localhost:8090'), '');
  assert.equal(resolveLocalImageUrl('//example.com/photo.png', '/asset/__window/window-1/notes/', 'http://localhost:8090'), '');
  assert.equal(resolveLocalImageUrl(' //example.com/photo.png', '/asset/__window/window-1/notes/', 'http://localhost:8090'), '');
});
