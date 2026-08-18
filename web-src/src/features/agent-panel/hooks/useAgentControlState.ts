import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useStateWithRef } from '@/common/hooks/useStateWithRef';
import {
  folderMenuEntries,
  libraryScopesEqual,
  type LibraryScope,
} from '@/common/lib/libraryScope';
import type { WorkspaceState } from '@/store/contexts/AppContext';
import type { AgentPanelCapabilities } from '@/common/lib/agentCatalog';
import { chatScopePill, folderMenuLocked, newChatScope, windowFolderSwitchPlan } from '@/features/agent-panel/lib/folderState';
import { effortMenuLocked } from '@/features/agent-panel/lib/effortMenuState';
import { modelMenuLocked, modelMenuVisible, type ModelControlState } from '@/features/agent-panel/lib/modelState';
import type { QueuedPrompt } from '@/features/agent-panel/hooks/useAgentPromptQueue';
import type { Attachment, Block, EffortLevel, PermMode } from '@/features/agent-panel/lib/types';

/** The composer's four pills — access mode, thinking effort, model, and
 *  session scope — plus the resumed-session flags that lock them. Every
 *  control here either applies live on the open socket or reconnects, so
 *  the session core injects `wsRef`, `reconnect`, and `resetSessionState`
 *  rather than this hook reaching for the transport itself.
 *
 *  Scope lives here too, but the CONNECTED scope is written by the core's
 *  connect effect and by `scope-changed`: this hook owns the state cell and
 *  the pill derived from it, and hands the core the setter and ref.
 *
 *  Unsent draft presence is state of this hook rather than the core's: the
 *  window-folder rule below is its only reader, and the core needs nothing
 *  but the rendered flag for blank-tab reporting. */
