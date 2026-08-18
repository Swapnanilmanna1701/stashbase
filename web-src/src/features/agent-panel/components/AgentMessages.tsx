/**
 * The transcript itself: the scrolling block list, how one turn's reply is
 * laid out (live-flat while streaming, work trace + answer once settled),
 * and the session-level notices around it. The user half of a turn lives in
 * `AgentUserTurn`, the tool surface in `AgentToolActivity`, and the pure
 * turn model in `lib/turnModel`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { AgentMarkdown } from '@/features/agent-panel/components/AgentMarkdown';
import { ChevronDownIcon, CopyIcon, MoreHorizontalIcon } from '@/common/components/icons';
import { Menu, type MenuItem } from '@/common/components/Menu';
import { cn } from '@/common/lib/utils';
import { StatusMessage } from '@/common/components/ui/status';
import { ToolActivityGroup, PermissionCard } from '@/features/agent-panel/components/AgentToolActivity';
import { MessageAttachments, UserMessageText, UserTurnHead } from '@/features/agent-panel/components/AgentUserTurn';
import { accentDotClass, outlineSmClass, spinnerClass } from '@/features/agent-panel/lib/panelStyles';
import { groupTurns, settledReplySections, tailBlockSpeaks, turnReplyText, workTraceLabel, type TurnMeta } from '@/features/agent-panel/lib/turnModel';
import { turnFailureGuidance, type TurnFailureActionId } from '@/features/agent-panel/lib/turnFailure';
import type { AgentKind, Attachment, Block, ToolBlock } from '@/features/agent-panel/lib/types';

/** Accent status dot used by working/queued indicators. */
function Dot() {
  return <span className={accentDotClass} aria-hidden="true" />;
}

export interface QueuedTurnPreview {
  id: string;
  text: string;
  attachments?: Attachment[];
  status: 'waiting' | 'steering' | 'steered';
  canSteer?: boolean;
}

export function MessageList({
  blocks, queuedTurns, turnActive, turnMeta, phase, fatal, fatalRecoveryLabel, agentKind, agentShortName, onPermission, onSteerQueued, onCopyUserMessage, onResendUserMessage, onRetry, onOpenArtifact, onTurnFailureAction,
}: {
  blocks: Block[];
  queuedTurns: QueuedTurnPreview[];
  turnActive: boolean;
  turnMeta: Record<string, TurnMeta>;
  phase: 'connecting' | 'live' | 'closed';
  fatal: string | null;
  fatalRecoveryLabel: 'Retry' | 'Reconnect';
  agentKind: AgentKind;
  agentShortName: string;
  onPermission: (toolBlockId: string, permId: string, allow: boolean) => void;
  onSteerQueued: (id: string) => void;
  onCopyUserMessage: (text: string) => void;
  onResendUserMessage: (text: string) => void;
  onRetry: () => void;
  onOpenArtifact: (path: string) => void;
  onTurnFailureAction: (blockId: string, action: TurnFailureActionId) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setShowJump(!stick.current);
  }

  useEffect(() => {
    if (stick.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
      setShowJump(false);
    }
  });

  const turns = useMemo(() => groupTurns(blocks), [blocks]);
  // The reply handlers travel as ONE object from here down through
  // TurnBody/WorkTrace/BlockView instead of four parallel props per layer.
  const handlers: ReplyHandlers = useMemo(
    () => ({ agentKind, onPermission, onCopyUserMessage, onResendUserMessage, onOpenArtifact, onTurnFailureAction }),
    [agentKind, onPermission, onCopyUserMessage, onResendUserMessage, onOpenArtifact, onTurnFailureAction],
  );

  return (
    // `agent-messages` is a layout hook: the chat-primary grid rules in
    // agent-panel.css widen its padding to center the readable column.
    // No top padding — the first child's own top margin carries the
    // breathing room (it scrolls away with the transcript).
    <div
      className="agent-messages scrollbar-quiet flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pt-0 pb-2 [&>*:first-child]:mt-3"
      role="log"
      aria-label="Agent conversation"
      aria-live="polite"
      aria-busy={turnActive}
      ref={ref}
      onScroll={onScroll}
    >
      {phase === 'connecting' && <ConnectingNotice agentShortName={agentShortName} />}
      {blocks.length === 0 && phase === 'closed' && fatal && (
        <FatalState fatal={fatal} agentShortName={agentShortName} recoveryLabel={fatalRecoveryLabel} onRetry={onRetry} />
      )}
      {turns.map((turn, index) => {
        // The last turn is the one still streaming while a turn is
        // active; only a settled turn offers actions on its reply.
        const settled = !(turnActive && index === turns.length - 1);
        const replyText = settled ? turnReplyText(turn) : '';
        return (
          <div className="agent-turn" key={turn.key}>
            {turn.head && (
              <UserTurnHead
                block={turn.head}
                onCopy={onCopyUserMessage}
                onSendEdit={onResendUserMessage}
              />
            )}
            <TurnBody
              blocks={turn.body}
              liveBlockId={turnActive && blocks.length > 0 ? blocks[blocks.length - 1].id : null}
              streaming={!settled}
              meta={turn.head ? turnMeta[turn.head.id] : undefined}
              handlers={handlers}
            />
            {replyText && <TurnActions text={replyText} onCopy={onCopyUserMessage} />}
          </div>
        );
      })}
      {queuedTurns.map((turn) => (
        <QueuedTurn
          key={turn.id}
          turn={turn}
          onSteer={onSteerQueued}
        />
      ))}
      {blocks.length > 0 && phase === 'closed' && fatal && (
        <FatalInline fatal={fatal} agentShortName={agentShortName} recoveryLabel={fatalRecoveryLabel} onRetry={onRetry} />
      )}
      {turnActive && !tailBlockSpeaks(blocks) && (
        // Generic tail status renders only when no visible block already
        // narrates the moment — a tool group shimmers its own summary
        // (running OR between consecutive calls, so it never blinks off and
        // hands the cue to this line), live thinking shimmers "Thinking",
        // and an awaiting permission card means the agent is waiting on the
        // USER, where "is working…" would be a lie.
        <div className="flex items-center gap-1.5 p-0.5 text-sm text-muted-foreground">
          <Dot /><span className="agent-shimmer">{agentShortName} is working…</span>
        </div>
      )}
      {showJump && (
        // Must sit above a pinned user-turn header (z-2), otherwise its
        // upper half is hidden and cannot be clicked while scrolling.
        <Button
          className="sticky bottom-2 z-3 cursor-pointer self-center rounded-full border border-border bg-pane px-2.5 py-1.25 text-sm text-foreground shadow-elevation"
          onPress={() => {
            if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
            stick.current = true;
            setShowJump(false);
          }}
        >Jump to latest ↓</Button>
      )}
    </div>
  );
}

