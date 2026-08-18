import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type HostedAccountState } from '@/common/api/api';
import { ACCOUNT_CHANGED_EVENT, notifyAccountChanged } from '@/common/lib/accountEvents';
import { signInWithStashBase } from '@/common/lib/accountOAuth';

export interface HostedAccount {
  /** Null until the first read lands — Anonymous is a signed-in:false state,
   *  not a missing one, so the row must not claim either while unknown. */
  account: HostedAccountState | null;
  signingIn: boolean;
  signInError: string | null;
  refresh: (refreshUsage?: boolean) => void;
  signIn: () => void;
  signOut: () => void;
}

/**
 * The sidebar row's view of the hosted account: who is signed in and how
 * much allowance is left.
 *
 * Sign-in and sign-out also happen in Settings, so the row re-reads on the
 * shared account event instead of owning the answer. Every read fails
 * silently: this row is chrome that renders on every launch, it races the
 * local server's boot, and Settings is the surface that reports why an
 * account call did not work.
 *
 * Usage is fetched on request rather than with every read — it costs a
 * hosted round trip, and the row shows it only once the menu is open.
 */
export function useHostedAccount(): HostedAccount {
  const [account, setAccount] = useState<HostedAccountState | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const refresh = useCallback((refreshUsage = false) => {
    api.getAccount(refreshUsage).then(setAccount).catch(() => { /* local server startup race */ });
  }, []);

  useEffect(() => {
    refresh(false);
    const onChanged = () => refresh(false);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const signOut = useCallback(() => {
    void api.signOutAccount()
      .then(() => {
        notifyAccountChanged();
        refresh(false);
      })
      .catch(() => { /* Settings remains the recovery surface */ });
  }, [refresh]);

  const signIn = useCallback(() => {
    setSigningIn(true);
    setSignInError(null);
    void signInWithStashBase('google')
      .then(setAccount)
      .catch((error: unknown) => setSignInError(errorMessage(error)))
      .finally(() => setSigningIn(false));
  }, []);

  return { account, signingIn, signInError, refresh, signIn, signOut };
}
