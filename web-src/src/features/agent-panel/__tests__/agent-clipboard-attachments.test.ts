import assert from 'node:assert/strict';
import test from 'node:test';
import { clipboardImageFiles, handleComposerPaste } from '@/features/agent-panel/lib/clipboardAttachments';

function image(type: string, name = ''): File {
  return new File(['image-bytes'], name, { type });
}

test('clipboard image files receive generated, type-appropriate names', () => {
  const files = clipboardImageFiles({
    files: [image('image/png'), image('image/jpeg', 'photo.jpg')],
  } as unknown as DataTransfer, new Date('2026-07-31T12:34:56.789Z'));

  assert.deepEqual(files.map((file) => file.name), [
    'clipboard-2026-07-31T12-34-56-789Z.png',
    'photo.jpg',
  ]);
  assert.deepEqual(files.map((file) => file.type), ['image/png', 'image/jpeg']);
});

test('clipboard extraction ignores text and non-image files', () => {
  const files = clipboardImageFiles({
    files: [
      new File(['plain text'], 'note.txt', { type: 'text/plain' }),
      image('image/webp'),
    ],
  } as unknown as DataTransfer, new Date('2026-07-31T12:34:56.789Z'));

  assert.deepEqual(files.map((file) => file.name), ['clipboard-2026-07-31T12-34-56-789Z.webp']);
});

test('clipboard extraction accepts an image DataTransfer item when files is empty', () => {
  const pastedImage = image('image/png');
  const files = clipboardImageFiles({
    files: [],
    items: [{ kind: 'file', type: 'image/png', getAsFile: () => pastedImage }],
  } as unknown as DataTransfer, new Date('2026-07-31T12:34:56.789Z'));

  assert.deepEqual(files.map((file) => file.name), ['clipboard-2026-07-31T12-34-56-789Z.png']);
});

test('composer paste attaches clipboard images without cancelling mixed text paste', () => {
  let attached: File[] = [];
  const allowNativePaste = handleComposerPaste({
    files: [image('image/png')],
    items: [],
    getData: (type: string) => type === 'text/plain' ? 'keep this text' : '',
  } as unknown as DataTransfer, false, (files) => { attached = files; }, new Date('2026-07-31T12:34:56.789Z'));

  assert.equal(allowNativePaste, false);
  assert.equal(attached.length, 1);
  assert.equal(attached[0].name, 'clipboard-2026-07-31T12-34-56-789Z.png');
});

test('composer text-only or disabled paste does not create an attachment', () => {
  let calls = 0;
  const textOnly = { files: [], items: [], getData: () => 'keep this text' } as unknown as DataTransfer;
  const imageOnly = { files: [image('image/png')], items: [] } as unknown as DataTransfer;

  assert.equal(handleComposerPaste(textOnly, false, () => { calls += 1; }), false);
  assert.equal(handleComposerPaste(imageOnly, true, () => { calls += 1; }), false);
  assert.equal(calls, 0);
});
