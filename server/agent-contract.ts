/**
 * Compatibility-first contract for the built-in Agent panel.
 *
 * Runtime-specific bridges register a small adapter here.  The renderer and
 * route layer speak only in terms of this contract, while Claude's SDK and
 * Codex's app-server remain free to keep their native lifecycle details.
 */
import type { WebSocket } from 'ws';
import { CLIS, launchCommandFor } from './terminal.ts';
import { resolveAgentCli } from './agent-cli.ts';
import { agentExecutableSource } from './agent-runtime-paths.ts';
import { agentBootstrapStatus } from './agent-runtime-installer.ts';
import { ensureAgentMcp } from './agent-mcp.ts';
import { filesystemPath } from './filesystem-path.ts';

/** The renderer↔server wire vocabulary lives in `shared/agent-protocol.ts` so
 * the renderer can import it without pulling this module's server-only graph
 * (`ws`, the CLI resolvers, the runtime installer) into the browser bundle.
 * Re-exported here so server-side callers keep one import site for the whole
 * contract. */
export type {
  AgentClientEvent,
  AgentModel,
  AgentServerEvent,
  AgentSkill,
} from '../shared/agent-protocol.ts';

export type AgentId = 'claude' | 'codex';
export type AgentRuntimeState = 'available' | 'unavailable' | 'failed';
export const AGENT_ACCESS_MODES = ['default', 'acceptEdits', 'plan', 'auto'] as const;
export type AgentAccessMode = (typeof AGENT_ACCESS_MODES)[number];

export function isAgentAccessMode(value: unknown): value is AgentAccessMode {
  return typeof value === 'string' && (AGENT_ACCESS_MODES as readonly string[]).includes(value);
}

/** Effort identifiers are runtime-owned opaque strings. Keep the URL boundary
 * bounded and free of control characters without narrowing future runtimes to
 * a StashBase-maintained enum. */
export function parseAgentEffort(value: unknown): string | undefined {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 64
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : undefined;
}

export interface AgentCapabilities {
  connection: true;
  prompts: true;
  interrupt: true;
  transcript: true;
  approvals: true;
  history: true;
  modes: boolean;
  effort: boolean;
  /** The runtime can enumerate and select its own session models. */
  models: boolean;
  skills: boolean;
  steering: boolean;
  titleHint: boolean;
}

export interface AgentConnectionOptions {
  windowId: string;
  effort?: string;
  resume?: string;
  access?: AgentAccessMode;
  /** Undefined deliberately means "use the runtime's configured default". */
  model?: string;
  /** Explicit session folder (a registered library-member root). Mutually
   * exclusive with `scope`. Undefined with no `scope` means "use the
   * window's current folder when one exists, else the library". Callers
   * must have validated with `resolveAgentSessionScope`. */
  folder?: string;
  /** Explicit library-wide session scope. The session binds the folder
   * home as its cwd and is NOT bound to any member folder. */
  scope?: 'library';
}

export type AgentSessionFolderResolution =
  | { ok: true; folder?: string }
  | { ok: false; message: string };

/** Resolve an optional explicit session folder against library membership.
 * Absent/empty → follow the window's current folder (folder stays undefined).
 * Present → it must match a registered member root; the stored member
 * spelling is returned so downstream path-keyed state stays consistent.
 * Anything else is rejected — an agent session must never be bound to an
 * arbitrary filesystem path. */
export function resolveAgentSessionFolder(
  requested: unknown,
  memberRoots: readonly string[],
): AgentSessionFolderResolution {
  if (requested == null) return { ok: true };
  if (typeof requested !== 'string') return { ok: false, message: 'folder must be a library folder path' };
  const trimmed = requested.trim();
  if (!trimmed) return { ok: true };
  if (!filesystemPath.isAbsolute(trimmed)) return { ok: false, message: 'folder must be an absolute library folder path' };
  for (const root of memberRoots) {
    try {
      if (filesystemPath.equal(root, trimmed)) return { ok: true, folder: root };
    } catch {
      // A malformed candidate cannot equal a member root; keep checking.
    }
  }
  return { ok: false, message: 'folder is not a registered library folder' };
}

