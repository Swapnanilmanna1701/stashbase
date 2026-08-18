/** Sidebar session-history seams: the merged two-agent listing behind the
 * scope headers' History menus, the resume consume rule, and the
 * reuse/create tab decision the sidebar resume path shares with New Chat
 * (`newChatPlan`). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { newChatPlan } from '@/store/lib/chatTabPlan.ts';
import {
  historyRequestParams,
  mergeAgentSessions,
  rowResumeFolder,
  rowScopeParams,
  shouldConsumePendingResume,
} from '@/features/agent-panel/lib/sessionHistory.ts';

const session = (id: string, lastModified: number) => ({ id, title: `Chat ${id}`, lastModified });

test('merged listing interleaves both agents newest first, each row tagged with its agent', () => {
  const merged = mergeAgentSessions([
    { agent: 'claude', sessions: [session('c2', 400), session('c1', 100)] },
    { agent: 'codex', sessions: [session('x2', 300), session('x1', 200)] },
  ]);
  assert.deepEqual(merged.failed, []);
  assert.deepEqual(
    merged.rows.map((row) => `${row.agent}:${row.id}`),
    ['claude:c2', 'codex:x2', 'codex:x1', 'claude:c1'],
  );
});

test('one agent failing keeps the other listing and reports only the failure', () => {
  const merged = mergeAgentSessions([
    { agent: 'claude', sessions: [session('c1', 100)] },
    { agent: 'codex', sessions: null },
  ]);
  assert.deepEqual(merged.failed, ['codex']);
  assert.deepEqual(merged.rows.map((row) => row.id), ['c1']);
});

test('every agent failing yields no rows and lists all failures', () => {
  const merged = mergeAgentSessions([
    { agent: 'claude', sessions: null },
    { agent: 'codex', sessions: null },
  ]);
  assert.deepEqual(merged.failed, ['claude', 'codex']);
  assert.deepEqual(merged.rows, []);
});

test('consume rule: only the ACTIVE, still-blank tab running the request agent takes a resume', () => {
  const base = { active: true, tabAgent: 'claude', requestAgent: 'claude', blank: true };
  assert.equal(shouldConsumePendingResume(base), true);
  // Inactive tabs wait — the sidebar activated the target tab.
  assert.equal(shouldConsumePendingResume({ ...base, active: false }), false);
  // Another agent's tab never takes it.
  assert.equal(shouldConsumePendingResume({ ...base, tabAgent: 'codex' }), false);
  // A non-blank tab is user work and is never hijacked.
  assert.equal(shouldConsumePendingResume({ ...base, blank: false }), false);
});

test('sidebar resume shares the New Chat tab plan: reuse the one blank tab, else create', () => {
  // The blank tab is reused even for the other agent — switched in place.
  assert.deepEqual(
    newChatPlan([{ id: 't1', agent: 'codex', blank: true }], 'claude'),
    { kind: 'reuse', id: 't1', switchAgent: true },
  );
  // A matching blank tab needs no switch.
  assert.deepEqual(
    newChatPlan([{ id: 't1', agent: 'claude', blank: true }], 'claude'),
    { kind: 'reuse', id: 't1', switchAgent: false },
  );
  // Only non-blank tabs → a fresh tab for the session's agent.
  assert.deepEqual(
    newChatPlan([{ id: 't1', agent: 'claude', blank: false }], 'claude'),
    { kind: 'new' },
  );
});

test('the all-scope listing resolves each ROW to its own scope for actions and resume', () => {
  const all = { kind: 'all' } as const;
  const folderRow = { id: 's1', title: 't', lastModified: 1, folder: '/work/alpha' };
  const libraryRow = { id: 's2', title: 't', lastModified: 2 };

  // Listing params: 'all' is a list-only mode; concrete scopes keep their
  // folder/library params.
  assert.deepEqual(historyRequestParams(all), { scope: 'all' });
  assert.deepEqual(historyRequestParams({ kind: 'library' }), { scope: 'library' });
  assert.deepEqual(historyRequestParams({ kind: 'folder', path: '/work/alpha' }), { folder: '/work/alpha' });

  // Row actions (rename/delete) bind the row's own scope under 'all', and
  // the menu's scope otherwise.
  assert.deepEqual(rowScopeParams(all, folderRow), { folder: '/work/alpha' });
  assert.deepEqual(rowScopeParams(all, libraryRow), { scope: 'library' });
  assert.deepEqual(rowScopeParams({ kind: 'library' }, folderRow), { scope: 'library' });

  // Resume binds the row's home folder (null = library scope).
  assert.equal(rowResumeFolder(all, folderRow), '/work/alpha');
  assert.equal(rowResumeFolder(all, libraryRow), null);
  assert.equal(rowResumeFolder({ kind: 'folder', path: '/work/beta' }, folderRow), '/work/beta');
  assert.equal(rowResumeFolder({ kind: 'library' }, folderRow), null);
});
