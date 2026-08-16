/**
 * Pure renderer state transition helpers shared by action hooks and the reducer.
 * Runtime dependencies stay browser-safe and free of React side effects.
 */
import type { FileMeta } from '../api';
import { VIEWABLE_FILE_EXTENSION_ALTERNATION } from '../../../shared/file-formats.ts';
import type { ChatTab, State, Tab } from './state';

const VIEWABLE_EXTENSION_RE = new RegExp(`\\.(${VIEWABLE_FILE_EXTENSION_ALTERNATION})$`, 'i');

/** Sidebar side-panel resize bounds (px), shared by the reducer and the
 *  drag handle. Dragging the panel narrower than `COLLAPSE_AT` collapses
 *  it entirely; between that and `MIN` it snaps to `MIN`. */
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_COLLAPSE_AT = 100;

/** Chat-panel resize bounds (px), shared by the reducer and drag handle.
 *  The floor fits the composer bar's worst case — attach + scope pill +
 *  model pill + mode pill + send — with the pills already truncating;
 *  below ~320 the bar clips its terminal send button. */
export const CHAT_MIN_WIDTH = 320;
export const CHAT_MAX_WIDTH = 640;
export const SPLITTER_KEYBOARD_STEP = 16;

export type SplitterKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';
const SPLITTER_KEYS: readonly SplitterKey[] = [
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
];

export function isSplitterKey(key: string): key is SplitterKey {
  return (SPLITTER_KEYS as readonly string[]).includes(key);
}

export function clampChatWidth(width: number) {
  return Math.max(CHAT_MIN_WIDTH, Math.min(width, CHAT_MAX_WIDTH));
}

/** Platform-neutral keyboard transition for the left sidebar separator. */
export function resizeSidebarByKeyboard(
  width: number,
  collapsed: boolean,
  key: SplitterKey,
): { width: number; collapsed: boolean } {
  if (key === 'Home') return { width, collapsed: true };
  if (key === 'End') return { width: SIDEBAR_MAX_WIDTH, collapsed: false };
  if (key === 'ArrowRight') {
    return {
      width: collapsed
        ? Math.max(SIDEBAR_MIN_WIDTH, Math.min(width, SIDEBAR_MAX_WIDTH))
        : Math.min(width + SPLITTER_KEYBOARD_STEP, SIDEBAR_MAX_WIDTH),
      collapsed: false,
    };
  }
  if (collapsed) return { width, collapsed: true };
  if (width <= SIDEBAR_MIN_WIDTH) return { width, collapsed: true };
  return {
    width: Math.max(width - SPLITTER_KEYBOARD_STEP, SIDEBAR_MIN_WIDTH),
    collapsed: false,
  };
}

/** Keyboard movement follows the separator: left grows the right-hand pane. */
export function resizeChatByKeyboard(width: number, key: SplitterKey): number {
  if (key === 'Home') return CHAT_MIN_WIDTH;
  if (key === 'End') return CHAT_MAX_WIDTH;
  return clampChatWidth(
    width + (key === 'ArrowLeft' ? SPLITTER_KEYBOARD_STEP : -SPLITTER_KEYBOARD_STEP),
  );
}

/** Build a fresh persistent tab. The id is `crypto.randomUUID` because every
 *  browser shipping in 2024+ (and Electron's bundled Chromium) has it;
 *  Node ≥19 also exposes it. */
export function makeTab(): Tab {
  return {
    id: crypto.randomUUID(),
    file: null,
    editMode: false,
    dirty: false,
    pendingAnchor: null,
    pendingHighlight: null,
    saveStatus: { text: '', cls: '' },
  };
}

/** Resolve the active tab object, or null if none. Used by both the
 *  reducer and the action thunks. */
export function getActiveTab(s: State): Tab | null {
  if (s.activeTabId == null) return null;
  return s.tabs.find((t) => t.id === s.activeTabId) ?? null;
}

/** Create a numbered placeholder tab for a new agent conversation. A new
 *  tab starts completely blank (its AgentView keeps the flag current).
 *  "New Chat" — not "Untitled" — matches the chat mental model; the first
 *  turn replaces it with the session's derived title. */
export function makeChatTab(agent: string, tabs: ChatTab[]): ChatTab {
  const sameAgentTabs = tabs.filter((tab) => tab.agent === agent);
  const title = sameAgentTabs.length === 0 ? 'New Chat' : `New Chat ${sameAgentTabs.length + 1}`;
  return { id: crypto.randomUUID(), agent, title, blank: true };
}

/** Move a chat tab to the most-recent position for its agent. */
export function rememberChatTab(recency: State['chatTabRecencyByAgent'], tab: ChatTab): State['chatTabRecencyByAgent'] {
  return {
    ...recency,
    [tab.agent]: [...(recency[tab.agent] ?? []).filter((id) => id !== tab.id), tab.id],
  };
}

