/** Pure state for the sidebar's session-history menus and the resume
 * handoff channel. Kept free of React so the merged listing and the
 * consume rule stay covered without a browser harness (mirrors
 * `folderState.ts`).
 *
 * History anchors on the active folder's header row (that folder's
 * sessions) and the New Chat row (ALL sessions across the library).
 * Each menu merges BOTH agents' sessions; a row remembers its agent so
 * rename/delete/resume route through the right runtime, and under the
 * all-scope listing its own member folder so actions bind its scope.
 *
 * Resume is a store handoff: the sidebar records a `PendingChatResume`
 * (CHAT_RESUME_REQUEST) and activates a suitable chat tab via the New
 * Chat plan (`newChatPlan` — reuse the one completely blank tab,
 * switching its agent in place when needed, else create). The target
 * tab's AgentView consumes the request (CHAT_RESUME_CONSUMED) and
 * resumes the session within the request's scope.
 */
import type { SessionInfo, SessionScopeParams } from '@/common/api/api';
import type { AgentKind } from '@/common/lib/agentCatalog';
import { scopeRequestParams, type HistoryScope } from '@/common/lib/libraryScope';

/** The listing params a history scope resolves to. */
export function historyRequestParams(scope: HistoryScope): SessionScopeParams {
  if (scope.kind === 'all') return { scope: 'all' };
  return scopeRequestParams(scope);
}

/** The scope one ROW belongs to — under `all` each row carries its own
 *  member folder (absent = library), and row actions (resume / rename /
 *  delete) must route through THAT scope, not the menu's. */
export function rowScopeParams(scope: HistoryScope, row: SessionInfo): SessionScopeParams {
  if (scope.kind !== 'all') return scopeRequestParams(scope);
  return row.folder ? { folder: row.folder } : { scope: 'library' };
}

/** The pending-resume folder binding for a row (`null` = library scope). */
export function rowResumeFolder(scope: HistoryScope, row: SessionInfo): string | null {
  if (scope.kind === 'folder') return scope.path;
  if (scope.kind === 'all') return row.folder ?? null;
  return null;
}

/** One agent's listing result for a scope: its sessions, or `null` when
 * that agent's fetch failed. */
export interface AgentSessionList {
  agent: AgentKind;
  sessions: SessionInfo[] | null;
}

/** A history row: one agent's session, tagged with its agent so row
 * actions (resume / rename / delete) route through that runtime. */
export interface MergedSessionRow extends SessionInfo {
  agent: AgentKind;
}

export interface MergedSessions {
  /** All loaded sessions across agents, newest first. */
  rows: MergedSessionRow[];
  /** Agents whose listing failed. The menu shows the loaded rows plus a
   * quiet inline note for these — one agent failing must not blank the
   * other's history. */
  failed: AgentKind[];
}

/** Merge per-agent listings into one newest-first list. Stable within an
 * agent (server order is already newest first); ties across agents keep
 * input agent order. */
export function mergeAgentSessions(lists: readonly AgentSessionList[]): MergedSessions {
  const rows: MergedSessionRow[] = [];
  const failed: AgentKind[] = [];
  for (const list of lists) {
    if (list.sessions === null) {
      failed.push(list.agent);
      continue;
    }
    for (const session of list.sessions) rows.push({ ...session, agent: list.agent });
  }
  rows.sort((a, b) => b.lastModified - a.lastModified);
  return { rows, failed };
}

/** Whether an AgentView should consume the pending sidebar resume: only
 * the ACTIVE tab, only when it runs the request's agent, and only while
 * it is still completely blank — a tab holding user work is never
 * hijacked into another conversation. */
export function shouldConsumePendingResume(options: {
  active: boolean;
  tabAgent: string;
  requestAgent: string;
  blank: boolean;
}): boolean {
  return options.active && options.tabAgent === options.requestAgent && options.blank;
}
