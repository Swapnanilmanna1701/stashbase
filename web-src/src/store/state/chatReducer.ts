/**
 * Chat sub-reducer: the right-side Agent Panel's tab bookkeeping. Composed
 * with the workspace and ui-shell sub-reducers by `stateReducer.ts`; every
 * case rebuilds only `ChatSlice`, and an action this slice does not own
 * answers `undefined`.
 *
 * `chatTabRecencyByAgent` is never written inline — every case states its
 * intent through `updateChatTabRecency` so the five that maintain it cannot
 * drift apart.
 */
import type { Action, ChatSlice } from './state';
import {
  clampChatWidth,
  mostRecentChatTab,
  retitledForAgentSwitch,
  updateChatTabRecency,
} from './stateHelpers';

/** Patch one tab in place, leaving the strip order untouched. */
function patchTab(c: ChatSlice, id: string, patch: Partial<ChatSlice['chatTabs'][number]>): ChatSlice {
  return { ...c, chatTabs: c.chatTabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/**
 * Close a chat tab. When it was the visible one, focus jumps to a neighbour
 * — preferring the tab that slid into its slot, falling back to the one on
 * its left. Closing the last tab folds the panel: an empty panel is dead
 * space, and the sidebar's New Chat button is the way back in.
 */
function closeTab(c: ChatSlice, id: string): ChatSlice {
  const idx = c.chatTabs.findIndex((t) => t.id === id);
  if (idx < 0) return c;
  const closedTab = c.chatTabs[idx];
  const nextTabs = c.chatTabs.filter((t) => t.id !== id);
  const nextActive = c.activeChatTabId === id
    ? (nextTabs[idx]?.id ?? nextTabs[idx - 1]?.id ?? null)
    : c.activeChatTabId;
  return {
    ...c,
    chatTabs: nextTabs,
    activeChatTabId: nextActive,
    chatTabRecencyByAgent: updateChatTabRecency(c.chatTabRecencyByAgent, {
      forget: closedTab,
      remember: nextTabs.find((tab) => tab.id === nextActive),
    }),
    chatOpen: nextTabs.length === 0 ? false : c.chatOpen,
  };
}

/**
 * Switch a COMPLETELY BLANK tab's agent in place (the New Chat split button
 * reusing a blank tab of the other agent). A tab with content, a draft,
 * attachments, or a resumed session is user work and never switches agent —
 * `blank === undefined` means its AgentView has not reported yet, and fresh
 * tabs start blank, so that counts as blank. The tab's recency entry moves
 * from the old agent's bucket to the new one so per-agent most-recent lookups
 * stay coherent.
 */
function setTabAgent(c: ChatSlice, id: string, agent: string): ChatSlice {
  const tab = c.chatTabs.find((t) => t.id === id);
  if (!tab || tab.blank === false || tab.agent === agent) return c;
  const sameAgentOthers = c.chatTabs.filter((t) => t.id !== id && t.agent === agent);
  const next = { ...tab, agent, title: retitledForAgentSwitch(tab.title, sameAgentOthers.length) };
  return {
    ...c,
    chatTabs: c.chatTabs.map((t) => (t.id === id ? next : t)),
    chatTabRecencyByAgent: updateChatTabRecency(c.chatTabRecencyByAgent, {
      forget: tab,
      remember: next,
    }),
  };
}

export function chatReducer(c: ChatSlice, a: Action): ChatSlice | undefined {
  switch (a.type) {
    case 'CHAT_TOGGLE':
      return { ...c, chatOpen: !c.chatOpen };
    case 'CHAT_WIDTH':
      // Clamp to sensible bounds. Below ~280 the prompt wraps every
      // word; above ~70% of viewport leaves no room for content.
      return { ...c, chatWidth: clampChatWidth(a.width) };
    case 'AGENTS_LOADED':
      return { ...c, agents: a.agents };
    case 'CHAT_AGENT_OPEN': {
      const existingTab = mostRecentChatTab(c, a.agent);
      const tab = existingTab ?? a.tab;
      if (!tab) return c;
      return {
        ...c,
        chatOpen: true,
        chatTabs: existingTab ? c.chatTabs : [...c.chatTabs, tab],
        activeChatTabId: tab.id,
        chatTabRecencyByAgent: updateChatTabRecency(c.chatTabRecencyByAgent, { remember: tab }),
      };
    }
    case 'CHAT_TAB_NEW':
      return {
        ...c,
        chatTabs: [...c.chatTabs, a.tab],
        activeChatTabId: a.tab.id,
        chatTabRecencyByAgent: updateChatTabRecency(c.chatTabRecencyByAgent, { remember: a.tab }),
      };
    case 'CHAT_TAB_CLOSE':
      return closeTab(c, a.id);
    case 'CHAT_TAB_ACTIVATE': {
      const tab = c.chatTabs.find((candidate) => candidate.id === a.id);
      if (!tab) return c;
      return {
        ...c,
        activeChatTabId: a.id,
        chatTabRecencyByAgent: updateChatTabRecency(c.chatTabRecencyByAgent, { remember: tab }),
      };
    }
    case 'CHAT_TAB_RENAME':
      return patchTab(c, a.id, { title: a.title });
    case 'CHAT_TAB_SET_BLANK':
      return patchTab(c, a.id, { blank: a.blank });
    case 'CHAT_TAB_SET_AGENT':
      return setTabAgent(c, a.id, a.agent);
    case 'CHAT_TAB_SET_SCOPE':
      return patchTab(c, a.id, { boundFolder: a.folder });
    case 'CHAT_RESUME_REQUEST':
      // A fresh request replaces an unconsumed one — the sidebar ensures a
      // suitable tab in the same interaction, so at most one is in flight.
      return { ...c, pendingResume: a.resume };
    case 'CHAT_RESUME_CONSUMED':
      return c.pendingResume ? { ...c, pendingResume: null } : c;
    case 'CHAT_TABS_RESET':
      // Wipes ALL tabs — called when the window LOSES its folder context
      // (library removal / another window closing the folder; the server
      // ends this window's agent sessions in those flows). A plain folder
      // switch never dispatches this: sessions are folder-bound and tabs
      // survive the switch. Fold the panel too, mirroring CHAT_TAB_CLOSE.
      return {
        ...c,
        chatTabs: [],
        activeChatTabId: null,
        chatTabRecencyByAgent: {},
        pendingResume: null,
        chatOpen: false,
      };
    default:
      // Not this slice's action — see the composition note in `stateReducer.ts`.
      return undefined;
  }
}
