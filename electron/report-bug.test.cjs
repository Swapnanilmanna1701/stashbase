'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { createReportBugPreloadBridge } = require('./report-bug-bridge.cjs');
const { DRAFT_MAX_AGE_MS, ERROR_DETAILS_MAX_BYTES, GITHUB_FIELD_MAX_LENGTH, GITHUB_URL_MAX_LENGTH, cleanupExpiredDrafts, createReportBugService, readBoundedLog, redactReportText, registerReportBugIpc, reportDetails, reportLogPath, sanitizeLogExcerpt } = require('./report-bug.cjs');

test('report redaction removes common credentials and replaces the home path', () => {
  const source = '/Users/ada/private token=secret-value Authorization: Bearer abcdefghijklmnopqrstuvwxyz ghp_abcdefghijklmnopqrstuvwxyz123456';
  const redacted = redactReportText(source, '/Users/ada');
  assert.equal(redacted.includes('/Users/ada'), false);
  assert.equal(redacted.includes('secret-value'), false);
  assert.equal(redacted.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.match(redacted, /^~\/private/);
});

test('report redaction covers structured secrets and removes source paths from logs', () => {
  const source = [
    '{"token":"secret-value","api_key":"sk-abcdefghijklmnopqrstuvwxyz","Authorization":"Bearer abcdefghijklmnopqrstuvwxyz"}',
    'opened /Users/ada/Notes/private-plan.md',
    String.raw`opened C:\Users\Ada\Notes\private-plan.md`,
  ].join('\n');
  const redacted = redactReportText(source, '/Users/ada', { redactPaths: true });
  assert.doesNotMatch(redacted, /secret-value|sk-abcdefghijklmnopqrstuvwxyz|abcdefghijklmnopqrstuv|private-plan|Notes|Users\\Ada/);
  assert.match(redacted, /"token":"\[REDACTED\]"/);
  assert.match(redacted, /\[REDACTED_PATH\]/);
});

test('log sanitizer fully removes Unicode and punctuation paths plus relative source names', () => {
  const source = [
    '/Users/ada/client#1/private.md',
    '/Users/张三/Notes/private.md',
    "/Users/ada/O'Brien/private.md",
    '/Users/ada/client:archive/private.md',
    'rename: notes/private.md -> archive/新文档.md',
    'derived output private-plan.md failed',
  ].join('\n');
  const redacted = redactReportText(source, '/Users/ada', { redactPaths: true });
  assert.doesNotMatch(redacted, /client|private|张三|Notes|Brien|archive|新文档|\.md/);
  assert.equal(redacted.split('[REDACTED_PATH]').length > 6, true);
});

test('credential sanitizer covers cloud, OAuth, session, cookie, and URL credentials', () => {
  // Assemble AWS-shaped fixtures at runtime so GitHub push protection does not
  // mistake the test data for committed credentials.
  const awsAccessKey = ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join('');
  const awsSecretKey = ['abcdefghijklmnopqrstuvwxyz', '1234567890', 'ABCD'].join('');
  const source = [
    `AWS_ACCESS_KEY_ID=${awsAccessKey}`,
    `AWS_SECRET_ACCESS_KEY=${awsSecretKey}`,
    'client_secret: oauth-secret',
    'access_token=access-secret refresh_token=refresh-secret',
    'session=live-session cookie="sid=private-cookie"',
    'https://alice:password@example.com/callback?access_token=url-secret&safe=yes',
  ].join('\n');
  const redacted = redactReportText(source, '/Users/ada');
  assert.equal(redacted.includes(awsAccessKey), false);
  assert.equal(redacted.includes(awsSecretKey), false);
  assert.doesNotMatch(redacted, /oauth-secret|access-secret|refresh-secret|live-session|private-cookie|alice:password|url-secret/);
  assert.match(redacted, /\[REDACTED\]/);
});

test('credential sanitizer consumes complete quoted values and cookie headers', () => {
  const source = [
    'API_KEY="correct horse battery staple"',
    "client_secret='oauth client private value'",
    'Cookie: sessionid=abc123; csrftoken=def456',
  ].join('\n');
  const redacted = redactReportText(source, '/Users/ada');
  assert.doesNotMatch(redacted, /correct|horse|battery|staple|oauth client|private value|abc123|def456|csrftoken/);
  assert.equal((redacted.match(/\[REDACTED\]/g) || []).length, 3);
});

test('structured log payloads are removed while time, severity, and subsystem remain useful', () => {
  const sanitized = sanitizeLogExcerpt([
    '12:10:11.123 warn  [routes/folders] rename_folder Notes -> Archive',
    '12:10:12.456 error [docx] docx_extract résumé final.docx failed',
  ].join('\n'));
  assert.equal(sanitized, '12:10:11.123 warn  [routes/folders] [details redacted]\n12:10:12.456 error [docx] [details redacted]');
  assert.doesNotMatch(sanitized, /Notes|Archive|résumé|docx_extract/);
});

test('multiline structured log continuations are removed until the next record', () => {
  const sanitized = sanitizeLogExcerpt([
    '12:10:11.123 error [routes/folders] operation failed',
    'Folder Notes could not be renamed',
    'at /Users/ada/Notes/private.md:10:2',
    '12:10:12.456 info  [server] recovered',
    'continued object value with Archive',
  ].join('\n'));
  assert.equal(sanitized, '12:10:11.123 error [routes/folders] [details redacted]\n12:10:12.456 info  [server] [details redacted]');
  assert.doesNotMatch(sanitized, /Notes|private|Archive|continued|operation failed/);
});

test('a bounded tail beginning inside a structured record drops its ambiguous prefix', () => {
  const sanitized = sanitizeLogExcerpt([
    'Folder SecretProject could not be renamed',
    'at hidden continuation data',
    '12:10:12.456 error [routes/folders] next failure',
    'ProjectAlpha continuation',
  ].join('\n'));
  assert.equal(sanitized, '12:10:12.456 error [routes/folders] [details redacted]');
  assert.doesNotMatch(sanitized, /SecretProject|hidden|ProjectAlpha/);
});

test('Windows UNC paths and labeled bare folder values are fully redacted', () => {
  const redacted = redactReportText([
    String.raw`root=\\server\share\SecretFolder`,
    String.raw`folder Notes\SecretFolder`,
    'folder: ProjectAlpha',
    'oldName="Quarterly Plan" newName=Archive',
  ].join('\n'), '/Users/ada', { redactPaths: true });
  assert.doesNotMatch(redacted, /server|share|SecretFolder|Notes|ProjectAlpha|Quarterly|Archive/);
  assert.ok((redacted.match(/\[REDACTED_PATH\]/g) || []).length >= 4);
});

test('log reads are bounded by recent bytes and lines', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'server.log');
  fs.writeFileSync(file, Array.from({ length: 20 }, (_, i) => `line-${i}`).join('\n'));
  assert.equal(readBoundedLog(file, { maxBytes: 1000, maxLines: 3 }), 'line-17\nline-18\nline-19');
  assert.ok(Buffer.byteLength(readBoundedLog(file, { maxBytes: 12, maxLines: 100 })) <= 12);
});

