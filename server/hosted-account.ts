import packageJson from '../package.json' with { type: 'json' };
import crypto from 'node:crypto';
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

export interface HostedQuota {
  plan: string;
  grantedTokens: number;
  usedTokens: number;
  reservedTokens: number;
  remainingTokens: number;
  periodStartedAt: string | null;
  periodEndsAt: string | null;
}

export interface HostedAccountState {
  signedIn: boolean;
  active: boolean;
  email?: string;
  displayName?: string;
  /** Same-origin renderer endpoint; the provider URL remains Node-only. */
  avatarUrl?: string;
  quota?: HostedQuota;
  quotaUnavailable?: boolean;
}

interface SupabaseUser {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }>;
}

interface SupabaseTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: SupabaseUser;
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

export type HostedOAuthProvider = 'google';

export interface HostedOAuthStart {
  flowId: string;
  provider: HostedOAuthProvider;
  url: string;
}

export interface HostedOAuthStatus {
  state: 'pending' | 'complete' | 'error';
  error?: string;
  appReturned?: boolean;
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
let profileHydration: { sessionKey: string; attemptedAt: number; promise: Promise<void> } | null = null;
const PROFILE_HYDRATION_RETRY_MS = 5 * 60 * 1000;
const PROFILE_TIMEOUT_MS = 3_000;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TIMEOUT_MS = 5_000;
const AVATAR_MAX_REDIRECTS = 2;
const AVATAR_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
let avatarCache: { key: string; contentType: string; bytes: Uint8Array } | null = null;

function messageOf(value: ErrorPayload | null, fallback: string): string {
  return value?.message ?? value?.error_description ?? value?.msg ?? value?.error ?? fallback;
}

async function jsonBody<T>(response: Response): Promise<T | null> {
  try { return await response.json() as T; } catch { return null; }
}

export function normalizedGoogleProfile(user: SupabaseUser | undefined): Pick<HostedAccountSession, 'displayName' | 'avatarUrl'> {
  const metadata = user?.user_metadata;
  const identity = user?.identities?.find((candidate) => candidate.provider === 'google')?.identity_data;
  const normalizeName = (value: unknown): string | undefined => {
    const normalized = typeof value === 'string'
      ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().replace(/\s+/gu, ' ')
      : '';
    return normalized ? Array.from(normalized).slice(0, 200).join('') : undefined;
  };
  const normalizeAvatar = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' && parsed.hostname === 'lh3.googleusercontent.com'
        && !parsed.username && !parsed.password) return parsed.toString();
    } catch { /* try the next provider candidate */ }
    return undefined;
  };
  const displayName = [metadata?.full_name, metadata?.name, identity?.full_name, identity?.name]
    .map(normalizeName).find((value) => value !== undefined);
  const avatarUrl = [metadata?.avatar_url, metadata?.picture, identity?.avatar_url, identity?.picture]
    .map(normalizeAvatar).find((value) => value !== undefined);
  return {
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
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
  const profile = normalizedGoogleProfile(value.user);
  return {
    accessToken, refreshToken, userId, email, expiresAt,
    ...(profile.displayName ? { displayName: profile.displayName } : fallback?.displayName ? { displayName: fallback.displayName } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : fallback?.avatarUrl ? { avatarUrl: fallback.avatarUrl } : {}),
  };
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

async function supabaseUser(accessToken: string): Promise<SupabaseUser> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const payload = await jsonBody<SupabaseUser & ErrorPayload>(response);
    if (!response.ok) throw new Error(messageOf(payload, `Supabase profile lookup failed (HTTP ${response.status}).`));
    return payload ?? {};
  } finally {
    clearTimeout(timeout);
  }
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
  avatarCache = null;
  profileHydration = null;
  if (!session) return;
  try { await supabaseAuth('/logout?scope=local', {}, session.accessToken); } catch { /* local sign-out still succeeds */ }
}

async function hydrateHostedProfile(session: HostedAccountSession): Promise<void> {
  if (session.displayName && session.avatarUrl) return;
  const sessionKey = `${session.userId}\0${session.accessToken}`;
  const now = Date.now();
  if (profileHydration?.sessionKey === sessionKey) {
    if (now - profileHydration.attemptedAt < PROFILE_HYDRATION_RETRY_MS) return profileHydration.promise;
  }
  const promise = (async () => {
    const user = await supabaseUser(session.accessToken);
    const profile = normalizedGoogleProfile(user);
    if (!profile.displayName && !profile.avatarUrl) return;
    const current = getHostedAccountSession();
    if (!current || current.userId !== session.userId || current.accessToken !== session.accessToken) return;
    setHostedAccountSession({
      ...current,
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    });
  })();
  profileHydration = { sessionKey, attemptedAt: now, promise };
  return promise;
}

function assertAvatarUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'lh3.googleusercontent.com'
    || url.username || url.password) throw new Error('Account avatar URL is not allowed.');
  return url;
}

/** Fetch the signed-in account's provider avatar without exposing a general
 * URL proxy. Redirects stay on the exact allowlisted HTTPS host; bodies are
 * type-, time-, and size-bounded before entering the renderer boundary. */
export async function hostedAccountAvatar(): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const session = getHostedAccountSession();
  if (!session?.avatarUrl) return null;
  const key = `${session.userId}\0${session.avatarUrl}`;
  if (avatarCache?.key === key) return { contentType: avatarCache.contentType, bytes: avatarCache.bytes };
  let url = assertAvatarUrl(session.avatarUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS);
  try {
    let response: Response | null = null;
    for (let redirects = 0; redirects <= AVATAR_MAX_REDIRECTS; redirects++) {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'image/avif,image/webp,image/png,image/jpeg' },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirects === AVATAR_MAX_REDIRECTS) throw new Error('Account avatar redirected too many times.');
      const location = response.headers.get('location');
      if (!location) throw new Error('Account avatar redirect was incomplete.');
      url = assertAvatarUrl(new URL(location, url).toString());
    }
    if (!response?.ok) throw new Error(`Account avatar failed (HTTP ${response?.status ?? 0}).`);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (!AVATAR_CONTENT_TYPES.has(contentType)) throw new Error('Account avatar returned an unsupported content type.');
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > AVATAR_MAX_BYTES) throw new Error('Account avatar is too large.');
    if (!response.body) throw new Error('Account avatar returned no content.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > AVATAR_MAX_BYTES) {
        await reader.cancel();
        throw new Error('Account avatar is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    avatarCache = { key, contentType, bytes };
    return { contentType, bytes };
  } finally {
    clearTimeout(timeout);
  }
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
  let session = getHostedAccountSession();
  if (!session) return { signedIn: false, active: false };
  try {
    await hydrateHostedProfile(session);
    session = getHostedAccountSession() ?? session;
  } catch { /* profile display data never gates account or local workflows */ }
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
    ...(session.displayName ? { displayName: session.displayName } : {}),
    ...(session.avatarUrl ? { avatarUrl: '/api/account/avatar' } : {}),
    ...(quota ? { quota } : {}),
    ...(quotaUnavailable ? { quotaUnavailable: true } : {}),
  };
}

export function stashbaseClientVersion(): string {
  return CLIENT_VERSION;
}
