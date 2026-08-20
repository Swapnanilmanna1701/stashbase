/**
 * On-demand installation coordinator for application-scoped Agent runtimes.
 *
 * The coordinator is intentionally dependency-injected so the New Chat
 * bootstrap state machine can be tested without downloading a 300 MB binary,
 * touching provider credentials, or rewriting a real MCP config.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  consumeAgentSetupFailure,
  managedAgentExecutable,
  managedAgentRuntimeRoot,
  type ManagedAgentId,
} from './agent-runtime-paths.ts';
import { ensureAgentMcp } from './agent-mcp.ts';
import {
  agentCliEnv,
  agentCliNeedsShell,
  commandDir,
  resolveAgentCli,
  resolveAgentCliWithLoginShell,
} from './agent-cli.ts';
import { terminateExtractorTree as terminateInstallerTree } from './extractor-process.ts';
import type {
  AgentBootstrapFailureCode,
  AgentBootstrapFailureStage,
  AgentBootstrapManualRecovery,
  AgentBootstrapStatus,
} from '../shared/agent-runtime.ts';

export type {
  AgentBootstrapFailure,
  AgentBootstrapFailureCode,
  AgentBootstrapFailureStage,
  AgentBootstrapManualRecovery,
  AgentBootstrapPhase,
  AgentBootstrapStatus,
} from '../shared/agent-runtime.ts';

type ProgressUpdate = Pick<AgentBootstrapStatus, 'progress' | 'message'>;

export interface AgentBootstrapDependencies {
  resolveExecutable(id: ManagedAgentId, options?: { probeLoginShell?: boolean }): string | null;
  installRuntime(id: ManagedAgentId, update: (next: ProgressUpdate) => void, signal: AbortSignal): Promise<void>;
  isAuthenticated(id: ManagedAgentId, executable: string): boolean;
  login(id: ManagedAgentId, executable: string, signal: AbortSignal): Promise<void>;
  configureMcp(id: ManagedAgentId): void;
  consumeFailure(stage: 'installation' | 'authentication' | 'mcp'): boolean;
}

const IDLE_STATUS: AgentBootstrapStatus = { phase: 'idle' };

export class AgentBootstrapCoordinator {
  private readonly statuses = new Map<ManagedAgentId, AgentBootstrapStatus>();
  private readonly controllers = new Map<ManagedAgentId, AbortController>();
  private readonly runs = new Map<ManagedAgentId, Promise<void>>();

  constructor(private readonly dependencies: AgentBootstrapDependencies) {}

  status(id: ManagedAgentId): AgentBootstrapStatus {
    return this.statuses.get(id) ?? IDLE_STATUS;
  }

  begin(id: ManagedAgentId): AgentBootstrapStatus {
    if (this.runs.has(id)) return this.status(id);
    let executable: string | null;
    try {
      executable = this.dependencies.resolveExecutable(id, { probeLoginShell: true });
    } catch (error) {
      this.fail(id, 'discovery', 'operation-failed', error);
      return this.status(id);
    }
    if (executable) {
      this.prepare(id, executable);
      return this.status(id);
    }

    if (this.dependencies.consumeFailure('installation')) {
      this.fail(id, 'installation', 'simulated', new Error('Simulated Agent installation failure.'));
      return this.status(id);
    }

    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.statuses.set(id, { phase: 'installing', progress: 0, message: `Preparing ${agentLabel(id)}…` });
    const run = (async () => {
      // Yield once so `runs` owns the promise before even a simulated or
      // synchronous installer failure reaches the cleanup block.
      await Promise.resolve();
      try {
        await this.dependencies.installRuntime(id, (next) => {
          this.statuses.set(id, { phase: 'installing', ...next });
        }, controller.signal);
      } catch (error) {
        this.fail(id, 'installation', 'operation-failed', error, 'install-command');
        return;
      }
      let installedExecutable: string | null;
      try {
        installedExecutable = this.dependencies.resolveExecutable(id);
      } catch (error) {
        this.fail(id, 'installation', 'operation-failed', error, 'install-command');
        return;
      }
      if (!installedExecutable) {
        this.fail(
          id,
          'installation',
          'runtime-unavailable',
          new Error(`${agentLabel(id)} installation finished without a usable executable.`),
          'install-command',
        );
        return;
      }
      this.statuses.set(id, { phase: 'configuring', progress: 1, message: 'Connecting StashBase MCP…' });
      this.prepare(id, installedExecutable);
    })().finally(() => {
      this.controllers.delete(id);
      this.runs.delete(id);
    });
    this.runs.set(id, run);
    return this.status(id);
  }

  /** Start the provider-owned browser login with the exact executable that
   * discovery selected. Credentials remain in Codex's normal account home;
   * StashBase owns only the child-process lifecycle and readiness state. */
  login(id: ManagedAgentId): AgentBootstrapStatus {
    if (this.runs.has(id)) return this.status(id);
    let executable: string | null;
    try {
      executable = this.dependencies.resolveExecutable(id, { probeLoginShell: true });
    } catch (error) {
      this.fail(id, 'discovery', 'operation-failed', error);
      return this.status(id);
    }
    if (!executable) {
      this.fail(id, 'discovery', 'runtime-unavailable', new Error(`${agentLabel(id)} is not installed.`));
      return this.status(id);
    }
    if (id !== 'codex') {
      this.fail(id, 'authentication', 'operation-failed', new Error('In-app login is not supported for this Agent.'));
      return this.status(id);
    }

    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.statuses.set(id, {
      phase: 'authenticating',
      message: 'Finish signing in to Codex in your browser…',
    });
    const run = this.dependencies.login(id, executable, controller.signal).then(() => {
      // A completed login is verified for real; the development signed-out
      // simulation targets only the readiness gate, not the login result.
      if (!this.checkAuthentication(id, executable, false)) return;
      this.statuses.set(id, { phase: 'configuring', progress: 1, message: 'Connecting StashBase MCP…' });
      this.configure(id);
    }).catch((error) => {
      this.fail(id, 'authentication', 'operation-failed', error);
    }).finally(() => {
      this.controllers.delete(id);
      this.runs.delete(id);
    });
    this.runs.set(id, run);
    return this.status(id);
  }

  private prepare(id: ManagedAgentId, executable: string, allowSimulation = true): void {
    if (!this.checkAuthentication(id, executable, allowSimulation)) return;
    this.configure(id, allowSimulation);
  }

  private checkAuthentication(id: ManagedAgentId, executable: string, allowSimulation = true): boolean {
    // Only Codex has a provider sign-in gate; the simulation is scoped the
    // same way so it cannot arm a login surface Claude does not have.
    if (allowSimulation && id === 'codex' && this.dependencies.consumeFailure('authentication')) {
      this.fail(
        id,
        'authentication',
        'authentication-required',
        new Error('Simulated signed-out Codex runtime.'),
      );
      return false;
    }
    try {
      if (this.dependencies.isAuthenticated(id, executable)) return true;
      this.fail(
        id,
        'authentication',
        'authentication-required',
        new Error(`${agentLabel(id)} is installed, but it is not signed in.`),
      );
    } catch (error) {
      this.fail(id, 'authentication', 'authentication-check-failed', error);
    }
    return false;
  }

  private configure(id: ManagedAgentId, allowSimulation = true): void {
    if (allowSimulation && this.dependencies.consumeFailure('mcp')) {
      this.fail(id, 'mcp', 'simulated', new Error('Simulated MCP configuration failure.'));
      return;
    }
    try {
      this.dependencies.configureMcp(id);
      this.statuses.set(id, { phase: 'ready', progress: 1, message: `${agentLabel(id)} is ready.` });
    } catch (error) {
      this.fail(id, 'mcp', 'operation-failed', error, 'mcp-settings');
    }
  }

  /** App startup may check authentication and repair MCP for runtimes it can
   * already discover, but it must never turn discovery into an implicit
   * download or login. The first post-bind pass skips login-shell probing; a
   * deferred pass repeats it WITH the probe (see
   * `connectInstalledAgentMcpAfterBoot`), so a system runtime that only a
   * login shell can resolve still auto-connects without waiting for the
   * first New Chat. */
  connectIfInstalled(id: ManagedAgentId, options?: { probeLoginShell?: boolean }): AgentBootstrapStatus {
    if (this.runs.has(id)) return this.status(id);
    let executable: string | null;
    try {
      executable = this.dependencies.resolveExecutable(id, options);
    } catch (error) {
      this.fail(id, 'discovery', 'operation-failed', error);
      return this.status(id);
    }
    if (!executable) return this.status(id);
    // Startup repair is background maintenance, not the explicit setup action
    // targeted by the development `nextFailure` control.
    this.prepare(id, executable, false);
    return this.status(id);
  }

  async reset(id: ManagedAgentId): Promise<void> {
    this.controllers.get(id)?.abort();
    await this.runs.get(id);
    this.statuses.delete(id);
  }

  async wait(id: ManagedAgentId): Promise<AgentBootstrapStatus> {
    await this.runs.get(id);
    return this.status(id);
  }

  async cancelAll(): Promise<ManagedAgentId[]> {
    const ids = [...this.runs.keys()];
    for (const id of ids) this.controllers.get(id)?.abort();
    await Promise.allSettled(ids.map((id) => this.runs.get(id)));
    return ids;
  }

  private fail(
    id: ManagedAgentId,
    stage: AgentBootstrapFailureStage,
    code: AgentBootstrapFailureCode,
    error: unknown,
    manualRecovery?: AgentBootstrapManualRecovery,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.statuses.set(id, {
      phase: 'failed',
      failure: {
        stage,
        code,
        message: message.slice(0, 1000),
        retryable: true,
        manualRecovery,
      },
    });
  }
}