export function useAgentControlState({
  workspace,
  capabilities,
  blocks,
  turnActive,
  blocksRef,
  turnActiveRef,
  queuedPromptsRef,
  attachmentsRef,
  sessionIdRef,
  wsRef,
  reconnect,
  resetSessionState,
}: {
  workspace: WorkspaceState;
  capabilities: AgentPanelCapabilities;
  blocks: Block[];
  turnActive: boolean;
  blocksRef: RefObject<Block[]>;
  turnActiveRef: RefObject<boolean>;
  queuedPromptsRef: RefObject<QueuedPrompt[]>;
  attachmentsRef: RefObject<Attachment[]>;
  sessionIdRef: RefObject<string | null>;
  wsRef: RefObject<WebSocket | null>;
  reconnect: () => void;
  resetSessionState: (options: { resumeId?: string | null }) => void;
}) {
  // Permission mode for this session — drives the composer's Modes
  // dropdown. Switching it sends `set-mode` so the agent applies it live.
  // Sessions start in Auto; picking Ask ('default') is an explicit choice.
  const [mode, setMode, modeRef] = useStateWithRef<PermMode>('auto');
  // Thinking effort is opt-in. Undefined preserves the native runtime
  // default; an explicit choice rides the connect URL for a new session.
  const [effort, setEffort, effortRef] = useStateWithRef<EffortLevel | undefined>(undefined);
  const [restoredClaudeSession, setRestoredClaudeSession] = useState(false);
  const [effortInherited, setEffortInherited] = useState(false);
  // User intent and runtime telemetry must stay separate: an active model
  // reached through Default must never become an explicit override later.
  const [modelControl, setModelControl, modelControlRef] = useStateWithRef<ModelControlState>({ models: [], notice: null, resumedSession: false });
  // Session scope (Cursor-style picker: a library folder, or "Library").
  // `pickedScope` is the user's explicit choice for the NEXT session;
  // undefined follows the window default (current folder, else library).
  // `connectedScope` is the binding the live session actually connected
  // with — captured per connect and never rebound.
  const [pickedScope, setPickedScope, pickedScopeRef] = useStateWithRef<LibraryScope | undefined>(undefined);
  const [connectedScope, setConnectedScope, connectedScopeRef] = useStateWithRef<LibraryScope | null>(null);
  // Unsent draft text lifted from the composer: a draft freezes the tab's
  // scope on a window-folder switch and keeps the tab from counting as a
  // reusable blank welcome tab.
  const [hasDraftText, setHasDraftText, hasDraftTextRef] = useStateWithRef(false);

  // An unbound tab that is still empty and draft-free follows the window's
  // folder: a sidebar switch reconnects its next (empty) session to the
  // new window default. A tab holding an unsent draft freezes its scope
  // (the draft keeps the binding the user saw). Bound tabs — content,
  // queued prompts, an explicit pick, or a resume — keep their session
  // and transcript untouched.
  useEffect(() => {
    const plan = windowFolderSwitchPlan({
      connectedScope: connectedScopeRef.current,
      picked: pickedScopeRef.current,
      resumedSession: modelControlRef.current.resumedSession,
      hasContent: blocksRef.current.length > 0 || queuedPromptsRef.current.length > 0,
      turnActive: turnActiveRef.current,
      hasDraft: hasDraftTextRef.current || attachmentsRef.current.length > 0,
      windowFolder: workspace.folderPath,
    });
    if (plan === 'freeze') {
      // Promote the connected scope to an explicit pick so a draft can
      // never be silently rebound by this or a later window switch.
      setPickedScope(connectedScopeRef.current ?? undefined);
      return;
    }
    if (plan !== 'follow') return;
    reconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow-mode only reacts to window-folder changes
  }, [workspace.folderPath]);

  /** Report whether the composer currently holds unsent draft text. */
  function handleDraftChange(hasText: boolean) {
    setHasDraftText(hasText);
  }

  /** Switch permission mode and tell the server to apply it live. */
  function changeMode(m: PermMode) {
    setMode(m);
    wsRef.current?.send(JSON.stringify({ t: 'set-mode', mode: m }));
  }

  /** Change thinking effort. Restored idle transcripts reconnect to the same
   * native session; their visible history is retained. */
  function changeEffort(level: EffortLevel | undefined) {
    if (effortMenuLocked(blocks.length > 0, turnActive, restoredClaudeSession)) return;
    setEffort(level);
    setEffortInherited(false);
    if (blocks.length > 0 && sessionIdRef.current) {
      // Resume the same native session with the transcript kept. The guard
      // above means this runs only while idle, so the reset's queue,
      // tool-name, and turn-settle steps are no-ops (an idle session has
      // drained its queue and settled its turn) — the reset contributes
      // resumeId + phase + a connect-nonce bump, plus clearing any
      // leftover fatal exactly like the other reconnect paths.
      resetSessionState({ resumeId: sessionIdRef.current });
    } else {
      reconnect();
    }
  }

  /** Pick the session scope (a library folder, or the whole library) for
   * this tab's NEXT session. Like a model change it reconnects, and it is
   * refused once the conversation has content — a live session is never
   * rebound to another scope. Picking the window default returns the tab
   * to follow-the-window. */
  function changeScope(next: LibraryScope) {
    if (blocks.length > 0 || turnActive || modelControl.resumedSession) return;
    setPickedScope(libraryScopesEqual(next, newChatScope(workspace.folderPath)) ? undefined : next);
    reconnect();
  }

  /** Changing model starts a new native session. A resumed or populated
   * transcript is immutable here, so it can never silently switch models. */
  function changeModel(next: string | undefined) {
    if (blocks.length > 0 || turnActive) return;
    setModelControl((current) => ({ ...current, selectedModel: next, activeModel: undefined, notice: null, resumedSession: false }));
    reconnect();
  }

  const effortLocked = effortMenuLocked(blocks.length > 0, turnActive, restoredClaudeSession);
  const modelLocked = modelMenuLocked(blocks.length > 0, turnActive);
  // Session-scope pill state. The shown scope is the live binding once
  // connected, else the scope the next session would bind (picked scope or
  // the window default, so unbound tabs follow the sidebar).
  const memberPaths = useMemo(() => workspace.recent.map((entry) => entry.path), [workspace.recent]);
  const folderEntries = useMemo(
    () => folderMenuEntries(workspace.recent, workspace.folderPath),
    [workspace.recent, workspace.folderPath],
  );
  const folderLocked = folderMenuLocked(blocks.length > 0, turnActive, modelControl.resumedSession);
  const sessionScope = chatScopePill({
    connectedScope,
    picked: pickedScope,
    windowFolder: workspace.folderPath,
    memberPaths,
  });
  const modelVisible = modelMenuVisible(capabilities?.models === true, modelControl.models);
  const effectiveModel = modelControl.activeModel ?? modelControl.selectedModel;
  const supportedEfforts = modelControl.models.find((entry) => entry.id === effectiveModel)?.supportedEfforts;

  return {
    mode,
    modeRef,
    changeMode,
    effort,
    effortRef,
    setEffort,
    effortInherited,
    setEffortInherited,
    effortLocked,
    changeEffort,
    supportedEfforts,
    restoredClaudeSession,
    setRestoredClaudeSession,
    modelControl,
    setModelControl,
    modelControlRef,
    modelLocked,
    modelVisible,
    changeModel,
    pickedScope,
    setPickedScope,
    pickedScopeRef,
    connectedScope,
    setConnectedScope,
    connectedScopeRef,
    folderEntries,
    folderLocked,
    sessionScope,
    changeScope,
    hasDraftText,
    handleDraftChange,
  };
}
