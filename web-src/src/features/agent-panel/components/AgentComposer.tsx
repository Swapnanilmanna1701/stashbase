/**
 * The chat input surface: draft text, attachment chips, the send/stop
 * action, and the bar of session pills under it.
 *
 * The two self-contained widgets it hosts live beside it — the `@`/`/`
 * suggestion popup in `MentionSuggestions.tsx` and the model/mode/effort
 * menus in `ComposerPills.tsx` — so what remains here is the composer's own
 * state (draft, selected skill, attachment preview) and the one rule that
 * decides whether that state can be sent.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { ArrowUpIcon, PlusIcon, StopIcon } from '@/common/components/icons';
import { cn } from '@/common/lib/utils';
import { AttachmentLightbox, FileAttachmentChip, ImageAttachmentChip } from '@/features/agent-panel/components/FileAttachmentChip';
import {
  scopePillAriaLabel,
  type LibraryScope,
  type LibraryFolderOption,
} from '@/common/lib/libraryScope';
import { ScopeMenu } from '@/common/components/ScopeMenu';
import { MentionComposer, type MentionComposerHandle } from '@/features/agent-panel/components/MentionComposer';
import {
  attachImageRemoveClass, attachRemoveClass, iconGhostButtonClass,
} from '@/features/agent-panel/lib/panelStyles';
import {
  ModelMenu, ModeMenu, nextPermMode,
  type ComposerEffortControl, type ComposerModeControl, type ComposerModelControl,
} from '@/features/agent-panel/components/ComposerPills';
import {
  MentionSuggestions, useMentionSuggestions,
  type ComposerMentionSources, type ComposerSkillSource,
} from '@/features/agent-panel/components/MentionSuggestions';
import type { AgentSkill, Attachment } from '@/features/agent-panel/lib/types';

/* The composer's prop contract stays readable from one place even though
 * the pill and mention halves are owned by the modules that render them. */
export type {
  ComposerEffortControl, ComposerModeControl, ComposerModelControl,
} from '@/features/agent-panel/components/ComposerPills';
export type {
  ComposerMentionSources, ComposerSkillSource,
} from '@/features/agent-panel/components/MentionSuggestions';

/* Neutral send button — accent only on hover-when-ready (VSCode-style).
 * Circular, not squircular: it is the terminal action on the bar, and a
 * true circle is the one shape that reads as a button rather than as a
 * smaller copy of the composer around it. `rounded-full` also opts out of
 * the app-wide squircle (see globals.css), which is what keeps it a
 * circle instead of a bulged superellipse. */
const sendClass =
  'grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border p-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4.5';
const sendReadyClass =
  'border-border bg-muted text-foreground enabled:hover:border-accent enabled:hover:bg-accent enabled:hover:text-primary-foreground disabled:cursor-default disabled:opacity-40';
const sendStopClass = 'border-destructive bg-destructive text-primary-foreground';

/** The scope this tab's session is (or will be) bound to. */
export interface ComposerScopeControl {
  current: LibraryScope;
  entries: LibraryFolderOption[];
  homeDir: string;
  locked: boolean;
  onSet: (scope: LibraryScope) => void;
}

/** Context attachments — owned by AgentView so panel drops, the `+`
 * picker, and the send path share one list. */
export interface ComposerAttachments {
  items: Attachment[];
  uploading: boolean;
  onPick: (files: File[]) => void;
  onPasteImages: (files: File[]) => void;
  onRemove: (path: string) => void;
}

