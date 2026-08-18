/**
 * StashBase-managed Agent runtime paths and development discovery controls.
 *
 * Managed runtimes are application-scoped dependencies: they live under
 * AppData, never modify the user's PATH, and continue to use each provider's
 * normal account/config home when launched. The in-memory discovery policy is
 * deliberately development-only state; production always resolves `auto`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { appDataRoot } from './local-data.ts';
import { isDevelopmentRuntime } from './development-runtime.ts';
import type {
  AgentDiscoveryPolicy,
  AgentRuntimeDebugState,
  AgentSetupFailureSimulation,
  AgentTurnFailureSimulation,
} from '../shared/agent-runtime.ts';

export type {
  AgentDiscoveryPolicy,
  AgentRuntimeDebugState,
  AgentSetupFailureSimulation,
  AgentTurnFailureSimulation,
} from '../shared/agent-runtime.ts';

export type ManagedAgentId = 'claude' | 'codex';
interface ManagedRuntimeManifest {
  version: string;
  platform: string;
  executable: string;
}

const DISCOVERY_POLICIES = new Set<AgentDiscoveryPolicy>(['auto', 'managed-only', 'system-only']);
const SETUP_FAILURE_SIMULATIONS = new Set<AgentSetupFailureSimulation>(['none', 'installation', 'authentication', 'mcp']);
const TURN_FAILURE_SIMULATIONS = new Set<AgentTurnFailureSimulation>([
  'none', 'rate-limit', 'quota', 'auth-expired', 'network', 'crash',
]);

export function initialAgentDiscoveryPolicy(
  env: NodeJS.ProcessEnv = process.env,
): AgentDiscoveryPolicy {
  const value = env.STASHBASE_AGENT_DISCOVERY_POLICY;
  const debugEnabled = isDevelopmentRuntime(env) || env.STASHBASE_AGENT_DEBUG === '1';
  return debugEnabled && DISCOVERY_POLICIES.has(value as AgentDiscoveryPolicy)
    ? value as AgentDiscoveryPolicy
    : 'auto';
}

let discoveryPolicy: AgentDiscoveryPolicy = initialAgentDiscoveryPolicy();
let nextFailure: AgentSetupFailureSimulation = 'none';
let nextTurnFailure: AgentTurnFailureSimulation = 'none';

export function agentRuntimeDebugEnabled(): boolean {
  return isDevelopmentRuntime() || process.env.STASHBASE_AGENT_DEBUG === '1';
}

export function getAgentRuntimeDebugState(): AgentRuntimeDebugState {
  if (!agentRuntimeDebugEnabled()) {
    return {
      enabled: false,
      discoveryPolicy: 'auto',
      nextFailure: 'none',
      nextTurnFailure: 'none',
    };
  }
  return { enabled: true, discoveryPolicy, nextFailure, nextTurnFailure };
}

export function setAgentRuntimeDebugState(
  patch: Partial<Omit<AgentRuntimeDebugState, 'enabled'>>,
): AgentRuntimeDebugState {
  if (!agentRuntimeDebugEnabled()) {
    throw Object.assign(new Error('Agent runtime test controls are available in development builds only.'), { status: 404 });
  }
  if (patch.discoveryPolicy !== undefined) {
    if (!DISCOVERY_POLICIES.has(patch.discoveryPolicy)) {
      throw Object.assign(new Error('Invalid Agent discovery policy.'), { status: 400 });
    }
    discoveryPolicy = patch.discoveryPolicy;
  }
  if (patch.nextFailure !== undefined) {
    if (!SETUP_FAILURE_SIMULATIONS.has(patch.nextFailure)) {
      throw Object.assign(new Error('Invalid Agent setup failure simulation.'), { status: 400 });
    }
    nextFailure = patch.nextFailure;
  }
  if (patch.nextTurnFailure !== undefined) {
    if (!TURN_FAILURE_SIMULATIONS.has(patch.nextTurnFailure)) {
      throw Object.assign(new Error('Invalid Agent turn failure simulation.'), { status: 400 });
    }
    nextTurnFailure = patch.nextTurnFailure;
  }
  return getAgentRuntimeDebugState();
}

/** Consume a development failure only when readiness reaches the selected
 * stage. Installation simulations therefore remain pending when an existing
 * runtime skips installation, while every injected failure is one-shot. */
export function consumeAgentSetupFailure(
  stage: Exclude<AgentSetupFailureSimulation, 'none'>,
): boolean {
  if (!agentRuntimeDebugEnabled() || nextFailure !== stage) return false;
  nextFailure = 'none';
  return true;
}

/** Consume the armed turn failure for the next prompt of any live session.
 * One-shot: the first prompt from any runtime takes it. */
export function consumeAgentTurnFailure(): Exclude<AgentTurnFailureSimulation, 'none'> | null {
  if (!agentRuntimeDebugEnabled() || nextTurnFailure === 'none') return null;
  const consumed = nextTurnFailure;
  nextTurnFailure = 'none';
  return consumed;
}

export interface SimulatedTurnFailureScript {
  /** Session-fatal: the adapter ends the session (protocol `exit`) instead of
   * settling one turn. */
  fatal: boolean;
  message: string;
}

/** The scripted outcome each turn simulation plays through the normal adapter
 * send path. Messages are shaped like the real provider errors they stand in
 * for — and flow through the live turn-failure classifier — and are prefixed
 * so a developer never mistakes one for a live failure. */
