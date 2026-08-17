/**
 * Settings → AI Index panel. The user can choose the signed-in StashBase
 * allowance, direct OpenAI, or OpenRouter's OpenAI-compatible endpoint. With
 * no active source, indexing and meaning-based search are disabled (files
 * still save, preview, and Exact search); the setup modal on folder load lives in
 * `EmbedderRequireKeyGate` so it fires whether or not Settings is open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, type EmbedderProvider, type EmbedderState } from '../../api';
import { useApp } from '../../store/AppContext';
import { EmbeddingAuthChoice } from '../embedder/EmbeddingAuthChoice';
import { KeyModal } from '../embedder/KeyModal';
import { RemoveKeyModal } from '../embedder/RemoveKeyModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { AccountSignInForm } from '../account/AccountSignInForm';
import { notifyAccountChanged } from '../../accountEvents';
import { hostedQuotaRemainingPercent, hostedQuotaResetLabel } from '../../lib/hostedQuota';
import { AccountAvatar, accountDisplayLabel } from '../account/AccountIdentity';

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
  const { dispatch, actions } = useApp();
  const [state, setState] = useState<EmbedderState | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<EmbedderProvider>('openai');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [keyEditOpen, setKeyEditOpen] = useState(false);
  const [keyRemoveOpen, setKeyRemoveOpen] = useState(false);
  // Inline "Add key" (no-key state): no modal — the input lives in the
  // panel. Change/Remove still use modals (rarer / needs confirm).
  const [addKey, setAddKey] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Whether the bring-your-own-key form is revealed. Only relevant when
  // nothing is authorized yet: that is the one state where Settings shows
  // the same fork the Files-panel callout does, so a user who arrived here
  // from either direction sees the two options with equal weight instead of
  // a key field plus a footnote about accounts.
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [signInFormOpen, setSignInFormOpen] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api.getEmbedder()
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setSelectedProvider(s.provider);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg || 'Failed to load embedder settings');
      });
    return () => { cancelled = true; };
  }, [loadNonce]);

  const retryLoad = useCallback(() => setLoadNonce((n) => n + 1), []);

  async function onKeyChanged(key: string) {
    const result = await api.changeApiKey(key, selectedProvider);
    if (!mountedRef.current) return;
    setKeyEditOpen(false);
    setState((s) => (s ? { ...s, provider: result.provider, model: result.model, hasKey: true, authorized: true, source: result.provider } : s));
    setSelectedProvider(result.provider);
    dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
    if (result.warning) actions.toast(`API key saved, but validation could not reach the provider: ${result.warning}`, { level: 'warning' });
    if (result.backfillStarted) void actions.markVisibleFilesPendingForSearch();
    void actions.refreshIndexState();
  }

  async function addKeySubmit() {
    const trimmed = addKey.trim();
    if (!trimmed) { setAddError('Key required'); return; }
    setAddBusy(true);
    setAddError(null);
    try {
      // changeApiKey rejects definite provider auth failures server-side,
      // so the success path only does one validation round trip.
      const result = await api.changeApiKey(trimmed, selectedProvider);
      if (!mountedRef.current) return;
      setAddKey('');
      setState((s) => (s ? { ...s, provider: result.provider, model: result.model, hasKey: true, authorized: true, source: result.provider } : s));
      setSelectedProvider(result.provider);
      dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
      if (result.warning) actions.toast(`API key saved, but validation could not reach the provider: ${result.warning}`, { level: 'warning' });
      if (result.backfillStarted) void actions.markVisibleFilesPendingForSearch();
      void actions.refreshIndexState();
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setAddError(errorMessage(err));
    } finally {
      if (mountedRef.current) setAddBusy(false);
    }
  }

  async function onKeyRemoveConfirmed() {
    await api.removeApiKey();
    if (!mountedRef.current) return;
    setKeyRemoveOpen(false);
    setLoadNonce((n) => n + 1);
    // The search popup re-checks the embedder before every semantic run, so
    // flipping the shared key state here is all it needs.
    dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: false });
    void actions.refreshIndexState();
  }

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

  async function refreshAccount() {
    setAccountBusy(true);
    try {
      const account = await api.getAccount(true);
      if (mountedRef.current) setState((current) => current ? { ...current, account } : current);
    } catch (err: unknown) {
      actions.toast(errorMessage(err), { level: 'error' });
    } finally {
      if (mountedRef.current) setAccountBusy(false);
    }
  }

  async function signOut() {
    setAccountBusy(true);
    try {
      await api.signOutAccount();
      notifyAccountChanged();
      if (!mountedRef.current) return;
      setLoadNonce((n) => n + 1);
      dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: false });
      void actions.refreshIndexState();
    } catch (err: unknown) {
      actions.toast(errorMessage(err), { level: 'error' });
    } finally {
      if (mountedRef.current) setAccountBusy(false);
    }
  }

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
                <div className="flex min-w-0 items-center gap-2.5">
                  <AccountAvatar account={state.account} />
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{accountDisplayLabel(state.account)}</div>
                    {state.account.displayName && state.account.email && (
                      <div className="truncate text-xs text-muted-foreground">{state.account.email}</div>
                    )}
                    <div className="mt-0.5 text-xs text-muted-foreground">Using the StashBase account allowance</div>
                  </div>
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
                setState((current) => current ? { ...current, authorized: true, source: 'stashbase-account', account } : current);
                setSignInFormOpen(false);
                dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
                if (account.backfillStarted) void actions.markVisibleFilesPendingForSearch();
                void actions.refreshIndexState();
              }}
            />
          )}
          {state.account.signedIn && !hostedActive && !signInFormOpen && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <AccountAvatar account={state.account} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">Signed in as {accountDisplayLabel(state.account)}</div>
                  {state.account.displayName && state.account.email && <div className="truncate text-xs text-muted-foreground">{state.account.email}</div>}
                  <div className="text-xs text-muted-foreground">Your own API key is currently active.</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={accountBusy}
                onClick={() => {
                  setAccountBusy(true);
                  api.useAccountAllowance()
                    .then((account) => {
                      if (!mountedRef.current) return;
                      setState((current) => current ? { ...current, source: 'stashbase-account', authorized: true, account } : current);
                      setKeyFormOpen(false);
                      dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
                      if (account.backfillStarted) void actions.markVisibleFilesPendingForSearch();
                      void actions.refreshIndexState();
                    })
                    .catch((err: unknown) => actions.toast(errorMessage(err), { level: 'error' }))
                    .finally(() => { if (mountedRef.current) setAccountBusy(false); });
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
                setSelectedProvider(picked);
                setAddKey('');
                setAddError(null);
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
                      setAccountBusy(true);
                      api.useApiKeySource(selectedProvider)
                        .then((next) => {
                          if (!mountedRef.current) return;
                          setState(next);
                          setKeyFormOpen(false);
                          dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
                          void actions.refreshIndexState();
                        })
                        .catch((err: unknown) => actions.toast(errorMessage(err), { level: 'error' }))
                        .finally(() => { if (mountedRef.current) setAccountBusy(false); });
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
                  onChange={(e) => { setAddKey(e.target.value); setAddError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addKeySubmit(); } }}
                />
                <Button
                  onClick={() => { void addKeySubmit(); }}
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
          onSaved={onKeyChanged}
        />
      )}
      {keyRemoveOpen && (
        <RemoveKeyModal
          onCancel={() => setKeyRemoveOpen(false)}
          onConfirm={onKeyRemoveConfirmed}
        />
      )}
    </>
  );
}
