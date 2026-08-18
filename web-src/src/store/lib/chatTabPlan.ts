/** Pick the blank tab to reuse as the welcome tab (New Chat button /
 * window-folder switch): prefer the preferred agent's blank tab, else any
 * blank tab, else null (create a new tab). */
export function blankTabToReuse(
  tabs: readonly { id: string; agent: string; blank?: boolean }[],
  preferredAgent: string,
): string | null {
  const blanks = tabs.filter((tab) => tab.blank);
  const preferred = blanks.find((tab) => tab.agent === preferredAgent);
  return (preferred ?? blanks[0])?.id ?? null;
}

/** What the sidebar's New Chat entry does for a requested agent: reuse
 * the one COMPLETELY blank tab regardless of its agent — switching the
 * blank tab's agent in place when it differs (`switchAgent`) — else
 * create a new tab. Any content, draft, attachments, or a resumed
 * session disqualifies a tab from reuse; user work is never rebound to
 * another agent. */
export type NewChatPlan =
  | { kind: 'reuse'; id: string; switchAgent: boolean }
  | { kind: 'new' };

export function newChatPlan(
  tabs: readonly { id: string; agent: string; blank?: boolean }[],
  agent: string,
): NewChatPlan {
  const reuseId = blankTabToReuse(tabs, agent);
  if (!reuseId) return { kind: 'new' };
  const tab = tabs.find((candidate) => candidate.id === reuseId);
  return { kind: 'reuse', id: reuseId, switchAgent: tab?.agent !== agent };
}