export function simulatedTurnFailureScript(
  kind: Exclude<AgentTurnFailureSimulation, 'none'>,
): SimulatedTurnFailureScript {
  switch (kind) {
    case 'rate-limit':
      return { fatal: false, message: 'Simulated failure: 429 rate_limit_error — too many requests. Retry after 30 seconds.' };
    case 'quota':
      return { fatal: false, message: 'Simulated failure: usage limit reached — this plan’s usage window is exhausted.' };
    case 'auth-expired':
      return { fatal: false, message: 'Simulated failure: 401 authentication_error — the session token has expired. Sign in again.' };
    case 'network':
      return { fatal: false, message: 'Simulated failure: fetch failed — getaddrinfo ENOTFOUND (network unreachable).' };
    case 'crash':
      return { fatal: true, message: 'Simulated failure: the Agent runtime exited unexpectedly (code 1).' };
  }
}

export function managedAgentRuntimeRoot(id: ManagedAgentId): string {
  return path.join(appDataRoot(), 'agent-runtimes', id);
}

export function managedCodexBinDir(): string {
  return path.join(managedAgentRuntimeRoot('codex'), 'bin');
}

export function managedCodexInstallerHome(): string {
  return path.join(managedAgentRuntimeRoot('codex'), 'installer-home');
}

export function managedCodexReleasesDir(): string {
  return path.join(managedCodexInstallerHome(), 'packages', 'standalone', 'releases');
}

function codexReleaseTargets(): string[] {
  // The provider installer detects the OS architecture independently. An x64
  // Electron build can therefore launch PowerShell on Windows ARM64 and
  // receive the native aarch64 package, so discovery must accept either
  // provider-owned target for the current OS.
  if (process.platform === 'win32') {
    return ['aarch64-pc-windows-msvc', 'x86_64-pc-windows-msvc'];
  }
  if (process.platform === 'darwin') {
    return ['aarch64-apple-darwin', 'x86_64-apple-darwin'];
  }
  if (process.platform === 'linux') {
    return ['aarch64-unknown-linux-gnu', 'x86_64-unknown-linux-gnu'];
  }
  return [];
}

function managedCodexReleaseExecutableCandidates(executableName: string): string[] {
  const targets = codexReleaseTargets();
  if (targets.length === 0) return [];
  const releasesDir = managedCodexReleasesDir();
  let names: string[];
  try {
    names = fs.readdirSync(releasesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => targets.some((target) => {
        const suffix = `-${target}`;
        return name.endsWith(suffix)
          && /^\d+\.\d+\.\d+(?:-alpha(?:\.\d+){0,2}|-beta(?:\.\d+)?)?$/.test(name.slice(0, -suffix.length));
      }));
  } catch {
    return [];
  }
  names.sort((left, right) => {
    try {
      return fs.statSync(path.join(releasesDir, right)).mtimeMs
        - fs.statSync(path.join(releasesDir, left)).mtimeMs;
    } catch {
      return right.localeCompare(left);
    }
  });
  return names.flatMap((name) => {
    const releaseDir = path.join(releasesDir, name);
    return [
      path.join(releaseDir, 'bin', executableName),
      path.join(releaseDir, executableName),
    ];
  });
}

function managedCodexExecutableCandidates(): string[] {
  const executableName = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const standaloneCurrent = path.join(
    managedCodexInstallerHome(),
    'packages',
    'standalone',
    'current',
  );
  return [
    path.join(managedCodexBinDir(), executableName),
    path.join(standaloneCurrent, 'bin', executableName),
    path.join(standaloneCurrent, executableName),
    ...managedCodexReleaseExecutableCandidates(executableName),
  ];
}

export function managedClaudeReleasesDir(): string {
  return path.join(managedAgentRuntimeRoot('claude'), 'releases');
}

export function managedClaudeManifestPath(): string {
  return path.join(managedAgentRuntimeRoot('claude'), 'current.json');
}

function executableFile(file: string): boolean {
  try {
    fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function readManagedClaudeManifest(): ManagedRuntimeManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(managedClaudeManifestPath(), 'utf8')) as Partial<ManagedRuntimeManifest>;
    if (
      typeof parsed.version !== 'string'
      || typeof parsed.platform !== 'string'
      || typeof parsed.executable !== 'string'
      || path.isAbsolute(parsed.executable)
      || parsed.executable.split(/[\\/]+/).includes('..')
    ) return null;
    return parsed as ManagedRuntimeManifest;
  } catch {
    return null;
  }
}

export function managedAgentExecutable(id: ManagedAgentId): string | null {
  if (id === 'codex') {
    return managedCodexExecutableCandidates().find(executableFile) ?? null;
  }
  const manifest = readManagedClaudeManifest();
  if (!manifest) return null;
  const executable = path.resolve(managedAgentRuntimeRoot('claude'), manifest.executable);
  const root = path.resolve(managedAgentRuntimeRoot('claude'));
  if (executable !== root && !executable.startsWith(root + path.sep)) return null;
  return executableFile(executable) ? executable : null;
}

export function writeManagedClaudeManifest(manifest: ManagedRuntimeManifest): void {
  const root = managedAgentRuntimeRoot('claude');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = managedClaudeManifestPath();
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

export function removeManagedAgentRuntime(id: ManagedAgentId): void {
  const root = managedAgentRuntimeRoot(id);
  const appRoot = path.resolve(appDataRoot());
  const resolved = path.resolve(root);
  if (!resolved.startsWith(appRoot + path.sep) || path.basename(path.dirname(resolved)) !== 'agent-runtimes') {
    throw new Error('Refusing to remove an Agent runtime outside StashBase AppData.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

export function agentDiscoveryPolicy(): AgentDiscoveryPolicy {
  return getAgentRuntimeDebugState().discoveryPolicy;
}

export function agentExecutableSource(id: ManagedAgentId, executable: string | null): 'system' | 'managed' | null {
  if (!executable) return null;
  const managed = managedAgentExecutable(id);
  return managed && path.resolve(executable) === path.resolve(managed) ? 'managed' : 'system';
}