function agentLabel(id: ManagedAgentId): string {
  return id === 'codex' ? 'Codex' : 'Claude Code';
}

function resolveManagedOrSystemExecutable(
  id: ManagedAgentId,
  options?: { probeLoginShell?: boolean },
): string | null {
  const resolver = options?.probeLoginShell ? resolveAgentCliWithLoginShell : resolveAgentCli;
  return resolver(id === 'codex'
    ? { name: 'codex', envNames: ['STASHBASE_CODEX_BIN', 'CODEX_CLI_BIN', 'CODEX_CLI_PATH'], logLabel: 'Codex' }
    : { name: 'claude', envNames: ['STASHBASE_CLAUDE_BIN', 'CLAUDE_CODE_BIN'], logLabel: 'Claude Code' });
}

/** Claude reports authentication through its native SDK connection. Codex
 * exposes a cheap, side-effect-free status command, so preparation can stop
 * before opening an app-server that cannot serve a turn. */
export function agentIsAuthenticated(id: ManagedAgentId, executable: string): boolean {
  if (id !== 'codex') return true;
  const timeoutMs = 10_000;
  const result = spawnSync(executable, ['login', 'status'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    shell: agentCliNeedsShell(executable),
    env: agentCliEnv({}, [commandDir(executable)]),
  });
  const output = [result.stdout, result.stderr]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-800);
  if (result.status === 0) return true;
  if (result.status === 1 && /not logged in/i.test(output)) return false;
  const nativeError = result.error as NodeJS.ErrnoException | undefined;
  let detail: string;
  if (nativeError?.code === 'ETIMEDOUT') detail = `timed out after ${timeoutMs}ms`;
  else if (nativeError) detail = `could not start: ${nativeError.message}`;
  else if (result.status !== null) detail = `exited with code ${result.status}`;
  else if (result.signal) detail = `terminated by ${result.signal}`;
  else detail = 'returned no exit status';
  throw new Error(`Could not check Codex sign-in (${detail}${output ? `: ${output}` : ''}).`);
}

