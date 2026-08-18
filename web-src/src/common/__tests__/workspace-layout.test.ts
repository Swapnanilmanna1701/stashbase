import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveWorkspaceLayout,
  shouldAutoCollapseChat,
} from '@/common/lib/workspaceLayout';

test('Chat owns the workspace until a document is opened', () => {
  assert.equal(resolveWorkspaceLayout({
    chatOpen: true,
    hasDocument: false,
    compact: false,
  }), 'chat-primary');
  assert.equal(resolveWorkspaceLayout({
    chatOpen: true,
    hasDocument: true,
    compact: false,
  }), 'split');
  assert.equal(resolveWorkspaceLayout({
    chatOpen: false,
    hasDocument: false,
    compact: false,
  }), 'document');
});

test('compact workspaces show one primary surface at a time', () => {
  assert.equal(resolveWorkspaceLayout({
    chatOpen: true,
    hasDocument: true,
    compact: true,
  }), 'chat-primary');
  assert.equal(resolveWorkspaceLayout({
    chatOpen: false,
    hasDocument: true,
    compact: true,
  }), 'document');
});

test('compact layout collapses Chat only for a document or viewport transition', () => {
  assert.equal(shouldAutoCollapseChat({
    chatOpen: true,
    hasDocument: true,
    compact: true,
    previousHasDocument: false,
    previousCompact: true,
  }), true);
  assert.equal(shouldAutoCollapseChat({
    chatOpen: true,
    hasDocument: true,
    compact: true,
    previousHasDocument: true,
    previousCompact: false,
  }), true);
  assert.equal(shouldAutoCollapseChat({
    chatOpen: true,
    hasDocument: true,
    compact: true,
    previousHasDocument: true,
    previousCompact: true,
  }), false);
});
