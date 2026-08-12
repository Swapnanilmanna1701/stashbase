import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, ListBox, ListBoxItem, MenuTrigger, Popover, VisuallyHidden } from 'react-aria-components';
import {
  ArrowUpIcon, BoltIcon, CheckIcon, ChevronDownIcon, ClipboardListIcon, CodeIcon,
  FileGenericIcon, FolderIcon, HandIcon, PlusIcon, StopIcon,
} from '../../icons';
import { cn } from '../../lib/utils';
import type { FileMeta, FolderMeta } from '../../api';
import { ImageLightbox } from '../ImageLightbox';
import { baseName } from './attachments';
import { FileAttachmentChip } from './FileAttachmentChip';
import { effortLabel, effortOptions } from './effortMenuState';
import {
  scopePillAriaLabel,
  type ChatScope,
  type LibraryFolderOption,
} from './folderState';
import { ScopeMenu } from '../ScopeMenu';
import { MentionComposer, type MentionComposerHandle, type MentionQuery } from './MentionComposer';
import { rankMentionSuggestions } from './mentionRanking';
import {
  attachImageChipClass, attachImagePreviewClass,
  attachImageRemoveClass, attachRemoveClass, iconGhostButtonClass,
  menuHeadClass, menuSectionClass, optActiveClass, optCheckClass, optClass, optDescClass,
  optIconClass, optTextClass, optTitleClass, pillChevronClass, pillClass, pillLockedClass,
} from './panelStyles';
import type { AgentModel, AgentSkill, Attachment, EffortLevel, PermMode } from './types';
import { modelMenuLabel } from './modelState';

const MODES: { id: PermMode; label: string; desc: string; Icon: typeof HandIcon }[] = [
  { id: 'default', label: 'Ask', desc: 'Ask before edits or higher-risk actions', Icon: HandIcon },
  { id: 'acceptEdits', label: 'Edit', desc: 'Apply file edits without asking each time', Icon: CodeIcon },
  { id: 'plan', label: 'Plan', desc: 'Explore and propose a plan before changing files', Icon: ClipboardListIcon },
  { id: 'auto', label: 'Auto', desc: 'Let the agent decide when approval is needed', Icon: BoltIcon },
];

/* Composer-bar pills: the shared quiet pill trigger (panelStyles) with a
 * control-naming title/aria-label so adjacent "Default" values stay
 * distinguishable. The session settings live behind a single trigger, so
 * no pill needs emphasis. */

/* Upward menus anchored to the pills. React Aria caps the popover height to
 * the viewport (inline max-height); `overflow-y-auto` makes a tall panel
 * (Mode + a long effort list) scroll INSIDE the card instead of spilling its
 * rows out past the clipped card background. */
const menuPopupClass =
  'z-20 max-h-[min(70vh,560px)] w-80 max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1.5 shadow-elevation scrollbar-quiet';
const settingsDividerClass = 'mx-1 my-1.5 h-px bg-border';

/* Effort rows share the menu's row idiom (like Mode / Model): a compact
 * single-line label with a trailing accent check on the selected row and a
 * quiet neutral active surface — never an accent-filled box. Icon-less and
 * description-less so any agent's level set stays short and never wraps. */
const effortRowClass =
  'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted';

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

/** Model pill — stays its own control so the current model is always
 * visible on the bar. Locked once the session has content. */
