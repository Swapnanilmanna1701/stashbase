import packageJson from '../package.json' with { type: 'json' };
import crypto from 'node:crypto';
import type { HostedAccountState, HostedOAuthProvider, HostedOAuthStart, HostedOAuthStatus, HostedQuota } from '../shared/account.ts';

export type {
  HostedAccountActivation,
  HostedAccountState,
  HostedOAuthProvider,
  HostedOAuthStart,
  HostedOAuthStatus,
  HostedQuota,
} from '../shared/account.ts';
import {
  getEmbeddingSource,
  getHostedAccountSession,
  setHostedAccountSession,
  type HostedAccountSession,
} from './app-config.ts';

export const STASHBASE_API_URL = 'https://api.stashbase.ai';
const SUPABASE_URL = 'https://vqtfigkoihpuziaimluf.supabase.co';
// Supabase publishable keys are intentionally safe to ship in clients. The
// project secret key remains server-only and must never enter this repository.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_D-S7Ry-IWC9pTdDx6DHHHw_-mmaTp3b';
const CLIENT_VERSION = packageJson.version;

interface SupabaseTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string };
  error?: string;
  error_description?: string;
  msg?: string;
}

interface ErrorPayload {
  code?: string;
  message?: string;
  error?: string;
  error_description?: string;
  msg?: string;
}

interface PendingOAuthFlow {
  provider: HostedOAuthProvider;
  verifier: string;
  windowId?: string;
  createdAt: number;
  state: 'pending' | 'exchanged' | 'complete' | 'error';
  error?: string;
  returnRequestedAt?: number;
  appReturnedAt?: number;
}

const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const pendingOAuthFlows = new Map<string, PendingOAuthFlow>();
const QUOTA_REFRESH_RETRY_MS = 5 * 60 * 1000;
let lastQuota: HostedQuota | undefined;
let quotaRefreshTimer: NodeJS.Timeout | null = null;
let onQuotaAvailable: (() => void | Promise<void>) | null = null;
let quotaAvailabilityRecovery: Promise<void> = Promise.resolve();
let tokenRefresh: { sessionKey: string; promise: Promise<string> } | null = null;

function messageOf(value: ErrorPayload | null, fallback: string): string {
  return value?.message ?? value?.error_description ?? value?.msg ?? value?.error ?? fallback;
}

async function jsonBody<T>(response: Response): Promise<T | null> {
  try { return await response.json() as T; } catch { return null; }
}

function sessionFrom(value: SupabaseTokenResponse, fallback?: HostedAccountSession): HostedAccountSession {
  const accessToken = value.access_token;
  const refreshToken = value.refresh_token ?? fallback?.refreshToken;
  const userId = value.user?.id ?? fallback?.userId;
  const email = value.user?.email ?? fallback?.email;
  const expiresAt = value.expires_at ?? (value.expires_in ? Math.floor(Date.now() / 1000) + value.expires_in : fallback?.expiresAt);
  if (!accessToken || !refreshToken || !userId || !email || !expiresAt) {
    throw new Error('Supabase returned an incomplete login session.');
  }
  return { accessToken, refreshToken, userId, email, expiresAt };
}

async function supabaseAuth(path: string, body: Record<string, unknown>, accessToken?: string): Promise<SupabaseTokenResponse> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await jsonBody<SupabaseTokenResponse>(response);
  if (!response.ok) throw new Error(messageOf(payload ?? null, `Supabase authentication failed (HTTP ${response.status}).`));
  return payload ?? {};
}

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

function pruneOAuthFlows(now = Date.now()): void {
  for (const [flowId, flow] of pendingOAuthFlows) {
    if (now - flow.createdAt > OAUTH_FLOW_TTL_MS) pendingOAuthFlows.delete(flowId);
  }
}

function assertLoopbackCallbackOrigin(callbackOrigin: string): URL {
  const parsed = new URL(callbackOrigin);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error('OAuth callback must use the local StashBase server.');
  }
  return parsed;
}

export function beginHostedOAuth(
  provider: HostedOAuthProvider,
  callbackOrigin: string,
  windowId?: string,
): HostedOAuthStart {
  pruneOAuthFlows();
  const origin = assertLoopbackCallbackOrigin(callbackOrigin);
  const flowId = base64Url(crypto.randomBytes(24));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const callback = new URL('/api/account/oauth/callback', origin);
  callback.searchParams.set('flow', flowId);

  pendingOAuthFlows.set(flowId, {
    provider,
    verifier,
    ...(windowId?.trim() ? { windowId: windowId.trim().slice(0, 128) } : {}),
    createdAt: Date.now(),
    state: 'pending',
  });

  const authorize = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorize.searchParams.set('provider', provider);
  authorize.searchParams.set('redirect_to', callback.toString());
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 's256');
  return { flowId, provider, url: authorize.toString() };
}

