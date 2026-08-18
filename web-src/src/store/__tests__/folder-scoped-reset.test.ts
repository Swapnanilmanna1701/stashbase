import assert from 'node:assert/strict';
import test from 'node:test';
import {
  folderScopedPreparationResetActions,
  folderScopedResetActions,
} from '@/store/lib/folderScopedReset';
import { recoverLostFolderContext } from '@/store/hooks/useSearchActions';
import { reducer } from '@/store/state/stateReducer';
import { initialState, type Action, type State } from '@/store/state/state';

function stateWithChatTabs(): State {
  return {
    ...initialState,
    chat: {
      ...initialState.chat,
      chatOpen: true,
      chatTabs: [
        { id: 'tab-claude', agent: 'claude', title: 'Research notes' },
        { id: 'tab-codex', agent: 'codex', title: 'New Chat' },
      ],
      activeChatTabId: 'tab-claude',
      chatTabRecencyByAgent: { claude: ['tab-claude'], codex: ['tab-codex'] },
    },
  };
}

function applyAll(state: State, actions: ReturnType<typeof folderScopedResetActions>): State {
  return actions.reduce((current, action) => reducer(current, action), state);
}

test('chat tabs and their sessions survive a window folder switch', () => {
  const plan = folderScopedResetActions('switch');
  assert.equal(plan.some((action) => action.type === 'CHAT_TABS_RESET'), false);
  // Document tabs still reset on a switch — only chat state survives.
  assert.equal(plan.some((action) => action.type === 'TABS_RESET'), true);

  const after = applyAll(stateWithChatTabs(), plan);
  assert.deepEqual(after.chat.chatTabs.map((tab) => tab.id), ['tab-claude', 'tab-codex']);
  assert.equal(after.chat.activeChatTabId, 'tab-claude');
  assert.equal(after.chat.chatOpen, true);
});

test('losing the window folder context still resets chat tabs', () => {
  const plan = folderScopedResetActions('folder-lost');
  assert.equal(plan.some((action) => action.type === 'CHAT_TABS_RESET'), true);

  const after = applyAll(stateWithChatTabs(), plan);
  assert.deepEqual(after.chat.chatTabs, []);
  assert.equal(after.chat.activeChatTabId, null);
  assert.equal(after.chat.chatOpen, false);
});

test('both transitions clear the same folder-scoped preparation state', () => {
  const switchTypes = folderScopedResetActions('switch').map((action) => action.type);
  const lostTypes = folderScopedResetActions('folder-lost').map((action) => action.type);
  assert.deepEqual(
    lostTypes.filter((type) => type !== 'CHAT_TABS_RESET'),
    switchTypes,
  );
});

/** The workspace half of a folder-context reset. Both sites dispatch these
 *  four, but at different points in their own ladders (see
 *  `folderScopedReset.ts`), so they are excluded when comparing the SHARED
 *  preparation-indicator set. */
const WORKSPACE_RESET_TYPES = new Set([
  'TABS_RESET',
  'CHAT_TABS_RESET',
  'ACTIVE_FOLDER',
  'FILE_ORDER_LOADED',
]);

/** Drive the 412 recovery ladder with no folder bound anywhere, so the
 *  rebind attempt and the conditional workspace reset are both skipped and
 *  only the shared preparation block runs. */
async function recoveryDispatchesWithNoFolder(): Promise<Action[]> {
  const dispatched: Action[] = [];
  const outcome = await recoverLostFolderContext({
    folderPathAtStart: '',
    openGenAtStart: 0,
    refs: {
      stateRef: { current: initialState },
      folderContextPath: { current: '' },
      lastTreeVersion: { current: 7 },
      syncGeneration: { current: 0 },
      openGeneration: { current: 0 },
    },
    dispatch: (action) => { dispatched.push(action); },
    loadFilesFromServer: async () => null,
    schedulePoll: () => {},
  });
  assert.equal(outcome, 'reset');
  return dispatched;
}

test('the 412 recovery ladder clears exactly the shared folder-scoped preparation set', async () => {
  // Nothing but a shared builder keeps these two ladders in step. Adding a
  // folder-scoped indicator field to `State` and clearing it inline at one
  // site — the failure mode that leaves a stale banner alive through a 412
  // recovery — has to fail here.
  const shared = folderScopedPreparationResetActions().map((action) => action.type);
  assert.ok(shared.length > 0);

  const dispatched = await recoveryDispatchesWithNoFolder();
  assert.deepEqual(dispatched.map((action) => action.type), shared);

  assert.deepEqual(
    folderScopedResetActions('folder-lost')
      .map((action) => action.type)
      .filter((type) => !WORKSPACE_RESET_TYPES.has(type)),
    shared,
  );
});

test('the shared preparation reset returns every folder-scoped indicator to its initial value', () => {
  const dirty: State = {
    ...initialState,
    workspace: {
      ...initialState.workspace,
      pendingSemanticNames: { 'note.md': true },
      pendingConversions: ['paper.pdf'],
      blockedConversions: ['scan.png'],
      conversionProgress: { 'paper.pdf': { phase: 'queued', lane: 'heavy', tasksAhead: 1 } },
      conversionRevision: 4,
      conversionVersions: { 'paper.pdf': 2 },
      indexWarning: { message: 'embedding failed', at: '2026-01-01T00:00:00.000Z' },
      preparationFailures: [{ path: 'paper.pdf', attempts: 2, lastError: 'boom', status: 'failed' }],
      syncRunning: true,
    },
  };
  const cleared = folderScopedPreparationResetActions()
    .reduce((current, action) => reducer(current, action), dirty);

  for (const field of [
    'pendingSemanticNames',
    'pendingConversions',
    'blockedConversions',
    'conversionProgress',
    'conversionRevision',
    'conversionVersions',
    'indexWarning',
    'preparationFailures',
    'syncRunning',
  ] as const) {
    assert.deepEqual(cleared.workspace[field], initialState.workspace[field], `${field} survived the reset`);
  }
});
