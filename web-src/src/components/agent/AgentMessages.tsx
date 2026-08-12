import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { VIEWABLE_FILE_EXTENSION_ALTERNATION } from '../../../../shared/file-formats.ts';
import { AgentMarkdown } from './AgentMarkdown';
import { ChevronDownIcon, CodeIcon, CopyIcon, EditIcon, FileGenericIcon, FolderIcon, MoreHorizontalIcon, NewFileIcon, SearchIcon } from '../../icons';
import { Menu, type MenuItem } from '../Menu';
import { cn } from '../../lib/utils';
import { ImageLightbox } from '../ImageLightbox';
import { buttonVariants } from '../ui/button';
import { StatusMessage } from '../ui/status';
import { FileAttachmentChip } from './FileAttachmentChip';
import { attachImageChipClass, attachImagePreviewClass } from './panelStyles';
import type { Attachment, Block, ToolBlock } from './types';

const outlineSmClass = buttonVariants({ variant: 'outline', size: 'sm' });
const primarySmClass = buttonVariants({ variant: 'default', size: 'sm' });
const ghostSmClass = buttonVariants({ variant: 'ghost', size: 'sm' });

/** Accent status dot used by working/queued/running indicators. */
function Dot() {
  return <span className="inline-block size-1.75 shrink-0 rounded-full bg-accent" aria-hidden="true" />;
}

/** Mono detail blocks inside tool cards (input JSON, results, commands). */
const toolPreClass =
  'mt-1.5 mb-0 max-h-70 overflow-x-auto overflow-y-auto rounded-md border border-border bg-pane px-2.25 py-1.75 font-mono text-xs leading-normal break-words whitespace-pre-wrap';

export interface QueuedTurnPreview {
  id: string;
  text: string;
  attachments?: Attachment[];
  status: 'waiting' | 'steering' | 'steered';
  canSteer?: boolean;
}

/** Per-turn "Worked for X" data, produced by AgentView and keyed by the
 * turn's user-message id. Absent for resumed history (no timing on the wire). */
export interface TurnMeta {
  /** Wall-clock ms the turn spent working, measured in the renderer. */
  durationMs: number;
  /** The user stopped this turn before it finished. */
  interrupted: boolean;
}

