/**
 * The first-run AI Index setup dialog (see `EmbedderRequireKeyGate`).
 *
 * Setting up an indexing source is strongly recommended, not forced: an
 * unindexed library still browses, edits, previews, and keyword-searches —
 * those are local computations, and open-source, local-first software must
 * not lock them behind a remote service. So the dialog has an exit, but a
 * low-emphasis, deliberate one; there is no casual dismiss (Escape / backdrop
 * do nothing), so the user makes an explicit choice rather than swatting a
 * prompt.
 *
 * Two views:
 *   • choice — sign in (recommended, hosted) · use your own key · a quiet
 *     "Skip for now" exit.
 *   • key    — provider toggle + key field; "Save key" activates. A Back link
 *     returns to the choice.
 *
 * The exit is one deliberate, low-emphasis button, not a confirm hop: "for
 * now" already says the choice is reversible and the Files-panel entry
 * reopens this, while a confirm that itemised the surviving local abilities
 * would package keyword search as a peer feature — which it is not meant to
 * be.
 *
 * Exits:
 *   • Save key — validates + persists via `/api/embedder/key`, daemon
 *     hot-swap; the dialog closes and the library is activated.
 *   • Skip AI Index for now — the caller records the choice for this window;
 *     the Files panel keeps a quiet "Set up AI Index" entry for later.
 */
import { useCallback, useRef, useState } from 'react';
import { type EmbedderProvider } from '@/common/api/apiTypes';
import { useApiKeyEntry } from '@/features/settings/hooks/useApiKeyEntry';
import ManagedModalShell from '@/common/components/ManagedModalShell';
import { EmbeddingAuthChoice } from '@/features/settings/components/embedder/EmbeddingAuthChoice';
import { Button } from '@/common/components/ui/button';
import { Input } from '@/common/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/common/components/ui/segmented-control';
import { StatusMessage } from '@/common/components/ui/status';
import { AccountSignInForm } from '@/common/components/AccountSignInForm';

const PROVIDERS: Record<EmbedderProvider, { label: string; model: string; placeholder: string }> = {
  openai: {
    label: 'OpenAI',
    model: 'text-embedding-3-small',
    placeholder: 'sk-...',
  },
  openrouter: {
    label: 'OpenRouter',
    model: 'openai/text-embedding-3-small',
    placeholder: 'sk-or-v1-...',
  },
};

const PROVIDER_ORDER: EmbedderProvider[] = ['openai', 'openrouter'];

type View = 'choice' | 'signin' | 'key';

const TITLES: Record<View, string> = {
  choice: 'Set up AI Index',
  signin: 'Sign in to StashBase',
  key: 'Add your API key',
};

/* One line, scannable at a glance. The old subtitle explained the
 * mechanism ("…even when the wording is different") — product copy in a
 * dialog whose job is a choice, and the sentence that started every layer
 * of this screen running two lines deep. */
const DESCRIPTIONS: Record<View, string> = {
  choice: 'Help Agents find context across your files.',
  signin: 'Use your free monthly AI Index allowance.',
  key: 'Paste an OpenAI or OpenRouter key.',
};