test('expired report directories are removed but current drafts remain', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldDraft = path.join(root, 'old');
  const freshDraft = path.join(root, 'fresh');
  fs.mkdirSync(oldDraft); fs.mkdirSync(freshDraft);
  fs.utimesSync(oldDraft, new Date(0), new Date(0));
  assert.equal(cleanupExpiredDrafts(root, 10_000, 5_000), 1);
  assert.equal(fs.existsSync(oldDraft), false);
  assert.equal(fs.existsSync(freshDraft), true);
});

test('preparation captures only the invoking window and exposes no filesystem paths', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-service-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = path.join(root, 'server.log');
  fs.writeFileSync(log, '12:10:11.123 info  [server] recent safe log');
  let captures = 0;
  let wrongWindowCaptures = 0;
  const invokingWindow = {
    webContents: { id: 17, capturePage: async () => { captures += 1; return { toPNG: () => Buffer.from('window-image') }; } },
    isDestroyed: () => false,
  };
  const otherWindow = { webContents: { id: 18, capturePage: async () => { wrongWindowCaptures += 1; return { toPNG: () => Buffer.from('wrong') }; } } };
  const windows = new Map([[17, invokingWindow], [18, otherWindow]]);
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: true },
    clipboard: { writeText() {} }, dialog: {}, shell: {}, logPath: log,
    getWindow: (event) => windows.get(event.sender.id),
    now: () => new Date('2026-08-12T00:00:00.000Z'),
  });
  const draft = await service.prepare({ sender: { id: 17 } });
  assert.equal(captures, 1);
  assert.equal(wrongWindowCaptures, 0);
  assert.equal(draft.diagnostics.version, '1.2.3');
  assert.equal(draft.logExcerpt, '12:10:11.123 info  [server] [details redacted]');
  assert.equal('directory' in draft, false);
  assert.equal(JSON.stringify(draft).includes(root), false);
});

