export const RETAINED_MARKDOWN_EDITOR_LIMIT = 5;

interface RetainableTab {
  id: string;
  file: { format: string } | null;
}

/**
 * Keep the active Markdown tab plus the remaining most-recently-used open
 * Markdown tabs. Returning them in tab-strip order keeps React's sibling
 * ordering stable while Editor History owns eviction priority.
 */
export function retainedMarkdownTabs<T extends RetainableTab>(
  tabs: T[],
  editorHistory: string[],
  activeTabId: string | null,
  limit = RETAINED_MARKDOWN_EDITOR_LIMIT,
): T[] {
  if (limit <= 0) return [];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const priority = activeTabId
    ? [activeTabId, ...editorHistory.filter((id) => id !== activeTabId)]
    : editorHistory;
  const retained = new Set<string>();
  for (const id of priority) {
    const tab = byId.get(id);
    if (!tab || tab.file?.format !== 'md') continue;
    retained.add(id);
    if (retained.size === limit) break;
  }
  return tabs.filter((tab) => retained.has(tab.id));
}
