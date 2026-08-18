import assert from 'node:assert/strict';
import test from 'node:test';
import { agentTurnFailureFor, classifyAgentTurnFailure } from '../agent-turn-failure.ts';
import { simulatedTurnFailureScript } from '../agent-runtime-paths.ts';

test('every non-fatal simulated script classifies as its own kind', () => {
  // The development scripts are provider-shaped so that injecting one
  // exercises the same classification a live failure would get. This pins
  // scripts and classifier together: a drift in either breaks here, not in
  // a dev session that silently renders the wrong recovery.
  const kinds = ['rate-limit', 'quota', 'auth-expired', 'network'] as const;
  for (const kind of kinds) {
    assert.equal(classifyAgentTurnFailure(simulatedTurnFailureScript(kind).message), kind);
  }
});

test('live provider messages classify by their vocabulary', () => {
  // Claude: signed out / expired OAuth surfaces on the SDK result. The
  // "Not logged in" phrasing is the observed live signed-out `result` text.
  assert.equal(classifyAgentTurnFailure('Not logged in · Please run /login'), 'auth-expired');
  assert.equal(classifyAgentTurnFailure('Invalid API key · Please run /login'), 'auth-expired');
  assert.equal(classifyAgentTurnFailure('OAuth token has expired. Run /login.'), 'auth-expired');
  // Claude: subscription window exhaustion arrives through the same field.
  assert.equal(classifyAgentTurnFailure('5-hour limit reached ∙ resets 3am'), 'quota');
  // Codex: expired ChatGPT session.
  assert.equal(classifyAgentTurnFailure('401 Unauthorized: token expired'), 'auth-expired');
  // Codex: refresh-token reuse detection invalidates the session (observed
  // live: two processes sharing auth.json raced the rotating refresh).
  assert.equal(
    classifyAgentTurnFailure('Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.'),
    'auth-expired',
  );
  // Plan exhaustion wins over an accompanying 429.
  assert.equal(classifyAgentTurnFailure("You've reached your usage limit. It resets at 5pm."), 'quota');
  assert.equal(classifyAgentTurnFailure('429 insufficient_quota: You exceeded your current quota'), 'quota');
  // Transient rate limiting.
  assert.equal(classifyAgentTurnFailure('429 rate_limit_error: Too many requests'), 'rate-limit');
  assert.equal(classifyAgentTurnFailure('Rate limit reached for requests'), 'rate-limit');
  assert.equal(classifyAgentTurnFailure('overloaded_error: The API is temporarily overloaded'), 'rate-limit');
  // Connectivity.
  assert.equal(classifyAgentTurnFailure('fetch failed: getaddrinfo ENOTFOUND api.openai.com'), 'network');
  assert.equal(classifyAgentTurnFailure('connect ECONNREFUSED 127.0.0.1:443'), 'network');
});

test('an unmatched message stays unclassified and adds no failure field', () => {
  assert.equal(classifyAgentTurnFailure('Codex failed before completing the turn.'), null);
  assert.equal(classifyAgentTurnFailure('sandbox service offline'), null);
  assert.equal(classifyAgentTurnFailure('Claude stopped after reaching the maximum number of turns.'), null);
  assert.equal(agentTurnFailureFor('sandbox service offline'), undefined);
  assert.deepEqual(agentTurnFailureFor('usage limit reached'), { kind: 'quota' });
});