export async function exchangeHostedOAuthCode(flowId: string, authCode: string): Promise<HostedAccountSession> {
  pruneOAuthFlows();
  const flow = pendingOAuthFlows.get(flowId);
  if (!flow || flow.state !== 'pending') throw new Error('This sign-in request expired. Start again from StashBase.');
  if (!authCode.trim()) throw new Error('Supabase did not return an authorization code.');
  try {
    const payload = await supabaseAuth('/token?grant_type=pkce', {
      auth_code: authCode,
      code_verifier: flow.verifier,
    });
    const session = sessionFrom(payload);
    clearHostedQuota();
    setHostedAccountSession(session);
    flow.state = 'exchanged';
    return session;
  } catch (error: unknown) {
    failHostedOAuth(flowId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function finishHostedOAuth(flowId: string): void {
  const flow = pendingOAuthFlows.get(flowId);
  if (flow?.state === 'exchanged') flow.state = 'complete';
}

/** Give a callback that arrived without a usable OAuth flow its own bounded
 * status ticket. The fixed deep link still carries no data, while the browser
 * can prove a successful app return before closing. */
export function createFailedHostedOAuthFlow(message: string): string {
  pruneOAuthFlows();
  const flowId = base64Url(crypto.randomBytes(24));
  pendingOAuthFlows.set(flowId, {
    provider: 'google',
    verifier: base64Url(crypto.randomBytes(48)),
    createdAt: Date.now(),
    state: 'error',
    error: message,
  });
  return flowId;
}

export function noteHostedOAuthReturnIntent(flowId: string, now = Date.now()): boolean {
  pruneOAuthFlows(now);
  const flow = pendingOAuthFlows.get(flowId);
  if (!flow || (flow.state !== 'complete' && flow.state !== 'error')) return false;
  flow.returnRequestedAt = now;
  return true;
}

/** Electron calls this only after accepting the exact data-free deep link.
 * Callback pages poll their own flow state and close only after this proof,
 * never merely because the browser lost focus. */
export function noteHostedOAuthAppReturn(now = Date.now()): {
  acknowledged: boolean;
  windowId?: string;
} {
  pruneOAuthFlows(now);
  const candidates = [...pendingOAuthFlows.values()]
    .filter((flow) => (
      (flow.state === 'complete' || flow.state === 'error')
      && !flow.appReturnedAt
    ))
    .sort((left, right) => (
      (right.returnRequestedAt ?? right.createdAt) - (left.returnRequestedAt ?? left.createdAt)
    ));
  const flow = candidates.find((candidate) => candidate.returnRequestedAt) ?? candidates[0];
  if (!flow) return { acknowledged: false };
  flow.appReturnedAt = now;
  return {
    acknowledged: true,
    ...(flow.windowId ? { windowId: flow.windowId } : {}),
  };
}

export function failHostedOAuth(flowId: string, message: string): void {
  const flow = pendingOAuthFlows.get(flowId);
  if (!flow) return;
  flow.state = 'error';
  flow.error = message;
}

export function hostedOAuthStatus(flowId: string): HostedOAuthStatus {
  pruneOAuthFlows();
  const flow = pendingOAuthFlows.get(flowId);
  if (!flow) return { state: 'error', error: 'This sign-in request expired. Start again.' };
  if (flow.state === 'complete') return {
    state: 'complete',
    ...(flow.appReturnedAt ? { appReturned: true } : {}),
  };
  if (flow.state === 'error') return {
    state: 'error',
    error: flow.error ?? 'Sign-in failed.',
    ...(flow.appReturnedAt ? { appReturned: true } : {}),
  };
  return { state: 'pending' };
}

export async function hostedAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
  const session = getHostedAccountSession();
  if (!session) throw new Error('Sign in to StashBase to use the hosted allowance.');
  if (!options.forceRefresh && session.expiresAt > Math.floor(Date.now() / 1000) + 60) return session.accessToken;
  const sessionKey = `${session.userId}\0${session.refreshToken}\0${session.accessToken}`;
  if (tokenRefresh?.sessionKey === sessionKey) return tokenRefresh.promise;

  const promise = (async () => {
    try {
      const payload = await supabaseAuth('/token?grant_type=refresh_token', { refresh_token: session.refreshToken });
      const current = getHostedAccountSession();
      if (!current || `${current.userId}\0${current.refreshToken}\0${current.accessToken}` !== sessionKey) {
        if (current) return current.accessToken;
        throw new Error('The hosted account changed while its token was refreshing.');
      }
      const refreshed = sessionFrom(payload, session);
      setHostedAccountSession(refreshed);
      return refreshed.accessToken;
    } catch (error) {
      const current = getHostedAccountSession();
      if (current && `${current.userId}\0${current.refreshToken}\0${current.accessToken}` === sessionKey) {
        setHostedAccountSession(undefined);
        clearHostedQuota();
      }
      throw error;
    }
  })();
  tokenRefresh = { sessionKey, promise };
  try {
    return await promise;
  } finally {
    if (tokenRefresh?.promise === promise) tokenRefresh = null;
  }
}

export async function signOutHostedAccount(): Promise<void> {
  const session = getHostedAccountSession();
  clearHostedQuota();
  setHostedAccountSession(undefined);
  if (!session) return;
  try { await supabaseAuth('/logout?scope=local', {}, session.accessToken); } catch { /* local sign-out still succeeds */ }
}

export async function fetchHostedQuota(options: { forceRefreshToken?: boolean } = {}): Promise<HostedQuota> {
  const token = await hostedAccessToken({ forceRefresh: options.forceRefreshToken });
  const response = await fetch(`${STASHBASE_API_URL}/v1/account/usage`, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-stashbase-client-version': CLIENT_VERSION,
    },
  });
  const payload = await jsonBody<HostedQuota & ErrorPayload>(response);
  if (response.status === 401 && !options.forceRefreshToken) return fetchHostedQuota({ forceRefreshToken: true });
  if (!response.ok) throw new Error(messageOf(payload, `StashBase account service failed (HTTP ${response.status}).`));
  const quota = payload as HostedQuota;
  rememberHostedQuota(quota);
  await quotaAvailabilityRecovery;
  return quota;
}

