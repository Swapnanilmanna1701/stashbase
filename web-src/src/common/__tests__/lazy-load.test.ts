/**
 * The generic lazy-load mechanics `common/` owns: chunk-load retry, boundary
 * reset on resource identity, and the two `Managed…` wrappers. A feature's own
 * use of a boundary is asserted in that feature — see
 * `@/features/agent-panel/__tests__/agent-chat-session-boundary.test.ts`.
 */
import assert from 'node:assert/strict';
import { createElement, Suspense, type ReactElement } from 'react';
import test from 'node:test';
import { LazyLoadBoundary, loadWithRetry, reloadForRecovery } from '@/common/components/ErrorBoundary';
import { LazyManaged, LazyManagedPicker } from '@/common/components/LazyManaged';

function StubComponent(props: Record<string, unknown>) {
  return createElement('span', null, JSON.stringify(props));
}

test('lazy module loading retries one transient failure', async () => {
  let attempts = 0;
  const loaded = await loadWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary chunk failure');
    return 'loaded';
  }, 1, 0);

  assert.equal(loaded, 'loaded');
  assert.equal(attempts, 2);
});

test('lazy module loading surfaces the final error after its retry budget', async () => {
  let attempts = 0;
  await assert.rejects(
    loadWithRetry(async () => {
      attempts += 1;
      throw new Error(`chunk failure ${attempts}`);
    }, 1, 0),
    /chunk failure 2/,
  );
  assert.equal(attempts, 2);
});

test('lazy load boundary clears a captured error when its resource identity changes', () => {
  const error = new Error('broken preview');
  const state = { error, resetKey: 'first.md:v1' };
  const props = {
    children: null,
    className: 'doc-loading',
    label: 'Markdown preview',
    resetKey: 'second.md:v1',
  };

  assert.deepEqual(LazyLoadBoundary.getDerivedStateFromProps(props, state), {
    error: null,
    resetKey: 'second.md:v1',
  });
  assert.equal(
    LazyLoadBoundary.getDerivedStateFromProps({ ...props, resetKey: state.resetKey }, state),
    null,
  );
});

test('Electron error recovery delegates reload to the main-process save barrier', async () => {
  let bridgeCalls = 0;
  let browserCalls = 0;
  const reloaded = await reloadForRecovery(
    { reloadWindow: async () => { bridgeCalls += 1; return true; } },
    () => { browserCalls += 1; },
  );

  assert.equal(reloaded, true);
  assert.equal(bridgeCalls, 1);
  assert.equal(browserCalls, 0);
});

test('browser error recovery retains its unload-aware fallback', async () => {
  let browserCalls = 0;
  const reloaded = await reloadForRecovery({}, () => { browserCalls += 1; });

  assert.equal(reloaded, true);
  assert.equal(browserCalls, 1);
});

test('LazyManaged wraps the managed component in Suspense with the given fallback and key', () => {
  const element = LazyManaged({
    as: StubComponent,
    fallback: 'loading…',
    componentProps: { a: 1 },
    componentKey: 'k1',
  }) as ReactElement<{ fallback: unknown; children: ReactElement<{ a: number }> }>;

  assert.equal(element.type, Suspense);
  assert.equal(element.props.fallback, 'loading…');
  const inner = element.props.children;
  assert.equal(inner.type, StubComponent);
  assert.deepEqual(inner.props, { a: 1 });
  assert.equal(inner.key, 'k1');
});

test('LazyManagedPicker keys the managed component to the request id and resets its error boundary with it', () => {
  const element = LazyManagedPicker({
    as: StubComponent,
    requestId: 3,
    label: 'Quick Open',
    loadingClass: 'quick-open-blocking',
    componentProps: { b: 2 },
  }) as ReactElement<{
    className: string;
    label: string;
    resetKey: string;
    // LazyLoadBoundary's child is the un-expanded <LazyManaged/> element —
    // only the top-level component body runs when called directly, so a
    // nested custom component stays as `{ type: LazyManaged, props }`.
    children: ReactElement<{
      as: unknown;
      fallback: ReactElement<{ className: string }>;
      componentProps: { b: number };
      componentKey: string;
    }>;
  }>;

  assert.equal(element.type, LazyLoadBoundary);
  assert.equal(element.props.className, 'quick-open-blocking');
  assert.equal(element.props.label, 'Quick Open');
  assert.equal(element.props.resetKey, '3');

  const managed = element.props.children;
  assert.equal(managed.type, LazyManaged);
  assert.equal(managed.props.as, StubComponent);
  assert.equal(managed.props.componentKey, '3');
  assert.deepEqual(managed.props.componentProps, { b: 2 });
  assert.equal(managed.props.fallback.props.className, 'quick-open-blocking');
});
