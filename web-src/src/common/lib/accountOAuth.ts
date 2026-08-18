import { api, type HostedAccountState, type HostedOAuthProvider } from '@/common/api/api';
import { notifyAccountChanged } from '@/common/lib/accountEvents';
import { openExternalUrl } from '@/common/lib/externalLink';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const OAUTH_POLL_MS = 750;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Sign-in cancelled.', 'AbortError'));
    }, { once: true });
  });
}

/**
 * Start a Node-owned Supabase PKCE flow, open the system browser, then poll
 * only the safe local flow status. Supabase tokens never enter the renderer.
 */
async function runSignIn(
  provider: HostedOAuthProvider = 'google',
  options: { signal?: AbortSignal; onBrowserOpened?: () => void } = {},
): Promise<HostedAccountState> {
  const started = await api.startAccountOAuth(provider);
  openExternalUrl(started.url);
  options.onBrowserOpened?.();

  const deadline = Date.now() + OAUTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(OAUTH_POLL_MS, options.signal);
    const status = await api.getAccountOAuthStatus(started.flowId);
    if (status.state === 'error') throw new Error(status.error ?? 'Sign-in failed.');
    if (status.state !== 'complete') continue;
    const account = await api.getAccount(true);
    if (!account.signedIn) throw new Error('Sign-in completed, but the local session is unavailable.');
    // The authenticated callback deep link owns native focus and sends the
    // acknowledgement that lets its browser tab close. Renderer polling only
    // updates account state; focusing here races that handoff.
    notifyAccountChanged();
    return account;
  }
  throw new Error('Sign-in timed out. Start again from StashBase.');
}

let activeSignIn: Promise<HostedAccountState> | null = null;

export function signInWithStashBase(
  provider: HostedOAuthProvider = 'google',
  options: { signal?: AbortSignal; onBrowserOpened?: () => void } = {},
): Promise<HostedAccountState> {
  if (activeSignIn) return activeSignIn;
  activeSignIn = runSignIn(provider, options).finally(() => { activeSignIn = null; });
  return activeSignIn;
}
