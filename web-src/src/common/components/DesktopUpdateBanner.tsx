import { useReducer } from 'react';
import { useDesktopUpdate } from '@/common/hooks/useDesktopUpdate';
import { CloseIcon } from '@/common/components/icons';
import { Button } from '@/common/components/ui/button';

const DISMISS_KEY = 'stashbase.update-banner-dismissed';

/** Dismissal tracks the current ANNOUNCEMENT, not the update: waving off
 *  "2.1.0 is available" must not swallow "2.1.0 is ready to install" after
 *  the user explicitly started that download, and a newer release is a new
 *  announcement. Version + phase is exactly that identity; download percent
 *  changes stay inside one signature. */
function announcementSignature(version: string, phase: string): string {
  return `${version}|${phase}`;
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(signature: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, signature);
  } catch {
    // Private browsing and hardened WebViews may reject localStorage;
    // the banner then simply returns next launch.
  }
}

/**
 * The desktop update announcement: a card floating above the sidebar's
 * account row rather than sitting in it, so the Discord, bug-report, and
 * Settings utilities never yield their place while an update is pending.
 *
 * Dismissable, unlike `EmbeddingSetupCallout` one row below: an update the
 * user is not ready to take would otherwise camp on screen for days, and
 * Settings → General remains the standing update surface after a dismiss.
 * Dismissal never touches the persisted preference or an in-flight
 * download — it hides this announcement only (see `announcementSignature`
 * for when it comes back).
 */
export function DesktopUpdateBanner() {
  const { state, runPrimaryAction } = useDesktopUpdate();
  // Dismissal lives in localStorage, not component state — this bump just
  // forces the re-render that hides the card in place.
  const [, bumpDismissals] = useReducer((n: number) => n + 1, 0);

  const simulationActive = state?.simulation?.value !== undefined
    && state.simulation.value !== 'off';
  const version = state?.availableVersion;
  if (!state || typeof version !== 'string') return null;
  if (!state.autoCheckEnabled && !simulationActive) return null;

  const signature = announcementSignature(version, state.phase);
  if (readDismissed() === signature) return null;

  const title = state.phase === 'ready'
    ? `StashBase ${version} is ready to install`
    : state.phase === 'installing'
      ? `Installing StashBase ${version}…`
      : state.phase === 'error'
        ? `Update to StashBase ${version} failed`
        : `StashBase ${version} is available`;
  const actionLabel = state.phase === 'ready'
    ? 'Install update'
    : state.phase === 'downloading'
      ? `Downloading${state.percent === undefined ? '…' : ` ${state.percent}%`}`
      : state.phase === 'installing'
        ? 'Installing…'
        : state.phase === 'error'
          ? 'Retry update'
          : 'Update';

  return (
    // Zero-height anchor: the card overlays the file tree instead of pushing
    // it, and its bottom edge tracks the account row it announces above.
    <div className="relative flex-none">
      <section
        aria-label="Application update"
        className="absolute inset-x-1.5 bottom-1.5 z-30 rounded-xl border border-border bg-card px-3 py-2.5 text-xs leading-snug shadow-elevation"
      >
        <div className="pr-5 font-semibold text-foreground">{title}</div>
        {state.phase === 'error' && state.message && (
          <div className="mt-0.5 pr-5 text-muted-foreground">{state.message}</div>
        )}
        {/* Solid accent, right-aligned: the transient-offer idiom
          * (ManagedClipboardImport), not the quiet inline-link one — this
          * card exists only to offer this action. */}
        <div className="mt-2 flex justify-end">
          <Button
            size="xs"
            disabled={state.phase === 'downloading' || state.phase === 'installing'}
            aria-label={`${actionLabel} to StashBase ${version}`}
            onClick={() => { void runPrimaryAction(); }}
          >
            {actionLabel}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss update notice"
          className="absolute top-0.5 right-0.5 text-muted-foreground"
          onClick={() => { rememberDismissed(signature); bumpDismissals(); }}
        >
          <CloseIcon className="size-3" aria-hidden="true" />
        </Button>
      </section>
    </div>
  );
}
