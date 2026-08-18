import assert from 'node:assert/strict';
import test from 'node:test';
import { rankMentionSuggestions } from '@/features/agent-panel/lib/mentionRanking';

const files = [
  { name: 'docs/archive/agent-panel.md', format: 'md' as const, heading: '', snippet: '' },
  { name: 'docs/agent.md', format: 'md' as const, heading: '', snippet: '' },
  { name: 'agent-notes.md', format: 'md' as const, heading: '', snippet: '' },
  { name: 'notes/agent.md', format: 'md' as const, heading: '', snippet: '' },
  { name: 'readme.md', format: 'md' as const, heading: '', snippet: '' },
];

const folders = [
  { path: 'docs' },
  { path: 'docs/archive' },
  { path: 'social/x-posts' },
];

test('mention ranking prioritizes exact filename and prefix matches', () => {
  assert.deepEqual(
    rankMentionSuggestions(files, folders, 'agent').map((suggestion) => suggestion.path),
    ['docs/agent.md', 'notes/agent.md', 'agent-notes.md', 'docs/archive/agent-panel.md'],
  );
});

test('mention ranking is stable for an empty query and includes folders within its result cap', () => {
  assert.deepEqual(
    rankMentionSuggestions(files, folders, '', 2).map((suggestion) => suggestion.path),
    ['docs', 'docs/archive'],
  );
});

test('mention ranking includes matching folders with their path context', () => {
  assert.deepEqual(
    rankMentionSuggestions(files, folders, 'archive').map((suggestion) => [suggestion.path, suggestion.kind]),
    [['docs/archive', 'folder'], ['docs/archive/agent-panel.md', 'file']],
  );
});

test('mention ranking ignores punctuation in workspace item names', () => {
  assert.deepEqual(
    rankMentionSuggestions(files, folders, 'xpos').map((suggestion) => suggestion.path),
    ['social/x-posts'],
  );
});

test('mention ranking keeps basename matches ahead of path-only matches', () => {
  const ranked = rankMentionSuggestions(
    [
      { name: 'agent-guide.md', format: 'md' as const, heading: '', snippet: '' },
      { name: 'docs/my-agent.md', format: 'md' as const, heading: '', snippet: '' },
      { name: 'agent-notes/readme.md', format: 'md' as const, heading: '', snippet: '' },
      { name: 'docs/agent/readme.md', format: 'md' as const, heading: '', snippet: '' },
    ],
    [{ path: 'agent' }],
    'agent',
  );

  assert.deepEqual(
    ranked.map((suggestion) => suggestion.path),
    [
      'agent',
      'agent-guide.md',
      'docs/my-agent.md',
      'agent-notes/readme.md',
      'docs/agent/readme.md',
    ],
  );
});

test('mention ranking normalizes case, separators, spaces, accents, and Unicode text consistently', () => {
  const internationalFiles = [
    { name: 'Docs/Résumé 2026/案例-总结.md', format: 'md' as const, heading: '', snippet: '' },
  ];
  const internationalFolders = [{ path: '客户/Über Café' }];

  assert.deepEqual(
    rankMentionSuggestions(internationalFiles, internationalFolders, 'resume/2026案例总结'),
    [{ path: 'Docs/Résumé 2026/案例-总结.md', kind: 'file' }],
  );
  assert.deepEqual(
    rankMentionSuggestions(internationalFiles, internationalFolders, 'ÜBER-CAFÉ'),
    [{ path: '客户/Über Café', kind: 'folder' }],
  );
});
