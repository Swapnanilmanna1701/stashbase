import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorStatus } from '@milkdown/kit/core';
import { planIncomingMarkdownSync, startCrepeCreation } from '@/features/documents/milkdown/crepeLifecycle.ts';

test('image paths stay relative and portable in Markdown', async () => {
  const { relativeAssetPath, portableImageMarkdownPath } = await import('@/features/documents/milkdown/paths.ts');
  assert.equal(relativeAssetPath('docs/roadmap.md', 'docs/photo.png'), 'photo.png');
  assert.equal(relativeAssetPath('roadmap.md', 'photo.png'), 'photo.png');
  assert.equal(relativeAssetPath('docs/roadmap.md', 'assets/photo.png'), 'assets/photo.png');
  assert.equal(portableImageMarkdownPath('photo one.png'), 'photo%20one.png');
  assert.equal(portableImageMarkdownPath('../assets/photo.png'), '../assets/photo.png');
});

test('failed Crepe creation can retry and unmount without destroying the rejected editor', async () => {
  const destroyed: string[] = [];
  const events: string[] = [];
  const failed = {
    editor: { status: EditorStatus.OnCreate },
    create: async () => { throw new Error('create rejected'); },
    destroy: async () => { destroyed.push('failed'); },
  };
  const retry = {
    editor: { status: EditorStatus.OnCreate },
    create: async () => { retry.editor.status = EditorStatus.Created; },
    destroy: async () => { destroyed.push('retry'); },
  };

  const disposeFailed = startCrepeCreation(failed, {
    ready: () => events.push('failed ready'),
    failed: () => events.push('failed'),
  });
  await Promise.resolve();
  await Promise.resolve();
  disposeFailed();

  const disposeRetry = startCrepeCreation(retry, {
    ready: () => events.push('retry ready'),
    failed: () => events.push('retry failed'),
  });
  await Promise.resolve();
  disposeRetry();

  assert.deepEqual(events, ['failed', 'retry ready']);
  assert.deepEqual(destroyed, ['retry']);
});

test('content arriving during creation replaces the initial source before the editor is shown', () => {
  assert.deepEqual(planIncomingMarkdownSync({
    currentBody: 'old body',
    dirty: false,
    incomingBody: 'fresh body',
    incomingFrontmatter: '---\ntitle: fresh\n---\n',
    incomingSource: '---\ntitle: fresh\n---\nfresh body',
    observedSource: 'old body',
  }), {
    observedSource: '---\ntitle: fresh\n---\nfresh body',
    frontmatter: '---\ntitle: fresh\n---\n',
    replacementBody: 'fresh body',
  });
});

test('dirty Markdown ignores retained source until the live buffer becomes clean', () => {
  assert.equal(planIncomingMarkdownSync({
    currentBody: 'new live typing',
    dirty: true,
    incomingBody: 'older acknowledgement',
    incomingFrontmatter: '',
    incomingSource: 'older acknowledgement',
    observedSource: 'initial source',
  }), null);
});