test('main keeps report collection behind the narrow IPC bridge', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  assert.match(main, /registerReportBugIpc\(ipcMain, reportBug\)/);
  assert.match(main, /app\.getPath\('logs'\)/);
  assert.doesNotMatch(main, /Library['"], ['"]Logs/);
});

test('preload bridge invokes only report channels and delivers native menu opens', async () => {
  const ipc = new EventEmitter();
  const calls = [];
  ipc.invoke = async (channel, input) => { calls.push([channel, input]); return channel; };
  const bridge = createReportBugPreloadBridge(ipc);
  let opens = 0;
  const unsubscribe = bridge.onOpen(() => { opens += 1; });
  ipc.emit('report-bug:open');
  assert.equal(await bridge.prepare({ errorDetails: 'boom' }), 'report-bug:prepare');
  assert.equal(await bridge.submit({ id: 'draft' }), 'report-bug:submit');
  unsubscribe();
  ipc.emit('report-bug:open');
  assert.equal(opens, 1);
  assert.deepEqual(calls, [['report-bug:prepare', { errorDetails: 'boom' }], ['report-bug:submit', { id: 'draft' }]]);
});

test('report log path follows Electron platform ownership without path assumptions', () => {
  assert.equal(reportLogPath({ getPath: () => '/var/log/stashbase' }, 'linux'), '/var/log/stashbase/server.log');
  assert.equal(reportLogPath({ getPath: () => '/Users/ada/Library/Logs/StashBase' }, 'darwin'), '/Users/ada/Library/Logs/StashBase/server.log');
  assert.equal(reportLogPath({ getPath: () => String.raw`C:\Users\Ada\AppData\Roaming\StashBase\logs` }, 'win32'), String.raw`C:\Users\Ada\AppData\Roaming\StashBase\logs\server.log`);
});

test('registered IPC handlers invoke the service and preserve the sender identity', async () => {
  const handlers = new Map();
  const calls = [];
  const service = Object.fromEntries(['prepare', 'copy', 'save', 'submit'].map((action) => [action, async (event, input) => { calls.push([action, event.sender.id, input]); return action; }]));
  registerReportBugIpc({ handle: (channel, handler) => handlers.set(channel, handler) }, service);
  const event = { sender: { id: 41 } };
  assert.equal(await handlers.get('report-bug:prepare')(event, { errorDetails: 'boom' }), 'prepare');
  assert.equal(await handlers.get('report-bug:submit')(event, { id: 'draft' }), 'submit');
  assert.deepEqual(calls, [['prepare', 41, { errorDetails: 'boom' }], ['submit', 41, { id: 'draft' }]]);
});

test('draft expiry evicts memory and disk as one lifecycle and rejects stale IDs', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-expiry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let clock = new Date('2026-08-12T00:00:00.000Z');
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: {}, shell: {}, logPath: path.join(root, 'missing.log'),
    getWindow: () => ({ webContents: { capturePage: async () => ({ toPNG: () => Buffer.from('image') }) } }),
    now: () => clock,
  });
  const draft = await service.prepare({});
  const directory = path.join(root, 'stashbase-reports', draft.id);
  assert.equal(fs.existsSync(directory), true);
  clock = new Date(clock.getTime() + DRAFT_MAX_AGE_MS + 1);
  assert.equal(service.cleanup(), 1);
  assert.equal(fs.existsSync(directory), false);
  await assert.rejects(service.copy({}, { id: draft.id }), /draft has expired/i);
});

