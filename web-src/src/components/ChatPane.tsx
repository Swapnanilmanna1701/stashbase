/**
 * Right-side chat panel — Cursor-style tabbed chats. Each tab in
 * `state.chatTabs` renders a structured agent panel. Claude routes to the
 * Claude Agent SDK bridge; Codex routes to the Codex app-server bridge.
 * All tabs stay mounted at once so switching preserves each session's
 * state (inactive tabs are absolutely-positioned + `visibility: hidden`).
 * The sidebar's New Chat split button is the one creation entry point;
 * the tabs here switch between (and close) existing chats.
 */
import * as React from 'react';
import type { ReactNode } from 'react';
import { AgentView } from './AgentView';
import { LazyLoadBoundary } from './ErrorBoundary';
import { agentMeta, isAgentKind } from '../agentCatalog';
import { cn } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { rememberPreferredAgent } from '../agentPreference';

/** One tab body. Inactive panes stay mounted (preserving each session's
 *  state) but render invisible and inert. */
const tabPaneClass = 'absolute inset-0 flex flex-col';
const chatTabId = (id: string) => `chat-tab-${id}`;
const chatPanelId = (id: string) => `chat-panel-${id}`;

/** The inside of one tab body; `status` styles the "no active chat" notice
 *  and the lazy-load error fallback. */
export const chatStatusClass =
  'flex min-h-0 flex-1 flex-col overflow-hidden px-4.5 py-4 text-sm text-muted-foreground';

/** Brand glyph for a tab's agent, shown before its title. */
function AgentGlyph({ agent }: { agent: string }) {
  const Icon = agentMeta(agent).Icon;
  return <Icon className="size-3.25 shrink-0" />;
}

export function ChatSessionBoundary({
  tabId,
  active,
  children,
}: {
  tabId: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <LazyLoadBoundary
      className={chatStatusClass}
      label="chat session"
      resetKey={`${tabId}:${active ? 'active' : 'inactive'}`}
    >
      {children}
    </LazyLoadBoundary>
  );
}

export function ChatPane() {
  const { state, dispatch } = useApp();
  // The panel renders with or without a window folder: chats are scoped
  // per tab (a library folder, or the whole library), so a no-folder
  // window can still hold library-wide chats.
  const tabs = state.chatTabs;
  const activeId = state.activeChatTabId;

  return (
    <aside
      className="chat-pane-shell"
      aria-label="Agent chat"
      aria-hidden={!state.chatOpen || undefined}
      inert={!state.chatOpen || undefined}
    >
      {/* Cursor-style tab strip. Scrolls horizontally when many tabs are
        * open; new tabs come from the sidebar's New Chat button, so it is
        * tabs-only. pr-10 reserves the window's top-right corner for the
        * shell's floating chat toggle (TitlebarControls).
        *
        * Geometry mirrors the document strip (`.tab-strip` in
        * mainpane.css): 6px above, NOTHING below, tabs bottom-aligned.
        * The two strips sit side by side across the window, so a 4px
        * bottom pad here left the chat tabs floating above a line the
        * document tabs sat on. Change one, change both. */}
      <div className="chat-tab-row flex min-h-8 items-end gap-1 pt-1.5 pr-10 pl-2">
        <div
          className="scrollbar-quiet flex flex-1 gap-0.5 overflow-x-auto overflow-y-hidden"
          role="tablist"
          aria-label="Chat sessions"
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={cn(
                // text-base (13px) matches the document tabs in the main
                // pane — the two tab strips are one role, one size.
                // text-sm (12px) + py-1.5 (6px) = the document tab's exact
                // type size and vertical padding, so both strips' tabs
                // stand the same height in the same voice.
                'group/tab inline-flex max-w-45 min-w-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-transparent border-b-0 py-1.5 pr-1.5 pl-2.5 text-sm whitespace-nowrap text-muted-foreground select-none hover:bg-muted hover:text-foreground',
                // bg-canvas, not bg-background: an active tab takes the
                // colour of the surface it fronts, and this one fronts
                // the chat canvas — `bg-background` is the document
                // pane's paper white, which made the tab a bright chip
                // floating on a panel it is supposed to open into. The
                // border, weight, and text colour carry the selection.
                tab.id === activeId && 'border-border bg-canvas font-medium text-foreground hover:bg-canvas',
              )}
              role="tab"
              id={chatTabId(tab.id)}
              aria-selected={tab.id === activeId}
              aria-controls={chatPanelId(tab.id)}
              tabIndex={tab.id === activeId ? 0 : -1}
              onClick={() => {
                if (isAgentKind(tab.agent)) rememberPreferredAgent(tab.agent);
                dispatch({ type: 'CHAT_TAB_ACTIVATE', id: tab.id });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  dispatch({ type: 'CHAT_TAB_ACTIVATE', id: tab.id });
                  return;
                }
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const nextIndex = event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                const next = tabs[nextIndex];
                if (!next) return;
                dispatch({ type: 'CHAT_TAB_ACTIVATE', id: next.id });
                requestAnimationFrame(() => document.getElementById(chatTabId(next.id))?.focus());
              }}
              title={tab.title}
            >
              <AgentGlyph agent={tab.agent} />
              {/* min-w-0 lets the label shrink so the ellipsis renders. */}
              <span className="min-w-0 overflow-hidden text-ellipsis">{tab.title}</span>
              <button
                type="button"
                className={cn(
                  'size-4.5 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent text-lg/none text-muted-foreground hover:bg-muted hover:text-foreground',
                  // Hidden by default — surfaces on tab hover or for the
                  // active tab, avoiding clutter with many tabs open.
                  tab.id === activeId ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                )}
                aria-label={`Close ${tab.title}`}
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'CHAT_TAB_CLOSE', id: tab.id });
                }}
              >×</button>
            </div>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(tabPaneClass, tab.id === activeId ? 'visible' : 'invisible pointer-events-none')}
            role="tabpanel"
            id={chatPanelId(tab.id)}
            aria-labelledby={chatTabId(tab.id)}
            aria-hidden={tab.id !== activeId}
          >
            <ChatSessionBoundary tabId={tab.id} active={tab.id === activeId}>
              {/* Keyed by tab id AND agent: when the New Chat split button
                * switches a blank tab's agent in place, the old agent's
                * idle connection tears down with its unmounting AgentView
                * and the new agent connects on a fresh mount. */}
              <AgentView
                key={`${tab.id}:${tab.agent}`}
                active={tab.id === activeId}
                id={tab.id}
                title={tab.title}
                agent={isAgentKind(tab.agent) ? tab.agent : 'claude'}
              />
            </ChatSessionBoundary>
          </div>
        ))}
        {tabs.length === 0 && (
          <div className={chatStatusClass}>
            No active chat. Click <strong>New Chat</strong> in the sidebar to
            start one.
          </div>
        )}
      </div>
    </aside>
  );
}
