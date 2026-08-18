import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_TURN_FAILED_MESSAGE,
  recordFailureBeforeContinuing,
  turnFailureGuidance,
  TurnErrorTracker,
} from '@/features/agent-panel/lib/turnFailure.ts';

test('every failure kind offers a truthful in-place action', () => {
  // Auth: Codex has a provider-owned in-app sign-in; Claude signs in through
  // its terminal, so its action restarts the session process — credentials
  // are read at process start, and without the restart a login completed in
  // the terminal stays invisible until the whole app is relaunched.
  assert.equal(turnFailureGuidance('auth-expired', 'codex').action.id, 'codex-sign-in');
  const claude = turnFailureGuidance('auth-expired', 'claude');
  assert.equal(claude.action.id, 'reconnect');
  assert.match(claude.guidance, /\/login/);
  // Quota, rate, and network clear on the provider side, so their action is
  // a plain resend on the live session — no process replacement.
  for (const agent of ['claude', 'codex'] as const) {
    assert.equal(turnFailureGuidance('quota', agent).action.id, 'resend');
    assert.equal(turnFailureGuidance('rate-limit', agent).action.id, 'resend');
    assert.equal(turnFailureGuidance('network', agent).action.id, 'resend');
  }
});

test('a bare failed terminal event adds one generic explanation', () => {
  const tracker = new TurnErrorTracker();
  tracker.start();

  assert.deepEqual(tracker.finish(true), {
    duplicate: false,
    failureMessage: AGENT_TURN_FAILED_MESSAGE,
  });
  assert.deepEqual(tracker.finish(true), {
    duplicate: true,
    failureMessage: null,
  });
});

test('a specific runtime error suppresses the generic fallback', () => {
  const tracker = new TurnErrorTracker();
  tracker.start();
  tracker.explain();

  assert.deepEqual(tracker.finish(true), {
    duplicate: false,
    failureMessage: null,
  });
});

test('successful and cancelled turns do not add an error, and the next turn resets the guard', () => {
  const tracker = new TurnErrorTracker();
  tracker.start();
  tracker.explain();
  assert.equal(tracker.finish(false).failureMessage, null);

  tracker.start();
  assert.equal(tracker.finish(true).failureMessage, AGENT_TURN_FAILED_MESSAGE);
});

test('the failure is recorded before the next queued prompt continues', () => {
  const tracker = new TurnErrorTracker();
  tracker.start();
  const events: string[] = [];

  recordFailureBeforeContinuing(
    tracker.finish(true),
    (message) => events.push(`error:${message}`),
    () => events.push('next queued prompt'),
  );
  recordFailureBeforeContinuing(
    tracker.finish(true),
    (message) => events.push(`error:${message}`),
    () => events.push('unexpected duplicate continuation'),
  );

  assert.deepEqual(events, [
    `error:${AGENT_TURN_FAILED_MESSAGE}`,
    'next queued prompt',
  ]);
});