test('copy, save, and submit use structured details and honor later attachment exclusions', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-actions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = path.join(root, 'server.log');
  const savePath = path.join(root, 'saved.md');
  fs.writeFileSync(log, '12:10:11.123 error [server] token="secret-value"\nrequest failed safely');
  const copied = [];
  const opened = [];
  const revealed = [];
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: true },
    clipboard: { writeText: (value) => copied.push(value) },
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: savePath }) },
    shell: { openExternal: async (url) => opened.push(url), showItemInFolder: (file) => revealed.push(file) },
    logPath: log,
    getWindow: () => ({ webContents: { capturePage: async () => ({ toPNG: () => Buffer.from('image') }) } }),
    now: () => new Date('2026-08-12T00:00:00.000Z'),
  });
  const draft = await service.prepare({});
  const included = { id: draft.id, happened: 'It froze', expected: 'It should save', steps: 'Open a note', includeScreenshot: true, includeLogs: true, includeErrorDetails: false };
  assert.equal(await service.copy({}, included), true);
  assert.match(copied.at(-1), /## What happened\nIt froze[\s\S]*## Diagnostics[\s\S]*StashBase: 1\.2\.3/);
  assert.doesNotMatch(copied.at(-1), /secret-value/);
  assert.equal(await service.save({}, included), true);
  assert.equal(fs.existsSync(savePath), true);
  assert.equal(fs.existsSync(path.join(root, 'saved-screenshot.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'saved-recent.log')), true);

  const excluded = { ...included, includeScreenshot: false, includeLogs: false };
  await service.submit({}, excluded);
  const directory = path.join(root, 'stashbase-reports', draft.id);
  assert.equal(fs.existsSync(path.join(directory, 'screenshot.png')), false);
  assert.equal(fs.existsSync(path.join(directory, 'recent.log')), false);
  const form = new URL(opened[0]);
  assert.equal(form.searchParams.get('happened'), 'It froze');
  assert.equal(form.searchParams.get('expected'), 'It should save');
  assert.equal(form.searchParams.get('reproduce'), 'Open a note');
  assert.match(revealed[0], /report\.md$/);
});

test('Save uses an immutable reviewed snapshot while preparation replaces the live draft', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-save-race-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const savePath = path.join(root, 'saved.md');
  let acceptSave;
  const saveDialog = new Promise((resolve) => { acceptSave = resolve; });
  const window = { webContents: { id: 31, capturePage: async () => ({ toPNG: () => Buffer.from('reviewed-image') }) } };
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: { showSaveDialog: () => saveDialog }, shell: {},
    logPath: path.join(root, 'missing.log'), getWindow: () => window,
  });
  const event = { sender: { id: 31 } };
  const draft = await service.prepare(event);
  const saving = service.save(event, { id: draft.id, includeScreenshot: true, includeLogs: false });
  await service.prepare(event, { requestId: 'replacement' });
  acceptSave({ canceled: false, filePath: savePath });
  assert.equal(await saving, true);
  assert.equal(fs.readFileSync(path.join(root, 'saved-screenshot.png'), 'utf8'), 'reviewed-image');
});

test('Save refuses to overwrite an existing companion attachment', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-save-collision-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const savePath = path.join(root, 'saved.md');
  const companion = path.join(root, 'saved-screenshot.png');
  fs.writeFileSync(companion, 'unrelated');
  const window = { webContents: { id: 32, capturePage: async () => ({ toPNG: () => Buffer.from('report-image') }) } };
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: { showSaveDialog: async () => ({ canceled: false, filePath: savePath }) }, shell: {},
    logPath: path.join(root, 'missing.log'), getWindow: () => window,
  });
  const draft = await service.prepare({ sender: { id: 32 } });
  await assert.rejects(service.save({ sender: { id: 32 } }, { id: draft.id, includeScreenshot: true, includeLogs: false }), /already exists/i);
  assert.equal(fs.readFileSync(companion, 'utf8'), 'unrelated');
  assert.equal(fs.existsSync(savePath), false);
});

test('renderer error details are a separately reviewed and excludable report artifact', () => {
  const draft = {
    diagnostics: { version: '1.2.3', platform: 'darwin', release: '25.0', arch: 'arm64', packaged: true, timestamp: '2026-08-12T00:00:00.000Z' },
    logExcerpt: '', homeDir: '/Users/ada', errorDetails: '/Users/ada/Notes/private.md failed',
  };
  assert.doesNotMatch(reportDetails(draft, { includeErrorDetails: false }), /Renderer error|private\.md/);
  const included = reportDetails(draft, { includeErrorDetails: true });
  assert.match(included, /## Renderer error/);
  assert.doesNotMatch(included, /private\.md|\/Users\/ada/);
});

test('draft actions reject a renderer other than the originating window', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-owner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const window = { webContents: { id: 7, capturePage: async () => ({ toPNG: () => Buffer.from('image') }) } };
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: {}, shell: {}, logPath: path.join(root, 'missing.log'),
    getWindow: () => window,
  });
  const draft = await service.prepare({ sender: { id: 7 } });
  await assert.rejects(service.copy({ sender: { id: 8 } }, { id: draft.id }), /originating window/i);
  assert.equal(await service.copy({ sender: { id: 7 } }, { id: draft.id }), true);
});

