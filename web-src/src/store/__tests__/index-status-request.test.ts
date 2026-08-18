import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/common/api/apiTransport';
import { runIndexStatusRequest } from '@/store/lib/indexStatusRequest';
import {
  commitOpenedFolderNavigation,
  runFolderOpenTransition,
} from '@/store/hooks/useFolderActions';
import { initialState, type Action, type State } from '@/store/state/state';
import { reducer } from '@/store/state/stateReducer';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('implicit active-folder polling is skipped while no folder is open', async () => {
  let calls = 0;
  const outcome = await runIndexStatusRequest({
    activeFolderPath: '',
    activeFolderTransitionInProgress: false,
    openGenerationAtStart: 1,
    getCurrentFolderPath: () => '',
    getCurrentOpenGeneration: () => 1,
    request: async () => {
      calls += 1;
      throw new ApiError('no folder open', 412, 'NO_FOLDER');
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(outcome, { kind: 'skipped' });
});

test('an in-flight status response becomes stale when a newer folder transition starts', async () => {
  let currentFolderPath = '/old-library';
  let currentOpenGeneration = 4;
  const response = deferred<never>();
  const polling = runIndexStatusRequest({
    activeFolderPath: currentFolderPath,
    activeFolderTransitionInProgress: false,
    openGenerationAtStart: currentOpenGeneration,
    getCurrentFolderPath: () => currentFolderPath,
    getCurrentOpenGeneration: () => currentOpenGeneration,
    request: () => response.promise,
  });

  currentOpenGeneration += 1;
  response.reject(new ApiError('no folder open', 412, 'NO_FOLDER'));

  assert.deepEqual(await polling, { kind: 'stale' });
});

test('a current active-folder error remains available for server-restart recovery', async () => {
  const error = new ApiError('no folder open', 412, 'NO_FOLDER');
  const outcome = await runIndexStatusRequest({
    activeFolderPath: '/library',
    activeFolderTransitionInProgress: false,
    openGenerationAtStart: 7,
    getCurrentFolderPath: () => '/library',
    getCurrentOpenGeneration: () => 7,
    request: async () => { throw error; },
  });

  assert.deepEqual(outcome, {
    kind: 'error',
    error,
  });
});

test('a same-generation explicit request remains current while renderer state catches up', async () => {
  const outcome = await runIndexStatusRequest({
    activeFolderPath: '',
    activeFolderTransitionInProgress: false,
    explicitFolderPath: '/library',
    openGenerationAtStart: 7,
    getCurrentFolderPath: () => '',
    getCurrentOpenGeneration: () => 7,
    request: async (folderPath) => ({ folderPath }),
  });

  assert.deepEqual(outcome, {
    kind: 'success',
    status: { folderPath: '/library' },
  });
});

test('an explicit request for a non-active folder lands stale once another folder is committed', async () => {
  const outcome = await runIndexStatusRequest({
    activeFolderPath: '/library-a',
    activeFolderTransitionInProgress: false,
    explicitFolderPath: '/library-b',
    openGenerationAtStart: 7,
    getCurrentFolderPath: () => '/library-a',
    getCurrentOpenGeneration: () => 7,
    request: async (folderPath) => ({ folderPath }),
  });

  assert.deepEqual(outcome, { kind: 'stale' });
});

test('implicit polling is skipped while a different active folder is opening', async () => {
  let calls = 0;
  const outcome = await runIndexStatusRequest({
    activeFolderPath: '/old-library',
    activeFolderTransitionInProgress: true,
    openGenerationAtStart: 8,
    getCurrentFolderPath: () => '/old-library',
    getCurrentOpenGeneration: () => 8,
    request: async () => {
      calls += 1;
      throw new ApiError('no folder open', 412, 'NO_FOLDER');
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(outcome, { kind: 'skipped' });
});

test('a stale status 412 cannot cancel a successful folder-open navigation', async () => {
  let state: State = initialState;
  const folderContextPath = { current: '/old-library' };
  const openGeneration = { current: 10 };
  const openingFolderGeneration = { current: null as number | null };
  const statusResponse = deferred<never>();
  const openResponse = deferred<{
    current: { path: string; name: string };
    recent: [];
  }>();
  const navigationCommitted = deferred<void>();
  const afterNavigation = deferred<void>();
  const pendingNavigationActions: Action[] = [];
  const dispatch = (action: Action) => {
    pendingNavigationActions.push(action);
  };

  const polling = runIndexStatusRequest({
    activeFolderPath: folderContextPath.current,
    activeFolderTransitionInProgress: false,
    openGenerationAtStart: openGeneration.current,
    getCurrentFolderPath: () => state.workspace.folderPath,
    getCurrentOpenGeneration: () => openGeneration.current,
    request: () => statusResponse.promise,
  });
  const opening = runFolderOpenTransition({
    openGeneration,
    openingFolderGeneration,
    request: () => openResponse.promise,
    commitNavigation: (current) => {
      commitOpenedFolderNavigation(dispatch, folderContextPath, current);
      navigationCommitted.resolve();
    },
    afterNavigation: () => afterNavigation.promise,
  });

  assert.equal(openGeneration.current, 11);
  assert.equal(openingFolderGeneration.current, 11);

  openResponse.resolve({
    current: { path: '/new-library', name: 'new-library' },
    recent: [],
  });
  await navigationCommitted.promise;
  assert.equal(openingFolderGeneration.current, null);

  const currentPoll = await runIndexStatusRequest({
    activeFolderPath: folderContextPath.current,
    activeFolderTransitionInProgress: openingFolderGeneration.current != null,
    openGenerationAtStart: openGeneration.current,
    getCurrentFolderPath: () => state.workspace.folderPath,
    getCurrentOpenGeneration: () => openGeneration.current,
    request: async () => {
      throw new ApiError('renderer state has not committed yet', 412, 'NO_FOLDER');
    },
  });
  assert.deepEqual(currentPoll, { kind: 'stale' });
  assert.equal(openGeneration.current, 11);

  for (const action of pendingNavigationActions) {
    state = reducer(state, action);
  }
  const committedPoll = await runIndexStatusRequest({
    activeFolderPath: folderContextPath.current,
    activeFolderTransitionInProgress: openingFolderGeneration.current != null,
    openGenerationAtStart: openGeneration.current,
    getCurrentFolderPath: () => state.workspace.folderPath,
    getCurrentOpenGeneration: () => openGeneration.current,
    request: async (folderPath) => ({ folderPath }),
  });
  assert.deepEqual(committedPoll, {
    kind: 'success',
    status: { folderPath: '/new-library' },
  });

  statusResponse.reject(new ApiError('no folder open', 412, 'NO_FOLDER'));

  assert.deepEqual(await polling, { kind: 'stale' });
  assert.equal(openGeneration.current, 11);
  assert.equal(state.workspace.folderPath, '/new-library');
  assert.equal(state.workspace.folder, 'new-library');

  afterNavigation.resolve();
  await opening;
});
