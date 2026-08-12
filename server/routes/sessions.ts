/**
 * Claude session-history routes for the chat panel's History dropdown.
 *
 * These wrap the Agent SDK's on-disk session store (`~/.claude/projects/`,
 * the same transcripts the `claude` CLI writes). They sit OUTSIDE the
 * `requireFolder` gate (no 412 before a folder is open), but the LIST is filtered to
 * the current folder by session `cwd` — the panel belongs to one folder, so
 * its History shows only that folder's conversations (falls back to all
 * when no folder is open). `:id` reads/rename/delete stay global by id.
 *
 *   GET    /api/agent/sessions             → list this folder's sessions
 *   GET    /api/agent/sessions/:id/messages→ a session's transcript as
 *                                            renderable panel blocks
 *   PATCH  /api/agent/sessions/:id { title }→ rename
 *   DELETE /api/agent/sessions/:id         → delete
 *
 * Resuming a session is NOT here — that rides the `/ws/agent` connect URL
 * (`resume=<id>`, see server/agent.ts); this route only feeds the list +
 * the transcript the client paints before reconnecting.
 */
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listSessions,
  getSessionMessages,
  getSessionInfo,
  renameSession,
  deleteSession,
  type SDKSessionInfo,
  type SessionMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { getCurrentFolder } from '../folder.ts';
import { filesystemPath } from '../filesystem-path.ts';
import { sendError } from '../http.ts';
import { agentAdapter, type AgentHistoryActions } from '../agent-contract.ts';
import {
  agentSessionFolderOverride,
  clearAgentSessionFolderOverride,
  historyRowInFolder,
} from '../agent-session-folders.ts';
import { restoreHistoryAttachments, type RestoredAttachment } from '../agent-history-attachments.ts';

/** Trimmed session row sent to the client. */
interface SessionRow {
  id: string;
  title: string;
  lastModified: number;
  cwd?: string;
  gitBranch?: string;
}

class SessionNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('session not found for current folder'); }
}

function toRow(s: SDKSessionInfo): SessionRow {
  return {
    id: s.sessionId,
    title: s.customTitle || s.summary || s.firstPrompt || s.sessionId,
    lastModified: s.lastModified,
    ...(s.cwd ? { cwd: s.cwd } : {}),
    ...(s.gitBranch ? { gitBranch: s.gitBranch } : {}),
  };
}

