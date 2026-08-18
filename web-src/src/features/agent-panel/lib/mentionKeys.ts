export type MentionKeyAction = 'next' | 'previous' | 'accept' | 'dismiss';

export function mentionKeyAction(key: string, suggestionsOpen: boolean): MentionKeyAction | null {
  if (!suggestionsOpen) return null;
  if (key === 'ArrowDown') return 'next';
  if (key === 'ArrowUp') return 'previous';
  if (key === 'Enter' || key === 'Tab') return 'accept';
  if (key === 'Escape') return 'dismiss';
  return null;
}
