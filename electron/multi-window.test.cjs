'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  terminateChildProcessTree,
  waitForChildExit,
} = require('./smoke-process.cjs');
const {
  WINDOW_ID_ARG_PREFIX,
  buildElectronSmokeArgs,
  createApplicationMenuTemplate,
  createRendererFlushCoordinator,
  createSingleFlight,
  createWindowRegistry,
  focusWindow,
  openOrFocusFolder,
  releaseWindowContextWithRetry,
  shouldQuitAfterLastWindow,
  windowLifecycleShortcutAction,
  windowIdFromArgv,
} = require('./multi-window.cjs');

test('smoke runner terminates and rejects a hung Electron child', async () => {
  const child = new EventEmitter();
  child.pid = 43123;
  child.exitCode = null;
  child.signalCode = null;
  let terminated = 0;

  await assert.rejects(
    waitForChildExit(child, {
      launch: 'layout',
      timeoutMs: 5,
      terminate: () => { terminated += 1; },
    }),
    /Electron smoke launch layout timed out after 5ms/,
  );
  assert.equal(terminated, 1);
});

test('smoke runner accepts a clean child exit without terminating it', async () => {
  const child = new EventEmitter();
  child.pid = 43124;
  child.exitCode = null;
  child.signalCode = null;
  let terminated = 0;

  const completed = waitForChildExit(child, {
    launch: 1,
    timeoutMs: 1000,
    terminate: () => { terminated += 1; },
  });
  child.emit('exit', 0, null);
  await completed;
  assert.equal(terminated, 0);
});

test('POSIX smoke timeout terminates the isolated Electron process group', async () => {
  const child = new EventEmitter();
  child.pid = 43125;
  child.exitCode = null;
  child.signalCode = null;
  const kills = [];

  await terminateChildProcessTree(child, 'linux', {
    killProcess: (pid, signal) => {
      kills.push([pid, signal]);
      child.exitCode = 1;
    },
  });

  assert.deepEqual(kills, [[-43125, 'SIGKILL']]);
});

test('Electron smoke disables Chromium sandbox only on Linux CI hosts', () => {
  assert.deepEqual(
    buildElectronSmokeArgs('linux', '/repo/electron/smoke.cjs', 43123),
    ['--no-sandbox', '/repo/electron/smoke.cjs', '--port=43123'],
  );
  assert.deepEqual(
    buildElectronSmokeArgs('darwin', '/repo/electron/smoke.cjs', 43123),
    ['/repo/electron/smoke.cjs', '--port=43123'],
  );
  assert.deepEqual(
    buildElectronSmokeArgs('win32', 'C:\\repo\\electron\\smoke.cjs', 43123),
    ['C:\\repo\\electron\\smoke.cjs', '--port=43123'],
  );
});

test('application menu exposes VS Code window commands on Windows and Linux', () => {
  let opened = 0;
  let closed = 0;
  const template = createApplicationMenuTemplate({
    platform: 'win32',
    onNewWindow: () => { opened += 1; },
    onCloseWindow: () => { closed += 1; },
  });
  const fileMenu = template.find((item) => item.label === 'File');
  const newWindow = fileMenu.submenu[0];

  assert.equal(newWindow.label, 'New Window');
  assert.equal(newWindow.accelerator, 'CommandOrControl+Shift+N');
  newWindow.click();
  assert.equal(opened, 1);
  const closeWindow = fileMenu.submenu.find((item) => item.label === 'Close Window');
  assert.ok(closeWindow);
  assert.equal(closeWindow.role, undefined);
  assert.equal(closeWindow.accelerator, 'Alt+F4');
  closeWindow.click();
  assert.equal(closed, 1);
  assert.equal(fileMenu.submenu.at(-1).role, 'quit');

  const linuxTemplate = createApplicationMenuTemplate({
    platform: 'linux',
    onNewWindow: () => {},
    onCloseWindow: () => {},
  });
  const linuxCloseWindow = linuxTemplate
    .find((item) => item.label === 'File')
    .submenu.find((item) => item.label === 'Close Window');
  assert.equal(linuxCloseWindow.accelerator, 'Alt+F4');
});