export function MessageList({
  blocks, queuedTurns, turnActive, turnMeta, phase, fatal, fatalRecoveryLabel, agentShortName, onPermission, onSteerQueued, onCopyUserMessage, onResendUserMessage, onRetry, onOpenArtifact,
}: {
  blocks: Block[];
  queuedTurns: QueuedTurnPreview[];
  turnActive: boolean;
  turnMeta: Record<string, TurnMeta>;
  phase: 'connecting' | 'live' | 'closed';
  fatal: string | null;
  fatalRecoveryLabel: 'Retry' | 'Reconnect';
  agentShortName: string;
  onPermission: (toolBlockId: string, permId: string, allow: boolean) => void;
  onSteerQueued: (id: string) => void;
  onCopyUserMessage: (text: string) => void;
  onResendUserMessage: (text: string) => void;
  onRetry: () => void;
  onOpenArtifact: (path: string) => void;
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

  return (
    // `agent-messages` is a layout hook: the chat-primary grid rules in
    // styles/chat.css widen its padding to center the readable column.
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
              onPermission={onPermission}
              onCopyUserMessage={onCopyUserMessage}
              onResendUserMessage={onResendUserMessage}
              onOpenArtifact={onOpenArtifact}
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

/** True when the stream's last block already carries its own live status
 *  (see the generic tail's comment in MessageList). */
function tailBlockSpeaks(blocks: Block[]): boolean {
  const tail = blocks[blocks.length - 1];
  if (!tail) return false;
  if (tail.kind === 'thinking') return true;
  // A tail tool of ANY status is already narrated by its own activity group:
  // while it is the turn's live tail that group keeps its dot + shimmer lit,
  // so the generic line must not also appear in the gap after a call settles
  // (running/awaiting were the only speaking states before — a settled tail
  // tool used to fall through here and pop the generic line onto a new row).
  return tail.kind === 'tool';
}

interface Turn { key: string; head: Extract<Block, { kind: 'user' }> | null; body: Block[] }

function groupTurns(blocks: Block[]): Turn[] {
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  for (const b of blocks) {
    if (b.kind === 'user') {
      cur = { key: b.id, head: b, body: [] };
      turns.push(cur);
    } else {
      if (!cur) { cur = { key: `lead-${b.id}`, head: null, body: [] }; turns.push(cur); }
      cur.body.push(b);
    }
  }
  return turns;
}

interface ReplyHandlers {
  onPermission: (t: string, p: string, a: boolean) => void;
  onCopyUserMessage: (text: string) => void;
  onResendUserMessage: (text: string) => void;
  onOpenArtifact: (path: string) => void;
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
    ? <ToolActivityGroup key={`activity-${group[0].id}`} tools={group} live={group[group.length - 1].id === liveBlockId} onPermission={h.onPermission} onOpenArtifact={h.onOpenArtifact} />
    : <BlockView
      key={group.id}
      block={group}
      live={group.id === liveBlockId}
      onPermission={h.onPermission}
      onCopyUserMessage={h.onCopyUserMessage}
      onResendUserMessage={h.onResendUserMessage}
      onOpenArtifact={h.onOpenArtifact}
    />
  );
}

function TurnBody({ blocks, liveBlockId, streaming, meta, onPermission, onCopyUserMessage, onResendUserMessage, onOpenArtifact }: {
  blocks: Block[];
  /** The stream's last block while the turn is active — the one block
   *  whose meta label may shimmer as "working". */
  liveBlockId: string | null;
  /** This turn is still streaming (the flat, everything-expanded phase). */
  streaming: boolean;
  meta?: TurnMeta;
  onPermission: (t: string, p: string, a: boolean) => void;
  onCopyUserMessage: (text: string) => void;
  onResendUserMessage: (text: string) => void;
  onOpenArtifact: (path: string) => void;
}) {
  const h: ReplyHandlers = { onPermission, onCopyUserMessage, onResendUserMessage, onOpenArtifact };

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

export function settledReplySections(blocks: Block[]): { workBlocks: Block[]; answerBlocks: Block[] } {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === 'assistant' || blocks[i].kind === 'error') {
      return { workBlocks: blocks.slice(0, i), answerBlocks: blocks.slice(i) };
    }
  }
  return { workBlocks: blocks, answerBlocks: [] };
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

function workTraceLabel(meta?: TurnMeta): string {
  const time = meta && typeof meta.durationMs === 'number' ? fmtDuration(meta.durationMs) : null;
  if (meta?.interrupted) return time ? `You stopped after ${time}` : 'You stopped';
  return time ? `Worked for ${time}` : 'Worked';
}

/** Compact wall-clock: "45s", "1m", "1m 24s". */
function fmtDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function UserTurnHead({
  block, onCopy, onSendEdit,
}: {
  block: Extract<Block, { kind: 'user' }>;
  onCopy: (text: string) => void;
  onSendEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text);

  useEffect(() => {
    if (!editing) setDraft(block.text);
  }, [block.text, editing]);

  return (
    <>
      <div className="agent-turn-head">
        {block.attachments && block.attachments.length > 0 && <MessageAttachments attachments={block.attachments} />}
        {editing ? (
          <InlineUserMessageEditor
            text={draft}
            saveLabel="Send"
            onChange={setDraft}
            onCancel={() => {
              setDraft(block.text);
              setEditing(false);
            }}
            onSave={() => {
              const text = draft.trim();
              if (!text) return;
              setEditing(false);
              onSendEdit(text);
            }}
          />
        ) : (
          block.text && (
            <UserMessageText
              text={block.text}
              attachmentPaths={block.attachments?.map((attachment) => attachment.path)}
            />
          )
        )}
      </div>
      {/* Actions live BELOW the bubble now, not floating in its corner: a
        * quiet copy/edit row that also opens a little breathing room before
        * the agent's reply. Revealed on hover/focus of the whole turn. */}
      {!editing && block.text && (
        <UserMessageActions
          text={block.text}
          onCopy={onCopy}
          onEdit={() => setEditing(true)}
        />
      )}
    </>
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

/** Sent image attachments intentionally mirror the composer thumbnail, but
 * are transcript content rather than removable composer state. */
function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  return (
    <>
      <div className="agent-turn-attach">
        {attachments.map((attachment) => attachment.previewUrl ? (
          <button
            key={attachment.path}
            type="button"
            className={cn(attachImageChipClass, attachImagePreviewClass)}
            aria-label={`Preview ${attachment.name}`}
            onClick={() => setPreviewAttachment(attachment)}
          >
            <img src={attachment.previewUrl} alt="" />
          </button>
        ) : (
          <FileAttachmentChip key={attachment.path} name={attachment.name} path={attachment.path} meta={attachment.dims} />
        ))}
      </div>
      {previewAttachment?.previewUrl && (
        <ImageLightbox
          src={previewAttachment.previewUrl}
          alt={previewAttachment.name}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </>
  );
}

function InlineUserMessageEditor({
  text, saveLabel = 'Save', onChange, onCancel, onSave,
}: {
  text: string;
  saveLabel?: string;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    });
  }, []);
  return (
    <div className="agent-turn-edit">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          onChange(e.target.value);
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button className={outlineSmClass} onPress={onCancel}>Cancel</Button>
        <Button className={primarySmClass} onPress={onSave}>{saveLabel}</Button>
      </div>
    </div>
  );
}

const USER_TEXT_CHAR_LIMIT = 300;
const USER_TEXT_LINE_LIMIT = 4;
const FILE_MENTION_RE = new RegExp(
  `(^|\\s)@([^\\n]*?\\.(?:${VIEWABLE_FILE_EXTENSION_ALTERNATION}))(?![/.])`,
  'gi',
);
/* Bare multi-segment paths (`topic/note.md`) chip too: history replay and
 * some runtimes serialize a mention without its `@`, and a raw relative
 * path glued into prose is the single roughest thing a transcript can
 * show. At least one `/` is required so ordinary "README.md" prose stays
 * text; the lookahead permits CJK or punctuation right after the
 * extension while rejecting longer paths/words. */
const BARE_FILE_PATH_RE = new RegExp(
  `(^|\\s)((?:[^\\s/@]+/)+[^\\s/]+?\\.(?:${VIEWABLE_FILE_EXTENSION_ALTERNATION}))(?![\\w./])`,
  'gi',
);

/** Flatten mention syntax for plain-text surfaces (tab titles, previews):
 * `@topic/note.md` and bare multi-segment paths read as just the file
 * name. The transcript renders chips instead — this is for places that
 * can only hold a string. */
export function flattenFileMentions(text: string): string {
  return text
    .replace(FILE_MENTION_RE, (_raw, lead: string, path: string) => `${lead}${baseName(path)}`)
    .replace(BARE_FILE_PATH_RE, (_raw, lead: string, path: string) => `${lead}${baseName(path)}`);
}

function UserMessageText({ text, attachmentPaths }: { text: string; attachmentPaths?: string[] }) {
  const [open, setOpen] = useState(false);
  const preview = userTextPreview(text);
  const collapsible = preview !== text;
  return (
    <span className="agent-turn-text">
      {renderUserFileMentions(open || !collapsible ? text : preview, attachmentPaths)}
      {collapsible && !open && <span className="agent-turn-ellipsis">…</span>}
      {collapsible && (
        <Button
          className="agent-turn-expand"
          onPress={() => setOpen((v) => !v)}
        >
          {open ? 'Show less' : 'Show more'}
          <ChevronDownIcon className={'agent-turn-expand-icon' + (open ? ' open' : '')} />
        </Button>
      )}
    </span>
  );
}

/** The composer serializes its atomic @-mention widget as @<path>. Restore
 * that same compact file chip in the transcript — for `@`-prefixed
 * mentions, bare multi-segment paths, and exact occurrences of this
 * turn's attachment paths (any boundary — attachment paths are known
 * verbatim, so spaces and CJK adjacency are fine). Overlapping hits keep
 * the earliest, longest match. */
function renderUserFileMentions(text: string, attachmentPaths: string[] = []): ReactNode[] {
  const hits: Array<{ start: number; end: number; path: string; lead: string }> = [];
  const collect = (re: RegExp) => {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const [raw, lead, path] = match;
      hits.push({ start: match.index, end: match.index + raw.length, path, lead });
    }
  };
  collect(FILE_MENTION_RE);
  collect(BARE_FILE_PATH_RE);
  for (const path of attachmentPaths) {
    if (!path) continue;
    let from = 0;
    for (let at = text.indexOf(path, from); at !== -1; at = text.indexOf(path, from)) {
      hits.push({ start: at, end: at + path.length, path, lead: '' });
      from = at + path.length;
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) parts.push(text.slice(cursor, hit.start));
    if (hit.lead) parts.push(hit.lead);
    parts.push(
      <span key={`${hit.start}:${hit.path}`} className="agent-file-mention" title={hit.path} aria-label={`File mention: ${hit.path}`}>
        {baseName(hit.path)}
      </span>,
    );
    cursor = hit.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : [text];
}

/** Copy + edit on every user message (ChatGPT-history register). Editing
 * resends the edited text as a NEW prompt — agent sessions cannot rewind,
 * so this is resend-from-history, never a fork. */
function UserMessageActions({
  text, onCopy, onEdit,
}: {
  text: string;
  onCopy: (text: string) => void;
  onEdit: () => void;
}) {
  return (
    <div className="agent-turn-user-actions" aria-label="Message actions">
      <Button aria-label="Copy message" onPress={() => onCopy(text)}>
        <CopyIcon />
      </Button>
      <Button aria-label="Edit and resend" onPress={onEdit}>
        <EditIcon />
      </Button>
    </div>
  );
}

function userTextPreview(text: string): string {
  const lines = text.split(/\r?\n/);
  let out = lines.slice(0, USER_TEXT_LINE_LIMIT).join('\n');
  if (out.length > USER_TEXT_CHAR_LIMIT) out = out.slice(0, USER_TEXT_CHAR_LIMIT);
  if (lines.length > USER_TEXT_LINE_LIMIT || text.length > out.length) return out.trimEnd();
  return text;
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
      {/* The global reduced-motion policy zeroes this keyframe animation,
        * leaving a static arc while the text still conveys the state. */}
      <span
        className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent"
        aria-hidden="true"
      />
      Connecting to {agentShortName}…
    </div>
  );
}

function BlockView({ block, live, onPermission, onCopyUserMessage, onResendUserMessage, onOpenArtifact }: {
  block: Block;
  live?: boolean;
  onPermission: (t: string, p: string, a: boolean) => void;
  onCopyUserMessage: (text: string) => void;
  onResendUserMessage: (text: string) => void;
  onOpenArtifact: (path: string) => void;
}) {
  switch (block.kind) {
    case 'user':
      return <UserTurnHead
        block={block}
        onCopy={onCopyUserMessage}
        onSendEdit={onResendUserMessage}
      />;
    case 'assistant':
      return <AssistantBlock text={block.text} onOpenArtifact={onOpenArtifact} />;
    case 'thinking':
      return <ThinkingView text={block.text} active={live} />;
    case 'error':
      return (
        <StatusMessage tone="error" className="text-sm leading-normal whitespace-pre-wrap">
          {block.text}
        </StatusMessage>
      );
    case 'tool':
      // A tool block only reaches BlockView while it is awaiting approval;
      // completed/running tools are grouped into ToolActivityGroup.
      return <PermissionCard block={block} onPermission={onPermission} />;
  }
}

function ToolActivityGroup({ tools, live = false, onPermission, onOpenArtifact }: {
  tools: ToolBlock[];
  /** This group is the live tail of an active turn. Keep the liveness cue
   *  (dot + shimmer + "…") lit across the whole tool stretch, not only while
   *  one tool happens to be `running`: between consecutive calls the group
   *  would otherwise go dark and the generic "…is working" tail would jump
   *  onto its own line. */
  live?: boolean;
  onPermission: (t: string, p: string, a: boolean) => void;
  onOpenArtifact: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = live || tools.some((tool) => tool.status === 'running');
  const summary = activitySummary(tools, active);
  return (
    // Activity is narration, not a construct: a quiet text-level
    // disclosure in the reading column (Cursor's "Explored 1 search"
    // register) — no full-width band, no left edge. It stays neutral even
    // when a step errored: intermediate tool failures are normal and the
    // agent usually recovers, so the collapsed line never shouts red. A
    // failed step still tints its own row inside the expansion, and a turn
    // that truly fails is explained by the inline fatal notice — not here.
    // Permission cards never enter these groups, so nothing actionable can
    // hide behind the collapse.
    <section className="agent-activity">
      <Button
        className="group/row flex w-full cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left text-sm hover:bg-muted"
        onPress={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {/* One leading glyph, Codex-style: the pulsing liveness Dot while the
          * group is the live tail, the first step's type icon once settled.
          * The disclosure chevron moves to the trailing edge and only fades
          * in on hover (or while open), so a resting row is just icon + text. */}
        {active ? <Dot /> : <ToolTypeIcon name={tools[0].name} input={tools[0].input} />}
        <span className={cn('min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground', active && 'agent-shimmer')}>{summary}</span>
        <ChevronDownIcon className={cn('ml-auto size-3 shrink-0 text-muted-foreground transition-opacity', open ? 'opacity-60' : 'opacity-0 group-hover/row:opacity-60', !open && '-rotate-90')} />
      </Button>
      {open && <div className="grid gap-0.5 pb-0.5 pl-5">{tools.map((tool) => <ToolRow key={tool.id} block={tool} />)}</div>}
      <ArtifactCards changes={tools.filter((tool) => tool.status === 'done').flatMap(fileChanges)} onOpen={onOpenArtifact} />
    </section>
  );
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

/** The reply text a turn's actions act on: every assistant block in the
 *  turn, in order — what the user sees as "the answer". */
function turnReplyText(turn: Turn): string {
  return turn.body
    .filter((block): block is Extract<Block, { kind: 'assistant' }> => block.kind === 'assistant')
    .map((block) => block.text)
    .join('\n\n')
    .trim();
}

/** The leading type glyph on an activity row — Read, Ran, Searched,
 * Wrote, Edited, Listed — so a row's kind reads before its text (Codex
 * register). Muted, or danger on a failed step. */
function ToolTypeIcon({ name, input, failed }: { name: string; input: Record<string, unknown>; failed?: boolean }) {
  const cls = cn('size-3.5 shrink-0', failed ? 'text-status-danger' : 'text-muted-foreground');
  if (name === 'Bash') {
    const action = commandActions(input)[0];
    if (action?.type === 'read') return <FileGenericIcon className={cls} />;
    if (action?.type === 'listFiles') return <FolderIcon className={cls} />;
    if (action?.type === 'search') return <SearchIcon className={cls} />;
    return <CodeIcon className={cls} />;
  }
  if (/read_file$/i.test(name)) return <FileGenericIcon className={cls} />;
  if (/write_file$/i.test(name)) return <NewFileIcon className={cls} />;
  if (/edit_file$/i.test(name) || name === 'File change') return <EditIcon className={cls} />;
  if (/list_directory$/i.test(name)) return <FolderIcon className={cls} />;
  if (/search/i.test(name)) return <SearchIcon className={cls} />;
  return <FileGenericIcon className={cls} />;
}

/** One tool inside an expanded activity group, Codex-style: a flat text
 * row — a small type icon, the action verb, and its object (a file name
 * underlined like a link, or a command / query in mono). No card, no
 * status badge; a finished step needs no "Done". The row toggles its
 * payload / result in place and reveals a chevron on hover. Failures tint
 * the whole row danger. Permission asks never appear here — they render
 * as their own card. */
function ToolRow({ block }: { block: ToolBlock }) {
  const [open, setOpen] = useState(false);
  const diff = useMemo(() => buildDiff(block.name, block.input), [block.name, block.input]);
  const { verb, target, mono } = toolRowParts(block.name, block.input);
  const running = block.status === 'running';
  const failed = block.status === 'error' || block.status === 'denied';
  return (
    <div className="group/row">
      <Button
        className={cn(
          'flex w-full cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left text-sm hover:bg-muted',
          failed ? 'text-status-danger' : 'text-muted-foreground',
        )}
        onPress={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ToolTypeIcon name={block.name} input={block.input} failed={failed} />
        <span className={cn('shrink-0', running && 'agent-shimmer')}>{verb}</span>
        {target && (
          <span className={cn(
            'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
            mono ? 'font-mono text-xs' : 'underline decoration-1 underline-offset-2',
          )}>{target}</span>
        )}
        <ChevronDownIcon className={cn('ml-auto size-3 shrink-0 transition-opacity', open ? 'opacity-60' : 'opacity-0 group-hover/row:opacity-60', !open && '-rotate-90')} />
      </Button>
      {open && (
        <div className="pb-1 pl-6">
          {diff && <DiffView diff={diff} />}
          {!diff && block.name === 'Bash' && <pre className={toolPreClass}>{String(block.input.command ?? '')}</pre>}
          {!diff && block.name !== 'Bash' && <pre className={toolPreClass}>{payloadPreview(block.input)}</pre>}
          {block.result != null && block.result !== '' && (
            <pre className={cn(toolPreClass, 'agent-tool-result', block.status === 'error' && 'err')}>{clip(block.result)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/** The one tool surface that stays a card: an approval ask. It is
 * actionable, so it must never hide inside collapsed activity. Quietest
 * chrome — the ask is the title, the payload renders once, and the single
 * primary button is the only emphasis. Approval stays an explicit click. */
function PermissionCard({ block, onPermission }: { block: ToolBlock; onPermission: (t: string, p: string, a: boolean) => void }) {
  const headRef = useRef<HTMLDivElement>(null);
  const diff = useMemo(() => buildDiff(block.name, block.input), [block.name, block.input]);
  function replyPermission(allow: boolean) {
    onPermission(block.id, block.permId!, allow);
    // The buttons vanish once the Agent updates this block; keep keyboard
    // focus on the card instead of dropping it to <body>.
    requestAnimationFrame(() => headRef.current?.focus());
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div ref={headRef} tabIndex={-1} className="px-2.5 py-1.75 text-sm font-semibold text-foreground outline-none">
        {block.permTitle ?? askTitle(block.name)}
      </div>
      {block.permId && (
        <div className="px-2.5 pb-2.5">
          {diff && <DiffView diff={diff} />}
          {!diff && block.name === 'Bash' && <pre className={toolPreClass}>{String(block.input.command ?? '')}</pre>}
          {!diff && block.name !== 'Bash' && <pre className={toolPreClass}>{payloadPreview(block.input)}</pre>}
          <div className="mt-2.25 flex justify-end gap-2">
            <Button className={ghostSmClass} onPress={() => replyPermission(false)}>Reject</Button>
            <Button className={primarySmClass} onPress={() => replyPermission(true)}>Allow</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArtifactCards({ changes, onOpen }: { changes: Array<{ path: string; kind: string }>; onOpen: (path: string) => void }) {
  if (!changes.length) return null;
  // One card per file — a path written repeatedly in one activity group
  // keeps its latest kind.
  const unique = [...new Map(changes.map((change) => [change.path, change])).values()];
  return <div className="grid gap-1 px-2.5 pb-2.25">{unique.map((change) => (
    <div
      className="grid grid-cols-[15px_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-md border border-border bg-pane px-1.75 py-1.5 text-xs"
      key={change.path}
    >
      <FileGenericIcon className="size-3.5 text-accent" />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-foreground" title={change.path}>{change.path}</span>
      <span className="capitalize text-muted-foreground">{change.kind}</span>
      <Button
        className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent"
        onPress={() => onOpen(change.path)}
      >Open</Button>
    </div>
  ))}</div>;
}

function fileChanges(block: ToolBlock): Array<{ path: string; kind: string }> {
  // MCP file mutations (write_file / edit_file) surface as artifacts too:
  // "work leaves an openable result" is a system guarantee, not something
  // the model must remember to link in prose.
  if (/(?:write_file|edit_file)$/i.test(block.name)) {
    const path = mcpArgs(block.input).path;
    if (typeof path !== 'string' || !path) return [];
    return [{ path, kind: /edit_file$/i.test(block.name) ? 'edited' : 'wrote' }];
  }
  if (block.name !== 'File change') return [];
  const raw = Array.isArray(block.input.changes) ? block.input.changes : [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const change = item as Record<string, unknown>;
    const path = [change.path, change.filePath, change.file_path].find((value): value is string => typeof value === 'string' && value.length > 0);
    if (!path) return [];
    const kind = typeof change.kind === 'string' ? change.kind : typeof change.type === 'string' ? change.type : 'Changed';
    return [{ path, kind }];
  });
}

function activityLabel(tool: ToolBlock): string {
  if (tool.name === 'File change') return 'Editing files';
  if (tool.name === 'Bash') return 'Verifying changes';
  if (/search|read/i.test(tool.name)) return 'Reading library';
  return tool.name;
}

type CommandAction = { type?: unknown; path?: unknown };

function commandActions(input: Record<string, unknown>): CommandAction[] {
  return Array.isArray(input.actions)
    ? input.actions.filter((action): action is CommandAction => !!action && typeof action === 'object')
    : [];
}

/** Question-form title for a pending approval — the card head carries the
 * ask, so the body needs no separate prompt line. */
function askTitle(name: string): string {
  if (name === 'Bash') return 'Run this command?';
  if (name === 'File change') return 'Apply these changes?';
  return `Allow ${name}?`;
}

/** Codex-style parts for an activity row: an action verb and, when there
 * is one, its object — a file name (rendered underlined, like a link) or
 * a command / query (rendered mono). The collapsed group summary uses its
 * own count-free rollup (activitySummary). */
function toolRowParts(name: string, input: Record<string, unknown>): { verb: string; target?: string; mono?: boolean } {
  if (name === 'Bash') {
    const action = commandActions(input)[0];
    if (action?.type === 'read' && typeof action.path === 'string') return { verb: 'Read', target: baseName(action.path) };
    if (action?.type === 'listFiles') return { verb: 'Listed files' };
    if (action?.type === 'search') return { verb: 'Searched files' };
    return { verb: 'Ran', target: clipInline(String(input.command ?? ''), 120), mono: true };
  }
  if (/read_file$/i.test(name)) {
    const path = mcpArgs(input).path ?? input.file_path;
    return typeof path === 'string' ? { verb: 'Read', target: baseName(path) } : { verb: 'Read file' };
  }
  if (/write_file$/i.test(name)) {
    const path = mcpArgs(input).path;
    return typeof path === 'string' ? { verb: 'Wrote', target: baseName(path) } : { verb: 'Wrote file' };
  }
  if (/edit_file$/i.test(name)) {
    const path = mcpArgs(input).path;
    return typeof path === 'string' ? { verb: 'Edited', target: baseName(path) } : { verb: 'Edited file' };
  }
  if (/list_directory$/i.test(name)) return { verb: 'Listed files' };
  if (/search/i.test(name)) {
    const args = mcpArgs(input);
    const q = args.query ?? args.pattern ?? input.query ?? input.pattern;
    return typeof q === 'string' ? { verb: 'Searched', target: clipInline(q, 120), mono: true } : { verb: 'Searched' };
  }
  if (name === 'File change') return { verb: 'Changed files' };
  return { verb: name };
}

/** A quiet, count-free description of a group's work (Codex register:
 * "Read files, ran a command"). It lists the categories present, each
 * phrased singular or plural to tell one from many — never an exact number,
 * and never different wording live vs done (which read as a glitch). An
 * active group appends "…". */
function activitySummary(tools: ToolBlock[], active?: boolean): string {
  let reads = 0;
  let lists = 0;
  let searches = 0;
  let commands = 0;
  let changes = 0;
  let toolsUsed = 0;
  for (const tool of tools) {
    if (tool.name === 'Bash') {
      const actions = commandActions(tool.input);
      if (!actions.length) { commands++; continue; }
      for (const action of actions) {
        if (action.type === 'read') reads++;
        else if (action.type === 'listFiles') lists++;
        else if (action.type === 'search') searches++;
        else commands++;
      }
    } else if (/read_file$/i.test(tool.name)) reads++;
    else if (/(?:write_file|edit_file)$/i.test(tool.name)) changes++;
    else if (/list_directory$/i.test(tool.name)) lists++;
    else if (/search/i.test(tool.name)) searches++;
    else if (tool.name === 'File change') changes++;
    else toolsUsed++;
  }
  const labels = [
    reads && `read ${reads === 1 ? 'a file' : 'files'}`,
    lists && `listed ${lists === 1 ? 'a folder' : 'folders'}`,
    searches && 'searched',
    commands && `ran ${commands === 1 ? 'a command' : 'commands'}`,
    changes && `edited ${changes === 1 ? 'a file' : 'files'}`,
    toolsUsed && `used ${toolsUsed === 1 ? 'a tool' : 'tools'}`,
  ].filter(Boolean);
  const summary = labels.length ? labels.join(', ') : 'worked';
  const capped = summary.charAt(0).toUpperCase() + summary.slice(1);
  return active ? `${capped}…` : capped;
}

type DiffRow = { type: 'ctx' | 'del' | 'add'; text: string };

function DiffView({ diff }: { diff: { file: string; rows: DiffRow[] } }) {
  return (
    <div className="agent-diff">
      <div className="agent-diff-file">{diff.file}</div>
      <div className="agent-diff-body">
        {diff.rows.map((r, i) => (
          <div key={i} className={'agent-diff-row ' + r.type}>
            <span className="agent-diff-gutter">{r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '}</span>
            <span className="agent-diff-text">{r.text || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDiff(name: string, input: Record<string, unknown>): { file: string; rows: DiffRow[] } | null {
  const file = String(input.file_path ?? input.path ?? '');
  if (name === 'Edit') {
    return { file, rows: lineDiff(String(input.old_string ?? ''), String(input.new_string ?? '')) };
  }
  if (name === 'MultiEdit' && Array.isArray(input.edits)) {
    const rows: DiffRow[] = [];
    for (const e of input.edits as Array<Record<string, unknown>>) {
      rows.push(...lineDiff(String(e.old_string ?? ''), String(e.new_string ?? '')));
    }
    return { file, rows };
  }
  if (name === 'Write') {
    return { file, rows: lineDiff('', String(input.content ?? '')) };
  }
  return null;
}

function lineDiff(oldStr: string, newStr: string): DiffRow[] {
  const o = oldStr === '' ? [] : oldStr.split('\n');
  const n = newStr === '' ? [] : newStr.split('\n');
  let p = 0;
  while (p < o.length && p < n.length && o[p] === n[p]) p++;
  let s = 0;
  while (s < o.length - p && s < n.length - p && o[o.length - 1 - s] === n[n.length - 1 - s]) s++;

  const rows: DiffRow[] = [];
  const ctx = 3;
  const headStart = Math.max(0, p - ctx);
  for (let i = headStart; i < p; i++) rows.push({ type: 'ctx', text: o[i] });
  for (let i = p; i < o.length - s; i++) rows.push({ type: 'del', text: o[i] });
  for (let i = p; i < n.length - s; i++) rows.push({ type: 'add', text: n[i] });
  const tailEnd = Math.min(o.length, o.length - s + ctx);
  for (let i = o.length - s; i < tailEnd; i++) rows.push({ type: 'ctx', text: o[i] });
  return rows;
}


const baseName = (p: string) => p.split('/').pop() || p;
const clipInline = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const clip = (s: string) => (s.length > 4000 ? s.slice(0, 4000) + '\n…(truncated)' : s);

/** Tool payloads render for HUMANS deciding or inspecting, not for
 * machines: hoist MCP-style `arguments`, drop empty scaffolding fields
 * (`server: ""`), and print string values verbatim — real newlines,
 * clipped to a screenful — never a JSON-escaped dump of a whole
 * document. Falls back to pretty JSON when nothing survives the
 * filter. */
const PAYLOAD_LINE_LIMIT = 14;
const PAYLOAD_CHAR_LIMIT = 1200;

function clipPayloadText(value: string): string {
  let out = value.split('\n').slice(0, PAYLOAD_LINE_LIMIT).join('\n');
  if (out.length > PAYLOAD_CHAR_LIMIT) out = out.slice(0, PAYLOAD_CHAR_LIMIT);
  if (out.length < value.length) {
    return `${out}\n… (+${(value.length - out.length).toLocaleString()} chars)`;
  }
  return out;
}

/** MCP wrappers nest the real payload under `arguments`; direct tools
 *  carry it at the top level. */
function mcpArgs(input: Record<string, unknown>): Record<string, unknown> {
  const nested = input.arguments;
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : input;
}

function payloadPreview(input: Record<string, unknown>): string {
  const args = mcpArgs(input);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value == null || value === '') continue;
    if (typeof value === 'string') {
      const text = clipPayloadText(value);
      lines.push(text.includes('\n') || text.length > 100 ? `${key}:\n${text}` : `${key}: ${text}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value, null, 2)}`);
    }
  }
  return lines.length ? lines.join('\n\n') : JSON.stringify(input, null, 2);
}
