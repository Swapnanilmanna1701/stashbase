/**
 * Codex thread-history routes for the chat panel's History dropdown.
 *
 * Backed by Codex app-server's structured thread APIs. Delete maps to the
 * native irreversible thread/delete operation so it has the same meaning as
 * Delete Chat for every built-in agent.
 */
import express from 'express';
import { getCurrentFolder, getFolderHome } from '../folder.ts';
import { sendError } from '../http.ts';
import {
  deleteCodexSession,
  getCodexSessionMessages,
  listCodexSessions,
  renameCodexSession,
} from '../codex-agent.ts';
import { agentAdapter, type AgentHistoryActions } from '../agent-contract.ts';
import { httpError } from '../codex-protocol.ts';
import { filesystemPath } from '../filesystem-path.ts';
import {
  agentSessionFolderOverride,
  agentSessionFolderOverrides,
  clearAgentSessionFolderOverride,
  historyRowsForFolder,
  missingOverriddenSessionIds,
} from '../agent-session-folders.ts';

export function mount(app: express.Express): void {
  app.get('/api/codex/sessions', async (_req, res) => {
    try {
      res.json(await codexHistory().list(getCurrentFolder()));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.get('/api/codex/sessions/:id/messages', async (req, res) => {
    try {
      res.json(await codexHistory().messages(req.params.id, getCurrentFolder()));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.patch('/api/codex/sessions/:id', async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'title required' });
      return;
    }
    try {
      res.json(await codexHistory().rename(req.params.id, title, getCurrentFolder()));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.delete('/api/codex/sessions/:id', async (req, res) => {
    try {
      await codexHistory().remove(req.params.id, getCurrentFolder());
      res.json({});
    } catch (err: unknown) {
      sendError(res, err);
    }
  });
}

/** Codex's native thread store is cwd-keyed, so a library chat rebound to a
 * project by `create_project` still lives under the reserved library cwd.
 * The persisted session→folder override moves it: the project listing pulls
 * it in, the library listing drops it, and direct actions accept it for its
 * override folder only. */
export function codexHistoryActions(): AgentHistoryActions {
  return {
    async list(folder) {
      const rows = (await listCodexSessions(folder)) as Array<{ id: string; lastModified: number }>;
      if (!folder) return rows;
      const overrides = agentSessionFolderOverrides('codex');
      const visible = historyRowsForFolder(rows, overrides, folder);
      const missing = missingOverriddenSessionIds(visible, overrides, folder);
      if (missing.length) {
        // Overridden sessions natively live under the reserved library cwd.
        const home = getFolderHome();
        if (!pathsEqual(home, folder)) {
          const homeRows = (await listCodexSessions(home)) as Array<{ id: string; lastModified: number }>;
          for (const row of homeRows) {
            if (missing.includes(row.id) && !visible.some((existing) => existing.id === row.id)) {
              visible.push(row);
            }
          }
          visible.sort((a, b) => b.lastModified - a.lastModified);
        }
      }
      return visible;
    },
    messages: (id, folder) => getCodexSessionMessages(id, overrideAwareFolder('read', id, folder)),
    async replay(id, folder) {
      return {
        protocol: 2,
        messages: await getCodexSessionMessages(id, overrideAwareFolder('read', id, folder)),
        effort: null,
      };
    },
    rename: (id, title, folder) => renameCodexSession(id, title, overrideAwareFolder('rename', id, folder)),
    async remove(id, folder) {
      await deleteCodexSession(id, overrideAwareFolder('delete', id, folder));
      clearAgentSessionFolderOverride('codex', id);
    },
  };
}

/** Fold the override into direct-session actions: an overridden session is
 * addressable only through its override folder — where the native cwd check
 * would fail, so the base call runs folder-unscoped after this validation. */
function overrideAwareFolder(action: string, id: string, folder: string | null): string | null {
  if (!folder) return null;
  const override = agentSessionFolderOverride('codex', id);
  if (!override) return folder;
  if (!pathsEqual(override, folder)) throw httpError(404, `session not found for current folder (${action})`);
  return null;
}

function pathsEqual(a: string, b: string): boolean {
  try {
    return filesystemPath.equal(a, b);
  } catch {
    return false;
  }
}

function codexHistory(): AgentHistoryActions {
  return agentAdapter('codex')?.history ?? codexHistoryActions();
}