const CODEX_LOGIN_TIMEOUT_MS = 10 * 60_000;

/** Run Codex's own browser-based login. The selected CLI opens the provider
 * page and writes credentials to its normal home; no token passes through
 * StashBase. */
export async function loginToAgent(
  id: ManagedAgentId,
  executable: string,
  signal: AbortSignal,
): Promise<void> {
  if (id !== 'codex') throw new Error('In-app login is available only for Codex.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['login'], {
      env: agentCliEnv({}, [commandDir(executable)]),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: agentCliNeedsShell(executable),
    });
    let output = '';
    let settled = false;
    let timedOut = false;
    const append = (chunk: Buffer | string) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => terminateInstallerTree(child);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateInstallerTree(child);
    }, CODEX_LOGIN_TIMEOUT_MS);
    timeout.unref?.();
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      const detail = output.replace(/\s+/g, ' ').trim().slice(-800);
      if (signal.aborted) finish(new Error('Codex sign-in was cancelled.'));
      else if (code === 0) finish();
      else if (timedOut) finish(new Error('Codex sign-in timed out after 10 minutes.'));
      else finish(new Error(detail || `Codex sign-in exited with code ${code ?? 'unknown'}.`));
    });
  });
}

export const agentBootstrapCoordinator = new AgentBootstrapCoordinator({
  resolveExecutable: resolveManagedOrSystemExecutable,
  installRuntime: installManagedRuntime,
  isAuthenticated: agentIsAuthenticated,
  login: loginToAgent,
  configureMcp: (id) => { ensureAgentMcp(id); },
  consumeFailure: consumeAgentSetupFailure,
});

