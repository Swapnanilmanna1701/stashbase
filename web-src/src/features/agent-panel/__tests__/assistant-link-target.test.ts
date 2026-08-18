import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAssistantLink } from '@/features/agent-panel/lib/assistantLinkTarget.ts';

const members = ['/u/lib/tennis', '/u/lib/work'];

test('exact member folder target opens that folder', () => {
  assert.deepEqual(
    resolveAssistantLink('/u/lib/tennis', { scopeFolder: null, windowFolder: null, members }),
    { kind: 'open-folder', path: '/u/lib/tennis' },
  );
  // Trailing slash normalizes.
  assert.deepEqual(
    resolveAssistantLink('/u/lib/work/', { scopeFolder: null, windowFolder: null, members }),
    { kind: 'open-folder', path: '/u/lib/work' },
  );
});

test('file under a member selects it in that folder', () => {
  assert.deepEqual(
    resolveAssistantLink('/u/lib/tennis/notes/serve.md', { scopeFolder: null, windowFolder: '/u/lib/work', members }),
    { kind: 'select-file', folder: '/u/lib/tennis', rel: 'notes/serve.md' },
  );
});

test('relative link resolves against the session folder, not the window', () => {
  assert.deepEqual(
    resolveAssistantLink('notes/serve.md', { scopeFolder: '/u/lib/tennis', windowFolder: '/u/lib/work', members }),
    { kind: 'select-file', folder: '/u/lib/tennis', rel: 'notes/serve.md' },
  );
});

test('extensionless target outside members is a project-open attempt', () => {
  // The "agent created a new project" case: register-and-open.
  assert.deepEqual(
    resolveAssistantLink('/u/StashBase/test2', { scopeFolder: null, windowFolder: null, members }),
    { kind: 'open-folder', path: '/u/StashBase/test2' },
  );
});

test('nested extensionless path inside a member opens as a folder', () => {
  assert.deepEqual(
    resolveAssistantLink('/u/lib/work/projects/alpha', { scopeFolder: null, windowFolder: null, members }),
    { kind: 'open-folder', path: '/u/lib/work/projects/alpha' },
  );
});

test('files outside every member and relative links without a base resolve to nothing', () => {
  assert.equal(
    resolveAssistantLink('/etc/passwd.txt', { scopeFolder: null, windowFolder: null, members }),
    null,
  );
  assert.equal(
    resolveAssistantLink('notes/serve.md', { scopeFolder: null, windowFolder: null, members }),
    null,
  );
});
