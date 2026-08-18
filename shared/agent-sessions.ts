/**
 * Stored agent session history as the chat panel's History menu reads it.
 *
 * Each agent keeps its own transcript store, so a listing is per agent and
 * the renderer merges them; `folder` is what lets a row from the
 * library-wide listing be resumed in the scope that owns it rather than the
 * one the menu happened to be opened from.
 */

/** A local agent session, as listed in the chat panel's History dropdown.
 *  Backed by the agent SDK's transcript store. */
export interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
  cwd?: string;
  gitBranch?: string;
  /** `scope=all` listings only: the member folder this session belongs
   *  to; absent = the library bucket. */
  folder?: string;
}

/** One block of a session's replayed transcript. Structurally a subset of
 *  AgentView's `Block` (history tools are always settled), so it drops
 *  straight into `setBlocks`. */
export type SessionBlock =
  | { kind: 'user'; id: string; text: string; attachments?: Array<{ path: string; name: string; dims?: string; previewUrl?: string }> }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown>; status: 'done' | 'error'; result?: string };

export interface SessionReplay {
  protocol: 2;
  messages: SessionBlock[];
  /** Null means inherited/unknown and must not become a resume override. */
  effort: string | null;
}