export function agentBootstrapStatus(id: ManagedAgentId): AgentBootstrapStatus {
  return agentBootstrapCoordinator.status(id);
}

export function beginAgentBootstrap(id: ManagedAgentId): AgentBootstrapStatus {
  return agentBootstrapCoordinator.begin(id);
}

export function loginAgentBootstrap(id: ManagedAgentId): AgentBootstrapStatus {
  return agentBootstrapCoordinator.login(id);
}

/** Explicit user recovery after fixing an installation outside StashBase.
 * Re-run discovery (including the login-shell probe) and MCP preparation for
 * an executable that now exists, but never authorize another download. */
export function recheckAgentBootstrap(id: ManagedAgentId): AgentBootstrapStatus {
  return agentBootstrapCoordinator.connectIfInstalled(id, { probeLoginShell: true });
}

export function connectInstalledAgentMcpOnStartup(): Array<{ id: ManagedAgentId; status: AgentBootstrapStatus }> {
  return (['codex', 'claude'] as const).map((id) => ({
    id,
    status: agentBootstrapCoordinator.connectIfInstalled(id),
  }));
}

/** The deferred second startup pass, WITH the login-shell probe: system
 * runtimes that only a login shell can resolve (nvm/homebrew paths) still
 * auto-connect shortly after boot instead of waiting for the first New
 * Chat. Runs off the listen path — the probe spawns a shell. */
export function connectInstalledAgentMcpAfterBoot(): Array<{ id: ManagedAgentId; status: AgentBootstrapStatus }> {
  return (['codex', 'claude'] as const).map((id) => ({
    id,
    status: agentBootstrapCoordinator.connectIfInstalled(id, { probeLoginShell: true }),
  }));
}

export function resetAgentBootstrap(id: ManagedAgentId): Promise<void> {
  return agentBootstrapCoordinator.reset(id);
}

export function cancelAgentRuntimeInstalls(): Promise<ManagedAgentId[]> {
  return agentBootstrapCoordinator.cancelAll();
}

async function installManagedRuntime(
  id: ManagedAgentId,
  update: (next: ProgressUpdate) => void,
  signal: AbortSignal,
): Promise<void> {
  if (id === 'claude') return installClaude(update, signal);
  return installCodex(update, signal);
}