function ModelMenu({ selectedModel, activeModel, models, locked, disabled, resumedSession, onSetModel }: {
  selectedModel?: string;
  activeModel?: string;
  models: AgentModel[];
  locked: boolean;
  disabled: boolean;
  resumedSession: boolean;
  onSetModel: (model?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const defaultSelected = !selectedModel;
  const label = modelMenuLabel(models, selectedModel, activeModel, resumedSession);
  const pick = (model?: string) => { onSetModel(model); setOpen(false); };
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        className={cn(pillClass, 'max-w-40', locked && pillLockedClass)}
        isDisabled={disabled || locked}
        aria-label={`Model: ${label}${locked ? ' — fixed for this conversation' : ''}`}
        // RAC forwards global DOM attributes (title) at runtime but its
        // ButtonProps type omits them; the spread keeps the tooltip typed.
        {...{ title: locked ? `Model — ${label} (fixed for this conversation)` : `Model — ${label}` }}
      >
        {/* Text-only trigger (Cursor-style): the leading glyphs made the
          * bar read heavy; the label carries the meaning. */}
        <span className="truncate">{label === 'Default' ? 'Model: Default' : label}</span>
        <ChevronDownIcon className={pillChevronClass} />
      </Button>
      <Popover className={cn(menuPopupClass, 'max-h-[min(360px,55vh)] overflow-auto')} placement="top end">
        <div className={menuHeadClass}><span className="font-semibold text-foreground">Model</span></div>
        <button
          type="button"
          className={cn(optClass, defaultSelected && optActiveClass)}
          onClick={() => pick(undefined)}
        >
          <span className={optTextClass}>
            <span className={optTitleClass}>Default</span>
            <span className={optDescClass}>Use this runtime’s configured model</span>
          </span>
          {defaultSelected && <CheckIcon className={optCheckClass} />}
        </button>
        {models.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={cn(optClass, selectedModel === entry.id && optActiveClass)}
            onClick={() => pick(entry.id)}
          >
            <span className={optTextClass}>
              <span className={optTitleClass}>{entry.label}</span>
              {entry.description && <span className={optDescClass}>{entry.description}</span>}
            </span>
            {selectedModel === entry.id && <CheckIcon className={optCheckClass} />}
          </button>
        ))}
      </Popover>
    </MenuTrigger>
  );
}

/** Mode pill — the permission-mode list with the effort bar at the bottom
 * of the same panel (the Claude Code treatment): mode stays visible on the
 * bar, effort lives one click away and echoes on the trigger only when
 * non-default ("Ask · High"). If the runtime has no mode control the pill
 * degrades to an effort-only trigger. */
function ModeMenu({ showMode, mode, onSetMode, showEffort, effort, effortInherited, efforts, effortLocked, disabled, onSetEffort }: {
  showMode: boolean;
  mode: PermMode;
  onSetMode: (m: PermMode) => void;
  showEffort: boolean;
  effort?: EffortLevel;
  effortInherited: boolean;
  efforts: EffortLevel[];
  effortLocked: boolean;
  disabled: boolean;
  onSetEffort: (level?: EffortLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = MODES.find((m) => m.id === mode) ?? MODES[0];
  const effortName = effort ? effortLabel(effort) : effortInherited ? 'Inherited' : 'Default';
  const effortSuffix = showEffort && (effort || effortInherited) ? ` · ${effortName}` : '';
  const label = showMode
    ? `${active.label}${effortSuffix}`
    : `Effort: ${effortName}`;
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        className={pillClass}
        isDisabled={disabled}
        aria-label={showMode
          ? `Permission mode: ${active.label} — ${active.desc}${showEffort && effort ? `; reasoning effort ${effortLabel(effort)}` : ''}`
          : `Reasoning effort: ${effortName}`}
      >
        {label}
        <ChevronDownIcon className={pillChevronClass} />
      </Button>
      <Popover className={menuPopupClass} placement="top end">
        {showMode && (
          <div>
            <div className={menuHeadClass}><span className="font-semibold text-foreground">Mode</span></div>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(optClass, m.id === mode && optActiveClass)}
                onClick={() => { onSetMode(m.id); setOpen(false); }}
              >
                <m.Icon className={optIconClass} />
                <span className={optTextClass}>
                  <span className={optTitleClass}>{m.label}</span>
                  <span className={optDescClass}>{m.desc}</span>
                </span>
                {m.id === mode && <CheckIcon className={optCheckClass} />}
              </button>
            ))}
          </div>
        )}
        {showEffort && (
          <div>
            {showMode && <div className={settingsDividerClass} />}
            <div
              className={effortLocked ? 'pointer-events-none opacity-60' : undefined}
              title={effortLocked ? 'Effort is fixed for this session' : undefined}
            >
              <EffortList effort={effort} efforts={efforts} inherited={effortInherited} onSet={onSetEffort} />
            </div>
          </div>
        )}
      </Popover>
    </MenuTrigger>
  );
}

