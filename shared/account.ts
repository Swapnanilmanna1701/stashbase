/**
 * The signed-in StashBase account and its hosted allowance.
 *
 * An account is optional throughout the product — the library works
 * anonymously — so every consumer has to be able to render "no account"
 * without treating it as an error. `quotaUnavailable` exists for the third
 * state the two booleans cannot express: signed in, but the hosted service
 * could not be reached to report usage, which is not the same as having no
 * allowance left.
 */

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
  /** Signed in, but the hosted service could not be reached to report
   *  usage. Distinct from having no allowance left. */
  quotaUnavailable?: boolean;
}

/**
 * What the two endpoints that ACTIVATE the account allowance return: the
 * account plus whether activating it kicked off a semantic backfill, which
 * the renderer needs so it can mark visible files pending.
 *
 * Known Gap: only `PUT /api/account/source` reports this. The OAuth
 * completion path computes the same flag server-side but does not put it in
 * any response the renderer reads, so a sign-in through the setup dialog
 * never marks files pending even when the server did start a backfill.
 */
export interface HostedAccountActivation extends HostedAccountState {
  backfillStarted?: boolean;
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