/** Explicit session scope: one library folder, or the whole library. */
export type AgentSessionScope = { kind: 'library' } | { kind: 'folder'; path: string };

export type AgentSessionScopeResolution =
  | { ok: true; scope?: AgentSessionScope }
  | { ok: false; message: string };

/** Resolve the optional explicit scope of a connect / history request.
 * `scope=library` is the only recognized scope value; an explicit folder
 * stays membership-validated through `resolveAgentSessionFolder`; sending
 * both is contradictory and rejected. Both absent → no explicit scope:
 * the caller falls back to the window's current folder when one exists,
 * else the library. */
export function resolveAgentSessionScope(
  requestedScope: unknown,
  requestedFolder: unknown,
  memberRoots: readonly string[],
): AgentSessionScopeResolution {
  const rawScope = typeof requestedScope === 'string' ? requestedScope.trim() : requestedScope == null ? '' : null;
  if (rawScope == null) return { ok: false, message: 'scope must be "library"' };
  const rawFolder = typeof requestedFolder === 'string' ? requestedFolder.trim() : requestedFolder == null ? '' : requestedFolder;
  if (rawScope) {
    if (rawScope !== 'library') return { ok: false, message: 'scope must be "library"' };
    if (rawFolder) return { ok: false, message: 'scope=library cannot be combined with a folder' };
    return { ok: true, scope: { kind: 'library' } };
  }
  const folder = resolveAgentSessionFolder(requestedFolder, memberRoots);
  if (!folder.ok) return folder;
  return folder.folder ? { ok: true, scope: { kind: 'folder', path: folder.folder } } : { ok: true };
}

/** Resolve the cwd and library-scoped flag a session binds at start time.
 * Explicit library scope → the folder home (the reserved library cwd —
 * library-scoped history persists under it, not under any member folder).
 * Explicit folder → that member root. Neither → the window's current
 * folder when one exists, else the library fallback. `libraryScoped`
 * sessions report no bound folder, so member-folder removal never tears
 * them down. */
export function resolveSessionBinding(options: {
  scope?: 'library';
  folder?: string;
  currentFolder: string | null;
  folderHome: string;
}): { cwd: string; libraryScoped: boolean } {
  if (options.scope === 'library') return { cwd: options.folderHome, libraryScoped: true };
  if (options.folder) return { cwd: options.folder, libraryScoped: false };
  if (options.currentFolder) return { cwd: options.currentFolder, libraryScoped: false };
  return { cwd: options.folderHome, libraryScoped: true };
}

export interface AgentHistoryActions {
  list(folder: string | null): Promise<unknown[]>;
  messages(id: string, folder: string | null): Promise<unknown[]>;
  /** Protocol-v2 replay metadata. Optional keeps third-party/older adapters
   * compatible with the established messages-only history contract. */
  replay?(id: string, folder: string | null): Promise<unknown>;
  rename(id: string, title: string, folder: string | null): Promise<unknown>;
  remove(id: string, folder: string | null): Promise<void>;
}

export interface AgentAdapter {
  id: AgentId;
  label: string;
  vendor: string;
  capabilities: AgentCapabilities;
  attach(ws: WebSocket, options: AgentConnectionOptions): void;
  stop(windowId?: string): void;
  /** End every live session bound to this member folder, across all windows.
   * Library folder removal uses this — a removed folder must not keep
   * running sessions, even in windows currently showing another folder. */
  stopFolder(folderAbs: string): void;
  history: AgentHistoryActions;
}

/** The registry entry shape both runtime session sets satisfy. */
export interface FolderBoundAgentSession {
  boundFolder(): string | null;
  dispose(): void;
}

/** Dispose exactly the sessions bound to `folderAbs` (filesystem identity
 * comparison), leaving sessions bound to other folders running. Shared by the
 * Claude and Codex registries so folder removal has one teardown semantic. */
