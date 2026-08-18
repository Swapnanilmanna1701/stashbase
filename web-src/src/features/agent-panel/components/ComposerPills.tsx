/**
 * The composer bar's session pills — model, permission mode, and reasoning
 * effort — plus the popovers behind them.
 *
 * Each is a pure function of the control object AgentComposer hands it: no
 * draft text, no attachments, no mention state, nothing else in the
 * composer. They live here so `AgentComposer.tsx` is the input surface and
 * its send path, not also three menus.
 *
 * Composer-bar pills use the shared quiet pill trigger (panelStyles) with a
 * control-naming title/aria-label so adjacent "Default" values stay
 * distinguishable. The session settings live behind a single trigger, so
 * no pill needs emphasis.
 */
import { useState } from 'react';
import { Button, MenuTrigger, Popover } from 'react-aria-components';
import {
  BoltIcon, CheckIcon, ChevronDownIcon, ClipboardListIcon, CodeIcon, HandIcon,
} from '@/common/components/icons';
import { cn } from '@/common/lib/utils';
import { effortLabel, effortOptions } from '@/features/agent-panel/lib/effortMenuState';
import {
  menuHeadClass, optActiveClass, optCheckClass, optClass, optDescClass,
  optIconClass, optTextClass, optTitleClass, pillChevronClass, pillClass, pillLockedClass,
} from '@/common/lib/pillMenuStyles';
import type { AgentModel, EffortLevel, PermMode } from '@/features/agent-panel/lib/types';
import { modelMenuLabel } from '@/features/agent-panel/lib/modelState';

const MODES: { id: PermMode; label: string; desc: string; Icon: typeof HandIcon }[] = [
  { id: 'default', label: 'Ask', desc: 'Ask before edits or higher-risk actions', Icon: HandIcon },
  { id: 'acceptEdits', label: 'Edit', desc: 'Apply file edits without asking each time', Icon: CodeIcon },
  { id: 'plan', label: 'Plan', desc: 'Explore and propose a plan before changing files', Icon: ClipboardListIcon },
  { id: 'auto', label: 'Auto', desc: 'Let the agent decide when approval is needed', Icon: BoltIcon },
];

/** The next mode in the bar's cycle order, for the composer's Shift-Tab
 *  shortcut. An unrecognized current mode restarts the cycle. */
export function nextPermMode(current: PermMode): PermMode {
  const index = MODES.findIndex((m) => m.id === current);
  return MODES[(index + 1) % MODES.length].id;
}

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

/** Permission-mode control for the composer bar's Mode pill. */
export interface ComposerModeControl {
  show: boolean;
  value: PermMode;
  onSet: (mode: PermMode) => void;
}

/** Thinking-effort control, sharing the Mode pill's popover. */
export interface ComposerEffortControl {
  show: boolean;
  /** Explicit override; undefined preserves the runtime default. */
  level?: EffortLevel;
  /** The resumed session carries a non-default effort the user never
   * picked here (reads on the Default row). */
  inherited: boolean;
  locked: boolean;
  /** Effort ids the effective model supports; undefined means all. */
  supported?: string[];
  onSet: (level?: EffortLevel) => void;
}

/** Model control for the bar's Model pill. */
export interface ComposerModelControl {
  show: boolean;
  /** User intent for the next session; undefined means Default (no override). */
  selected?: string;
  /** Model the runtime says the live session is actually using. */
  active?: string;
  models: AgentModel[];
  locked: boolean;
  notice: string | null;
  resumedSession: boolean;
  onSet: (model?: string) => void;
}

/** Model pill — stays its own control so the current model is always
 * visible on the bar. Locked once the session has content. */
export function ModelMenu({ model, disabled }: { model: ComposerModelControl; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const defaultSelected = !model.selected;
  const label = modelMenuLabel(model.models, model.selected, model.active, model.resumedSession);
  const pick = (id?: string) => { model.onSet(id); setOpen(false); };
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        className={cn(pillClass, 'max-w-40', model.locked && pillLockedClass)}
        isDisabled={disabled || model.locked}
        aria-label={`Model: ${label}${model.locked ? ' — fixed for this conversation' : ''}`}
        // RAC forwards global DOM attributes (title) at runtime but its
        // ButtonProps type omits them; the spread keeps the tooltip typed.
        {...{ title: model.locked ? `Model — ${label} (fixed for this conversation)` : `Model — ${label}` }}
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
        {model.models.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={cn(optClass, model.selected === entry.id && optActiveClass)}
            onClick={() => pick(entry.id)}
          >
            <span className={optTextClass}>
              <span className={optTitleClass}>{entry.label}</span>
              {entry.description && <span className={optDescClass}>{entry.description}</span>}
            </span>
            {model.selected === entry.id && <CheckIcon className={optCheckClass} />}
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
export function ModeMenu({ mode, effort, disabled }: {
  mode: ComposerModeControl;
  effort: ComposerEffortControl;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activeMode = MODES.find((m) => m.id === mode.value) ?? MODES[0];
  const efforts = effortOptions(effort.supported);
  const effortName = effort.level ? effortLabel(effort.level) : effort.inherited ? 'Inherited' : 'Default';
  const effortSuffix = effort.show && (effort.level || effort.inherited) ? ` · ${effortName}` : '';
  const label = mode.show
    ? `${activeMode.label}${effortSuffix}`
    : `Effort: ${effortName}`;
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        className={pillClass}
        isDisabled={disabled}
        aria-label={mode.show
          ? `Permission mode: ${activeMode.label} — ${activeMode.desc}${effort.show && effort.level ? `; reasoning effort ${effortLabel(effort.level)}` : ''}`
          : `Reasoning effort: ${effortName}`}
      >
        {label}
        <ChevronDownIcon className={pillChevronClass} />
      </Button>
      <Popover className={menuPopupClass} placement="top end">
        {mode.show && (
          <div>
            <div className={menuHeadClass}><span className="font-semibold text-foreground">Mode</span></div>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(optClass, m.id === mode.value && optActiveClass)}
                onClick={() => { mode.onSet(m.id); setOpen(false); }}
              >
                <m.Icon className={optIconClass} />
                <span className={optTextClass}>
                  <span className={optTitleClass}>{m.label}</span>
                  <span className={optDescClass}>{m.desc}</span>
                </span>
                {m.id === mode.value && <CheckIcon className={optCheckClass} />}
              </button>
            ))}
          </div>
        )}
        {effort.show && (
          <div>
            {mode.show && <div className={settingsDividerClass} />}
            <div
              className={effort.locked ? 'pointer-events-none opacity-60' : undefined}
              title={effort.locked ? 'Effort is fixed for this session' : undefined}
            >
              <EffortList effort={effort.level} efforts={efforts} inherited={effort.inherited} onSet={effort.onSet} />
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