const CLAUDE_INSTALLER = process.platform === 'win32'
  ? 'https://claude.ai/install.ps1'
  : 'https://claude.ai/install.sh';

/** Claude's official installer script is written for bash (it relies on
 * `[[ ]]` and regex matching); Windows shares the Codex PowerShell
 * selection. */
export function resolveClaudeInstallerShell(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  isFile: (candidate: string) => boolean = regularFile,
): CodexInstallerShell {
  const shell = resolveCodexInstallerShell(platform, env, isFile);
  return shell.kind === 'posix' ? { ...shell, command: '/bin/bash' } : shell;
}

export async function installClaude(
  update: (next: ProgressUpdate) => void,
  signal: AbortSignal,
  dependencies: Partial<AgentInstallDependencies> = {},
): Promise<void> {
  const verifyExecutable = dependencies.verifyExecutable ?? verifyAgentExecutable;
  const resolveInstallerShell = dependencies.resolveInstallerShell ?? resolveClaudeInstallerShell;
  const runScript = dependencies.runInstallerScript ?? claudeInstallerScriptRunner;
  const resolveInstalled = dependencies.resolveInstalledExecutable
    ?? (() => resolveManagedOrSystemExecutable('claude'));
  update({ message: 'Downloading the official Claude Code installer…' });
  const script = await fetchBoundedText(CLAUDE_INSTALLER, signal, 2_000_000);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
  };
  const shell = resolveInstallerShell();
  await runScript(shell, script, env, signal, (line) => {
    const message = line.trim();
    if (message) update({ message });
  });
  const executable = resolveInstalled();
  if (!executable) {
    throw new Error(
      "The official Claude Code installer exited successfully but no 'claude' executable "
      + 'was found in its standard install locations (such as ~/.local/bin). '
      + 'Check whether security software quarantined Claude Code, then retry the installation.',
    );
  }
  verifyExecutable(executable, 'Claude Code', agentCliEnv());
  // Unlike Codex's Windows installer, `claude.exe install` leaves its bin
  // dir off the user Path, so the CLI would be invisible to the user's own
  // terminal (StashBase discovery scans the directory and is unaffected).
  if (process.platform === 'win32') ensureWindowsClaudeOnUserPath(update);
  update({ progress: 1, message: 'Claude Code installed.' });
}

const WINDOWS_LOCAL_BIN_RAW = '%USERPROFILE%\\.local\\bin';

/** Additively repair the per-user Path so a fresh Claude install is usable
 * from the user's own terminal. Reads the raw (unexpanded) registry value,
 * appends the raw `%USERPROFILE%` entry only when no existing entry expands
 * to the same directory, writes back as REG_EXPAND_SZ so other entries keep
 * their variable forms, and broadcasts the environment change so newly
 * opened shells see it. Never uses `setx` (it truncates at 1024 chars) and
 * never removes or reorders entries. */
export function windowsUserPathRepairScript(rawEntry = WINDOWS_LOCAL_BIN_RAW): string {
  return [
    '$ErrorActionPreference = "Stop"',
    `$entry = '${rawEntry}'`,
    'if (-not (Test-Path HKCU:\\Environment)) { $null = New-Item -Path HKCU:\\Environment }',
    '$key = Get-Item HKCU:\\Environment',
    "$raw = [string]$key.GetValue('Path', '', 'DoNotExpandEnvironmentNames')",
    "$expandedEntry = [Environment]::ExpandEnvironmentVariables($entry).TrimEnd('\\')",
    '$has = $false',
    "foreach ($part in ($raw -split ';')) {",
    "  if ($part -and ([Environment]::ExpandEnvironmentVariables($part).TrimEnd('\\') -ieq $expandedEntry)) { $has = $true }",
    '}',
    'if (-not $has) {',
    "  $next = if ($raw) { $raw.TrimEnd(';') + ';' + $entry } else { $entry }",
    "  Set-ItemProperty -Path HKCU:\\Environment -Name Path -Value $next -Type ExpandString",
    '}',
    '$signature = \'[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);\'',
    '$native = Add-Type -MemberDefinition $signature -Name PathBroadcast -Namespace StashBase -PassThru',
    '$result = [UIntPtr]::Zero',
    '$null = $native::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, "Environment", 2, 5000, [ref]$result)',
  ].join('\r\n');
}