/** Effort as a vertical list — the same row idiom as the Mode and Model
 * lists above it, so the whole popover reads as one control. The Default
 * row (clears any override) leads, then each level the runtime advertises,
 * in its own order. Being data-driven rows, it renders any agent's set —
 * Claude's Low…Max, Codex's Light…Ultra — with no wrapping or layout risk. */
function EffortList({ effort, efforts, inherited, onSet }: { effort?: EffortLevel; efforts: EffortLevel[]; inherited: boolean; onSet: (l?: EffortLevel) => void }) {
  const rows: { id: string; label: string; selected: boolean; pick: () => void }[] = [
    { id: '__default__', label: 'Default', selected: !effort, pick: () => onSet(undefined) },
    ...efforts.map((lv) => ({ id: lv, label: effortLabel(lv), selected: effort === lv, pick: () => onSet(lv) })),
  ];
  return (
    <div>
      <div className={menuHeadClass}><span className="font-semibold text-foreground">Effort</span></div>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className={cn(effortRowClass, row.selected && optActiveClass)}
          onClick={row.pick}
        >
          <span className={cn('min-w-0 truncate', row.selected && 'font-medium')}>
            {row.label}
            {/* The session inherited a non-default effort from a resumed
              * transcript; the Default row is where you'd clear it, so it's
              * where the current inherited state reads. */}
            {row.id === '__default__' && inherited && !effort && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">inherited</span>
            )}
          </span>
          {row.selected && <CheckIcon className={optCheckClass} />}
        </button>
      ))}
    </div>
  );
}