export function mount(app: express.Express): void {
  // Sessions for the CURRENT folder, newest first. The agent always runs
  // with cwd = the open folder dir, and the SDK records `cwd` per session,
  // so filter on it — the History dropdown then shows only this folder's
  // conversations (incl. terminal Claude Code runs in the same dir),
  // matching "this panel belongs to this folder". No folder open (rare —
  // the panel needs one) → fall back to listing all so it's never blank.
  app.get('/api/agent/sessions', async (_req, res) => {
    try {
      res.json(await claudeHistory().list(getCurrentFolder()));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // A session's transcript, mapped to the same block shape the WS streams
  // so the client renders it with its existing BlockView untouched.
  app.get('/api/agent/sessions/:id/messages', async (req, res) => {
    try {
      res.json(await claudeHistory().messages(req.params.id, getCurrentFolder()));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Rename (the pencil). Returns the refreshed row.
  app.patch('/api/agent/sessions/:id', async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'title required' });
      return;
    }
    try {
      res.json(await claudeHistory().rename(req.params.id, title, getCurrentFolder()));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Delete (the trash) — removes the `{id}.jsonl` transcript.
  app.delete('/api/agent/sessions/:id', async (req, res) => {
    try {
      await claudeHistory().remove(req.params.id, getCurrentFolder());
      res.json({});
    } catch (err: unknown) {
      sendError(res, err);
    }
  });
}

/** Claude's compatibility adapter delegates the panel's history actions to
 * the SDK store without exposing those SDK details to routes or renderer.
 * A persisted session→folder override (create_project rebinding a library
 * chat) wins over the native cwd: the overridden session lists under its
 * project folder and no longer under the library's reserved cwd. */
interface ClaudeHistoryDependencies {
  getMessages: typeof getSessionMessages;
  readNativeTranscript: typeof readClaudeNativeTranscript;
  belongsToFolder: typeof sessionBelongsToFolder;
}

export function claudeHistoryActions(overrides: Partial<ClaudeHistoryDependencies> = {}): AgentHistoryActions {
  const getMessages = overrides.getMessages ?? getSessionMessages;
  const readNativeTranscript = overrides.readNativeTranscript ?? readClaudeNativeTranscript;
  const belongsToFolder = overrides.belongsToFolder ?? sessionBelongsToFolder;
  return {
    async list(folder) {
      const sessions = await listSessions();
      return sessions.map(toRow)
        .filter((row) => !folder || claudeSessionInFolder(row.id, row, folder))
        .sort((a, b) => b.lastModified - a.lastModified);
    },
    async messages(id, folder) {
      if (!(await belongsToFolder(id, folder))) throw new SessionNotFoundError();
      return transcriptToBlocks(await getMessages(id));
    },
    async replay(id, folder) {
      if (!(await belongsToFolder(id, folder))) throw new SessionNotFoundError();
      // The SDK intentionally sanitizes history after selecting the active
      // chain. Keep those UUIDs for chain authority, but join them back to the
      // raw JSONL entries to recover metadata the SDK response omits.
      const messages = await getMessages(id);
      const native = await readNativeTranscript(id);
      return {
        protocol: 2,
        messages: transcriptToBlocks(messages),
        effort: claudeTranscriptEffort(native, messages),
      };
    },
    async rename(id, title, folder) {
      if (!(await belongsToFolder(id, folder))) throw new SessionNotFoundError();
      await renameSession(id, title);
      const info = await getSessionInfo(id);
      return info ? toRow(info) : { id, title, lastModified: 0 };
    },
    async remove(id, folder) {
      if (!(await belongsToFolder(id, folder))) throw new SessionNotFoundError();
      await deleteSession(id);
      clearAgentSessionFolderOverride('claude', id);
    },
  };
}

function claudeSessionInFolder(id: string, info: { cwd?: unknown }, folder: string): boolean {
  return historyRowInFolder(
    agentSessionFolderOverride('claude', id),
    sessionInfoMatchesFolder(info, folder),
    folder,
  );
}

type NativeTranscriptEntry = {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  effort?: unknown;
  message?: unknown;
};

const CLAUDE_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/** Recover raw effort for the newest assistant UUID selected by the SDK's
 * active-chain reader. A future value is deliberately unknown; walking back
 * would silently replace newer native semantics with stale supported data. */
export function claudeTranscriptEffort(
  native: NativeTranscriptEntry[],
  active: Array<Pick<SessionMessage, 'type' | 'uuid'>>,
): string | null {
  const byId = new Map(native.flatMap((entry) =>
    typeof entry.uuid === 'string' && entry.uuid ? [[entry.uuid, entry] as const] : []));
  const latest = [...active].reverse().find((entry) => entry.type === 'assistant');
  if (!latest) return null;
  const raw = byId.get(latest.uuid);
  const message = raw?.message as { effort?: unknown } | null | undefined;
  const value = raw?.effort ?? message?.effort;
  return typeof value === 'string' && CLAUDE_EFFORTS.has(value) ? value : null;
}

/** Read the native session JSONL without trusting the renderer-supplied id as
 * a path. Claude may use a hashed project-directory name, so search only the
 * immediate SDK projects directories for the exact UUID filename. */
export async function readClaudeNativeTranscript(sessionId: string): Promise<NativeTranscriptEntry[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return [];
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude');
  const projectsDir = path.join(configDir, 'projects');
  let projects: import('node:fs').Dirent[];
  try { projects = await fs.readdir(projectsDir, { withFileTypes: true }); }
  catch { return []; }
  for (const project of projects) {
    if (!project.isDirectory() && !project.isSymbolicLink()) continue;
    try {
      const text = await fs.readFile(path.join(projectsDir, project.name, `${sessionId}.jsonl`), 'utf8');
      return text.split(/\r?\n/).flatMap((line): NativeTranscriptEntry[] => {
        if (!line.trim()) return [];
        try {
          const value = JSON.parse(line) as NativeTranscriptEntry;
          return value && typeof value === 'object' && typeof value.type === 'string' ? [value] : [];
        } catch { return []; }
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return [];
    }
  }
  return [];
}

function claudeHistory(): AgentHistoryActions {
  return agentAdapter('claude')?.history ?? claudeHistoryActions();
}

async function sessionBelongsToFolder(id: string, folder: string | null): Promise<boolean> {
  // When no folder is open, the list route intentionally falls back to
  // all sessions; keep direct actions global before a folder is open.
  if (!folder) return true;
  const info = await getSessionInfo(id);
  return claudeSessionInFolder(id, info ?? {}, folder);
}

export function sessionInfoMatchesFolder(info: { cwd?: unknown } | null | undefined, folder: string): boolean {
  return !!(info && typeof info.cwd === 'string'
    && info.cwd.trim()
    && filesystemPath.equal(info.cwd, folder));
}

// ----- transcript → panel blocks ----------------------------------------

/** The renderable block shape the client's BlockView consumes. Mirrors
 *  AgentView's `Block` union (history tools are always settled: 'done' or
 *  'error'). */
type WireBlock =
  | { kind: 'user'; id: string; text: string; attachments?: RestoredAttachment[] }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown>; status: 'done' | 'error'; result?: string };

/** Walk a session's messages in order into panel blocks, stitching each
 *  `tool_result` (which arrives as a later user-role message) back onto
 *  its originating `tool_use` block by id — the same correlation the live
 *  WS path does, just replayed from disk. */
export function transcriptToBlocks(msgs: Array<{ type: string; message: unknown }>): WireBlock[] {
  const blocks: WireBlock[] = [];
  const toolById = new Map<string, Extract<WireBlock, { kind: 'tool' }>>();
  let seq = 0;
  const id = () => `h${seq++}`;

  for (const m of msgs) {
    const message = m.message as { role?: string; content?: unknown };
    const content = message?.content;

    if (m.type === 'user') {
      if (typeof content === 'string') {
        appendUserBlock(blocks, id, content);
        continue;
      }
      if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const b of content as Array<Record<string, unknown>>) {
          if (b.type === 'text' && typeof b.text === 'string') {
            texts.push(b.text);
          } else if (b.type === 'tool_result') {
            const tool = toolById.get(String(b.tool_use_id));
            if (tool) {
              tool.result = stringifyToolResult(b.content);
              if (b.is_error === true) tool.status = 'error';
            }
          }
        }
        appendUserBlock(blocks, id, texts.join('\n').trim());
      }
      continue;
    }

    if (m.type === 'assistant' && Array.isArray(content)) {
      for (const b of content as Array<Record<string, unknown>>) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          blocks.push({ kind: 'assistant', id: id(), text: b.text });
        } else if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
          blocks.push({ kind: 'thinking', id: id(), text: b.thinking });
        } else if (b.type === 'tool_use') {
          const tool: Extract<WireBlock, { kind: 'tool' }> = {
            kind: 'tool',
            id: id(),
            name: String(b.name ?? ''),
            input: (b.input as Record<string, unknown>) ?? {},
            status: 'done',
          };
          toolById.set(String(b.id), tool);
          blocks.push(tool);
        }
      }
    }
  }
  return blocks;
}

function appendUserBlock(blocks: WireBlock[], id: () => string, text: string): void {
  const restored = restoreHistoryAttachments(text);
  if (!restored.text.trim() && restored.attachments.length === 0) return;
  blocks.push({
    kind: 'user',
    id: id(),
    text: restored.text,
    ...(restored.attachments.length ? { attachments: restored.attachments } : {}),
  });
}

/** Stringify a tool_result `content` (string, or text/other blocks) — the
 *  same shape `server/agent.ts` renders for live tool results. */
function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as Record<string, unknown>;
        if (block.type === 'text' && typeof block.text === 'string') return block.text;
        return JSON.stringify(block);
      })
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}
