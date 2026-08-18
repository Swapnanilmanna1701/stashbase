/**
 * Settings → AI Index panel. The user can choose the signed-in StashBase
 * allowance, direct OpenAI, or OpenRouter's OpenAI-compatible endpoint. With
 * no active source, indexing and meaning-based search are disabled (files
 * still save, preview, and Exact search); the setup modal on folder load lives in
 * `EmbedderRequireKeyGate` so it fires whether or not Settings is open.
 */
import { useState } from 'react';
import { type EmbedderProvider } from '@/common/api/apiTypes';
import { useEmbedderSettings } from '@/features/settings/hooks/useEmbedderSettings';
import { EmbeddingAuthChoice } from '@/features/settings/components/embedder/EmbeddingAuthChoice';
import { KeyModal } from '@/features/settings/components/embedder/KeyModal';
import { RemoveKeyModal } from '@/features/settings/components/embedder/RemoveKeyModal';
import { Button } from '@/common/components/ui/button';
import { Input } from '@/common/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/common/components/ui/segmented-control';
import { AccountSignInForm } from '@/common/components/AccountSignInForm';
import { hostedQuotaRemainingPercent, hostedQuotaResetLabel } from '@/common/lib/hostedQuota';

const PROVIDERS: Record<EmbedderProvider, { label: string; model: string; placeholder: string; costHint: string }> = {
  openai: {
    label: 'OpenAI',
    model: 'text-embedding-3-small',
    placeholder: 'sk-...',
    costHint: 'about $0.02 per million tokens',
  },
  openrouter: {
    label: 'OpenRouter',
    model: 'openai/text-embedding-3-small',
    placeholder: 'sk-or-v1-...',
    costHint: 'billed by OpenRouter',
  },
};

const PROVIDER_ORDER: EmbedderProvider[] = ['openai', 'openrouter'];