interface ReplyHandlers {
  agentKind: AgentKind;
  onPermission: (t: string, p: string, a: boolean) => void;
  onCopyUserMessage: (text: string) => void;
  onResendUserMessage: (text: string) => void;
  onOpenArtifact: (path: string) => void;
  onTurnFailureAction: (blockId: string, action: TurnFailureActionId) => void;
}

/** Render a run of reply blocks: consecutive completed/running tool blocks
 * collapse into one ToolActivityGroup; everything else (thinking, assistant
 * prose, errors, and awaiting-permission tools) renders inline. Permission
 * requests stay OUT of the groups so their Allow/Reject controls are never
 * hidden by a collapse. */
function renderReplyBlocks(blocks: Block[], liveBlockId: string | null, h: ReplyHandlers): ReactNode {
  const groups: Array<Block | ToolBlock[]> = [];
  for (const block of blocks) {
    if (block.kind !== 'tool' || block.status === 'awaiting') {
      groups.push(block);
      continue;
    }
    const previous = groups[groups.length - 1];
    if (Array.isArray(previous)) previous.push(block);
    else groups.push([block]);
  }
  return groups.map((group) => Array.isArray(group)
    ? <ToolActivityGroup key={`activity-${group[0].id}`} tools={group} live={group[group.length - 1].id === liveBlockId} onOpenArtifact={h.onOpenArtifact} />
    : <BlockView key={group.id} block={group} live={group.id === liveBlockId} handlers={h} />
  );
}

function TurnBody({ blocks, liveBlockId, streaming, meta, handlers: h }: {
  blocks: Block[];
  /** The stream's last block while the turn is active — the one block
   *  whose meta label may shimmer as "working". */
  liveBlockId: string | null;
  /** This turn is still streaming (the flat, everything-expanded phase). */
  streaming: boolean;
  meta?: TurnMeta;
  handlers: ReplyHandlers;
}) {
  // While streaming, render the trace flat and expanded — the work is
  // happening live and there is no stable "final answer" to separate yet
  // (the last assistant block keeps moving as tokens arrive).
  if (streaming) return <>{renderReplyBlocks(blocks, liveBlockId, h)}</>;

  // Interrupted: no clean answer was produced, so the whole trace stays in
  // the collapsible, expanded by default, under "You stopped after X".
  if (meta?.interrupted) return <WorkTrace blocks={blocks} meta={meta} handlers={h} defaultOpen />;

  // Settled normally: the last assistant answer OR terminal error remains
  // visible. Everything before it collapses under "Worked for X". Hiding a
  // terminal error in the work trace leaves a failed turn unexplained.
  const { workBlocks, answerBlocks } = settledReplySections(blocks);
  return (
    <>
      {workBlocks.length > 0 && <WorkTrace blocks={workBlocks} meta={meta} handlers={h} />}
      {renderReplyBlocks(answerBlocks, null, h)}
    </>
  );
}

