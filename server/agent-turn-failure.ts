/**
 * Turn-scoped runtime failure classification, shared by both adapters.
 *
 * A live turn error reaches the renderer as provider prose. The renderer must
 * never infer a recovery from that prose, so the adapter — the one place that
 * legitimately reads provider messages — classifies it into a small closed
 * set of failure kinds and attaches the kind to the protocol `error` event.
 * The renderer switches on the kind alone: transient kinds invite resending,
 * `quota` explains the provider-side reset, and `auth-expired` routes to each
 * runtime's real sign-in path.
 *
 * The development turn-failure scripts are provider-shaped and flow through
 * this same classifier, so injecting one in Settings exercises exactly the
 * presentation a live failure would get. A message that matches nothing stays
 * unclassified and renders as a plain error.
 */

import type { AgentTurnFailure, AgentTurnFailureKind } from '../shared/agent-protocol.ts';

export type { AgentTurnFailure, AgentTurnFailureKind } from '../shared/agent-protocol.ts';

/** Ordered: authentication first (its messages are unambiguous), then plan
 * exhaustion before transient rate limiting (quota messages often carry a
 * 429 as well), then explicit connectivity signals. Patterns prefer precise
 * provider vocabulary over broad words so an unmatched message stays a plain
 * error instead of wearing the wrong recovery. */
const AUTH_PATTERN =
  /authentication_error|invalid api key|api key.{0,20}invalid|please run \/login|not logged in|logged out|login required|unauthorized|\b401\b|token.{0,30}(expired|revoked|invalid)|oauth.{0,20}(expired|error|revoked)|sign in again|re-?authenticate/i;
const QUOTA_PATTERN =
  /usage limit|quota|credit balance|out of credits|usage cap|spending (limit|cap)|plan limit|(weekly|monthly|5-hour) limit|insufficient_quota/i;
const RATE_LIMIT_PATTERN =
  /rate.?limit|too many requests|\b429\b|overloaded|\b529\b|throttl/i;
const NETWORK_PATTERN =
  /\bnetwork\b|econnrefused|econnreset|enotfound|etimedout|esockettimedout|eai_again|epipe|fetch failed|socket hang ?up|getaddrinfo|no internet|connection (error|failed|refused|reset|closed|lost)|(could not|couldn.t|unable to) (connect|reach)/i;

export function classifyAgentTurnFailure(message: string): AgentTurnFailureKind | null {
  if (AUTH_PATTERN.test(message)) return 'auth-expired';
  if (QUOTA_PATTERN.test(message)) return 'quota';
  if (RATE_LIMIT_PATTERN.test(message)) return 'rate-limit';
  if (NETWORK_PATTERN.test(message)) return 'network';
  return null;
}

/** The optional `failure` field of a protocol `error` event: present only
 * when the message classifies, so unclassified errors keep today's shape. */
export function agentTurnFailureFor(message: string): AgentTurnFailure | undefined {
  const kind = classifyAgentTurnFailure(message);
  return kind ? { kind } : undefined;
}

/** The wire `error` event for a turn-scoped runtime failure — message plus
 * its classified kind when one matches. Both adapters send exactly this
 * shape, so classification cannot drift between them. */
export function agentTurnErrorEvent(
  message: string,
): { t: 'error'; message: string; failure?: AgentTurnFailure } {
  const failure = agentTurnFailureFor(message);
  return { t: 'error', message, ...(failure ? { failure } : {}) };
}
