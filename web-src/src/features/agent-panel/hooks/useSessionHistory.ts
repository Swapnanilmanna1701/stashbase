import { useCallback, useEffect, useState } from 'react';
import { api } from '@/common/api/api';
import { AGENTS, type AgentKind } from '@/common/lib/agentCatalog';
import type { HistoryScope } from '@/common/lib/libraryScope';
import {
  historyRequestParams,
  mergeAgentSessions,
  rowScopeParams,
  type MergedSessionRow,
} from '@/features/agent-panel/lib/sessionHistory';

const rowKey = (row: MergedSessionRow) => `${row.agent}:${row.id}`;

export interface SessionHistory {
  rows: MergedSessionRow[];
  /** Agents whose listing failed; each surfaces as a quiet inline note. */
  failedAgents: AgentKind[];
  loading: boolean;
  rename: (row: MergedSessionRow, title: string) => Promise<void>;
  /** False when the delete failed and the row is still listed. */
  remove: (row: MergedSessionRow) => Promise<boolean>;
}

/**
 * Both agents' sessions for one history scope, newest first, with the
 * rename and delete commands for a row.
 *
 * Each agent stores its own history, so a listing is two independent
 * requests merged into one ordering. They are fetched together and a
 * failure is per agent: one agent being unreachable must leave the other's
 * sessions listed rather than blank the menu.
 *
 * Rename and delete route through the row's own agent and scope, not the
 * menu's — the library-wide listing mixes rows from every folder, and each
 * one is only addressable where it lives.
 */
export function useSessionHistory(scope: HistoryScope): SessionHistory {
  const [rows, setRows] = useState<MergedSessionRow[]>([]);
  const [failedAgents, setFailedAgents] = useState<AgentKind[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Both agents fetch in parallel; one failing must not blank the
      // other's history — the failed agent surfaces as a quiet inline note.
      const lists = await Promise.all(AGENTS.map(async (agent) => ({
        agent: agent.id,
        sessions: await api.listSessions(agent.id, historyRequestParams(scope)).catch(() => null),
      })));
      if (cancelled) return;
      const merged = mergeAgentSessions(lists);
      setRows(merged.rows);
      setFailedAgents(merged.failed);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the scope identity changes
  }, [scope.kind, scope.kind === 'folder' ? scope.path : '']);

  const rename = useCallback(async (row: MergedSessionRow, title: string) => {
    try {
      const updated = await api.renameSession(row.id, title, row.agent, rowScopeParams(scope, row));
      setRows((rs) => rs.map((r) => (rowKey(r) === rowKey(row) ? { ...r, ...updated } : r)));
    } catch { /* leave list as-is */ }
  }, [scope]);

  const remove = useCallback(async (row: MergedSessionRow): Promise<boolean> => {
    try { await api.deleteSession(row.id, row.agent, rowScopeParams(scope, row)); }
    catch { return false; }
    setRows((rs) => rs.filter((r) => rowKey(r) !== rowKey(row)));
    return true;
  }, [scope]);

  return { rows, failedAgents, loading, rename, remove };
}
