/**
 * Structured chat view for an agent tab — the VSCode-extension-style
 * panel. Both Claude (Agent SDK) and Codex (app-server) connect through the
 * Shared Agent Contract at `/ws/agent`; their adapters live in server.
 * Both render the event stream as ordered blocks:
 * user / assistant bubbles, collapsible thinking, tool cards with
 * inline diffs + approve/reject, and error notices. A composer at the
 * bottom sends prompts, stops a running turn, takes dropped files, and
 * `@`-mentions library files.
 *
 * This component is composition: connection/session state lives in
 * `useAgentSession`, attachment upload/preview bookkeeping lives in
 * `useAgentAttachments`, and the runtime-not-ready cards live in
 * `AgentRuntimeGate`. See those modules for the actual state machine.
 *
 * See design-docs/architecture.md §8 for the shared library path.
 */
import { useState } from 'react';
import type { AgentKind } from '@/common/lib/agentCatalog';
import { FILE_MIME } from '@/common/lib/dragMime';
import { acceptsAgentContextDrop, dragPayloadKinds } from '@/common/lib/dragRouting';
import { useAppActions, useChat, useWorkspace } from '@/store/contexts/AppContext';
import { Button } from 'react-aria-components';
import { buttonVariants } from '@/common/components/ui/button';
import { AgentComposer } from '@/features/agent-panel/components/AgentComposer';
import { AgentRuntimeGate } from '@/features/agent-panel/components/AgentRuntimeGate';
import { EmptyChatGreeting, EmptyChatSuggestion } from '@/features/agent-panel/components/AgentEmptyState';
import { MessageList } from '@/features/agent-panel/components/AgentMessages';
import { useAgentAttachments } from '@/features/agent-panel/hooks/useAgentAttachments';
import { useAgentSession } from '@/features/agent-panel/hooks/useAgentSession';
import { openSettings } from '@/common/lib/settingsTrigger';