/** The turn's working trace — thinking, interim narration, and tool activity —
 * folded under a single "Worked for X" (or "You stopped after X") header, the
 * way Codex presents a completed turn. Collapsed by default once the turn is
 * done (the answer below carries the result); an interrupted turn opens by
 * default since it has no answer. The user can toggle it either way. */
function WorkTrace({ blocks, meta, handlers, defaultOpen = false }: {
  blocks: Block[];
  meta?: TurnMeta;
  handlers: ReplyHandlers;
  defaultOpen?: boolean;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? defaultOpen;
  return (
    <section className="agent-worktrace">
      <Button
        className="agent-worktrace-head"
        onPress={() => setUserOpen((value) => !(value ?? defaultOpen))}
        aria-expanded={open}
      >
        <span className="agent-worktrace-label">{workTraceLabel(meta)}</span>
        <ChevronDownIcon className={cn('agent-worktrace-chev', !open && '-rotate-90')} />
      </Button>
      {open && <div className="agent-worktrace-body">{renderReplyBlocks(blocks, null, handlers)}</div>}
    </section>
  );
}

function QueuedTurn({
  turn, onSteer,
}: {
  turn: QueuedTurnPreview;
  onSteer: (id: string) => void;
}) {
  const label = turn.status === 'steered' ? 'Steered' : turn.status === 'steering' ? 'Steering' : 'Waiting';
  return (
    <div className="agent-turn queued">
      <div className="agent-turn-head queued">
        {turn.attachments && turn.attachments.length > 0 && <MessageAttachments attachments={turn.attachments} />}
        <div className="agent-turn-line">
          {turn.text && (
            <UserMessageText
              text={turn.text}
              attachmentPaths={turn.attachments?.map((attachment) => attachment.path)}
            />
          )}
          <span className="agent-turn-actions">
            <span className="agent-turn-waiting">
              <Dot />
              {label}
            </span>
            {turn.canSteer && turn.status === 'waiting' && (
              <Button className="agent-turn-steer" onPress={() => onSteer(turn.id)}>
                Steer
              </Button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function fatalCopy(fatal: string, agentShortName: string): { title: string; detail: string } {
  if (/No folder open/i.test(fatal)) {
    return { title: 'No folder open', detail: 'Open a folder, then retry.' };
  }
  return { title: `${agentShortName} couldn't continue`, detail: fatal };
}

const fatalTitleClass = 'text-base font-semibold';
const fatalDetailClass =
  'max-h-35 overflow-auto text-sm leading-normal break-words whitespace-pre-wrap text-muted-foreground';

function FatalState({
  fatal, agentShortName, recoveryLabel, onRetry,
}: {
  fatal: string;
  agentShortName: string;
  recoveryLabel: 'Retry' | 'Reconnect';
  onRetry: () => void;
}) {
  const copy = fatalCopy(fatal, agentShortName);
  return (
    <div className="grid min-h-45 flex-1 place-items-center px-2 py-6">
      <StatusMessage tone="error" className="flex w-[min(440px,100%)] flex-col items-start gap-2 rounded-xl p-3.5">
        <div className={fatalTitleClass}>{copy.title}</div>
        <div className={fatalDetailClass}>{copy.detail}</div>
        <Button className={outlineSmClass} onPress={onRetry}>{recoveryLabel}</Button>
      </StatusMessage>
    </div>
  );
}

function FatalInline({
  fatal, agentShortName, recoveryLabel, onRetry,
}: {
  fatal: string;
  agentShortName: string;
  recoveryLabel: 'Retry' | 'Reconnect';
  onRetry: () => void;
}) {
  const copy = fatalCopy(fatal, agentShortName);
  return (
    <StatusMessage tone="error" className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
      <div>
        <div className={fatalTitleClass}>{copy.title}</div>
        <div className={fatalDetailClass}>{copy.detail}</div>
      </div>
      <Button className={outlineSmClass} onPress={onRetry}>{recoveryLabel}</Button>
    </StatusMessage>
  );
}

function ConnectingNotice({ agentShortName }: { agentShortName: string }) {
  return (
    <div className="flex items-center gap-2 px-0.5 py-2 text-sm text-muted-foreground" role="status">
      <span className={spinnerClass} aria-hidden="true" />
      Connecting to {agentShortName}…
    </div>
  );
}

function BlockView({ block, live, handlers }: {
  block: Block;
  live?: boolean;
  handlers: ReplyHandlers;
}) {
  switch (block.kind) {
    case 'user':
      // Unreachable: groupTurns hoists every user block into turn.head, so
      // none travels through renderReplyBlocks. Kept for exhaustiveness.
      return null;
    case 'assistant':
      return <AssistantBlock text={block.text} onOpenArtifact={handlers.onOpenArtifact} />;
    case 'thinking':
      return <ThinkingView text={block.text} active={live} />;
    case 'error': {
      // A classified live failure explains its recovery; anything else —
      // including replayed history, which carries no kind — stays a plain
      // message. The kind is adapter-assigned; no prose is parsed here.
      const guidance = block.failureKind ? turnFailureGuidance(block.failureKind, handlers.agentKind) : null;
      if (!guidance) {
        return (
          <StatusMessage tone="error" className="text-sm leading-normal whitespace-pre-wrap">
            {block.text}
          </StatusMessage>
        );
      }
      return (
        <StatusMessage tone="error" className="flex flex-col items-start gap-1.5 rounded-xl p-3">
          <div className="text-sm font-semibold">{guidance.title}</div>
          <div className={fatalDetailClass}>{block.text}</div>
          <div className="text-sm leading-normal">{guidance.guidance}</div>
          <Button
            className={outlineSmClass}
            onPress={() => handlers.onTurnFailureAction(block.id, guidance.action.id)}
          >
            {guidance.action.label}
          </Button>
        </StatusMessage>
      );
    }
    case 'tool':
      // A tool block only reaches BlockView while it is awaiting approval;
      // completed/running tools are grouped into ToolActivityGroup.
      return <PermissionCard block={block} onPermission={handlers.onPermission} />;
  }
}

function ThinkingView({ text, active }: { text: string; active?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'agent-thinking' + (open ? ' open' : '')}>
      <Button className="agent-thinking-head" onPress={() => setOpen((o) => !o)}>
        <ChevronDownIcon className="agent-thinking-chev" />
        {/* Shimmers while this is the stream's live block — the label
          * itself signals "working" (Cursor register). */}
        <span className={active ? 'agent-shimmer' : undefined}>Thinking</span>
      </Button>
      {open && <div className="agent-thinking-body">{text}</div>}
    </div>
  );
}

/** Assistant prose. The actions menu is NOT here — it belongs to the
 * whole reply (see `TurnActions`), not to each paragraph the stream
 * happened to split off between tool calls. */
function AssistantBlock({ text, onOpenArtifact }: {
  text: string;
  onOpenArtifact: (path: string) => void;
}) {
  return <div className="agent-prose"><AgentMarkdown markdown={text} onOpenArtifact={onOpenArtifact} /></div>;
}

/** One ⋯ menu per completed TURN, on its own line under the reply.
 *
 * Per-turn, not per-block: a single reply is delivered as several
 * assistant blocks separated by tool calls, so a per-block menu stamped
 * a button after every paragraph. And always visible rather than
 * hover-revealed — at one quiet button per turn there is nothing to hide
 * from, and a control that only exists under the pointer is a control
 * most people never find. Absent while the turn is still streaming:
 * there is no complete reply to act on yet. */
function TurnActions({ text, onCopy }: {
  text: string;
  onCopy: (text: string) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const items: MenuItem[] = [
    { label: 'Copy Reply', icon: <CopyIcon />, onSelect: () => onCopy(text) },
  ];
  return (
    <div className="flex justify-end">
      <Button
        className={cn(
          'grid size-5.5 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground',
          anchor && 'bg-active text-foreground',
        )}
        aria-label="Reply actions"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onPress={(e) => setAnchor((prev) => (prev ? null : (e.target as HTMLElement).getBoundingClientRect()))}
      >
        <MoreHorizontalIcon className="size-4" />
      </Button>
      {anchor && (
        <Menu anchor={{ rect: anchor, align: 'right' }} minWidth={170} items={items} onClose={() => setAnchor(null)} />
      )}
    </div>
  );
}