export function disposeSessionsBoundToFolder<T extends FolderBoundAgentSession>(
  sessions: Set<T>,
  folderAbs: string,
): void {
  for (const session of [...sessions]) {
    const bound = session.boundFolder();
    let matches = false;
    try {
      matches = bound != null && filesystemPath.equal(bound, folderAbs);
    } catch {
      matches = false;
    }
    if (matches) {
      session.dispose();
      sessions.delete(session);
    }
  }
}

export interface AgentRuntimeDescriptor {
  id: AgentId;
  label: string;
  vendor: string;
  installHint: string;
  launchCommand: string;
  endpoint: '/ws/agent';
  installed: boolean;
  source: 'system' | 'managed' | null;
  state: AgentRuntimeState;
  bootstrap: ReturnType<typeof agentBootstrapStatus>;
  error?: string;
  capabilities: AgentCapabilities;
}

const adapters = new Map<AgentId, AgentAdapter>();
const runtimeFailures = new Map<AgentId, string>();

export function agentExecutableFor(id: AgentId): string | null {
  const config = id === 'claude'
    ? { name: 'claude', envNames: ['STASHBASE_CLAUDE_BIN', 'CLAUDE_CODE_BIN'], logLabel: 'Claude Code' }
    : { name: 'codex', envNames: ['STASHBASE_CODEX_BIN', 'CODEX_CLI_BIN', 'CODEX_CLI_PATH'], logLabel: 'Codex' };
  return resolveAgentCli(config, () => {});
}

export function registerAgentAdapter(adapter: AgentAdapter): void {
  adapters.set(adapter.id, adapter);
}

/** Pure descriptor builder used by discovery and its contract tests. */
export function runtimeDescriptorFor(adapter: AgentAdapter, executable = agentExecutableFor(adapter.id)): AgentRuntimeDescriptor {
  const cli = CLIS[adapter.id];
  const installed = executable !== null;
  const failure = runtimeFailures.get(adapter.id);
  const state: AgentRuntimeState = !installed ? 'unavailable' : failure ? 'failed' : 'available';
  return {
    id: adapter.id,
    label: adapter.label,
    vendor: adapter.vendor,
    installHint: cli.installHint,
    launchCommand: launchCommandFor(cli),
    endpoint: '/ws/agent',
    installed,
    source: agentExecutableSource(adapter.id, executable),
    state,
    bootstrap: agentBootstrapStatus(adapter.id),
    ...(failure ? { error: failure } : {}),
    capabilities: adapter.capabilities,
  };
}

export function agentAdapter(id: string): AgentAdapter | null {
  return id === 'claude' || id === 'codex' ? adapters.get(id) ?? null : null;
}

/** Native discovery is performed at request time so a CLI installed or
 * upgraded while StashBase is open is reflected without a bundled-version
 * assumption. */
export function discoverAgentRuntimes(): AgentRuntimeDescriptor[] {
  return [...adapters.values()].map((adapter) => runtimeDescriptorFor(adapter));
}

export function attachAgentRuntime(id: string, ws: WebSocket, options: AgentConnectionOptions): void {
  const adapter = agentAdapter(id);
  if (!adapter) {
    ws.send(JSON.stringify({ t: 'error', message: 'Unsupported agent runtime.' }));
    ws.close();
    return;
  }
  if (!agentExecutableFor(adapter.id)) {
    ws.send(JSON.stringify({ t: 'error', message: `${adapter.label} CLI is not available.` }));
    ws.close();
    return;
  }
  try {
    ensureAgentMcp(adapter.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ws.send(JSON.stringify({ t: 'error', message: `Could not connect StashBase MCP: ${message}` }));
    ws.close();
    return;
  }
  clearAgentRuntimeFailure(adapter.id);
  adapter.attach(ws, options);
}

export function stopAgentRuntime(id: AgentId, windowId?: string): void {
  agentAdapter(id)?.stop(windowId);
}

export function stopAgentRuntimeForFolder(id: AgentId, folderAbs: string): void {
  agentAdapter(id)?.stopFolder(folderAbs);
}

export function reportAgentRuntimeFailure(id: AgentId, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  runtimeFailures.set(id, message.slice(0, 500));
}

export function clearAgentRuntimeFailure(id: AgentId): void {
  runtimeFailures.delete(id);
}