function scheduleQuotaRefresh(quota: HostedQuota): void {
  if (quotaRefreshTimer) clearTimeout(quotaRefreshTimer);
  quotaRefreshTimer = null;
  if (quota.remainingTokens > 0) return;
  const resetAt = quota.periodEndsAt ? Date.parse(quota.periodEndsAt) : Number.NaN;
  const untilReset = Number.isFinite(resetAt) ? resetAt - Date.now() + 1_000 : Number.NaN;
  const delay = Number.isFinite(untilReset)
    ? Math.max(untilReset, untilReset <= 0 ? QUOTA_REFRESH_RETRY_MS : 1_000)
    : QUOTA_REFRESH_RETRY_MS;
  quotaRefreshTimer = setTimeout(() => {
    quotaRefreshTimer = null;
    void fetchHostedQuota().catch(() => {
      if (lastQuota) scheduleQuotaRefresh(lastQuota);
    });
  }, Math.min(delay, 2_147_000_000));
  quotaRefreshTimer.unref?.();
}

function clearHostedQuota(): void {
  lastQuota = undefined;
  if (quotaRefreshTimer) clearTimeout(quotaRefreshTimer);
  quotaRefreshTimer = null;
}

export function rememberHostedQuota(quota: HostedQuota): void {
  const wasExhausted = isHostedQuotaExhausted();
  lastQuota = quota;
  scheduleQuotaRefresh(quota);
  if (wasExhausted && !isHostedQuotaExhausted()) {
    quotaAvailabilityRecovery = Promise.resolve(onQuotaAvailable?.())
      .catch(() => { /* owner logs recovery failures */ });
  }
}

export function cachedHostedQuota(): HostedQuota | undefined {
  return lastQuota;
}

export function isHostedQuotaExhausted(): boolean {
  return (lastQuota?.remainingTokens ?? 1) <= 0;
}

export function setHostedQuotaAvailableHandler(handler: (() => void | Promise<void>) | null): void {
  onQuotaAvailable = handler;
}

export async function hostedAccountState(refreshQuota = false): Promise<HostedAccountState> {
  const session = getHostedAccountSession();
  if (!session) return { signedIn: false, active: false };
  let quota = lastQuota;
  let quotaUnavailable = false;
  if (refreshQuota || !quota) {
    try {
      quota = await fetchHostedQuota();
    } catch {
      if (!getHostedAccountSession()) return { signedIn: false, active: false };
      quotaUnavailable = true;
    }
  }
  return {
    signedIn: true,
    active: getEmbeddingSource() === 'stashbase-account',
    email: session.email,
    ...(quota ? { quota } : {}),
    ...(quotaUnavailable ? { quotaUnavailable: true } : {}),
  };
}

export function stashbaseClientVersion(): string {
  return CLIENT_VERSION;
}