function ensureWindowsClaudeOnUserPath(update: (next: ProgressUpdate) => void): void {
  const shell = resolveCodexInstallerShell();
  const result = spawnSync(
    shell.command,
    ['-NoProfile', '-NonInteractive', '-Command', windowsUserPathRepairScript()],
    { encoding: 'utf8', timeout: 15_000, windowsHide: true },
  );
  if (result.status === 0) {
    update({ message: 'Added %USERPROFILE%\\.local\\bin to your PATH — open a new terminal to use claude.' });
  } else {
    // The install itself succeeded and StashBase can use it either way;
    // terminal visibility falls back to the manual step.
    update({ message: 'Claude Code installed. To use it from a terminal, add %USERPROFILE%\\.local\\bin to your PATH.' });
  }
}

function claudeInstallerScriptRunner(
  shell: CodexInstallerShell,
  script: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onLine: (line: string) => void,
): Promise<void> {
  return runInstallerScript(shell, script, env, signal, onLine, {
    tempRoot: managedAgentRuntimeRoot('claude'),
    bootstrap: CLAUDE_PS1_BOOTSTRAP,
  });
}

const CODEX_INSTALLER = process.platform === 'win32'
  ? 'https://chatgpt.com/codex/install.ps1'
  : 'https://chatgpt.com/codex/install.sh';

export interface CodexInstallerShell {
  command: string;
  args: string[];
  kind: 'posix' | 'powershell-7' | 'windows-powershell';
}

type AgentExecutableVerifier = (
  executable: string,
  label: string,
  env: NodeJS.ProcessEnv,
) => void;

type InstallerScriptRunner = (
  shell: CodexInstallerShell,
  script: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onLine: (line: string) => void,
) => Promise<void>;