test('macOS application menu keeps Cmd+W for tabs and uses Cmd+Shift+W for windows', () => {
  const template = createApplicationMenuTemplate({
    platform: 'darwin',
    onNewWindow: () => {},
    onCloseWindow: () => {},
  });
  assert.equal(template[0].role, 'appMenu');
  const closeWindow = template.find((item) => item.label === 'File').submenu.at(-1);
  assert.equal(closeWindow.label, 'Close Window');
  assert.equal(closeWindow.role, undefined);
  assert.equal(closeWindow.accelerator, 'Command+Shift+W');
});

test('Help menu opens the shared links and is the last menu on both platforms', () => {
  const links = require('../shared/links.json');
  for (const platform of ['darwin', 'win32', 'linux']) {
    const opened = [];
    let reportRequests = 0;
    const template = createApplicationMenuTemplate({
      platform,
      onNewWindow: () => {},
      onCloseWindow: () => {},
      onOpenExternal: (url) => opened.push(url),
      onReportBug: () => { reportRequests += 1; },
    });
    // `role: 'help'` is what makes macOS place it last and attach the
    // system search field; a plain `label: 'Help'` silently loses both.
    const help = template.at(-1);
    assert.equal(help.role, 'help', `${platform}: Help must be the final menu`);

    const reportBug = help.submenu.find((entry) => entry.label === 'Report Bug…');
    assert.ok(reportBug, `${platform}: Help is missing Report Bug…`);
    reportBug.click();
    assert.equal(reportRequests, 1);

    for (const [label, expected] of [
      ['StashBase Website', links.website],
      ['Community Discord', links.discord],
    ]) {
      const item = help.submenu.find((entry) => entry.label === label);
      assert.ok(item, `${platform}: Help is missing ${label}`);
      item.click();
      assert.equal(opened.at(-1), expected);
    }
    // Hard-coding a URL here would let the menu and the renderer's Discord
    // button drift to different invites — the reason links.json exists.
    assert.deepEqual(opened, [links.website, links.discord]);
  }
});

test('window lifecycle input follows the platform menu mapping without stealing tab chords', () => {
  const ctrlShiftN = {
    type: 'keyDown',
    key: 'n',
    control: true,
    meta: false,
    shift: true,
    alt: false,
  };
  const ctrlShiftW = {
    type: 'keyDown',
    key: 'w',
    control: true,
    meta: false,
    shift: true,
    alt: false,
  };

  assert.equal(windowLifecycleShortcutAction(ctrlShiftN, 'win32'), 'new-window');
  assert.equal(windowLifecycleShortcutAction(ctrlShiftN, 'linux'), 'new-window');
  assert.equal(
    windowLifecycleShortcutAction({ ...ctrlShiftN, control: false, meta: true }, 'darwin'),
    'new-window',
  );
  assert.equal(windowLifecycleShortcutAction(ctrlShiftW, 'win32'), 'close-window');
  assert.equal(windowLifecycleShortcutAction(ctrlShiftW, 'linux'), 'close-window');
  assert.equal(
    windowLifecycleShortcutAction({ ...ctrlShiftW, control: false, meta: true }, 'darwin'),
    'close-window',
  );
  assert.equal(
    windowLifecycleShortcutAction({
      type: 'keyDown',
      key: 'F4',
      control: false,
      meta: false,
      shift: false,
      alt: true,
    }, 'win32'),
    'close-window',
  );
  assert.equal(
    windowLifecycleShortcutAction({ ...ctrlShiftW, shift: false }, 'win32'),
    null,
  );
  assert.equal(
    windowLifecycleShortcutAction({ ...ctrlShiftW, type: 'keyUp' }, 'win32'),
    null,
  );
  assert.equal(
    windowLifecycleShortcutAction({ ...ctrlShiftW, alt: true }, 'linux'),
    null,
  );
  assert.equal(
    windowLifecycleShortcutAction({ ...ctrlShiftW, isAutoRepeat: true }, 'linux'),
    null,
  );
});

test('last-window behavior follows each desktop platform convention', () => {
  assert.equal(shouldQuitAfterLastWindow('darwin'), false);
  assert.equal(shouldQuitAfterLastWindow('win32'), true);
  assert.equal(shouldQuitAfterLastWindow('linux'), true);
});