export function AgentView({
  active,
  id,
  title,
  agent = 'claude',
}: {
  active: boolean;
  id: string;
  title: string;
  agent?: AgentKind;
}) {
  const workspace = useWorkspace();
  const chat = useChat();
  const { dispatch, actions } = useAppActions();

  // Composer attachments (context files) — lifted here so a drop anywhere
  // on the panel, the composer `+`, and the send path all share one list.
  const attach = useAgentAttachments({ toast: actions.toast });

  const session = useAgentSession({
    active,
    id,
    title,
    agent,
    workspace,
    chat,
    dispatch,
    actions,
    attachments: attach.attachments,
    attachmentsRef: attach.attachmentsRef,
    clearComposerAttachments: attach.clearComposerAttachments,
    discardAttachmentsForReset: attach.discardAttachmentsForReset,
  });
  // The session groups its state by owner; destructure the namespaces once
  // so the JSX below reads as composition rather than prop threading.
  const { controls, mentions, queue, runtime, skills, transcript } = session;

  const [dragOver, setDragOver] = useState(false);

  // Drag files anywhere onto the panel to attach them as context: OS files
  // (Finder screenshots / PDFs) become transient attachments (temp dir,
  // NOT the folder); sidebar files (FILE_MIME) reference their existing
  // path. `stopPropagation` is load-bearing: it stops the event before it
  // reaches the window-level `useGlobalDragDrop` listener, which would
  // otherwise *also* fire and import the file into the folder.
  function onPanelDragOver(e: React.DragEvent) {
    const kinds = dragPayloadKinds(e.dataTransfer);
    if (!acceptsAgentContextDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    // The sidebar drag source sets effectAllowed='move'; match it so the
    // drop isn't silently cancelled (OS files accept 'copy').
    e.dataTransfer.dropEffect = kinds.internalFile && !kinds.osFiles ? 'move' : 'copy';
    if (transcript.phase === 'live') setDragOver(true);
  }
  function onPanelDragLeave(e: React.DragEvent) {
    // Only clear when the pointer actually leaves the panel, not when it
    // crosses between child elements.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
  }
  function onPanelDrop(e: React.DragEvent) {
    if (!acceptsAgentContextDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (transcript.phase !== 'live') return;
    const osFiles = Array.from(e.dataTransfer.files ?? []);
    if (osFiles.length) void attach.uploadFiles(osFiles);
    else {
      const filePath = e.dataTransfer.getData(FILE_MIME);
      if (filePath) attach.addFolderFiles([filePath], mentions.knownFilePaths);
    }
  }

  // Runtime-readiness gates, most fundamental first: discovery has not
  // answered yet, preparation is running, preparation failed, CLI missing.
  // Chat UI below owns the pane once the runtime is usable.
  const showRuntimeGate = !runtime.runtime || runtime.bootstrapActive || runtime.bootstrapFailed || runtime.runtimeUnavailable;

  // Empty chat (no turns yet, session usable) renders the hero layout:
  // greeting + centered composer + starter templates. Any transcript
  // content, a queued prompt, or a closed/failed session falls back to the
  // standard transcript-over-bottom-composer layout. The composer keeps its
  // `key` so the same mounted instance moves between the two layouts.
  const emptyChat = transcript.blocks.length === 0 && queue.queuedTurns.length === 0 && transcript.phase !== 'closed' && !transcript.fatal;

  return (
    // `agent-view` stays as a routing hook: useGlobalDragDrop uses
    // `closest('.agent-view')` to keep panel drops out of folder import.
    <div
      // Documents are paper (base); chat sits on the CANVAS role — a cool
      // near-white between paper and chrome, identical in BOTH layouts,
      // floating its white cards (user turns, composer, code blocks). The
      // surface never changes with layout, so opening a document only
      // resizes the panel — no mode jump.
      className="agent-view relative flex min-h-0 flex-1 flex-col bg-canvas"
      onDragOver={onPanelDragOver}
      onDragLeave={onPanelDragLeave}
      onDrop={onPanelDrop}
    >
      {dragOver && (
        // pointer-events-none so the overlay never steals the drop or
        // flickers dragenter/leave; the panel's own handlers take the drop.
        <div className="pointer-events-none absolute inset-1.5 z-20 grid place-items-center rounded-xl border-2 border-dashed border-accent/55 bg-accent/7 backdrop-blur-[1.5px]">
          <div className="rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-elevation">Drop files to add as context</div>
        </div>
      )}
      {/* No pane header: the chat tab already names the conversation and
        * the composer's scope pill carries the binding — repeating either
        * here was pure noise. */}
      {showRuntimeGate ? (
        <AgentRuntimeGate
          runtime={runtime.runtime}
          fallbackName={session.meta.name}
          bootstrapActive={runtime.bootstrapActive}
          bootstrapFailed={runtime.bootstrapFailed}
          runtimeUnavailable={runtime.runtimeUnavailable}
          onRefresh={() => void runtime.refreshRuntimes()}
          onCheck={() => void runtime.checkRuntime()}
          onInstall={() => void runtime.startRuntimeBootstrap()}
          onLogin={() => void runtime.loginToCodex()}
          onCopyInstall={runtime.copyInstallHint}
          onOpenMcpSetup={() => openSettings('mcp')}
        />
      ) : <>
        {emptyChat ? (
          // Empty chat: the composer is the hero. The greeting bottoms out
          // this flex-[3] band and the rotating suggestion bottoms out the
          // flex-[4] band below the composer, so the input rests just above
          // the vertical center (Cursor-style) at every panel height.
          <div key="empty-above" className="flex min-h-0 flex-[3] flex-col justify-end overflow-hidden px-2">
            <div className="mx-auto w-[min(640px,100%)]">
              <EmptyChatGreeting
                agentShortName={session.meta.shortName}
                connecting={transcript.phase === 'connecting'}
              />
            </div>
          </div>
        ) : (
          <MessageList
            key="messages"
            blocks={transcript.blocks}
            queuedTurns={queue.queuedTurns}
            turnActive={transcript.turnActive}
            turnMeta={transcript.turnMeta}
            phase={transcript.phase}
            fatal={transcript.fatal}
            fatalRecoveryLabel={transcript.fatalRecoveryLabel}
            agentKind={agent}
            agentShortName={session.meta.shortName}
            onTurnFailureAction={transcript.handleTurnFailureAction}
            onPermission={transcript.replyPermission}
            onSteerQueued={queue.steerQueuedPrompt}
            onCopyUserMessage={transcript.copyUserMessage}
            onResendUserMessage={queue.resend}
            onRetry={transcript.reconnectAfterFatal}
            onOpenArtifact={transcript.openArtifactLink}
          />
        )}
        {transcript.phase === 'closed' && !transcript.fatal && (
          <div className="flex items-center justify-between gap-2.5 border-t border-border px-3 py-2 text-sm text-muted-foreground">
            <span>Session ended.</span>
            <Button className={buttonVariants({ variant: 'outline', size: 'sm' })} onPress={transcript.reconnect}>Reconnect</Button>
          </div>
        )}
      <AgentComposer
        key="composer"
        hero={emptyChat}
        phase={transcript.phase}
        disabled={transcript.phase !== 'live'}
        turnActive={transcript.turnActive}
        active={active}
        agentShortName={session.meta.shortName}
        prefill={transcript.prefill}
        mode={{ show: runtime.capabilities?.modes === true, value: controls.mode, onSet: controls.changeMode }}
        effort={{
          show: runtime.capabilities?.effort === true,
          level: controls.effort,
          inherited: controls.effortInherited,
          locked: controls.effortLocked,
          supported: controls.supportedEfforts,
          onSet: controls.changeEffort,
        }}
        model={{
          show: controls.modelVisible,
          selected: controls.modelControl.selectedModel,
          active: controls.modelControl.activeModel,
          models: controls.modelControl.models,
          locked: controls.modelLocked,
          notice: controls.modelControl.notice,
          resumedSession: controls.modelControl.resumedSession,
          onSet: controls.changeModel,
        }}
        scope={{
          current: controls.sessionScope,
          entries: controls.folderEntries,
          homeDir: workspace.homeDir,
          locked: controls.folderLocked,
          onSet: controls.changeScope,
        }}
        mentions={{ files: mentions.mentionFiles, folders: mentions.mentionFolders }}
        skills={{ list: skills.skills, state: skills.skillState, onRefresh: skills.refreshSkills }}
        attachments={{
          items: attach.attachments,
          uploading: attach.uploading,
          onPick: attach.uploadFiles,
          onPasteImages: attach.pasteImages,
          onRemove: attach.removeAttachment,
        }}
        onDraftChange={controls.handleDraftChange}
        onFocusChange={transcript.setAgentComposerFocused}
        onSend={queue.send}
        onStop={transcript.stop}
      />
      {emptyChat && (
        <div key="empty-below" className="scrollbar-quiet flex min-h-0 flex-[4] flex-col overflow-y-auto px-2">
          {/* mt-auto pins the suggestion toward the pane's bottom edge when
            * there is room, turning the leftover space into deliberate
            * composition; on short panels it simply sits below the composer. */}
          <div className="mt-auto shrink-0">
            <EmptyChatSuggestion
              onPrefill={(text) => transcript.setPrefill({ text, nonce: Date.now() })}
              libraryScoped={controls.sessionScope.kind === 'library'}
            />
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
