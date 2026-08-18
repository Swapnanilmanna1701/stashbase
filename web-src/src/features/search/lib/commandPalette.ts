import { fuzzyScore } from './fuzzy';

export type QuickAccessProvider = 'files' | 'commands' | 'help';

export interface CommandContext {
  hasFolder: boolean;
  hasActiveTab: boolean;
  activeFileIsMarkdown: boolean;
}

export interface CommandDefinition {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  available: (context: CommandContext) => boolean;
}

export function routeQuickAccess(value: string): { provider: QuickAccessProvider; query: string } {
  const trimmed = value.trimStart();
  if (trimmed.startsWith('>')) return { provider: 'commands', query: trimmed.slice(1).trimStart() };
  if (trimmed.startsWith('?')) return { provider: 'help', query: trimmed.slice(1).trimStart() };
  return { provider: 'files', query: value };
}

export const commandDefinitions: readonly CommandDefinition[] = [
  { id: 'document.new-note', label: 'New Note', category: 'Document', shortcut: 'Cmd/Ctrl+N', available: ({ hasFolder }) => hasFolder },
  { id: 'document.save', label: 'Save', category: 'Document', shortcut: 'Cmd/Ctrl+S', available: ({ hasActiveTab }) => hasActiveTab },
  { id: 'document.close-editor', label: 'Close Editor', category: 'Document', shortcut: 'Cmd/Ctrl+W', available: ({ hasActiveTab }) => hasActiveTab },
  { id: 'document.toggle-editing', label: 'Toggle Editing Mode', category: 'Document', available: ({ activeFileIsMarkdown }) => activeFileIsMarkdown },
  { id: 'document.find', label: 'Find in Document', category: 'Document', shortcut: 'Cmd/Ctrl+F', available: ({ hasActiveTab }) => hasActiveTab },
  { id: 'search.open', label: 'Search Library', category: 'Search', shortcut: 'Cmd/Ctrl+Shift+F', available: () => true },
  { id: 'agent.show-claude', label: 'Show Claude Code', category: 'Agent Panel', available: ({ hasFolder }) => hasFolder },
  { id: 'agent.show-codex', label: 'Show Codex', category: 'Agent Panel', available: ({ hasFolder }) => hasFolder },
  { id: 'settings.open', label: 'Open Settings', category: 'Settings', available: () => true },
];

/** Ranks only supplied, already-available commands. Recency is deliberately
 * owned by the picker component so it never becomes persisted activity data. */
export function rankCommandPalette(
  commands: readonly CommandDefinition[],
  query: string,
  recentIds: readonly string[],
): CommandDefinition[] {
  const normalized = query.trim();
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));
  return commands
    .map((command) => {
      const haystack = `${command.label} ${command.category} ${command.id}`;
      const score = normalized ? fuzzyScore(haystack, normalized) : 0;
      return score == null ? null : { command, score, recent: recentRank.get(command.id) };
    })
    .filter((candidate): candidate is { command: CommandDefinition; score: number; recent: number | undefined } => candidate !== null)
    .sort((a, b) => {
      if (a.recent !== undefined || b.recent !== undefined) {
        if (a.recent === undefined) return 1;
        if (b.recent === undefined) return -1;
        return a.recent - b.recent;
      }
      return b.score - a.score || a.command.label.localeCompare(b.command.label);
    })
    .map(({ command }) => command);
}
