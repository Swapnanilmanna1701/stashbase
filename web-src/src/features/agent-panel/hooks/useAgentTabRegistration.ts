import { useEffect } from 'react';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import { folderScope, LIBRARY_SCOPE, type LibraryScope } from '@/common/lib/libraryScope';
import type { Action, ChatState } from '@/store/contexts/AppContext';
import { shouldConsumePendingResume } from '@/features/agent-panel/lib/sessionHistory';
import type { AgentKind } from '@/common/lib/agentCatalog';

/** The two ways one Chat tab talks back to the shared tab model: it reports
 *  its own blankness, and — when it is the blank tab the sidebar meant — it
 *  claims the pending History resume.
 *
 *  Both are self-contained: they read `chat` and write through `dispatch`,
 *  and neither touches the socket, the transcript, or the session reset
 *  path, so they compose beside the session core instead of inside it. */
export function useAgentTabRegistration({
  id,
  active,
  agent,
  blank,
  chat,
  dispatch,
  resumeSession,
}: {
  id: string;
  active: boolean;
  agent: AgentKind;
  /** Whether this tab is COMPLETELY blank right now — no transcript, no
   *  active turn, not resumed, no picked scope, no draft text, no
   *  attachments — which is what makes it the reusable welcome tab for New
   *  Chat and window-folder switches. */
  blank: boolean;
  chat: ChatState;
  dispatch: (a: Action) => void;
  resumeSession: (sessionId: string, scope: LibraryScope) => void | Promise<void>;
}) {
  const storedBlank = chat.chatTabs.find((tab) => tab.id === id)?.blank ?? true;
  useEffect(() => {
    if (storedBlank !== blank) dispatch({ type: 'CHAT_TAB_SET_BLANK', id, blank });
  }, [blank, storedBlank, dispatch, id]);

  // The guards below must read the values as of the moment the request
  // arrives (or this tab becomes active), not as of the render that bound
  // the effect — a blankness change alone must never re-run the handoff.
  const blankRef = useLatestRef(blank);
  const resumeSessionRef = useLatestRef(resumeSession);

  // Sidebar History handoff: the sidebar recorded a pending resume and
  // ensured a suitable tab is active; the ACTIVE, still-blank tab running
  // the request's agent takes it. Consume-and-clear BEFORE resuming so the
  // request can never double-fire, and never hijack a non-blank tab.
  const pendingResume = chat.pendingResume;
  useEffect(() => {
    if (!pendingResume) return;
    if (!shouldConsumePendingResume({
      active,
      tabAgent: agent,
      requestAgent: pendingResume.agent,
      blank: blankRef.current,
    })) return;
    dispatch({ type: 'CHAT_RESUME_CONSUMED' });
    void resumeSessionRef.current(
      pendingResume.sessionId,
      pendingResume.folder === null ? LIBRARY_SCOPE : folderScope(pendingResume.folder),
    );
  }, [pendingResume, active, agent, dispatch, blankRef, resumeSessionRef]);
}
