'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const REPORT_LIMITS = require('../shared/report-bug.json');

const MAX_LOG_BYTES = 64 * 1024;
const MAX_LOG_LINES = 500;
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GITHUB_FIELD_MAX_LENGTH = REPORT_LIMITS.githubFieldMaxLength;
const GITHUB_URL_MAX_LENGTH = REPORT_LIMITS.githubUrlMaxLength;
const ERROR_DETAILS_MAX_BYTES = 32 * 1024;

const SENSITIVE_KEY = '(?:api[_-]?key|token|secret|password|authorization|aws_access_key_id|aws_secret_access_key|client_secret|access_token|refresh_token|session(?:_id)?|cookie|set-cookie|credentials?)';

function redactReportText(value, homeDir = os.homedir(), { redactPaths = false } = {}) {
  let text = String(value ?? '');
  if (homeDir) text = text.split(homeDir).join('~');
  const replacements = [
    [/(\b(?:cookie|set-cookie)\b\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]'],
    [new RegExp(`((?:"|')?${SENSITIVE_KEY}(?:"|')?\\s*[:=]\\s*)(["'])(.*?)\\2`, 'gi'), '$1$2[REDACTED]$2'],
    [/\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[_A-Za-z0-9-]{12,}\b/gi, '[REDACTED_TOKEN]'],
    [new RegExp(`\\b(${SENSITIVE_KEY})\\b\\s*[:=]\\s*(?:bearer\\s+)?[^\\s,;]+`, 'gi'), '$1=[REDACTED]'],
    [/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*/gi, 'Bearer [REDACTED]'],
    [/\bAKIA[A-Z0-9]{16}\b/g, '[REDACTED_AWS_KEY]'],
    [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
    [/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, '[REDACTED_SECRET]'],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  if (redactPaths) {
    text = text.split(/(\r?\n)/).map((line) => {
      if (/^\r?\n$/.test(line)) return line;
      let safe = line.replace(
        /\b(?:root|folder|folderPath|oldName|newName|path|file|source|destination)\b\s*(?::|=)?\s*(?:"[^"]*"|'[^']*'|[^\r\n]+)/giu,
        '[REDACTED_PATH]',
      );
      safe = safe
        .replace(/\\\\[^\r\n]+/gu, '[REDACTED_PATH]')
        .replace(/(?:file:\/\/)?\/[^\r\n]*/gu, '[REDACTED_PATH]')
        .replace(/\b[A-Za-z]:\\[^\r\n]*/gu, '[REDACTED_PATH]');
      safe = safe
        .replace(/(?:^|(?<=[\s:>]))(?:\.{0,2}\/)?[^\s]+\/[^\s]+/gu, '[REDACTED_PATH]')
        .replace(/(?:^|(?<=[\s:>]))[^:\r\n]*?\.[\p{L}\p{N}]{1,10}\b/gu, '[REDACTED_PATH]');
      return safe;
    }).join('');
  }
  return text;
}

function readBoundedLog(file, { maxBytes = MAX_LOG_BYTES, maxLines = MAX_LOG_LINES } = {}) {
  try {
    const stat = fs.statSync(file);
    const size = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(size);
      fs.readSync(fd, buffer, 0, size, Math.max(0, stat.size - size));
      return buffer.toString('utf8').split(/\r?\n/).slice(-maxLines).join('\n');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function sanitizeLogExcerpt(value) {
  const output = [];
  for (const line of String(value ?? '').split(/\r?\n/)) {
    const structured = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3}\s+(?:debug|info|warn|error)\s+\[[^\]\r\n]+\])/i);
    if (structured) {
      output.push(`${structured[1]} [details redacted]`);
    }
  }
  return output.join('\n');
}

function reportDetails(draft, input = {}) {
  const sections = [
    '## What happened', input.happened?.trim() || '_Not provided_',
    '', '## Expected behavior', input.expected?.trim() || '_Not provided_',
    '', '## Steps to reproduce', input.steps?.trim() || '_Not provided_',
    '', '## Diagnostics',
    `- StashBase: ${draft.diagnostics.version}`,
    `- OS: ${draft.diagnostics.platform} ${draft.diagnostics.release}`,
    `- Architecture: ${draft.diagnostics.arch}`,
    `- Mode: ${draft.diagnostics.packaged ? 'packaged' : 'development'}`,
    `- Timestamp: ${draft.diagnostics.timestamp}`,
    '', '## Attachments',
    input.includeScreenshot === false ? '- Screenshot excluded by user' : '- `screenshot.png` (reviewed by user)',
    input.includeLogs === false || !draft.logExcerpt ? '- Logs excluded or unavailable' : '- `recent.log` (bounded and redacted)',
    '', '> No data was uploaded by StashBase. Attachments must be added manually.',
  ];
  if (input.includeErrorDetails === true && draft.errorDetails?.trim()) {
    sections.push('', '## Renderer error', '```text', redactReportText(draft.errorDetails, draft.homeDir, { redactPaths: true }), '```');
  }
  return redactReportText(sections.join('\n'), draft.homeDir);
}

function cleanupExpiredDrafts(root, now = Date.now(), maxAgeMs = DRAFT_MAX_AGE_MS) {
  if (!fs.existsSync(root)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(root, entry.name);
    try {
      if (now - fs.statSync(target).mtimeMs > maxAgeMs) {
        fs.rmSync(target, { recursive: true, force: true });
        removed += 1;
      }
    } catch { /* best-effort cleanup */ }
  }
  return removed;
}

function reportLogPath(app, platform = process.platform) {
  return (platform === 'win32' ? path.win32 : path.posix).join(app.getPath('logs'), 'server.log');
}

function truncateForEncodedQuery(value, maxEncodedLength = GITHUB_FIELD_MAX_LENGTH) {
  let result = '';
  let encodedLength = 0;
  for (const character of String(value ?? '').toWellFormed()) {
    const characterLength = encodeURIComponent(character).length;
    if (encodedLength + characterLength > maxEncodedLength) break;
    result += character;
    encodedLength += characterLength;
  }
  return result;
}

function truncateUtf8(value, maxBytes) {
  let result = '';
  let byteLength = 0;
  for (const character of String(value ?? '').toWellFormed()) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (byteLength + characterBytes > maxBytes) break;
    result += character;
    byteLength += characterBytes;
  }
  return result;
}

