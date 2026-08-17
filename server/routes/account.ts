import express from 'express';
import {
  getHostedAccountSession,
  setEmbeddingSource,
} from '../app-config.ts';
import {
  beginHostedOAuth,
  createFailedHostedOAuthFlow,
  exchangeHostedOAuthCode,
  failHostedOAuth,
  finishHostedOAuth,
  hostedAccountState,
  hostedAccountAvatar,
  hostedOAuthStatus,
  noteHostedOAuthAppReturn,
  noteHostedOAuthReturnIntent,
  signOutHostedAccount,
  type HostedOAuthProvider,
} from '../hosted-account.ts';
import { startHostedEmbeddingBroker } from '../hosted-embedding-broker.ts';
import { errorMessage, logger } from '../log.ts';
import { oauthResultPage } from '../oauth-result-page.ts';
import { bootBindAllFolders, reconcileLibraryFolders, resetIndexerRuntime } from '../state.ts';
import { isEmbeddingAvailable } from '../embedding-availability.ts';
import { processPrivateTokenMatches } from '../process-private-token.ts';
import { currentWindowId } from '../folder.ts';

const log = logger('routes/account');
const OAUTH_PROVIDERS = new Set<HostedOAuthProvider>(['google']);
const OAUTH_RETURN_TOKEN_HEADER = 'x-stashbase-oauth-return-token';

interface AccountRouteOptions {
  appReturnToken: string;
}

function oauthProvider(value: unknown): HostedOAuthProvider | null {
  return typeof value === 'string' && OAUTH_PROVIDERS.has(value as HostedOAuthProvider)
    ? value as HostedOAuthProvider
    : null;
}

function callbackOrigin(req: express.Request): string {
  return new URL(`http://${req.get('host') ?? ''}`).origin;
}

async function activateHostedSource(reason: string): Promise<boolean> {
  // Learn a zero allowance before any daemon bind/reconcile can spend work.
  await hostedAccountState(true);
  await startHostedEmbeddingBroker();
  setEmbeddingSource('stashbase-account');
  try {
    await resetIndexerRuntime({ forgetBindings: true });
    await bootBindAllFolders();
    void reconcileLibraryFolders(reason).catch((error: unknown) => {
      log.warn(`${reason}: semantic backfill failed: ${errorMessage(error)}`);
    });
  } catch (error: unknown) {
    log.warn(`${reason}: runtime reset/rebind failed: ${errorMessage(error)}`);
  }
  return isEmbeddingAvailable();
}

