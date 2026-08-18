import { PanelLeftIcon, PanelRightIcon, SearchIcon } from '@/common/components/icons';
import { formatPrimaryShiftShortcut } from '@/common/lib/platformShortcuts';
import { readPreferredAgent } from '@/common/lib/agentPreference';
import { useAppActions, useChat, useWorkspace } from '@/store/contexts/AppContext';
import { FolderSwitcher } from '@/features/workspace';
import { openLibrarySearch } from '@/common/lib/librarySearchTrigger';
import { TooltipButton } from '@/common/components/TooltipButton';

/* [&_svg]:size-3.5 — the app-wide 14px icon size (one scale everywhere;
 * hierarchy comes from colour/weight/text, never glyph size). */
const controlButtonClass =
  'flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 '
  + 'text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5';

/**
 * Cursor-style window-top controls in the titlebar band: sidebar toggle
 * + library search + the folder switcher at the window's top-left (right
 * of the macOS traffic lights), and the mirrored chat-panel toggle at
 * the top-right — `.titlebar-controls` / `.titlebar-controls-right` in
 * globals.css own the placement. They belong to the APP shell, not the
 * panel columns, so collapsing either panel leaves its toggle in place
 * as the way back in, and the switcher keeps naming the window's folder
 * while the sidebar is collapsed.
 */
export function TitlebarControls() {
  const { sidebarCollapsed: collapsed } = useWorkspace();
  const chat = useChat();
  const chatOpen = chat.chatOpen;
  const { actions, dispatch } = useAppActions();

  /** Opening with NO chat tabs must land on something usable — reuse the
   *  New Chat blank-tab rule (which also opens the panel) instead of
   *  revealing an empty pane. Closing is always a plain toggle. */
  function toggleChat() {
    if (!chatOpen && chat.chatTabs.length === 0) {
      actions.activateChatTab(readPreferredAgent());
      return;
    }
    dispatch({ type: 'CHAT_TOGGLE' });
  }

  return (
    <>
      <div className="titlebar-controls">
        <TooltipButton
          className={controlButtonClass}
          aria-expanded={!collapsed}
          aria-controls="sidebar-panel-files"
          label={`${collapsed ? 'Show' : 'Hide'} sidebar (${formatPrimaryShiftShortcut('E')})`}
          onClick={() => dispatch({ type: 'SIDEBAR_SET_COLLAPSED', collapsed: !collapsed })}
        >
          <PanelLeftIcon />
        </TooltipButton>
        <TooltipButton
          className={controlButtonClass}
          aria-haspopup="dialog"
          label={`Search (${formatPrimaryShiftShortcut('F')})`}
          onClick={() => openLibrarySearch()}
        >
          <SearchIcon />
        </TooltipButton>
        {/* Hairline between the icon utilities and the folder identity —
          * short and centered, not a full-band cut. */}
        <span className="mx-1.5 h-4 w-px flex-none bg-border" aria-hidden="true" />
        <FolderSwitcher />
      </div>
      <div className="titlebar-controls-right">
        <TooltipButton
          className={controlButtonClass}
          aria-expanded={chatOpen}
          label={`${chatOpen ? 'Hide' : 'Show'} chat panel`}
          onClick={toggleChat}
        >
          <PanelRightIcon />
        </TooltipButton>
      </div>
    </>
  );
}