/** Drop a closed tab from its agent's recency list. */
export function forgetChatTab(recency: State['chatTabRecencyByAgent'], tab: ChatTab): State['chatTabRecencyByAgent'] {
  const ids = (recency[tab.agent] ?? []).filter((id) => id !== tab.id);
  if (ids.length > 0) return { ...recency, [tab.agent]: ids };
  const { [tab.agent]: _removed, ...rest } = recency;
  return rest;
}

/** Return an agent's most recently active tab that is still open. */
export function mostRecentChatTab(s: State, agent: string): ChatTab | null {
  const ids = s.chatTabRecencyByAgent[agent] ?? [];
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const tab = s.chatTabs.find((candidate) => candidate.id === ids[i]);
    if (tab) return tab;
  }
  return null;
}

/** Put a source file first in its folder-local most-recently-used list. */
export function rememberRecentFile(paths: string[], path: string): string[] {
  return [path, ...paths.filter((candidate) => candidate !== path)];
}

/** Put a tab id first in Editor History's most-recently-activated list. */
export function rememberActivatedTab(history: string[], id: string): string[] {
  return [id, ...history.filter((candidate) => candidate !== id)];
}

/** Drop closed tab ids from Editor History so the Ctrl+Tab navigator never
 *  offers a tab that no longer exists. */
export function forgetClosedTabs(history: string[], openIds: Set<string>): string[] {
  return history.filter((id) => openIds.has(id));
}

/** Visible files to mark as pending immediately after the user adds the
 *  first embedding key. The server may already be embedding by the time
 *  `/api/index-status` is polled, and the daemon serialises status behind
 *  embeds; this optimistic set keeps search-readiness accounting from
 *  temporarily undercounting the backfill. */
export function optimisticKeyBackfillPaths(files: FileMeta[]): string[] {
  return files
    .filter((f) => f.format === 'md' || f.format === 'html' || f.format === 'json' || f.format === 'pdf' || f.format === 'image' || f.format === 'docx' || f.format === 'xlsx')
    .map((f) => f.name)
    .filter((name) => !name.split('/').some((seg) => seg.startsWith('.')))
    .sort();
}

/** Merge `patch` into the active tab in place. Returns the state
 *  unchanged when no tab is active — every caller checks `activeTabId`
 *  first, but the no-op guard keeps the reducer cases short. */
export function patchActiveTab(s: State, patch: Partial<Tab>): State {
  if (s.activeTabId == null) return s;
  return {
    ...s,
    tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, ...patch } : t)),
  };
}

export function remapOnePath(path: string, from: string, to: string, kind: 'file' | 'folder'): string {
  if (!path) return path;
  if (kind === 'file') return path === from ? to : path;
  if (path === from) return to;
  return path.startsWith(from + '/') ? to + path.slice(from.length) : path;
}

function splitPath(path: string): { parent: string; base: string } {
  const i = path.lastIndexOf('/');
  return i < 0 ? { parent: '', base: path } : { parent: path.slice(0, i), base: path.slice(i + 1) };
}

export function renamedFilePath(oldName: string, newBaseName: string): string {
  const extMatch = oldName.match(VIEWABLE_EXTENSION_RE);
  const ext = extMatch ? extMatch[0] : '';
  const lastSlash = oldName.lastIndexOf('/');
  const dir = lastSlash >= 0 ? oldName.slice(0, lastSlash + 1) : '';
  return dir + newBaseName + ext;
}

function uniqueOrder(names: string[]): string[] {
  return [...new Set(names)];
}

export function remapFileOrder(
  order: Record<string, string[]>,
  from: string,
  to: string,
  kind: 'file' | 'folder',
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [parent, names] of Object.entries(order)) {
    const remappedParent = kind === 'folder' ? remapOnePath(parent, from, to, kind) : parent;
    next[remappedParent] = uniqueOrder([...(next[remappedParent] ?? []), ...names]);
  }

  const oldPart = splitPath(from);
  const newPart = splitPath(to);
  const oldList = next[oldPart.parent] ?? [];
  if (oldList.includes(oldPart.base)) {
    if (oldPart.parent === newPart.parent) {
      next[oldPart.parent] = uniqueOrder(oldList.map((name) => (
        name === oldPart.base ? newPart.base : name
      )));
    } else {
      next[oldPart.parent] = oldList.filter((name) => name !== oldPart.base);
      next[newPart.parent] = uniqueOrder([...(next[newPart.parent] ?? []), newPart.base]);
    }
  }

  for (const [parent, names] of Object.entries(next)) {
    if (names.length === 0) delete next[parent];
  }
  return next;
}
