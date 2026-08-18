import assert from 'node:assert/strict';
import test from 'node:test';
import { hostedQuotaRemainingPercent, hostedQuotaResetLabel } from '@/common/lib/hostedQuota.ts';

const quota = {
  plan: 'free',
  grantedTokens: 1_000_000,
  usedTokens: 80_000,
  reservedTokens: 0,
  remainingTokens: 920_000,
  periodStartedAt: '2026-08-01T00:00:00.000Z',
  periodEndsAt: '2026-09-01T00:00:00.000Z',
};

test('hosted quota presentation shares bounded percentage and reset formatting', () => {
  assert.equal(hostedQuotaRemainingPercent(quota), 92);
  assert.equal(hostedQuotaRemainingPercent({ ...quota, remainingTokens: 2_000_000 }), 100);
  assert.equal(hostedQuotaRemainingPercent({ ...quota, remainingTokens: -1 }), 0);
  assert.match(hostedQuotaResetLabel(quota), /^Resets /);
  assert.equal(hostedQuotaResetLabel({ ...quota, periodEndsAt: null }), '');
});
