/**
 * The user half of a turn: the sent message head with its attachments,
 * the collapsible message text (file mentions chipped back into place),
 * the copy/edit actions under the bubble, and the inline editor that
 * resends an edited prompt. Mention parsing is pure and lives in
 * `lib/mentionText`.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { ChevronDownIcon, CopyIcon, EditIcon } from '@/common/components/icons';
import { basename } from '@/common/lib/paths';
import { AttachmentLightbox, FileAttachmentChip, ImageAttachmentChip } from '@/features/agent-panel/components/FileAttachmentChip';
import { segmentFileMentions } from '@/features/agent-panel/lib/mentionText';
import { outlineSmClass, primarySmClass } from '@/features/agent-panel/lib/panelStyles';
import type { Attachment, Block } from '@/features/agent-panel/lib/types';

export function UserTurnHead({
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

/** Sent image attachments intentionally mirror the composer thumbnail, but
 * are transcript content rather than removable composer state. */
export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  return (
    <>
      <div className="agent-turn-attach">
        {attachments.map((attachment) => attachment.previewUrl ? (
          <ImageAttachmentChip
            key={attachment.path}
            name={attachment.name}
            previewUrl={attachment.previewUrl}
            onPreview={() => setPreviewAttachment(attachment)}
          />
        ) : (
          <FileAttachmentChip key={attachment.path} name={attachment.name} path={attachment.path} meta={attachment.dims} />
        ))}
      </div>
      <AttachmentLightbox attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
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

export function UserMessageText({ text, attachmentPaths }: { text: string; attachmentPaths?: string[] }) {
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
 * that same compact file chip in the transcript (parsing rules live in
 * mentionText.ts). */
function renderUserFileMentions(text: string, attachmentPaths?: string[]): ReactNode[] {
  return segmentFileMentions(text, attachmentPaths).map((segment) => segment.kind === 'mention'
    ? (
      <span key={`${segment.start}:${segment.path}`} className="agent-file-mention" title={segment.path} aria-label={`File mention: ${segment.path}`}>
        {basename(segment.path)}
      </span>
    )
    : segment.text);
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
