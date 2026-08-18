import type { HostedQuota } from '@/common/api/apiTypes';

export function hostedQuotaRemainingPercent(quota: HostedQuota): number {
  const percent = (quota.remainingTokens / Math.max(1, quota.grantedTokens)) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function hostedQuotaResetLabel(quota: HostedQuota): string {
  return quota.periodEndsAt
    ? `Resets ${new Date(quota.periodEndsAt).toLocaleDateString()}`
    : '';
}