export function EmbeddingPanel() {
  const {
    state,
    loadError,
    retryLoad,
    selectedProvider,
    selectProvider,
    addKey,
    addBusy,
    addError,
    setAddKey,
    submitAddKey,
    accountBusy,
    saveKey,
    removeKey,
    refreshAccount,
    signOut,
    useAccountAllowance,
    useApiKeySource,
    applySignedIn,
  } = useEmbedderSettings();
  const [keyEditOpen, setKeyEditOpen] = useState(false);
  const [keyRemoveOpen, setKeyRemoveOpen] = useState(false);
  // Whether the bring-your-own-key form is revealed. Only relevant when
  // nothing is authorized yet: that is the one state where Settings shows
  // the same fork the Files-panel callout does, so a user who arrived here
  // from either direction sees the two options with equal weight instead of
  // a key field plus a footnote about accounts.
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [signInFormOpen, setSignInFormOpen] = useState(false);

  if (loadError) {
    return (
      <div>
        <div className="text-sm text-destructive">Couldn’t load embedder settings: {loadError}</div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={retryLoad}>Retry</Button>
        </div>
      </div>
    );
  }
  if (!state) return <div className="py-3 text-base text-muted-foreground">Loading…</div>;
  const selected = PROVIDERS[selectedProvider];
  const activeProviderSelected = state.provider === selectedProvider;
  const hasSelectedProviderKey = state.hasKey && activeProviderSelected;
  const directSourceActive = state.source === selectedProvider;
  // Provider and model are bring-your-own-key concerns. While the fork is
  // up they would be answering a question the user has not reached yet, so
  // the panel shows the choice alone until a path is picked.
  const hostedActive = state.source === 'stashbase-account' && state.account.signedIn;
  const showingHostedSummary = hostedActive && !keyFormOpen && !signInFormOpen;
  const showingAuthChoice = !state.authorized && !keyFormOpen && !signInFormOpen;

  return (
    <>
      <div>
        <div>
          <div className="mb-1 text-base font-semibold">AI Index</div>
          <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
            Powers meaning-based search and Agent retrieval. The model stays fixed so the local index remains compatible.
          </div>
          {showingHostedSummary && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{state.account.email}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Using the StashBase account allowance</div>
                </div>
                {state.account.quota && (
                  <div className="text-right">
                    <div className="text-base font-semibold">{hostedQuotaRemainingPercent(state.account.quota)}%</div>
                    <div className="text-2xs text-muted-foreground">remaining</div>
                  </div>
                )}
              </div>
              {state.account.quota && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${hostedQuotaRemainingPercent(state.account.quota)}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>{state.account.quota.remainingTokens.toLocaleString()} tokens left</span>
                    <span>{hostedQuotaResetLabel(state.account.quota)}</span>
                  </div>
                </div>
              )}
              {state.account.quotaUnavailable && <div className="mt-2 text-xs text-muted-foreground">Usage is temporarily unavailable.</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={accountBusy} onClick={() => { void refreshAccount(); }}>Refresh usage</Button>
                <Button variant="outline" size="sm" disabled={accountBusy} onClick={() => setKeyFormOpen(true)}>Use your own key</Button>
                <Button variant="ghost" size="sm" disabled={accountBusy} onClick={() => { void signOut(); }}>Sign out</Button>
              </div>
            </div>
          )}
          {signInFormOpen && (
            <AccountSignInForm
              onBack={() => setSignInFormOpen(false)}
              onSignedIn={(account) => {
                applySignedIn(account);
                setSignInFormOpen(false);
              }}
            />
          )}
          {state.account.signedIn && !hostedActive && !signInFormOpen && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">Signed in as {state.account.email}</div>
                <div className="text-xs text-muted-foreground">Your own API key is currently active.</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={accountBusy}
                onClick={() => {
                  setKeyFormOpen(false);
                  void useAccountAllowance();
                }}
              >Use account allowance</Button>
            </div>
          )}
          {!showingHostedSummary && !signInFormOpen && !showingAuthChoice && (
            <SegmentedControl
              aria-label="Embedding provider"
              className="mt-0.5 mb-2 w-fit"
              disabled={addBusy}
              value={[selectedProvider]}
              onValueChange={(next) => {
                const picked = next[0] as EmbedderProvider | undefined;
                if (!picked || picked === selectedProvider) return;
                selectProvider(picked);
              }}
            >
              {PROVIDER_ORDER.map((provider) => (
                <SegmentedControlItem key={provider} value={provider} className="min-w-24 text-sm">
                  {PROVIDERS[provider].label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          )}
          {!showingHostedSummary && !signInFormOpen && !showingAuthChoice && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm leading-normal text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_code]:whitespace-nowrap [&_code]:text-accent">
            {state.hasKey && <span>Current: {PROVIDERS[state.provider].label}</span>}
            <span>Model: <code>{selected.model}</code></span>
            <span>{selected.costHint}</span>
          </div>
          )}
          {!showingHostedSummary && !signInFormOpen && (hasSelectedProviderKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 text-sm leading-8 text-muted-foreground">{directSourceActive ? 'Key active' : 'Key configured'}</div>
              <div className="flex flex-wrap gap-2">
                {!directSourceActive && (
                  <Button
                    size="sm"
                    disabled={accountBusy}
                    onClick={() => {
                      setKeyFormOpen(false);
                      void useApiKeySource();
                    }}
                  >Use this key</Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setKeyEditOpen(true)}
                >Change key…</Button>
                <Button
                  variant="destructive-outline"
                  onClick={() => setKeyRemoveOpen(true)}
                >Remove key…</Button>
              </div>
            </div>
          ) : (
            <>
              {state.hasKey && !activeProviderSelected && (
                <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
                  Save a {selected.label} key to switch from {PROVIDERS[state.provider].label}.
                </div>
              )}
              {/* Nothing authorized yet: lead with the fork, the same one
                * the Files-panel callout shows. Switching providers with a
                * key already on file is a different question and keeps the
                * plain form. */}
              {showingAuthChoice && (
                <EmbeddingAuthChoice onSignIn={() => setSignInFormOpen(true)} onUseOwnKey={() => setKeyFormOpen(true)} />
              )}
              {!showingAuthChoice && (
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  type="password"
                  className="h-8 flex-1 font-mono text-sm"
                  placeholder={selected.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  value={addKey}
                  disabled={addBusy}
                  onChange={(e) => setAddKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitAddKey(); } }}
                />
                <Button
                  onClick={() => { void submitAddKey(); }}
                  disabled={addBusy || !addKey.trim()}
                >{addBusy ? 'Validating…' : 'Add key'}</Button>
              </div>
              )}
              {addError && <div className="mt-1.5 text-sm text-destructive">{addError}</div>}
            </>
          ))}
          {!showingHostedSummary && !signInFormOpen && !showingAuthChoice && (
            <div className="mt-3.5 text-sm leading-normal text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_code]:whitespace-nowrap [&_code]:text-accent">
              Stored locally in <code>~/.stashbase/config.json</code>. Used only for embeddings, never chat.
            </div>
          )}
        </div>
      </div>

      {keyEditOpen && (
        <KeyModal
          mode="change"
          provider={selectedProvider}
          model={selected.model}
          placeholder={selected.placeholder}
          onCancel={() => setKeyEditOpen(false)}
          onSaved={async (key) => { setKeyEditOpen(false); await saveKey(key); }}
        />
      )}
      {keyRemoveOpen && (
        <RemoveKeyModal
          onCancel={() => setKeyRemoveOpen(false)}
          onConfirm={async () => { setKeyRemoveOpen(false); await removeKey(); }}
        />
      )}
    </>
  );
}
