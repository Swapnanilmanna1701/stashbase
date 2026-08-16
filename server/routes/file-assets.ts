import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeHtml } from '../html.ts';
import { resolveAsset, resolveExisting } from '../files.ts';
import { detectViewerFormat } from '../format.ts';
import { derivedHtmlPathForDocx } from '../docx.ts';
import { isConversionTextUnavailable } from '../conversion.ts';
import { hasFailed } from '../conversion-status.ts';
import { filesystemPath } from '../filesystem-path.ts';
import { exactMemberFolderRoot, runWithFolderRoot, toSourcePath } from '../folder.ts';
import { sendError } from '../http.ts';
import { isAudioFile } from '../format.ts';
import { prepareAudioPreview, readAudioPreviewStatus } from '../audio-transcription.ts';
import { inspectXlsxContainer, readBoundedXlsx } from '../xlsx.ts';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.aac': 'audio/aac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
};

export function mountFileAssetRoutes(app: express.Express): void {
  // HTML responses carry heading ids and the scroll bootstrap. Video uses
  // sendFile for Range support; other assets stream with an explicit MIME.
  app.get('/asset/*', (req, res) => {
    const scope = parseAssetScope((req.params as any)[0] as string);
    if (!scope) return res.status(404).end();
    void withAssetScope(scope, () => {
      const abs = resolveAsset(scope.rel);
      if (!abs) return res.status(404).end();
      const ext = path.extname(abs).toLowerCase();
      if (ext === '.html' || ext === '.htm') {
        try {
          const raw = fs.readFileSync(abs, 'utf8');
          const { preparedHtml } = analyzeHtml(raw);
          res.type('text/html').send(preparedHtml);
        } catch (err: unknown) {
          sendError(res, err);
        }
        return;
      }
      if (ext === '.xlsx') {
        void readBoundedXlsx(abs)
          .then((bytes) => { inspectXlsxContainer(bytes); res.type(MIME['.xlsx']).send(bytes); })
          .catch((err: unknown) => {
            if (!res.headersSent) res.status(422).json({ error: err instanceof Error ? err.message : String(err) });
          });
        return;
      }
      if (ext === '.webm' || ext === '.mp4' || ext === '.mov' || ext === '.m4v' || isAudioFile(abs)) {
        return res.sendFile(abs);
      }
      res.type(MIME[ext] ?? 'application/octet-stream');
      fs.createReadStream(abs).pipe(res);
    });
  });

  // Chromium can play many accepted audio/video sources directly. If a codec
  // or container is unsupported, AudioPreview retries through this AppData-only
  // WebM/Opus audio representation. Generation is deduplicated per source.
  app.get('/asset-audio-preview/*', async (req, res) => {
    const scope = parseAssetScope((req.params as any)[0] as string);
    if (!scope) return res.status(404).end();
    if (!isAudioFile(scope.rel)) return res.status(415).end();
    const controller = new AbortController();
    const abort = () => controller.abort(new Error('audio preview request closed'));
    const abortOnPrematureClose = () => { if (!res.writableEnded) abort(); };
    req.once('aborted', abort);
    res.once('close', abortOnPrematureClose);
    try {
      await withAssetScope(scope, async () => {
        const sourceAbs = resolveExisting(scope.rel);
        if (!sourceAbs) return res.status(404).end();
        const previewAbs = await prepareAudioPreview(sourceAbs, controller.signal);
        res.type('audio/webm');
        res.sendFile(previewAbs);
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      sendError(res, err);
    } finally {
      req.removeListener('aborted', abort);
      res.removeListener('close', abortOnPrematureClose);
    }
  });

  // Explicit preparation lets the renderer show queue/work feedback before
  // assigning the fallback URL to <audio>. Closing/cancelling the request
  // releases this caller's waiter and cancels shared native work when it was
  // the last interested preview.
  app.post('/api/audio/preview/prepare', async (req, res) => {
    const rel = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
    if (!rel || !isAudioFile(rel)) return res.status(415).json({ error: 'media path required' });
    const scope = explicitFolderScope(rel, req.body?.folder);
    if (!scope) return res.status(400).json({ error: 'folder is not a registered library folder' });
    const controller = new AbortController();
    const abort = () => controller.abort(new Error('audio preview request closed'));
    const abortOnPrematureClose = () => { if (!res.writableEnded) abort(); };
    req.once('aborted', abort);
    res.once('close', abortOnPrematureClose);
    try {
      await withAssetScope(scope, async () => {
        const sourceAbs = resolveExisting(rel);
        if (!sourceAbs) return res.status(404).json({ error: 'file not found' });
        await prepareAudioPreview(sourceAbs, controller.signal);
        res.json({ ok: true });
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      sendError(res, err);
    } finally {
      req.removeListener('aborted', abort);
      res.removeListener('close', abortOnPrematureClose);
    }
  });

  app.get('/api/audio/preview/status', async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!rel || !isAudioFile(rel)) return res.status(415).json({ error: 'media path required' });
    const scope = explicitFolderScope(rel, req.query.folder);
    if (!scope) return res.status(400).json({ error: 'folder is not a registered library folder' });
    try {
      await withAssetScope(scope, () => {
        const sourceAbs = resolveExisting(rel);
        if (!sourceAbs) return res.status(404).json({ error: 'file not found' });
        res.json(readAudioPreviewStatus(sourceAbs));
      });
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Derived DOCX HTML is a fallback when renderer-side conversion cannot
  // produce the immediate preview. The visible DOCX stays the source path.
  app.get('/asset-derived/*', (req, res) => {
    const scope = parseAssetScope((req.params as any)[0] as string);
    if (!scope) return res.status(404).end();
    const rel = scope.rel;
    if (detectViewerFormat(rel) !== 'docx') return res.status(415).end();
    void withAssetScope(scope, () => {
      let sourceAbs: string | null = null;
      try {
        sourceAbs = resolveExisting(rel);
        if (!sourceAbs) return res.status(404).end();
        if (isConversionTextUnavailable(sourceAbs)) throw new Error('document conversion unavailable');
        const htmlAbs = derivedHtmlPathForDocx(sourceAbs);
        const raw = fs.readFileSync(htmlAbs, 'utf8');
        const { preparedHtml } = analyzeHtml(raw);
        res.type('text/html').send(preparedHtml);
      } catch {
        let sourcePath: string | null = sourceAbs ? filesystemPath.absolute(sourceAbs) : null;
        if (!sourcePath) {
          try { sourcePath = toSourcePath(rel); } catch { /* no active folder context */ }
        }
        let failed = false;
        if (sourcePath) {
          try { failed = hasFailed(sourcePath); }
          catch { /* preparation status is auxiliary */ }
        }
        let message = 'Preparing document preview…';
        if (failed) {
          message = 'Document preparation failed. Use Reprocess to try again.';
        }
        res.status(409).type('text/html').send(
          `<!doctype html><meta charset="utf-8"><body>${message}</body>`,
        );
      }
    });
  });
}

/** Explicit-folder scope for the JSON audio endpoints: same membership rule
 *  as the path token, but carried as an ordinary `folder` parameter since no
 *  iframe/base-href constraint applies. Returns null for a non-member ref. */
function explicitFolderScope(rel: string, folderRaw: unknown): AssetScope | null {
  const ref = typeof folderRaw === 'string' && folderRaw.trim() ? folderRaw.trim() : undefined;
  if (!ref) return { rel };
  const folderRoot = exactMemberFolderRoot(ref);
  if (!folderRoot) return null;
  return { rel, folderRoot };
}

function stripAssetWindowPrefix(rel: string): string {
  if (!rel.startsWith('__window/')) return rel;
  const slash = rel.indexOf('/', '__window/'.length);
  return slash >= 0 ? rel.slice(slash + 1) : '';
}

interface AssetScope {
  rel: string;
  /** Absolute member folder root when the URL carries a `__folder/` token —
   *  a viewer showing a file from a non-active folder. */
  folderRoot?: string;
}

/** Strip `__window/<id>/` (identity already consumed in `withWindowContext`)
 *  and an optional `__folder/<double-encoded-abs>/` scope token. The folder
 *  rides the PATH — not a query param — because iframe `<base href>` and
 *  relative sub-asset URLs only inherit path segments. The token is
 *  double-encoded by the renderer: Express decodes the wildcard once, so
 *  the surviving segment stays slash-free until we decode it here.
 *  Returns null for a malformed or non-member folder token. */
function parseAssetScope(raw: string): AssetScope | null {
  const rel = stripAssetWindowPrefix(raw);
  if (!rel.startsWith('__folder/')) return { rel };
  const slash = rel.indexOf('/', '__folder/'.length);
  if (slash < 0) return null;
  let folderRef: string;
  try {
    folderRef = decodeURIComponent(rel.slice('__folder/'.length, slash));
  } catch {
    return null;
  }
  const folderRoot = exactMemberFolderRoot(folderRef);
  if (!folderRoot) return null;
  return { rel: rel.slice(slash + 1), folderRoot };
}

async function withAssetScope<T>(scope: AssetScope, fn: () => T | Promise<T>): Promise<T> {
  return scope.folderRoot ? runWithFolderRoot(scope.folderRoot, fn) : fn();
}