export function mount(app: express.Express, { appReturnToken }: AccountRouteOptions): void {
  app.get('/api/account', async (req, res) => {
    const refresh = req.query.refresh === '1';
    res.json(await hostedAccountState(refresh));
  });

  app.get('/api/account/avatar', async (_req, res) => {
    try {
      const avatar = await hostedAccountAvatar();
      if (!avatar) return res.status(404).end();
      res.setHeader('content-type', avatar.contentType);
      res.setHeader('cache-control', 'private, no-store');
      res.setHeader('x-content-type-options', 'nosniff');
      res.end(Buffer.from(avatar.bytes));
    } catch {
      // Avatar display is optional. Fail closed to the renderer fallback
      // without exposing provider URLs or upstream diagnostics.
      res.status(404).end();
    }
  });

  app.post('/api/account/oauth/start', (req, res) => {
    try {
      const provider = oauthProvider(req.body?.provider ?? 'google');
      if (!provider) return res.status(400).json({ error: 'Unsupported sign-in provider.' });
      res.json(beginHostedOAuth(provider, callbackOrigin(req), currentWindowId()));
    } catch (error: unknown) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/account/oauth/callback', async (req, res) => {
    const flowId = typeof req.query.flow === 'string' ? req.query.flow : '';
    const authCode = typeof req.query.code === 'string' ? req.query.code : '';
    const providerError = typeof req.query.error_description === 'string'
      ? req.query.error_description
      : typeof req.query.error === 'string' ? req.query.error : '';
    if (!flowId) {
      const message = 'The sign-in request is missing or expired. Return to StashBase and try again.';
      const failedFlowId = createFailedHostedOAuthFlow(message);
      return res.status(400).type('html').send(oauthResultPage({
        title: 'Sign-in failed',
        message,
        kind: 'error',
        returnStatusUrl: `/api/account/oauth/status?flow=${encodeURIComponent(failedFlowId)}`,
        returnIntentUrl: `/api/account/oauth/return-intent?flow=${encodeURIComponent(failedFlowId)}`,
      }));
    }
    if (providerError) {
      failHostedOAuth(flowId, providerError);
      return res.status(400).type('html').send(oauthResultPage({
        title: 'Sign-in failed', message: providerError, kind: 'error',
        returnStatusUrl: `/api/account/oauth/status?flow=${encodeURIComponent(flowId)}`,
        returnIntentUrl: `/api/account/oauth/return-intent?flow=${encodeURIComponent(flowId)}`,
      }));
    }
    try {
      await exchangeHostedOAuthCode(flowId, authCode);
      const backfillStarted = await activateHostedSource('StashBase account activated');
      finishHostedOAuth(flowId);
      log.info(`OAuth sign-in completed${backfillStarted ? '; semantic backfill started' : ''}`);
      res.type('html').send(oauthResultPage({
        title: 'Signed in to StashBase',
        message: 'Your account is ready. This page will return you to the app automatically.',
        autoReturn: true,
        returnStatusUrl: `/api/account/oauth/status?flow=${encodeURIComponent(flowId)}`,
        returnIntentUrl: `/api/account/oauth/return-intent?flow=${encodeURIComponent(flowId)}`,
      }));
    } catch (error: unknown) {
      const message = errorMessage(error);
      failHostedOAuth(flowId, message);
      res.status(400).type('html').send(oauthResultPage({
        title: 'Sign-in failed', message, kind: 'error',
        returnStatusUrl: `/api/account/oauth/status?flow=${encodeURIComponent(flowId)}`,
        returnIntentUrl: `/api/account/oauth/return-intent?flow=${encodeURIComponent(flowId)}`,
      }));
    }
  });

  app.get('/api/account/oauth/status', (req, res) => {
    const flowId = typeof req.query.flow === 'string' ? req.query.flow : '';
    if (!flowId) return res.status(400).json({ error: 'Missing sign-in flow.' });
    res.json(hostedOAuthStatus(flowId));
  });

  app.post('/api/account/oauth/return-intent', (req, res) => {
    const flowId = typeof req.query.flow === 'string' ? req.query.flow : '';
    if (!flowId || !noteHostedOAuthReturnIntent(flowId)) {
      return res.status(404).json({ error: 'Sign-in flow is unavailable.' });
    }
    res.json({ accepted: true });
  });

  app.post('/api/account/oauth/app-return', (req, res) => {
    if (!processPrivateTokenMatches(req.header(OAUTH_RETURN_TOKEN_HEADER), appReturnToken)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.json(noteHostedOAuthAppReturn());
  });

  app.put('/api/account/source', async (_req, res) => {
    try {
      if (!getHostedAccountSession()) return res.status(401).json({ error: 'Sign in first.' });
      const backfillStarted = await activateHostedSource('StashBase account source selected');
      res.json({ ...(await hostedAccountState(true)), backfillStarted });
    } catch (error: unknown) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/account', async (_req, res) => {
    const wasActive = (await hostedAccountState(false)).active;
    await signOutHostedAccount();
    if (wasActive) {
      try {
        await resetIndexerRuntime({ forgetBindings: true });
        await bootBindAllFolders();
      } catch (error: unknown) {
        log.warn(`sign out: runtime reset failed: ${errorMessage(error)}`);
      }
    }
    res.json({ signedIn: false, active: false });
  });
}
