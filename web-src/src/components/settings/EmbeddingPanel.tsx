/**
 * Settings → AI Index panel. The user can choose the direct OpenAI
 * embedding endpoint or OpenRouter's OpenAI-compatible endpoint. With no
 * key set, indexing and search are disabled (files still save and
 * preview); the `RequireApiKeyModal` auto-pop on folder load lives in
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
    setState((s) => (s ? { ...s, provider: result.provider, model: result.model, hasKey: true } : s));
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
      setState((s) => (s ? { ...s, provider: result.provider, model: result.model, hasKey: true } : s));
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
    setState((s) => (s ? { ...s, hasKey: false } : s));
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
  // Provider and model are bring-your-own-key concerns. While the fork is
  // up they would be answering a question the user has not reached yet, so
  // the panel shows the choice alone until a path is picked.
  const showingAuthChoice = !state.hasKey && !keyFormOpen;

  return (
    <>
      <div>
        <div>
          <div className="mb-1 text-base font-semibold">AI Index</div>
          <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
            Powers meaning-based search and Agent retrieval. The model stays fixed so the local index remains compatible.
          </div>
          {!showingAuthChoice && (
          <div className="mt-0.5 mb-2 inline-flex max-w-full items-center overflow-hidden rounded-md border border-border bg-card" role="radiogroup" aria-label="Embedding provider">
            {PROVIDER_ORDER.map((provider) => {
              const option = PROVIDERS[provider];
              const selectedOption = provider === selectedProvider;
              return (
                <button
                  key={provider}
                  type="button"
                  className={
                    'inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 border-0 border-l border-border '
                    + 'px-2.5 text-sm whitespace-nowrap text-foreground transition-colors duration-fast first:border-l-0 '
                    + 'enabled:hover:bg-muted disabled:cursor-default disabled:opacity-60 '
                    + (selectedOption ? 'bg-accent/10 font-semibold' : 'bg-transparent')
                  }
                  role="radio"
                  aria-checked={selectedOption}
                  disabled={addBusy}
                  onClick={() => {
                    setSelectedProvider(provider);
                    setAddKey('');
                    setAddError(null);
                  }}
                >
                  <span className="font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
          )}
          {!showingAuthChoice && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm leading-normal text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_code]:whitespace-nowrap [&_code]:text-accent">
            {state.hasKey && <span>Current: {PROVIDERS[state.provider].label}</span>}
            <span>Model: <code>{selected.model}</code></span>
            <span>{selected.costHint}</span>
          </div>
          )}
          {hasSelectedProviderKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 text-sm leading-8 text-muted-foreground">Key configured</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setKeyEditOpen(true)}
                >Change key…</Button>
                <Button
                  variant="destructive-outline"
                  size="sm"
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
                <EmbeddingAuthChoice onUseOwnKey={() => setKeyFormOpen(true)} />
              )}
              {!showingAuthChoice && (
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  type="password"
                  className="flex-1 font-mono text-sm"
                  placeholder={selected.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  value={addKey}
                  disabled={addBusy}
                  onChange={(e) => { setAddKey(e.target.value); setAddError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addKeySubmit(); } }}
                />
                <Button
                  size="sm"
                  onClick={() => { void addKeySubmit(); }}
                  disabled={addBusy || !addKey.trim()}
                >{addBusy ? 'Validating…' : 'Add key'}</Button>
              </div>
              )}
              {addError && <div className="mt-1.5 text-sm text-destructive">{addError}</div>}
            </>
          )}
          {!showingAuthChoice && (
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
