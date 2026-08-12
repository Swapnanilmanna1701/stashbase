import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestInfo } from '@playwright/test';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import { AppErrorCollector } from './errors.ts';
import type { AppFixture } from './fixtures.ts';

const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SUPPORT_DIR, '..', '..');
const ELECTRON_ENTRY = path.join(PROJECT_ROOT, 'e2e', 'electron-entry.cjs');

export interface LaunchedApp {
  electron: ElectronApplication;
  page: Page;
  errors: AppErrorCollector;
  close(): Promise<void>;
  relaunch(): Promise<LaunchedApp>;
}

export interface LaunchAppOptions {
  readinessTimeoutMs?: number;
}

function descendantsOf(rootPid: number): number[] {
  if (process.platform === 'win32') return [];
  try {
    const rows = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter(([pid, ppid]) => Number.isInteger(pid) && Number.isInteger(ppid));
    const result: number[] = [];
    const pending = [rootPid];
    while (pending.length) {
      const parent = pending.pop()!;
      for (const [pid, ppid] of rows) {
        if (ppid !== parent || result.includes(pid)) continue;
        result.push(pid);
        pending.push(pid);
      }
    }
    return result.reverse();
  } catch {
    return [];
  }
}

function terminateKnownProcessTree(rootPid: number): void {
  if (!Number.isInteger(rootPid) || rootPid <= 1) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(rootPid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    return;
  }
  for (const pid of [...descendantsOf(rootPid), rootPid]) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

async function quitElectronApplication(
  electronApplication: ElectronApplication,
  page?: Page,
): Promise<void> {
  const closed = electronApplication.waitForEvent('close', { timeout: 15_000 });
  try {
    const windowClosed = page && !page.isClosed()
      ? page.waitForEvent('close', { timeout: 10_000 })
      : Promise.resolve();
    await electronApplication.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.close();
    });
    await windowClosed;
    if (process.platform === 'darwin') {
      // macOS intentionally keeps the app session alive after its final
      // window closes. Quit only after the renderer save handshake completed.
      await electronApplication.evaluate(({ app }) => {
        setTimeout(() => app.quit(), 0);
      });
    }
  } catch (error) {
    // The application can close the evaluation channel before returning from
    // app.quit(). The close event below remains the authoritative lifecycle
    // boundary; rethrow only if the application did not actually close.
    try {
      await closed;
      return;
    } catch {
      throw error;
    }
  }
  await closed;
}

function electronArgs(fixture: AppFixture): string[] {
  const applicationArgs = [ELECTRON_ENTRY, `--port=${fixture.port}`];
  return process.platform === 'linux' ? ['--no-sandbox', ...applicationArgs] : applicationArgs;
}

function serverLogFile(fixture: AppFixture): string {
  return path.join(fixture.home, 'Library', 'Logs', 'StashBase', 'server.log');
}

async function attachText(
  testInfo: TestInfo | undefined,
  name: string,
  body: string,
): Promise<void> {
  if (!testInfo) return;
  await testInfo.attach(name, { body: Buffer.from(body), contentType: 'text/plain' });
}

export async function launchApp(
  fixture: AppFixture,
  testInfo?: TestInfo,
  options: LaunchAppOptions = {},
): Promise<LaunchedApp> {
  const readinessTimeoutMs = options.readinessTimeoutMs ?? 45_000;
  const output: string[] = [];
  let electronApplication: ElectronApplication | undefined;
  try {
    electronApplication = await _electron.launch({
      args: electronArgs(fixture),
      cwd: PROJECT_ROOT,
      env: fixture.env,
      timeout: 45_000,
    });
    const processHandle = electronApplication.process();
    processHandle.stdout?.on('data', (chunk) => output.push(String(chunk)));
    processHandle.stderr?.on('data', (chunk) => output.push(String(chunk)));

    const errors = new AppErrorCollector();
    electronApplication.on('window', (window) => errors.attach(window));
    const page = await electronApplication.firstWindow({ timeout: readinessTimeoutMs });
    errors.attach(page);
    await electronApplication.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    await page.locator('body').waitFor({ state: 'attached', timeout: readinessTimeoutMs });
    await page.waitForFunction(
      () => document.body.dataset.bootSettled === '1',
      undefined,
      { timeout: readinessTimeoutMs },
    );

    let closed = false;
    const session: LaunchedApp = {
      electron: electronApplication,
      page,
      errors,
      async close() {
        if (closed) return;
        closed = true;
        const traceFile = testInfo
          ? testInfo.outputPath(`electron-trace-${Date.now()}.zip`)
          : path.join(fixture.artifacts, `electron-trace-${Date.now()}.zip`);
        try {
          await electronApplication!.context().tracing.stop({ path: traceFile });
          if (testInfo) {
            await testInfo.attach('electron-trace', {
              path: traceFile,
              contentType: 'application/zip',
            });
          }
        } finally {
          await quitElectronApplication(electronApplication!, page);
        }
        await assertPortAvailable(fixture.port);
        const serverLog = serverLogFile(fixture);
        if (fs.existsSync(serverLog)) {
          await attachText(testInfo, 'server-log', fs.readFileSync(serverLog, 'utf8'));
        }
        await attachText(testInfo, 'electron-output', `${output.join('')}\n${errors.format()}`);
      },
      async relaunch() {
        await session.close();
        return launchApp(fixture, testInfo);
      },
    };
    return session;
  } catch (error) {
    if (electronApplication) {
      const rootPid = electronApplication.process().pid;
      try { await quitElectronApplication(electronApplication); } catch {
        if (rootPid !== undefined) terminateKnownProcessTree(rootPid);
      }
    }
    const serverLog = serverLogFile(fixture);
    if (fs.existsSync(serverLog)) {
      await attachText(testInfo, 'server-log', fs.readFileSync(serverLog, 'utf8'));
    }
    await attachText(testInfo, 'electron-output', output.join(''));
    throw error;
  }
}

export function assertPortAvailable(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      reject(new Error(`port ${port} remained occupied after Electron closed`, { cause: error }));
    });
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}