export function RequireApiKeyModal({
  initialProvider = 'openai',
  isTopmost,
  onSaved,
  onSignedIn,
  onSkip,
}: {
  initialProvider?: EmbedderProvider;
  isTopmost: boolean;
  onSaved: (provider: EmbedderProvider, model: string, backfillStarted?: boolean, warning?: string) => void;
  onSignedIn: (backfillStarted?: boolean) => void;
  onSkip: () => void;
}) {
  const [provider, setProvider] = useState<EmbedderProvider>(initialProvider);
  const [view, setView] = useState<View>('choice');
  const { key, busy, error, setKey, clearError, submit } = useApiKeyEntry(
    provider,
    // `changeApiKey` server-side rejects definite provider auth failures,
    // persists to `~/.stashbase/config.json`, and rebinds so the next
    // search uses the new key (creating the collection on first key).
    useCallback(
      (result) => onSaved(result.provider, result.model, result.backfillStarted, result.warning),
      [onSaved],
    ),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Opening focus for the choice view. Base UI otherwise hands focus to
  // the first enabled control — here the second card, because the first
  // is inert — and a focus ring around a full-width card reads as "this
  // one is already picked", the single thing this screen must not say.
  // A tabindex=-1 wrapper takes the focus silently (globals.css drops the
  // ring for elements the keyboard cannot tab to) and Tab still steps
  // into the cards from there.
  const choiceRef = useRef<HTMLDivElement | null>(null);

  return (
    <ManagedModalShell
      title={TITLES[view]}
      description={DESCRIPTIONS[view]}
      // A tight column: this is a short, choice-style dialog, and the default
      // width let the description prose run past a comfortable measure.
      narrow
      // Per view, and never nothing: focusing a ref whose element is not
      // mounted drops focus to the document and strands keyboard users.
      // The key view lands in the field; the choice view lands on its
      // inert wrapper rather than on a card (see `choiceRef`).
      initialFocus={view === 'key' ? inputRef : choiceRef}
      // No casual dismiss. Backdrop clicks are disabled and the close request
      // (Escape) is swallowed — the way out is an explicit choice: activate,
      // or take the deliberate "Skip for now" path.
      closeOnBackdrop={false}
      onCancel={() => { /* no casual dismiss — choose activate or skip */ }}
      isTopmost={isTopmost}
    >
      {view === 'choice' && (
        <div ref={choiceRef} tabIndex={-1} className="outline-none">
          <EmbeddingAuthChoice
            onSignIn={() => setView('signin')}
            onUseOwnKey={() => setView('key')}
            onSkip={onSkip}
          />
        </div>
      )}

      {view === 'signin' && (
        <div ref={choiceRef} tabIndex={-1} className="outline-none">
          <AccountSignInForm
            onBack={() => setView('choice')}
            // The signed-in account carries no backfill flag: see the Known
            // Gap on `HostedAccountActivation` in `shared/account.ts`.
            onSignedIn={() => onSignedIn(undefined)}
          />
        </div>
      )}

      {view === 'key' && (
      <>
      {/* The shared segmented control, not a hand-rolled radio row: that
        * one marked its selection with a heavier font, which at one size
        * reads as "these two words are different sizes", and it stretched
        * to the dialog width so the two providers got unequal shares. */}
      <SegmentedControl
        aria-label="Embedding provider"
        className="mb-2 w-fit"
        disabled={busy}
        value={[provider]}
        onValueChange={(next) => {
          const picked = next[0] as EmbedderProvider | undefined;
          if (!picked || picked === provider) return;
          setProvider(picked);
          setKey('');
          clearError();
        }}
      >
        {PROVIDER_ORDER.map((optionProvider) => (
          <SegmentedControlItem key={optionProvider} value={optionProvider} className="min-w-24 text-sm">
            {PROVIDERS[optionProvider].label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {/* Detail, not body: at 13px these two lines carried the same
        * weight as the question above them. */}
      <div className="mb-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-normal text-muted-foreground [&_code]:font-mono [&_code]:text-2xs [&_code]:text-accent">
        <span>Model: <code>{PROVIDERS[provider].model}</code></span>
        <span>Stored locally in <code>~/.stashbase/config.json</code></span>
      </div>
      <Input
        ref={inputRef}
        type="password"
        className="font-mono text-sm"
        placeholder={PROVIDERS[provider].placeholder}
        autoComplete="off"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') { e.preventDefault(); void submit(); }
        }}
      />
      {error && (
        <StatusMessage tone="error" className="mt-2.5 max-h-[min(180px,32vh)] overflow-y-auto wrap-anywhere">
          {error}
        </StatusMessage>
      )}
      <div className="mt-3.5 flex items-center justify-between gap-2">
        {/* Same quiet text exit as the choice view's "Skip for now": both
          * are the low-emphasis way OUT of this dialog, so they read as
          * one control at two moments — no resting underline, no button
          * box beside the primary action, underline on hover only. */}
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:cursor-default disabled:opacity-60"
          onClick={() => { setView('choice'); clearError(); }}
          disabled={busy}
        >Back</button>
        <Button
          type="button"
          onClick={submit}
          disabled={busy}
        >{busy ? 'Validating…' : 'Save key'}</Button>
      </div>
      </>
      )}
    </ManagedModalShell>
  );
}
