/**
 * Embedder routes: manage the global embedding provider key and validate
 * a key without persisting it.
 *
 * The current provider set is intentionally narrow: OpenAI directly, or
 * OpenRouter as an OpenAI-compatible endpoint for the same 1536d OpenAI
 * embedding model. Arbitrary model switching stays out of scope so the
 * single local collection remains valid.
 */
import express from 'express';
import { logger, errorMessage } from '../log.ts';
import { getCurrentFolder } from '../folder.ts';
import {
  getEmbeddingSource,
  getEmbedderConfig,
  isEmbeddingConfigured,
  isEmbedderProvider,
  setApiKey,
  setEmbeddingSource,
} from '../app-config.ts';
import type { EmbedderProvider } from '../app-config.ts';
import {
  isEmbeddingAvailable,
  shouldReconcileAfterEmbeddingSourceChange,
} from '../embedding-availability.ts';
import { bootBindAllFolders, reconcileLibraryFolders, resetIndexerRuntime } from '../state.ts';
import { sendError, validateEmbedderKey } from '../http.ts';
import { hostedAccountState } from '../hosted-account.ts';
import type { ApiKeySaveResult, EmbedderState } from '../../shared/embedding.ts';

const log = logger('routes/embedder');

function parseProvider(raw: unknown, fallback: EmbedderProvider): EmbedderProvider | null {
  if (raw == null || raw === '') return fallback;
  return isEmbedderProvider(raw) ? raw : null;
}

function providerLabel(provider: EmbedderProvider): string {
  return provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
}

export function mount(app: express.Express): void {
  // Embedder status: active provider + whether a key is configured.
  app.get('/api/embedder', async (_req, res) => {
    const cfg = getEmbedderConfig();
    const source = getEmbeddingSource();
    const account = await hostedAccountState(source === 'stashbase-account');
    const state: EmbedderState = {
      provider: cfg.provider,
      hasKey: !!cfg.apiKey,
      authorized: isEmbeddingConfigured(),
      source,
      model: cfg.model,
      account,
    };
    res.json(state);
  });

  // Set / rotate the active embedding key. A definite provider rejection
  // blocks the save so a typo can't blow away a working key. A network
  // / transient validation failure still saves the key: offline/proxied
  // machines need to configure first and let indexing report connectivity.
  app.put('/api/embedder/key', async (req, res) => {
    const current = getEmbedderConfig();
    const provider = parseProvider(req.body?.provider, current.provider);
    if (!provider) return res.status(400).json({ error: 'unknown embedder provider' });
    const rawKey = typeof req.body?.key === 'string'
      ? req.body.key
      : typeof req.body?.openaiKey === 'string'
        ? req.body.openaiKey
        : '';
    const key = rawKey.trim();
    if (!key) return res.status(400).json({ error: 'key required' });
    const check = await validateEmbedderKey(provider, key);
    const warning = check.ok ? undefined : check.error;
    if (!check.ok && check.status < 500) return res.status(check.status).json({ error: check.error });
    const previousSource = getEmbeddingSource();
    const shouldBackfill = shouldReconcileAfterEmbeddingSourceChange(
      previousSource,
      provider,
      isEmbeddingAvailable(),
    );
    try {
      setApiKey(key, provider);
    } catch (err: unknown) {
      sendError(res, err);
      return;
    }
    try {
      await resetIndexerRuntime({ forgetBindings: true });
      await bootBindAllFolders();
      if (shouldBackfill) {
        const cur = getCurrentFolder();
        log.info(`${providerLabel(provider)} key set: starting semantic backfill${cur ? ` (active folder: ${cur})` : ''}`);
        void reconcileLibraryFolders(`${providerLabel(provider)} embedder key set`)
          .catch((err: unknown) => {
            log.warn(`key set: semantic backfill failed: ${errorMessage(err)}`);
          });
      } else {
        log.info(`${providerLabel(provider)} key updated; existing embedding index remains valid`);
      }
    } catch (err: unknown) {
      log.warn(`key set: runtime reset/rebind failed: ${errorMessage(err)}`);
    }
    const saved = getEmbedderConfig();
    const result: ApiKeySaveResult = {
      hasKey: true,
      authorized: true,
      source: saved.provider,
      provider: saved.provider,
      model: saved.model,
      backfillStarted: shouldBackfill,
      ...(warning ? { warning } : {}),
    };
    res.json(result);
  });

  app.put('/api/embedder/source', async (req, res) => {
    const cfg = getEmbedderConfig();
    const provider = parseProvider(req.body?.provider, cfg.provider);
    if (!provider) return res.status(400).json({ error: 'unknown embedder provider' });
    if (!cfg.apiKey || cfg.provider !== provider) {
      return res.status(400).json({ error: `Add a ${providerLabel(provider)} key before selecting it.` });
    }
    try {
      setEmbeddingSource(provider);
      await resetIndexerRuntime({ forgetBindings: true });
      await bootBindAllFolders();
      void reconcileLibraryFolders(`${providerLabel(provider)} source selected`)
        .catch((err: unknown) => {
          log.warn(`source selected: semantic reconcile failed: ${errorMessage(err)}`);
        });
      res.json({
        provider,
        hasKey: true,
        authorized: true,
        source: provider,
        model: getEmbedderConfig().model,
        account: await hostedAccountState(false),
      });
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  // Wipe the active embedding key. New embed / search calls will no-op
  // until a key is added back; existing vectors stay valid.
  app.delete('/api/embedder/key', async (_req, res) => {
    try {
      setApiKey(undefined);
    } catch (err: unknown) {
      sendError(res, err);
      return;
    }
    try {
      await resetIndexerRuntime({ forgetBindings: true });
      await bootBindAllFolders();
    } catch (err: unknown) {
      log.warn(`key delete: runtime reset failed: ${errorMessage(err)}`);
    }
    const cfg = getEmbedderConfig();
    res.json({
      hasKey: false,
      authorized: isEmbeddingConfigured(),
      source: getEmbeddingSource(),
      provider: cfg.provider,
      model: cfg.model,
      account: await hostedAccountState(false),
    });
  });
}
