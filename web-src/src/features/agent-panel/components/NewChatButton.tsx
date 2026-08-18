import { useRef, useState } from 'react';
import { ChevronDownIcon, PlusIcon } from '@/common/components/icons';
import { Menu, type MenuItem } from '@/common/components/Menu';
import { AGENT_META, AGENTS, type AgentKind } from '@/common/lib/agentCatalog';
import {
  newChatAgentSelectionPlan,
  readPreferredAgent,
  rememberPreferredAgent,
} from '@/common/lib/agentPreference';
import { ALL_HISTORY_SCOPE } from '@/common/lib/libraryScope';
import { useAppActions } from '@/store/contexts/AppContext';
import { ScopeHistoryButton } from './ScopeHistoryButton';

/** Full-width New Chat entry at the sidebar's top (Cursor's "New
 *  Agent" position) — the app's ONE chat-creation entry point, a split
 *  button. The main area starts a chat with the last-selected agent; the
 *  chevron at the row's right edge only chooses the agent the next main-area
 *  click will use. That click reuses the one completely blank tab regardless
 *  of its agent (switching the blank tab's agent in place when it differs —
 *  `newChatPlan`); any content, draft, attachments, or resumed session means
 *  a fresh tab instead. It opens the chat panel when hidden. The
 *  reused/created tab's scope resolves to the window default (current folder,
 *  else Library) on connect, so no scope needs to be threaded here. */
export function NewChatButton() {
  const { actions } = useAppActions();
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const chevronRef = useRef<HTMLButtonElement | null>(null);

  function startChat(agent: AgentKind) {
    actions.activateChatTab(agent);
  }

  /** Picking from the chevron only updates the next-chat preference. Chat
   *  creation stays behind the main New Chat action. */
  function pickAgent(agent: AgentKind) {
    const plan = newChatAgentSelectionPlan(agent);
    rememberPreferredAgent(plan.preferredAgent);
    if (plan.startAgent) startChat(plan.startAgent);
    setMenuAnchor(null);
  }

  /* Agent NAMES, not "New <Agent> Chat": the row itself says New Chat and
   * now names its agent beside this chevron, so the menu is the picker
   * that changes that name — repeating the whole action per item read as
   * three ways to do the same thing. */
  const agentItems: MenuItem[] = AGENTS.map((agent) => ({
    label: agent.launcherLabel,
    icon: <agent.Icon />,
    onSelect: () => pickAgent(agent.id),
  }));

  // Read at render time, no state: the picker closes its menu after writing,
  // while the other rememberPreferredAgent call sites also dispatch a store
  // update, so this row re-renders with the latest app-wide preference.
  const preferred = AGENT_META[readPreferredAgent()];

  return (
    /* A quiet full-width pill row (Cursor's "New Agent" treatment), not a
     * boxed button — the sidebar's rows carry the hierarchy. The chevron
     * is a subtle affordance revealed on hover/focus (and while its menu
     * is open). There is no keyboard shortcut, so no hint is shown. */
    <div className="flex-none px-1.5 pt-2 pb-3">
      <div className="group/newchat flex min-h-7 w-full items-center rounded-md hover:bg-muted">
        <button
          type="button"
          className="flex min-h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-base text-foreground"
          title={`Start a ${preferred.launcherLabel} chat in the current folder, or across the whole library`}
          onClick={() => startChat(readPreferredAgent())}
        >
          {/* A PLUS, not the agent's mark: this row's job is "make a new
            * chat", and leading with a vendor glyph made the action read
            * as "Codex" with a label attached. Which agent it will use
            * now rides beside the chevron, where the picker that changes
            * it lives. 16px slot around the 14px glyph — every row does
            * this, so the label lands on the shared 38px gutter line. */}
          <span className="inline-flex size-4 flex-none items-center justify-center">
            <PlusIcon className="size-3.5 text-muted-foreground" />
          </span>
          <span className="min-w-0 truncate">New Chat</span>
        </button>
        {/* ALL chat history lives on this row since the Library section
          * retired — with no per-folder rows left, this is the one place
          * every session (each member folder + the library scope) stays
          * reachable; rows resume in their own scope. It sits BEFORE the
          * agent label so the "Codex ⌄" label-plus-picker pair stays
          * adjacent. */}
        <ScopeHistoryButton
          scope={ALL_HISTORY_SCOPE}
          label="Chat history"
        />
        {/* The agent this row will start, named next to its picker — the
          * row would otherwise give no clue which of the two runs, and
          * the menu is where it changes. */}
        <span className="ml-1 shrink-0 truncate text-xs text-muted-foreground">
          {preferred.launcherLabel}
        </span>
        <button
          ref={chevronRef}
          type="button"
          className={
            /* Quiet-icon-button canon (TitlebarControls): muted hover
             * surface; the app-wide `:focus-visible` outline rule paints
             * the translucent halo. Compact size-5 keeps the control
             * inside the row; sub-24px keeps rounded-sm per the corner
             * contract. No right margin beyond mr-1: the chevron's own
             * 20px box already holds the glyph 2px off the agent label,
             * and more read as two unrelated controls rather than one
             * label-plus-picker. size-4 (a step up from the sidebar's
             * 14px glyphs) because this chevron sits beside 11px text.
             * Always visible, muted: the arrow IS the discoverability of
             * the agent menu — hover-only would hide the affordance. */
            'mr-1 inline-flex size-5 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent '
            + 'text-muted-foreground hover:bg-muted hover:text-foreground '
            + '[&_svg]:size-4 '
            + (menuAnchor ? 'bg-muted text-foreground' : '')
          }
          aria-label="Choose agent for new chat"
          aria-haspopup="menu"
          aria-expanded={!!menuAnchor}
          onClick={() => {
            if (menuAnchor) { setMenuAnchor(null); return; }
            const rect = chevronRef.current?.getBoundingClientRect();
            if (rect) setMenuAnchor(rect);
          }}
        >
          <ChevronDownIcon />
        </button>
      </div>
      {menuAnchor && (
        <Menu
          anchor={{ rect: menuAnchor, align: 'right' }}
          minWidth={210}
          items={agentItems}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  );
}