export function AgentComposer({
  phase, disabled, turnActive, active, agentShortName, hero, prefill,
  mode, effort, model, scope, mentions, skills, attachments,
  onDraftChange, onFocusChange, onSend, onStop,
}: {
  phase: 'connecting' | 'live' | 'closed';
  disabled: boolean;
  turnActive: boolean;
  active: boolean;
  agentShortName: string;
  /** Empty-chat layout: AgentView centers the composer mid-panel, so the
   * root sizes itself to the hero column instead of the `agent-composer`
   * chat-primary width hook. Same mounted instance in both layouts. */
  hero?: boolean;
  /** Empty-state starter template. Prefills the draft only — never sends. */
  prefill?: { text: string; nonce: number } | null;
  mode: ComposerModeControl;
  effort: ComposerEffortControl;
  model: ComposerModelControl;
  scope: ComposerScopeControl;
  mentions: ComposerMentionSources;
  skills: ComposerSkillSource;
  attachments: ComposerAttachments;
  /** Reports whether the composer holds unsent draft text, so the tab
   * model can freeze a drafted tab's scope and exclude it from blank-tab
   * reuse. */
  onDraftChange?: (hasText: boolean) => void;
  onFocusChange: (focused: boolean) => void;
  onSend: (text: string, skill?: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const composerRef = useRef<MentionComposerHandle>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMentionSuggestions({
    composerRef,
    mentions,
    skills: skills.list,
    onSkillPicked: (skill) => setSelectedSkill(skill),
  });

  useEffect(() => { if (active) composerRef.current?.focus(); }, [active]);

  // Starter-suggestion prefill: replace the draft and keep focus in the
  // editor so typing continues naturally. Sending stays a user action.
  useEffect(() => {
    if (prefill) composerRef.current?.setText(prefill.text);
  }, [prefill]);

  function cycleMode() {
    mode.onSet(nextPermMode(mode.value));
  }

  // "Explore with", not "Message": the agent here is pointed at the
  // user's own library, and the generic chat-app phrasing said nothing
  // about that. Kept as one line so the wording is easy to revisit.
  const placeholder = phase === 'connecting'
    ? 'Connecting…'
    : phase === 'closed'
      ? 'Reconnect to continue…'
      : turnActive
        ? 'Ask for follow-up changes'
        : `Explore with ${agentShortName}…`;

  /** Whether the given draft is sendable. The send button and `submit`
   *  below are the two places that ask, and they must never drift: the
   *  button reads the draft state, `submit` reads the text CodeMirror
   *  hands it, and a skill or an attachment makes an empty draft valid. */
  function canSend(draft: string): boolean {
    if (disabled || attachments.uploading) return false;
    return Boolean(draft.trim()) || attachments.items.length > 0 || Boolean(selectedSkill);
  }

  function submit(t: string) {
    if (!canSend(t)) return false;
    onSend(t.trim(), selectedSkill?.id);
    setSelectedSkill(undefined);
    suggestions.dismiss();
    return true;
  }

  return (
    // `agent-composer` is a layout hook: the chat-primary grid rules in
    // agent-panel.css center it to the readable transcript width. In hero
    // mode the empty-state column (656px = 640px content + own padding)
    // replaces that hook so the composer centers mid-panel.
    // px-3 matches the transcript's 12px insets so the composer card and
    // the turn cards above share one column edge (the wrapper's
    // chat-primary width budgets for it — see `.agent-composer`).
    <div
      className={cn('relative', hero ? 'mx-auto w-[min(656px,100%)] p-2' : 'agent-composer p-2 px-3')}
      data-draft-empty={text.trim() ? 'false' : 'true'}
    >
      <MentionSuggestions state={suggestions} skills={skills} />
      <div className={cn(
        // No focus treatment on the CARD: the caret already says where
        // typing goes, and an accent ring around a box this large was the
        // loudest thing on screen for the app's most common state — the
        // composer is focused nearly all the time.
        // The hero corner — one step past every overlay in the app. The
        // composer is the surface the eye rests on, and the extra radius
        // is what makes it read as the anchor rather than another panel.
        'flex flex-col gap-1.5 rounded-2xl border border-border bg-background px-2 pt-2 pb-1.5',
        // Hero (empty-state) presentation: the composer is the visual
        // anchor of an otherwise bare pane, so it earns a taller resting
        // input and the one sanctioned non-overlay shadow. Docked mode
        // stays flat and compact beside a document.
        // 56px ≈ two and a half lines: a shade taller than the docked
        // composer's two, which is all the extra presence the empty
        // pane's anchor needs. Four lines read as a form to fill in.
        hero && 'shadow-raised [--composer-min-h:56px]',
      )}>
        {(attachments.items.length > 0 || attachments.uploading) && (
          <div className="flex flex-wrap items-center gap-1">
            {attachments.items.map((a) => a.previewUrl ? (
              <ImageAttachmentChip
                key={a.path}
                name={a.name}
                previewUrl={a.previewUrl}
                onPreview={() => setPreviewAttachment(a)}
                trailing={
                  <Button
                    className={attachImageRemoveClass}
                    aria-label={`Remove ${a.name}`}
                    onPress={() => {
                      if (previewAttachment?.path === a.path) setPreviewAttachment(null);
                      attachments.onRemove(a.path);
                    }}
                  >
                    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                      <path d="m2.25 2.25 7.5 7.5M9.75 2.25l-7.5 7.5" />
                    </svg>
                  </Button>
                }
              />
            ) : (
              <FileAttachmentChip
                key={a.path}
                name={a.name}
                path={a.path}
                trailing={<Button className={attachRemoveClass} aria-label={`Remove ${a.name}`} onPress={() => attachments.onRemove(a.path)}>×</Button>}
              />
            ))}
            {attachments.uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
          </div>
        )}
        <MentionComposer
          ref={composerRef}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(next) => {
            setText(next);
            // Lift draft presence to the tab model: unsent text freezes the
            // tab's scope and disqualifies it from blank-tab reuse.
            onDraftChange?.(Boolean(next.trim()));
          }}
          onMentionChange={suggestions.onQueryChange}
          onMentionNavigate={suggestions.move}
          onMentionAccept={suggestions.accept}
          onMentionDismiss={suggestions.dismiss}
          onSkillMarkerRemoved={() => setSelectedSkill(undefined)}
          onShiftTab={() => {
            if (!mode.show || disabled) return false;
            cycleMode();
            return true;
          }}
          onSubmit={submit}
          onPasteImages={attachments.onPasteImages}
          onFocusChange={onFocusChange}
          mentionOpen={suggestions.open}
          mentionListboxId={suggestions.composerListboxId}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            attachments.onPick(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        {/* Action bar under the input. The negative side margins bleed the
          * top rule past the box padding so it spans edge to edge. */}
        {/* No divider above the controls: the composer reads as ONE input
          * surface (Cursor/ChatGPT register) — spacing and the controls'
          * muted styling carry the separation, and a mid-card hairline
          * would double up with the card's own border. */}
        <div className="flex items-center gap-1 pt-0.5">
          <Button
            className={iconGhostButtonClass}
            aria-label={attachments.uploading ? 'Uploading files' : 'Upload local files'}
            isDisabled={attachments.uploading}
            onPress={() => fileInputRef.current?.click()}
          >
            <PlusIcon />
          </Button>
          {/* Scope reads left (with the attach control); the run settings
            * — model, mode — group right next to send. */}
          <ScopeMenu
            scope={scope.current}
            entries={scope.entries}
            homeDir={scope.homeDir}
            heading="Session scope"
            libraryDetail="Chat across your whole library"
            ariaLabel={scopePillAriaLabel(scope.current, scope.locked)}
            locked={scope.locked}
            disabled={disabled}
            onSetScope={scope.onSet}
          />
          <span className="flex-1" />
          {model.show && <ModelMenu model={model} disabled={disabled} />}
          {(mode.show || effort.show) && <ModeMenu mode={mode} effort={effort} disabled={disabled} />}
          {turnActive ? (
            <Button className={cn(sendClass, sendStopClass)} aria-label="Stop agent" onPress={onStop}>
              <StopIcon />
            </Button>
          ) : (
            <Button
              className={cn(sendClass, sendReadyClass)}
              aria-label="Send message"
              isDisabled={!canSend(text)}
              onPress={() => composerRef.current?.submit()}
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
        {model.notice && <div className="pt-1.5 text-xs leading-snug text-muted-foreground" role="status">{model.notice}</div>}
      </div>
      <AttachmentLightbox attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </div>
  );
}
