/**
 * Guard for the index poll's dispatch budget.
 *
 * `pendingSemanticNames` and `semanticIndexing` both live in the workspace
 * slice, and the poll re-reads them every POLL_PENDING_MS while indexing.
 * They were dispatched unconditionally — sitting between four correctly
 * guarded dispatches — so every tick produced a new state object and
 * re-rendered all ~37 `useWorkspace()` consumers even when the server
 * reported nothing new. The poll rebuilds `pending` as a fresh `Set` each
 * time, so identity comparison alone would never have caught it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  equalNameSets,
  planSemanticPollDispatches,
  shallowEqualSemanticIndexing,
} from '@/store/lib/appContextHelpers';
import { toNameSet, type WorkspaceSlice } from '@/store/state/state';

function prevState(
  pending: string[],
  semanticIndexing: WorkspaceSlice['semanticIndexing'] = null,
): Pick<WorkspaceSlice, 'pendingSemanticNames' | 'semanticIndexing'> {
  return { pendingSemanticNames: toNameSet(pending), semanticIndexing };
}

test('an unchanged poll payload dispatches nothing', () => {
  const prev = prevState(['a.md', 'b.md'], { state: 'indexing', sourceCount: 2 });
  const actions = planSemanticPollDispatches(prev, {
    // A different Set instance with the same contents — exactly what the
    // poll builds on every tick.
    pending: new Set(['b.md', 'a.md']),
    semanticIndexing: { state: 'indexing', sourceCount: 2 },
  });
  assert.deepEqual(actions, []);
});

test('an empty payload against empty state dispatches nothing', () => {
  const actions = planSemanticPollDispatches(prevState([]), {
    pending: new Set<string>(),
    semanticIndexing: null,
  });
  assert.deepEqual(actions, []);
});

test('a changed pending set dispatches only the pending action', () => {
  const prev = prevState(['a.md'], { state: 'indexing' });
  const actions = planSemanticPollDispatches(prev, {
    pending: new Set(['a.md', 'c.md']),
    semanticIndexing: { state: 'indexing' },
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'PENDING_SEMANTIC_NAMES');
});

test('a removed name counts as a change even though the size shrinks', () => {
  const actions = planSemanticPollDispatches(prevState(['a.md', 'b.md']), {
    pending: new Set(['a.md']),
    semanticIndexing: null,
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'PENDING_SEMANTIC_NAMES');
});

test('a same-size but different-membership set counts as a change', () => {
  const actions = planSemanticPollDispatches(prevState(['a.md', 'b.md']), {
    pending: new Set(['a.md', 'c.md']),
    semanticIndexing: null,
  });
  assert.equal(actions.length, 1);
});

test('a changed indexing state dispatches only the indexing action', () => {
  const prev = prevState(['a.md'], { state: 'indexing', sourceCount: 1 });
  const actions = planSemanticPollDispatches(prev, {
    pending: new Set(['a.md']),
    semanticIndexing: { state: 'ready', sourceCount: 1 },
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'SEMANTIC_INDEXING_STATE');
});

test('a transition to or from null indexing state is a change', () => {
  assert.equal(
    planSemanticPollDispatches(prevState([], null), {
      pending: new Set<string>(),
      semanticIndexing: { state: 'indexing' },
    }).length,
    1,
  );
  assert.equal(
    planSemanticPollDispatches(prevState([], { state: 'indexing' }), {
      pending: new Set<string>(),
      semanticIndexing: null,
    }).length,
    1,
  );
});

test('the dispatched pending set is a copy, not the caller-owned instance', () => {
  const incoming = new Set(['a.md']);
  const [action] = planSemanticPollDispatches(prevState([]), {
    pending: incoming,
    semanticIndexing: null,
  });
  assert.equal(action.type, 'PENDING_SEMANTIC_NAMES');
  if (action.type !== 'PENDING_SEMANTIC_NAMES') return;
  assert.notEqual(action.names, incoming, 'state must not alias a set the poll keeps mutating');
  assert.deepEqual(Object.keys(action.names), ['a.md']);
});

test('both changing dispatches both, preserving the established order', () => {
  const actions = planSemanticPollDispatches(prevState(['a.md'], { state: 'indexing' }), {
    pending: new Set(['b.md']),
    semanticIndexing: { state: 'ready' },
  });
  assert.deepEqual(actions.map((a) => a.type), [
    'PENDING_SEMANTIC_NAMES',
    'SEMANTIC_INDEXING_STATE',
  ]);
});

test('equalNameSets compares membership, not identity', () => {
  assert.ok(equalNameSets(toNameSet(['a', 'b']), toNameSet(['b', 'a'])));
  assert.ok(!equalNameSets(toNameSet(['a']), toNameSet(['a', 'b'])));
  assert.ok(!equalNameSets(toNameSet(['a']), toNameSet(['b'])));
});

test('shallowEqualSemanticIndexing compares every reported field', () => {
  assert.ok(shallowEqualSemanticIndexing(null, null));
  assert.ok(!shallowEqualSemanticIndexing(null, { state: 'ready' }));
  assert.ok(shallowEqualSemanticIndexing({ state: 'ready' }, { state: 'ready' }));
  assert.ok(!shallowEqualSemanticIndexing(
    { state: 'indexing', sourceCount: 1 },
    { state: 'indexing', sourceCount: 2 },
  ));
  assert.ok(!shallowEqualSemanticIndexing(
    { state: 'indexing', estimatedBytes: 10 },
    { state: 'indexing', estimatedBytes: 20 },
  ));
});