function registerReportBugIpc(ipcMain, service) {
  for (const action of ['prepare', 'copy', 'save', 'submit']) {
    ipcMain.handle(`report-bug:${action}`, (event, input) => service[action](event, input));
  }
}

function createReportBugService({ app, clipboard, dialog, shell, logPath, getWindow, now = () => new Date() }) {
  const root = path.join(app.getPath('temp'), 'stashbase-reports');
  const drafts = new Map();
  const latestRequestByOwner = new Map();
  const observedSenders = new WeakSet();
  cleanupExpiredDrafts(root);
  function expireDrafts() {
    const currentTime = now().getTime();
    let removed = 0;
    const expiredOwners = new Set();
    for (const [id, draft] of drafts) {
      if (currentTime - draft.createdAt <= DRAFT_MAX_AGE_MS) continue;
      drafts.delete(id);
      expiredOwners.add(draft.ownerWebContentsId);
      fs.rmSync(draft.directory, { recursive: true, force: true });
      removed += 1;
    }
    for (const owner of expiredOwners) {
      if (![...drafts.values()].some((draft) => draft.ownerWebContentsId === owner)) {
        const request = latestRequestByOwner.get(owner);
        if (!request?.pending) latestRequestByOwner.delete(owner);
      }
    }
    return removed + cleanupExpiredDrafts(root, currentTime);
  }
  const cleanupTimer = setInterval(expireDrafts, 60 * 60 * 1000);
  cleanupTimer.unref?.();

  function releaseOwner(ownerWebContentsId) {
    latestRequestByOwner.delete(ownerWebContentsId);
    for (const [id, draft] of drafts) {
      if (draft.ownerWebContentsId !== ownerWebContentsId) continue;
      drafts.delete(id);
      fs.rmSync(draft.directory, { recursive: true, force: true });
    }
  }

  async function prepare(event, options = {}) {
    expireDrafts();
    const win = getWindow(event);
    if (!win || win.isDestroyed?.()) throw new Error('A StashBase window is required to prepare a report.');
    const ownerWebContentsId = event?.sender?.id ?? win.webContents?.id ?? null;
    const requestId = typeof options.requestId === 'string' && options.requestId
      ? options.requestId
      : Symbol('report-request');
    latestRequestByOwner.set(ownerWebContentsId, { id: requestId, pending: true });
    if (event?.sender && typeof event.sender.once === 'function' && !observedSenders.has(event.sender)) {
      observedSenders.add(event.sender);
      event.sender.once('destroyed', () => releaseOwner(ownerWebContentsId));
    }
    for (const [draftId, existing] of drafts) {
      if (existing.ownerWebContentsId !== ownerWebContentsId) continue;
      drafts.delete(draftId);
      fs.rmSync(existing.directory, { recursive: true, force: true });
    }
    const id = `${now().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const directory = path.join(root, id);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    let image;
    try {
      image = await win.webContents.capturePage();
    } catch (error) {
      if (latestRequestByOwner.get(ownerWebContentsId)?.id === requestId) {
        latestRequestByOwner.delete(ownerWebContentsId);
      }
      fs.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    const screenshot = image.toPNG();
    if (latestRequestByOwner.get(ownerWebContentsId)?.id !== requestId) {
      fs.rmSync(directory, { recursive: true, force: true });
      throw new Error('This report preparation was superseded by a newer request.');
    }
    const logExcerpt = sanitizeLogExcerpt(readBoundedLog(logPath));
    const diagnostics = {
      version: app.getVersion(), platform: process.platform, release: os.release(), arch: process.arch,
      timestamp: now().toISOString(), packaged: app.isPackaged === true,
    };
    const errorDetails = truncateUtf8(
      redactReportText(options.errorDetails || '', os.homedir(), { redactPaths: true }),
      ERROR_DETAILS_MAX_BYTES,
    );
    const draft = { id, directory, screenshot, logExcerpt, diagnostics, homeDir: os.homedir(), errorDetails, createdAt: now().getTime(), ownerWebContentsId };
    drafts.set(id, draft);
    const currentRequest = latestRequestByOwner.get(ownerWebContentsId);
    if (currentRequest?.id === requestId) currentRequest.pending = false;
    return { id, screenshotDataUrl: `data:image/png;base64,${screenshot.toString('base64')}`, logExcerpt, diagnostics, errorDetails };
  }

  function snapshot(event, id, input = {}) {
    expireDrafts();
    const draft = drafts.get(id);
    if (!draft) throw new Error('This report draft has expired. Please prepare it again.');
    const callerWebContentsId = event?.sender?.id ?? getWindow(event)?.webContents?.id ?? null;
    if (callerWebContentsId !== draft.ownerWebContentsId) {
      throw new Error('This report draft belongs to a different originating window.');
    }
    const details = reportDetails(draft, input);
    return {
      id: draft.id,
      details,
      screenshot: input.includeScreenshot === false ? null : Buffer.from(draft.screenshot),
      logExcerpt: input.includeLogs === false ? '' : draft.logExcerpt,
    };
  }

  function writeHandoffArtifacts(reviewed) {
    const directory = fs.mkdtempSync(path.join(root, `${reviewed.id}-handoff-`));
    const reportPath = path.join(directory, 'report.md');
    fs.writeFileSync(reportPath, `${reviewed.details}\n`, { mode: 0o600 });
    if (reviewed.screenshot) fs.writeFileSync(path.join(directory, 'screenshot.png'), reviewed.screenshot, { mode: 0o600 });
    if (reviewed.logExcerpt) fs.writeFileSync(path.join(directory, 'recent.log'), `${reviewed.logExcerpt}\n`, { mode: 0o600 });
    return reportPath;
  }

  return {
    prepare,
    cleanup: expireDrafts,
    releaseOwner,
    debugState: () => ({ drafts: drafts.size, owners: latestRequestByOwner.size }),
    async copy(_event, input) {
      const { details } = snapshot(_event, input.id, input);
      clipboard.writeText(details);
      return true;
    },
    async save(event, input) {
      const reviewed = snapshot(event, input.id, input);
      const win = getWindow(event);
      const result = await dialog.showSaveDialog(win, { title: 'Save bug report', defaultPath: `stashbase-report-${reviewed.id}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (result.canceled || !result.filePath) return false;
      const base = result.filePath.replace(/\.md$/i, '');
      const companions = [
        reviewed.screenshot && [`${base}-screenshot.png`, reviewed.screenshot],
        reviewed.logExcerpt && [`${base}-recent.log`, Buffer.from(`${reviewed.logExcerpt}\n`)],
      ].filter(Boolean);
      const collision = companions.find(([file]) => fs.existsSync(file));
      if (collision) throw new Error(`A companion report file already exists: ${path.basename(collision[0])}. Choose another report name.`);
      const created = [];
      try {
        for (const [file, contents] of companions) {
          fs.writeFileSync(file, contents, { flag: 'wx', mode: 0o600 });
          created.push(file);
        }
        fs.writeFileSync(result.filePath, `${reviewed.details}\n`, { mode: 0o600 });
      } catch (error) {
        for (const file of created) fs.rmSync(file, { force: true });
        throw error;
      }
      return true;
    },
    async submit(_event, input) {
      const reviewed = snapshot(_event, input.id, input);
      const { details } = reviewed;
      clipboard.writeText(details);
      const url = new URL('https://github.com/liliu-z/stashbase/issues/new');
      url.searchParams.set('template', 'bug_report.yml');
      url.searchParams.set('title', `[Bug]: ${truncateForEncodedQuery((input.happened || '').trim(), 600)}`);
      url.searchParams.set('happened', truncateForEncodedQuery(input.happened?.trim() || 'Not provided.'));
      url.searchParams.set('expected', truncateForEncodedQuery(input.expected?.trim() || 'Not provided.'));
      url.searchParams.set('reproduce', truncateForEncodedQuery(input.steps?.trim() || 'Not provided.'));
      url.searchParams.set('attachments', truncateForEncodedQuery(`Diagnostics:\n${details.match(/## Diagnostics[\s\S]*?(?=\n## |$)/)?.[0] || 'See copied report details.'}\n\nPaste the copied structured report and drag the revealed, reviewed files here.`));
      if (url.toString().length > GITHUB_URL_MAX_LENGTH) {
        throw new Error('The prefilled GitHub report is too long. Shorten the descriptions and try again.');
      }
      const reportPath = writeHandoffArtifacts(reviewed);
      shell.showItemInFolder(reportPath);
      await shell.openExternal(url.toString());
      return { message: 'Details copied. Drag the revealed screenshot and log files into the GitHub issue before submitting.' };
    },
  };
}

module.exports = { DRAFT_MAX_AGE_MS, ERROR_DETAILS_MAX_BYTES, GITHUB_FIELD_MAX_LENGTH, GITHUB_URL_MAX_LENGTH, MAX_LOG_BYTES, MAX_LOG_LINES, cleanupExpiredDrafts, createReportBugService, readBoundedLog, redactReportText, registerReportBugIpc, reportDetails, reportLogPath, sanitizeLogExcerpt, truncateForEncodedQuery, truncateUtf8 };
