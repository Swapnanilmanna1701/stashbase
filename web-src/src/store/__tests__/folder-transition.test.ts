import assert from 'node:assert/strict';
import test from 'node:test';
import { createFolderMutationQueue } from '@/store/lib/folderTransition';

test('folder context mutations stay ordered when Home is followed by Open', async () => {
  const queue = createFolderMutationQueue();
  const calls: string[] = [];
  let releaseClose!: () => void;
  const closeGate = new Promise<void>((resolve) => { releaseClose = resolve; });

  const close = queue.run(async () => {
    calls.push('close:start');
    await closeGate;
    calls.push('close:end');
  });
  const open = queue.run(async () => {
    calls.push('open');
  });

  await Promise.resolve();
  assert.deepEqual(calls, ['close:start']);
  releaseClose();
  await Promise.all([close, open]);
  assert.deepEqual(calls, ['close:start', 'close:end', 'open']);
});