test('a newer preparation evicts completed drafts and prevents slower captures from becoming live', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-supersede-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const captures = [];
  const window = { webContents: { id: 12, capturePage: () => new Promise((resolve) => captures.push(resolve)) } };
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: {}, shell: {}, logPath: path.join(root, 'missing.log'), getWindow: () => window,
  });
  const event = { sender: { id: 12 } };
  const slow = service.prepare(event, { requestId: 'menu-1' });
  const newer = service.prepare(event, { requestId: 'error-2', errorDetails: 'boom' });
  captures[1]({ toPNG: () => Buffer.from('new') });
  const current = await newer;
  captures[0]({ toPNG: () => Buffer.from('old') });
  await assert.rejects(slow, /superseded/i);
  assert.equal(await service.copy(event, { id: current.id }), true);
  const directories = fs.readdirSync(path.join(root, 'stashbase-reports'));
  assert.deepEqual(directories, [current.id]);

  const thirdPromise = service.prepare(event, { requestId: 'menu-3' });
  captures[2]({ toPNG: () => Buffer.from('third') });
  await thirdPromise;
  await assert.rejects(service.copy(event, { id: current.id }), /expired/i);
});

test('renderer error details are byte-bounded before storage and IPC', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-error-bound-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sender = { id: 21 };
  const window = { webContents: { id: 21, capturePage: async () => ({ toPNG: () => Buffer.from('image') }) } };
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: {}, shell: {}, logPath: path.join(root, 'missing.log'), getWindow: () => window,
  });
  const draft = await service.prepare({ sender }, { errorDetails: '🧪'.repeat(ERROR_DETAILS_MAX_BYTES) });
  assert.ok(Buffer.byteLength(draft.errorDetails, 'utf8') <= ERROR_DETAILS_MAX_BYTES);
  assert.equal(draft.errorDetails.endsWith('\uFFFD'), false);
});

test('window destruction releases request bookkeeping and every owned draft', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-window-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sender = new EventEmitter();
  sender.id = 22;
  const window = { webContents: { id: 22, capturePage: async () => ({ toPNG: () => Buffer.from('image') }) } };
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: {}, shell: {}, logPath: path.join(root, 'missing.log'), getWindow: () => window,
  });
  const draft = await service.prepare({ sender }, { requestId: 'window-request' });
  sender.emit('destroyed');
  await assert.rejects(service.copy({ sender }, { id: draft.id }), /expired/i);
  assert.equal(service.debugState().owners, 0);
  assert.equal(service.debugState().drafts, 0);
});

test('GitHub handoff bounds every prefilled field and the complete URL', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-report-url-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let opened = '';
  const window = { webContents: { id: 9, capturePage: async () => ({ toPNG: () => Buffer.from('image') }) } };
  const service = createReportBugService({
    app: { getPath: () => root, getVersion: () => '1.2.3', isPackaged: false },
    clipboard: { writeText() {} }, dialog: {}, shell: { openExternal: async (url) => { opened = url; }, showItemInFolder() {} },
    logPath: path.join(root, 'missing.log'), getWindow: () => window,
  });
  const event = { sender: { id: 9 } };
  const draft = await service.prepare(event);
  const huge = '🧪'.repeat(GITHUB_FIELD_MAX_LENGTH);
  await service.submit(event, { id: draft.id, happened: huge, expected: huge, steps: huge, includeScreenshot: false, includeLogs: false });
  const url = new URL(opened);
  for (const field of ['happened', 'expected', 'reproduce']) {
    assert.ok(url.searchParams.get(field).length > 0);
    assert.ok(encodeURIComponent(url.searchParams.get(field)).length <= GITHUB_FIELD_MAX_LENGTH);
  }
  assert.ok(opened.length <= GITHUB_URL_MAX_LENGTH);
});
