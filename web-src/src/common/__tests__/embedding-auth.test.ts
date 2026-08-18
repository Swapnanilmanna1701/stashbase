import assert from 'node:assert/strict';
import test from 'node:test';
import type { EmbedderState } from '@/common/api/api';
import {
  hasSkippedAiIndexing,
  isEmbeddingAuthorized,
  setAiIndexingSkipped,
} from '@/common/lib/embeddingAuth';

function state(patch: Partial<EmbedderState>): EmbedderState {
  return {
    provider: 'openai',
    hasKey: false,
    authorized: false,
    source: 'openai',
    model: 'text-embedding-3-small',
    account: { signedIn: false, active: false },
    ...patch,
  };
}

test('the AI Index skip is per folder: another folder re-offers, activation clears all', () => {
  assert.equal(hasSkippedAiIndexing('/work/alpha'), false);

  // Skipping alpha quiets alpha only — switching to beta must re-offer
  // (the titlebar switcher made in-place switching the primary flow, so a
  // window-wide skip silently became a permanent opt-out).
  setAiIndexingSkipped(true, '/work/alpha');
  assert.equal(hasSkippedAiIndexing('/work/alpha'), true);
  assert.equal(hasSkippedAiIndexing('/work/beta'), false);

  // Returning to a folder skipped in this window stays quiet.
  setAiIndexingSkipped(true, '/work/beta');
  assert.equal(hasSkippedAiIndexing('/work/alpha'), true);
  assert.equal(hasSkippedAiIndexing('/work/beta'), true);

  // Activation clears every prior skip, so a later key removal re-gates
  // from a clean state instead of staying silently skipped.
  setAiIndexingSkipped(false, '/work/alpha');
  assert.equal(hasSkippedAiIndexing('/work/alpha'), false);
  assert.equal(hasSkippedAiIndexing('/work/beta'), false);
});

test('a bare-window skip covers the first folder opened, later folders re-offer', () => {
  // Fresh state for this test: activation clears every prior skip.
  setAiIndexingSkipped(false, '');

  // The bare window ('' — no folder open yet) is its own context, so a
  // fresh window offers setup before any folder is chosen.
  assert.equal(hasSkippedAiIndexing(''), false);
  setAiIndexingSkipped(true, '');
  assert.equal(hasSkippedAiIndexing(''), true);

  // The launch offer and the first folder are one continuous flow: the
  // bare-window skip carries into the first folder instead of re-nagging
  // seconds after an explicit "not now"…
  assert.equal(hasSkippedAiIndexing('/work/alpha'), true);

  // …and is consumed by it: a DIFFERENT folder still re-offers, while the
  // first folder stays quiet on return.
  assert.equal(hasSkippedAiIndexing('/work/beta'), false);
  assert.equal(hasSkippedAiIndexing('/work/alpha'), true);
});

test('AI Index authorization accepts either hosted account or BYOK source', () => {
  assert.equal(isEmbeddingAuthorized(null), false);
  assert.equal(isEmbeddingAuthorized(state({ authorized: true, source: 'stashbase-account' })), true);
  assert.equal(isEmbeddingAuthorized(state({ authorized: true, source: 'openrouter', hasKey: true })), true);
  assert.equal(isEmbeddingAuthorized(state({ authorized: false, source: 'stashbase-account' })), false);
});