export interface AgentInstallDependencies {
  verifyExecutable: AgentExecutableVerifier;
  resolveInstallerShell: () => CodexInstallerShell;
  runInstallerScript: InstallerScriptRunner;
  /** Post-install discovery of the freshly installed executable. Defaults to
   * the same system-then-managed resolution the coordinator uses, which
   * covers the official user-level locations (`~/.local/bin`, the official
   * Windows standalone bin). Injected by tests so a developer machine's own
   * CLIs can never satisfy an install check. */
  resolveInstalledExecutable: () => string | null;
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string {
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  const value = key ? env[key] : undefined;
  return typeof value === 'string' ? value : '';
}

function regularFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function resolveCodexInstallerShell(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  isFile: (candidate: string) => boolean = regularFile,
): CodexInstallerShell {
  if (platform !== 'win32') return { command: '/bin/sh', args: [], kind: 'posix' };

  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'];
  const candidates: string[] = [];
  const pathValue = environmentValue(env, 'PATH');
  for (const entry of pathValue.split(path.win32.delimiter)) {
    const dir = entry.trim().replace(/^"(.*)"$/, '$1');
    if (dir) candidates.push(path.win32.join(dir, 'pwsh.exe'));
  }
  for (const name of ['ProgramW6432', 'ProgramFiles']) {
    const programFiles = environmentValue(env, name);
    if (programFiles) candidates.push(path.win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'));
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (isFile(candidate)) return { command: candidate, args, kind: 'powershell-7' };
  }

  const systemRoot = environmentValue(env, 'SystemRoot');
  const windowsPowerShell = systemRoot
    ? path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  return {
    command: isFile(windowsPowerShell) ? windowsPowerShell : 'powershell.exe',
    args,
    kind: 'windows-powershell',
  };
}

function codexInstallerFailure(error: unknown, shell: CodexInstallerShell): Error {
  const failure = error instanceof Error ? error : new Error(String(error));
  if (
    shell.kind === 'windows-powershell'
    && /property\s+['"]OSArchitecture['"]\s+cannot be found/i.test(failure.message)
  ) {
    return new Error(
      'The official Codex installer is incompatible with Windows PowerShell 5.1 on this PC. '
      + 'Install PowerShell 7 (pwsh.exe), then retry.',
    );
  }
  return failure;
}

export async function installCodex(
  update: (next: ProgressUpdate) => void,
  signal: AbortSignal,
  dependencies: Partial<AgentInstallDependencies> = {},
): Promise<void> {
  const verifyExecutable = dependencies.verifyExecutable ?? verifyAgentExecutable;
  const resolveInstallerShell = dependencies.resolveInstallerShell ?? resolveCodexInstallerShell;
  const runScript = dependencies.runInstallerScript ?? codexInstallerScriptRunner;
  const resolveInstalled = dependencies.resolveInstalledExecutable
    ?? (() => resolveManagedOrSystemExecutable('codex'));
  update({ message: 'Downloading the official Codex installer…' });
  const script = await fetchBoundedText(CODEX_INSTALLER, signal, 2_000_000);
  // The official installer owns its layout and the user's PATH profile:
  // strip any inherited pinning so a stale desktop environment can never
  // redirect it into a private, terminal-invisible location.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_INSTALL_DIR: undefined,
    CODEX_HOME: undefined,
    CODEX_NON_INTERACTIVE: 'true',
    ELECTRON_RUN_AS_NODE: undefined,
  };
  const shell = resolveInstallerShell();
  try {
    await runScript(shell, script, env, signal, (line) => {
      const message = line.replace(/^==>\s*/, '').trim();
      if (!message) return;
      update({
        message: /^Downloading Codex CLI$/i.test(message)
          ? 'Downloading Codex CLI… this may take several minutes.'
          : message,
      });
    });
  } catch (error) {
    throw codexInstallerFailure(error, shell);
  }
  const executable = resolveInstalled();
  if (!executable) {
    throw new Error(
      "The official Codex installer exited successfully but no 'codex' executable "
      + 'was found in its standard install locations (such as ~/.local/bin). '
      + 'Check whether security software quarantined Codex, then retry the installation.',
    );
  }
  verifyExecutable(executable, 'Codex', agentCliEnv());
  update({ progress: 1, message: 'Codex installed.' });
}

function codexInstallerScriptRunner(
  shell: CodexInstallerShell,
  script: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onLine: (line: string) => void,
): Promise<void> {
  return runInstallerScript(shell, script, env, signal, onLine, {
    tempRoot: managedAgentRuntimeRoot('codex'),
    bootstrap: CODEX_PS1_BOOTSTRAP,
  });
}

async function fetchBoundedText(url: string, signal: AbortSignal, maxBytes: number): Promise<string> {
  const response = await fetch(url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) from ${new URL(url).host}.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new Error(`Download from ${new URL(url).host} exceeded its size limit.`);
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

export function verifyAgentExecutable(
  executable: string,
  label: string,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 20_000,
): void {
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    env: { ...env, ELECTRON_RUN_AS_NODE: undefined },
  });
  if (result.status !== 0) {
    const nativeError = result.error as NodeJS.ErrnoException | undefined;
    const stderr = typeof result.stderr === 'string'
      ? result.stderr.replace(/\s+/g, ' ').trim().slice(-800)
      : '';
    let detail: string;
    if (nativeError?.code === 'ETIMEDOUT') detail = `timed out after ${timeoutMs}ms`;
    else if (nativeError) detail = `could not start: ${nativeError.message}`;
    else if (result.status !== null) detail = `exited with code ${result.status}`;
    else if (result.signal) detail = `terminated by ${result.signal}`;
    else detail = 'returned no exit status';
    throw new Error(
      `${label} was downloaded but did not pass its executable check (${detail}${stderr ? `: ${stderr}` : ''}).`,
    );
  }
}

async function runInstallerScript(
  shell: CodexInstallerShell,
  script: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onLine: (line: string) => void,
  options: { tempRoot: string; bootstrap: readonly string[] },
): Promise<void> {
  let scriptDir: string | null = null;
  let scriptFile: string | null = null;
  if (shell.kind !== 'posix') {
    fs.mkdirSync(options.tempRoot, { recursive: true, mode: 0o700 });
    scriptDir = fs.mkdtempSync(path.join(options.tempRoot, '.installer-script.'));
    scriptFile = path.join(scriptDir, 'install.ps1');
    fs.writeFileSync(scriptFile, agentPowerShellInstallerScript(script, options.bootstrap), { mode: 0o600 });
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(shell.command, scriptFile ? [...shell.args, scriptFile] : shell.args, {
        env,
        // POSIX cancellation addresses the installer process group by negative
        // PID. Windows uses taskkill /T instead, so keeping pwsh attached makes
        // its close event represent the script host that actually ran -File.
        detached: shell.kind === 'posix',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stderr = '';
      let buffered = '';
      const abort = () => terminateInstallerTree(child);
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? '';
        for (const line of lines) onLine(line);
      });
      child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-4000); });
      child.on('error', (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      });
      child.on('close', (code) => {
        signal.removeEventListener('abort', abort);
        if (buffered.trim()) onLine(buffered);
        if (signal.aborted) reject(new Error('Agent installation was cancelled.'));
        else if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `Official Agent installer exited with code ${code ?? 'unknown'}.`));
      });
      if (scriptFile) child.stdin.end();
      else child.stdin.end(script);
    });
  } finally {
    if (scriptDir) {
      try {
        fs.rmSync(scriptDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {
        // The downloaded public installer contains no credentials. A transient
        // Windows lock must not replace the installation result that matters.
      }
    }
  }
}

/** The official installers own their standard install layout and the user's
 * PATH. The Windows bootstrap only enforces failure propagation, strips
 * environment that could redirect or derail the install (stale managed
 * pinning from older StashBase versions, the Electron node marker), and pins
 * non-interactive mode. Windows environment keys are case-insensitive and
 * packaged desktop processes can inherit stale or duplicate variants.
 * Executing one file also avoids a nested script invocation that can return
 * success without running its target on some packaged Windows
 * environments. */
export const CODEX_PS1_BOOTSTRAP = [
  '$ErrorActionPreference = "Stop"',
  'Remove-Item Env:\\CODEX_INSTALL_DIR -ErrorAction SilentlyContinue',
  'Remove-Item Env:\\CODEX_HOME -ErrorAction SilentlyContinue',
  '$env:CODEX_NON_INTERACTIVE = "true"',
  'Remove-Item Env:\\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue',
] as const;

export const CLAUDE_PS1_BOOTSTRAP = [
  '$ErrorActionPreference = "Stop"',
  'Remove-Item Env:\\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue',
] as const;

export function agentPowerShellInstallerScript(
  installerScript: string,
  bootstrapLines: readonly string[],
): string {
  const bootstrap = [...bootstrapLines, ''].join('\r\n');
  // PowerShell requires `param(...)` to be the script's first statement, so
  // the bootstrap must insert AFTER the parameter declaration. Codex declares
  // `[CmdletBinding()]` before its block; Claude opens with a bare multi-line
  // `param(` whose closing parenthesis starts its own line. Prepending the
  // bootstrap ahead of a param block turns `param` into an unknown command.
  const parameterBlock = installerScript.match(
    /^(?:\uFEFF)?\s*(?:\[CmdletBinding\(\)\]\s*\r?\n)?param\([\s\S]*?\r?\n\)\s*\r?\n/,
  )?.[0];
  if (!parameterBlock) return bootstrap + installerScript;
  return parameterBlock + bootstrap + installerScript.slice(parameterBlock.length);
}
