/**
 * Library-wide routes. External agents talk in absolute source paths because
 * they may run in sandboxes that cannot read the user's local filesystem.
 * These routes are the host-side bridge for semantic retrieval, index status,
 * orientation, library rules, and file CRUD.
 */
import express from 'express';
import fs from 'node:fs';
import { errorMessage, logger } from '../log.ts';
import { indexer } from '../state.ts';
import { sendError } from '../http.ts';
import {
  requireLibraryStatusFolder,
} from '../library-file-access.ts';
import { agentContextFile } from '../library-file-reader.ts';
import { currentWindowId } from '../folder.ts';
import { AGENT_SESSION_ID_HEADER } from '../agent-session-registry.ts';
import { createLibraryOperations, type LibraryOperations } from '../library-operations/index.ts';
import {
  parseSearchTypes,
  SEARCH_TYPES_VALIDATION_ERROR,
} from '../../shared/search-types.ts';

export {
  normalizeLibraryFilePath,
  normalizeLibrarySearchScope,
  requireLibraryStatusFolder,
  type AgentContextFile,
  type LibrarySearchScope,
} from '../library-file-access.ts';
export { agentContextFile, readLibraryFile } from '../library-file-reader.ts';
export { listLibraryDirectory } from '../library-directory.ts';
export {
  deleteLibraryFile,
  editLibraryFile,
  moveLibraryFile,
  writeLibraryFile,
} from '../library-file-mutations.ts';

const log = logger('routes/library-files');


export function mount(app: express.Express, operations: LibraryOperations = createLibraryOperations()): void {
  // Hybrid search over the whole library (optional `folder`, `path_prefix`,
  // and source `types` filters). Powers MCP's `search_library`. Hidden `.md`
  // files are remapped or dropped (same rule as /api/search) so an external
  // client never sees an internal path.
  app.post('/api/library/search', async (req, res) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query : '';
      const topK = Number.isFinite(req.body?.top_k) ? Number(req.body.top_k) : 8;
      const types = parseSearchTypes(req.body?.types);
      if (types == null) {
        return res.status(400).json({
          error: SEARCH_TYPES_VALIDATION_ERROR,
          code: 'INVALID_SEARCH_TYPES',
        });
      }
      res.json(await operations.search({
        query,
        topK,
        folder: req.body?.folder,
        pathPrefix: req.body?.path_prefix,
        types,
      }));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Keyword (ripgrep) search over the whole library, or one `folder`
  // (optionally narrowed to a folder-relative `path_prefix`). Powers the
  // in-app search popup's exact mode; deliberately outside the per-window
  // folder gate so it answers before any folder is open. Hidden derived
  // notes are remapped or dropped, same as every other search surface.
  app.post('/api/library/keyword-search', async (req, res) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query : '';
      res.json(await operations.keywordSearch({
        query,
        caseStrict: req.body?.case_strict === true,
        wholeWord: req.body?.whole_word === true,
        folder: typeof req.body?.folder === 'string' ? req.body.folder : undefined,
        pathPrefix: typeof req.body?.path_prefix === 'string' ? req.body.path_prefix : undefined,
      }));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Index status for the whole library (or one `folder`). Powers the totals
  // MCP's `reindex` reports after a sweep.
  app.get('/api/library/index-status', async (req, res) => {
    try {
      const folderRoot = requireLibraryStatusFolder(req.query.folder);
      const status = await indexer.status(folderRoot);
      // Recently-indexed slice: intersect the indexed file set with
      // their on-disk mtime, return top N. Helps an agent answer "what
      // did I just embed?" without a state.db timestamp column. Paths are
      // absolute (members live anywhere).
      let recentlyIndexed: Array<{ path: string; mtimeMs: number }> = [];
      try {
        const indexed = await indexer.listFiles(folderRoot);
        const enriched: Array<{ path: string; mtimeMs: number }> = [];
        for (const abs of Object.keys(indexed)) {
          try {
            const st = fs.statSync(abs);
            enriched.push({ path: abs, mtimeMs: st.mtimeMs });
          } catch { /* file vanished — drop from list */ }
        }
        enriched.sort((a, b) => b.mtimeMs - a.mtimeMs);
        recentlyIndexed = enriched.slice(0, 10);
      } catch (err) {
        log.warn(`recently_indexed enrichment failed: ${errorMessage(err)}`);
      }
      res.json({
        ...status,
        recentlyIndexed,
      });
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Reconcile one folder or the whole library. Powers MCP `reindex` while
  // keeping membership resolution inside the app server instead of the stdio
  // MCP host.
  app.post('/api/library/reindex', async (req, res) => {
    try {
      const folder = req.body?.folder ?? req.query.folder;
      res.json(await operations.reindex({ folder: typeof folder === 'string' ? folder : undefined }));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Create a new project folder and register it into the library. Powers
  // MCP's `create_project`. Session attribution rides the request header
  // (set by the stdio MCP host from its spawn environment) — a live
  // library-scoped panel session is rebound to the new project; external
  // callers only create + register.
  app.post('/api/library/create-project', async (req, res) => {
    try {
      const attribution = req.header(AGENT_SESSION_ID_HEADER)?.trim();
      res.json(await operations.createProject({
        name: req.body?.name,
        location: req.body?.location,
        ...(attribution ? { agentSessionId: attribution } : {}),
        // Fallback identity for MCP hosts that don't forward the session
        // header (stale installed binaries): the request's window id.
        windowId: currentWindowId(),
      }));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Library info = folder_home + folders. Powers MCP's `library_info` tool — the agent's
  // orientation card at the start of a session.
  app.get('/api/library/info', async (_req, res) => {
    try {
      res.json(await operations.info());
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Resolve the best file path to hand to a built-in agent for a visible
  // source file. PDF/DOCX use app-data extracted text for reading. HTML/images
  // keep the original source as the read path; their extracted text layers
  // are indexing inputs, not source replacements.
  app.get('/api/library/agent-context-file', async (req, res) => {
    try {
      res.json(await agentContextFile(req.query.path));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.get('/api/library/directory', async (req, res) => {
    try {
      res.json(await operations.listDirectory(req.query.path));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.get('/api/library/file', async (req, res) => {
    try {
      res.json(await operations.read(req.query.path));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.put('/api/library/file', async (req, res) => {
    try {
      const filePath = req.body?.path;
      const content = req.body?.content;
      const baseVersion = typeof req.body?.baseVersion === 'string' ? req.body.baseVersion : undefined;
      res.json(await operations.write({ path: filePath, content, baseVersion }));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.post('/api/library/file/edit', async (req, res) => {
    try {
      const filePath = req.body?.path;
      const oldText = req.body?.old_text;
      const newText = req.body?.new_text;
      const baseVersion = typeof req.body?.baseVersion === 'string' ? req.body.baseVersion : undefined;
      res.json(await operations.edit({ path: filePath, oldText, newText, replaceAll: req.body?.replace_all === true, baseVersion }));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.patch('/api/library/file/move', async (req, res) => {
    try {
      res.json(await operations.move({ path: req.body?.path, newPath: req.body?.new_path, cascade: req.body?.cascade !== false }));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  app.delete('/api/library/file', async (req, res) => {
    try {
      res.json(await operations.delete(req.query.path));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });
}
