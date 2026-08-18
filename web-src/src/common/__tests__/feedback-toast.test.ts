import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFeedbackToastController,
  feedbackToastPolicy,
} from '@/common/components/ui/toast';
import {
  bindFeedbackToastRuntime,
  feedbackToasts,
} from '@/common/lib/feedbackToasts';

test('feedback toasts deduplicate in place and refresh their timeout', () => {
  const added: Array<Record<string, unknown>> = [];
  const updated: Array<{ id: string; options: Record<string, unknown> }> = [];
  const closed: Array<string | undefined> = [];
  const controller = createFeedbackToastController({
    add(options) {
      added.push(options as Record<string, unknown>);
      return 'toast-1';
    },
    update(id, options) {
      updated.push({ id, options: options as Record<string, unknown> });
    },
    close(id) {
      closed.push(id);
    },
  });

  assert.equal(controller.show('Saved', { level: 'success' }), 'toast-1');
  assert.equal(controller.show('Saved', { level: 'success' }), 'toast-1');
  assert.equal(added.length, 1);
  assert.equal(added[0].timeout, 3000);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, 'toast-1');
  assert.equal((updated[0].options.data as { count: number }).count, 2);

  controller.dismiss('toast-1');
  controller.clear();
  assert.deepEqual(closed, ['toast-1', undefined]);
});

test('errors are persistent and announced with high priority', () => {
  const added: Array<Record<string, unknown>> = [];
  const controller = createFeedbackToastController({
    add(next) {
      added.push(next as Record<string, unknown>);
      return 'error-1';
    },
    update() {},
    close() {},
  });

  controller.show('Could not save', { level: 'error' });
  assert.equal(added[0].timeout, 0);
  assert.equal(added[0].priority, 'high');
});

test('every feedback level has one shared timeout, priority, and accent policy', () => {
  assert.deepEqual(feedbackToastPolicy, {
    info: {
      timeout: 3000,
      priority: 'low',
      accentClass: 'border-l-status-info',
    },
    success: {
      timeout: 3000,
      priority: 'low',
      accentClass: 'border-l-status-success',
    },
    warning: {
      timeout: 5000,
      priority: 'high',
      accentClass: 'border-l-status-warning',
    },
    error: {
      timeout: 0,
      priority: 'high',
      accentClass: 'border-l-status-danger',
    },
  });
});

test('explicit toast lifetimes override the level default, including persistence', () => {
  const added: Array<Record<string, unknown>> = [];
  const controller = createFeedbackToastController({
    add(next) {
      added.push(next as Record<string, unknown>);
      return `toast-${added.length}`;
    },
    update() {},
    close() {},
  });

  controller.show('Short warning', { level: 'warning', ttl: 1200 });
  controller.show('Persistent info', { level: 'info', ttl: null });
  assert.equal(added[0].timeout, 1200);
  assert.equal(added[1].timeout, 0);
});

test('the lightweight toast facade replays feedback raised before Base UI loads', () => {
  const pendingId = feedbackToasts.show('Queued before the viewport');
  const replayed: Array<{ message: string; requestedId?: string }> = [];
  const unbind = bindFeedbackToastRuntime({
    show(message, _options, requestedId) {
      replayed.push({ message, requestedId });
      return requestedId ?? 'generated';
    },
  });

  assert.deepEqual(replayed, [{
    message: 'Queued before the viewport',
    requestedId: pendingId,
  }]);
  unbind();
});