test('folder registry finds an existing context, excludes the sender, and retires closed windows', () => {
  const registry = createWindowRegistry({ platform: 'win32' });
  const first = { name: 'first' };
  const second = { name: 'second' };
  registry.add('window-1', first);
  registry.add('window-2', second);
  registry.setFolder('window-1', 'C:\\Users\\Ada\\Notes');

  assert.equal(registry.findByFolder('c:/users/ada/notes'), first);
  assert.equal(registry.findByFolder('C:\\Users\\Ada\\Notes', { excludeWindowId: 'window-1' }), null);

  registry.remove('window-1');
  assert.equal(registry.findByFolder('C:\\Users\\Ada\\Notes'), null);
});

test('focusing an existing folder window restores it before bringing it forward', () => {
  const calls = [];
  const win = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };

  assert.equal(focusWindow(win), true);
  assert.deepEqual(calls, ['restore', 'show', 'focus']);
});

test('folder action follows the user flow: focus another matching window or open a new one', async () => {
  const registry = createWindowRegistry({ platform: 'linux' });
  const notes = {
    isDestroyed: () => false,
    isMinimized: () => false,
    showCalled: 0,
    focusCalled: 0,
    show() { this.showCalled += 1; },
    focus() { this.focusCalled += 1; },
  };
  const research = { name: 'research' };
  registry.add('window-notes', notes, '/work/notes');
  registry.add('window-research', research, '/work/research');
  const created = [];

  const focused = await openOrFocusFolder({
    registry,
    folder: '/work/notes',
    senderWindow: research,
    createWindow: async (folder) => { created.push(folder); return { folder }; },
  });
  assert.equal(focused.action, 'focused');
  assert.equal(notes.showCalled, 1);
  assert.equal(notes.focusCalled, 1);
  assert.deepEqual(created, []);

  const opened = await openOrFocusFolder({
    registry,
    folder: '/work/notes',
    senderWindow: notes,
    createWindow: async (folder) => {
      created.push(folder);
      return { folder };
    },
  });
  assert.equal(opened.action, 'opened');
  assert.deepEqual(created, ['/work/notes']);
});

test('window context cleanup retries transient transport failures', async () => {
  const results = [
    { reachable: false, statusCode: 0 },
    { reachable: true, statusCode: 503 },
    { reachable: true, statusCode: 200 },
  ];
  let calls = 0;
  const result = await releaseWindowContextWithRetry(
    async () => {
      calls += 1;
      return results.shift();
    },
    { delays: [0, 0], sleep: async () => {} },
  );

  assert.equal(result.ok, true);
  assert.equal(calls, 3);
});

test('single-flight startup coalesces simultaneous initial-window requests', async () => {
  let starts = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const flight = createSingleFlight(async () => {
    starts += 1;
    await gate;
    return { id: starts };
  });

  const first = flight.run();
  const second = flight.run();
  assert.equal(starts, 1);
  release();
  assert.equal(await first, await second);

  await flight.run();
  assert.equal(starts, 2);
});

test('renderer flush coordinator waits for the matching save acknowledgement', async () => {
  const sent = [];
  const coordinator = createRendererFlushCoordinator({
    createRequestId: () => 'request-1',
    timeoutMs: 1000,
  });
  const win = {
    isDestroyed: () => false,
    webContents: {
      id: 41,
      isDestroyed: () => false,
      send: (...args) => sent.push(args),
    },
  };

  const pending = coordinator.request(win, 'window-close');
  assert.deepEqual(sent, [[
    'window:prepare-context-release',
    { requestId: 'request-1', reason: 'window-close' },
  ]]);
  assert.equal(coordinator.handleResponse(99, { requestId: 'request-1', ok: true }), false);
  assert.equal(coordinator.handleResponse(41, { requestId: 'wrong', ok: true }), false);
  assert.equal(coordinator.handleResponse(41, { requestId: 'request-1', ok: true }), true);
  assert.equal(await pending, true);
});

test('preload reads and bounds the main-process window identity', () => {
  assert.equal(
    windowIdFromArgv(['electron', `${WINDOW_ID_ARG_PREFIX}window-123`]),
    'window-123',
  );
  assert.equal(windowIdFromArgv(['electron']), null);
  assert.equal(
    windowIdFromArgv([`${WINDOW_ID_ARG_PREFIX}${'x'.repeat(200)}`]).length,
    128,
  );
});