export function AgentComposer({
  phase, disabled, turnActive, active, mode, onSetMode, effort, onSetEffort,
  effortInherited, effortLocked, supportedEfforts, selectedModel, activeModel, models, modelLocked, modelNotice, resumedSession, onSetModel, sessionScope, folderEntries, folderLocked, folderHomeDir, onSetScope, onDraftChange, mentionFiles, mentionFolders, skills, skillState, onRefreshSkills, attachments, uploading, agentShortName, showModeMenu, showEffortMenu, showModelMenu, prefill, hero, onPickFiles, onPasteImages, onFocusChange, onRemoveAttachment, onSend, onStop,
}: {
  phase: 'connecting' | 'live' | 'closed';
  disabled: boolean;
  turnActive: boolean;
  active: boolean;
  mode: PermMode;
  onSetMode: (mode: PermMode) => void;
  effort?: EffortLevel;
  effortInherited: boolean;
  onSetEffort: (level?: EffortLevel) => void;
  effortLocked: boolean;
  supportedEfforts?: string[];
  selectedModel?: string;
  activeModel?: string;
  models: AgentModel[];
  modelLocked: boolean;
  modelNotice: string | null;
  resumedSession: boolean;
  onSetModel: (model?: string) => void;
  /** The scope this tab's session is (or will be) bound to. */
  sessionScope: ChatScope;
  folderEntries: LibraryFolderOption[];
  folderLocked: boolean;
  folderHomeDir: string;
  onSetScope: (scope: ChatScope) => void;
  /** Reports whether the composer holds unsent draft text, so the tab
   * model can freeze a drafted tab's scope and exclude it from blank-tab
   * reuse. */
  onDraftChange?: (hasText: boolean) => void;
  /** File/folder listing that feeds `@` mention ranking. For a tab bound to
   * another library folder this is the SESSION folder's listing, not the
   * window's; empty for a library-wide chat (mentions disabled there). */
  mentionFiles: FileMeta[];
  mentionFolders: FolderMeta[];
  skills: AgentSkill[];
  skillState: 'available' | 'empty' | 'failed';
  onRefreshSkills: () => void;
  attachments: Attachment[];
  uploading: boolean;
  agentShortName: string;
  showModeMenu: boolean;
  showEffortMenu: boolean;
  showModelMenu: boolean;
  /** Empty-state starter template. Prefills the draft only — never sends. */
  prefill?: { text: string; nonce: number } | null;
  /** Empty-chat layout: AgentView centers the composer mid-panel, so the
   * root sizes itself to the hero column instead of the `agent-composer`
   * chat-primary width hook. Same mounted instance in both layouts. */
  hero?: boolean;
  onPickFiles: (files: File[]) => void;
  onPasteImages: (files: File[]) => void;
  onFocusChange: (focused: boolean) => void;
  onRemoveAttachment: (path: string) => void;
  onSend: (text: string, skill?: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const composerRef = useRef<MentionComposerHandle>(null);
  const mentionListboxId = useId();
  const [mention, setMention] = useState<MentionQuery>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (active) composerRef.current?.focus(); }, [active]);

  // Starter-suggestion prefill: replace the draft and keep focus in the
  // editor so typing continues naturally. Sending stays a user action.
  useEffect(() => {
    if (prefill) composerRef.current?.setText(prefill.text);
  }, [prefill]);

  function cycleMode() {
    const i = MODES.findIndex((m) => m.id === mode);
    onSetMode(MODES[(i + 1) % MODES.length].id);
  }

  const suggestions = useMemo(() => {
    if (!mention || mention.kind !== 'mention') return [];
    return rankMentionSuggestions(mentionFiles, mentionFolders, mention.q);
  }, [mention, mentionFiles, mentionFolders]);

  const skillSuggestions = useMemo(() => mention?.kind === 'skill'
    ? skills.filter((skill) => skill.label.toLowerCase().includes(mention.q.toLowerCase()) || (skill.description ?? '').toLowerCase().includes(mention.q.toLowerCase()))
    : [], [mention, skills]);
  const choices = mention?.kind === 'skill' ? skillSuggestions : suggestions;

  const activeSuggestionIndex = Math.min(activeMentionIndex, Math.max(choices.length - 1, 0));
  const compatibleEfforts = effortOptions(supportedEfforts);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const list = mentionListRef.current;
      const active = list?.querySelector<HTMLElement>('.agent-mention-item.active');
      if (!list || !active) return;
      // `offsetTop` is relative to the positioned popup, not necessarily this
      // scroll container. Let the browser find the containing scrollport so a
      // selected row never lands partly above or below the visible list.
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSuggestionIndex, choices.length]);

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

  function pickMention(path: string) {
    if (!mention || mention.kind !== 'mention') return;
    composerRef.current?.insertMention(path, mention);
    setMention(null);
  }
  function submit(t: string) {
    const trimmed = t.trim();
    if ((!trimmed && attachments.length === 0 && !selectedSkill) || disabled || uploading) return false;
    onSend(trimmed, selectedSkill?.id);
    setSelectedSkill(undefined);
    setMention(null);
    return true;
  }

  function moveMention(direction: 1 | -1) {
    if (!choices.length) return;
    setActiveMentionIndex((index) => (index + direction + choices.length) % choices.length);
  }

  return (
    // `agent-composer` is a layout hook: the chat-primary grid rules in
    // styles/chat.css center it to the readable transcript width. In hero
    // mode the empty-state column (656px = 640px content + own padding)
    // replaces that hook so the composer centers mid-panel.
    // px-3 matches the transcript's 12px insets so the composer card and
    // the turn cards above share one column edge (the wrapper's
    // chat-primary width budgets for it — see `.agent-composer`).
    <div
      className={cn('relative', hero ? 'mx-auto w-[min(656px,100%)] p-2' : 'agent-composer p-2 px-3')}
      data-draft-empty={text.trim() ? 'false' : 'true'}
    >
      {mention && (choices.length > 0 || mention.kind === 'skill') && (
        <div className="agent-mention">
          <div className="agent-mention-head">
            <span>{mention.kind === 'skill' ? 'Available skills' : 'Files and folders'}</span>
            <span>{choices.length ? '↑↓ navigate · Enter select · Esc dismiss' : 'Esc dismiss'}</span>
          </div>
          {choices.length > 0 && <VisuallyHidden>
            <div role="status">
              {`${mention.kind === 'skill' ? (skillSuggestions[activeSuggestionIndex]?.label ?? '') : baseName(suggestions[activeSuggestionIndex].path)}, ${activeSuggestionIndex + 1} of ${choices.length}`}
            </div>
          </VisuallyHidden>}
          {choices.length > 0 ? <ListBox
            ref={mentionListRef}
            id={mentionListboxId}
            className="agent-mention-list"
            aria-label={mention.kind === 'skill' ? 'Matching available skills' : 'Matching library files and folders'}
            selectionMode="single"
            selectedKeys={[mention.kind === 'skill' ? skillSuggestions[activeSuggestionIndex]?.id ?? '' : suggestions[activeSuggestionIndex].path]}
            onAction={(key) => { if (mention.kind === 'skill') { const skill = skills.find((item) => item.id === String(key)); if (skill) { setSelectedSkill(skill); composerRef.current?.insertSkill(skill.label, mention); setMention(null); } } else pickMention(String(key)); }}
          >
            {mention.kind === 'skill' ? skillSuggestions.map((skill, index) => (
              <ListBoxItem key={skill.id} id={skill.id} className={({ isSelected }) => 'agent-mention-item' + (isSelected ? ' active' : '')} textValue={skill.label}><FileGenericIcon className="agent-mention-icon" /><span className="agent-mention-text"><span className="agent-mention-name">{skill.label}</span>{skill.description && <span className="agent-mention-path">{skill.description}</span>}</span></ListBoxItem>
            )) : suggestions.map((suggestion, index) => (
              <ListBoxItem
                key={suggestion.path}
                id={suggestion.path}
                className={({ isSelected }) => 'agent-mention-item' + (isSelected ? ' active' : '')}
                textValue={suggestion.path}
              >
                {suggestion.kind === 'folder'
                  ? <FolderIcon className="agent-mention-icon" />
                  : <FileGenericIcon className="agent-mention-icon" />}
                <span className="agent-mention-text">
                  <span className="agent-mention-name">{baseName(suggestion.path)}</span>
                  <span className="agent-mention-path">{suggestion.path}</span>
                </span>
              </ListBoxItem>
            ))}
          </ListBox> : (
            <div className="agent-mention-empty" role="status">
              {skillState === 'failed' ? <><span>Could not load skills.</span><Button className="agent-mention-retry" onPress={onRefreshSkills}>Retry</Button></> : <span>No skills are available for this folder.</span>}
            </div>
          )}
        </div>
      )}
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
        {(attachments.length > 0 || uploading) && (
          <div className="flex flex-wrap items-center gap-1">
            {attachments.map((a) => a.previewUrl ? (
              <span key={a.path} className={attachImageChipClass}>
                <button
                  type="button"
                  className={attachImagePreviewClass}
                  aria-label={`Preview ${a.name}`}
                  onClick={() => setPreviewAttachment(a)}
                >
                  <img src={a.previewUrl} alt="" />
                </button>
                <Button
                  className={attachImageRemoveClass}
                  aria-label={`Remove ${a.name}`}
                  onPress={() => {
                    if (previewAttachment?.path === a.path) setPreviewAttachment(null);
                    onRemoveAttachment(a.path);
                  }}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                    <path d="m2.25 2.25 7.5 7.5M9.75 2.25l-7.5 7.5" />
                  </svg>
                </Button>
              </span>
            ) : (
              <FileAttachmentChip
                key={a.path}
                name={a.name}
                path={a.path}
                trailing={<Button className={attachRemoveClass} aria-label={`Remove ${a.name}`} onPress={() => onRemoveAttachment(a.path)}>×</Button>}
              />
            ))}
            {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
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
          onMentionChange={(next) => {
            setMention(next);
            setActiveMentionIndex(0);
          }}
          onMentionNavigate={moveMention}
            onMentionAccept={() => {
            if (!mention) return false;
            if (!choices.length) return mention.kind === 'skill';
            if (mention.kind === 'skill') { const skill = skillSuggestions[activeSuggestionIndex]; if (!skill) return false; setSelectedSkill(skill); composerRef.current?.insertSkill(skill.label, mention); setMention(null); return true; }
            pickMention(suggestions[activeSuggestionIndex].path);
            return true;
          }}
            onMentionDismiss={() => setMention(null)}
          onSkillMarkerRemoved={() => setSelectedSkill(undefined)}
          onShiftTab={() => {
            if (!showModeMenu || disabled) return false;
            cycleMode();
            return true;
          }}
          onSubmit={submit}
          onPasteImages={onPasteImages}
          onFocusChange={onFocusChange}
          mentionOpen={Boolean(mention && (choices.length > 0 || mention.kind === 'skill'))}
          mentionListboxId={mention && choices.length ? mentionListboxId : undefined}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onPickFiles(Array.from(e.target.files ?? []));
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
            aria-label={uploading ? 'Uploading files' : 'Upload local files'}
            isDisabled={uploading}
            onPress={() => fileInputRef.current?.click()}
          >
            <PlusIcon />
          </Button>
          {/* Scope reads left (with the attach control); the run settings
            * — model, mode — group right next to send. */}
          <ScopeMenu
            scope={sessionScope}
            entries={folderEntries}
            homeDir={folderHomeDir}
            heading="Session scope"
            libraryDetail="Chat across your whole library"
            ariaLabel={scopePillAriaLabel(sessionScope, folderLocked)}
            locked={folderLocked}
            disabled={disabled}
            onSetScope={onSetScope}
          />
          <span className="flex-1" />
          {showModelMenu && (
            <ModelMenu
              selectedModel={selectedModel}
              activeModel={activeModel}
              models={models}
              locked={modelLocked}
              disabled={disabled}
              resumedSession={resumedSession}
              onSetModel={onSetModel}
            />
          )}
          {(showModeMenu || showEffortMenu) && (
            <ModeMenu
              showMode={showModeMenu}
              mode={mode}
              onSetMode={onSetMode}
              showEffort={showEffortMenu}
              effort={effort}
              effortInherited={effortInherited}
              efforts={compatibleEfforts}
              effortLocked={effortLocked}
              disabled={disabled}
              onSetEffort={onSetEffort}
            />
          )}
          {turnActive ? (
            <Button className={cn(sendClass, sendStopClass)} aria-label="Stop agent" onPress={onStop}>
              <StopIcon />
            </Button>
          ) : (
            <Button
              className={cn(sendClass, sendReadyClass)}
              aria-label="Send message"
              isDisabled={disabled || uploading || (!text.trim() && attachments.length === 0 && !selectedSkill)}
              onPress={() => composerRef.current?.submit()}
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
        {modelNotice && <div className="pt-1.5 text-xs leading-snug text-muted-foreground" role="status">{modelNotice}</div>}
      </div>
      {previewAttachment?.previewUrl && (
        <ImageLightbox
          src={previewAttachment.previewUrl}
          alt={previewAttachment.name}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
