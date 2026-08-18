import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commandDefinitions,
  rankCommandPalette,
  routeQuickAccess,
} from '@/features/search/lib/commandPalette';

test('Quick Access routes explicit command input without mixing it with files', () => {
  assert.deepEqual(routeQuickAccess('>new note'), { provider: 'commands', query: 'new note' });
  assert.deepEqual(routeQuickAccess('notes/plan'), { provider: 'files', query: 'notes/plan' });
  assert.deepEqual(routeQuickAccess('?'), { provider: 'help', query: '' });
});

test('Command Palette filters unavailable commands and promotes session recency', () => {
  const available = commandDefinitions.filter((command) => command.available({
    hasFolder: true,
    hasActiveTab: true,
    activeFileIsMarkdown: true,
  }));
  const ranked = rankCommandPalette(available, '', ['agent.show-codex']);

  assert.equal(ranked[0]?.id, 'agent.show-codex');
  assert.ok(ranked.some((command) => command.id === 'document.new-note'));
  assert.ok(ranked.some((command) => command.id === 'document.find'));
  assert.ok(!commandDefinitions.some((command) => command.id === 'document.new-note' && command.available({
    hasFolder: false,
    hasActiveTab: false,
    activeFileIsMarkdown: false,
  })));
});

test('Command Palette matches labels, categories, and stable identities', () => {
  const commands = commandDefinitions.filter((command) => command.available({
    hasFolder: true,
    hasActiveTab: false,
    activeFileIsMarkdown: false,
  }));

  assert.deepEqual(rankCommandPalette(commands, 'settings', []).map((command) => command.id), ['settings.open']);
  assert.deepEqual(rankCommandPalette(commands, 'agent.show-codex', []).map((command) => command.id), ['agent.show-codex']);
});
