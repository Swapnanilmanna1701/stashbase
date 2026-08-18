import { useEffect, useState } from 'react';
import type { HostedAccountState } from '@/common/api/apiTypes';
import { UserIcon } from '@/common/components/icons';

export function accountDisplayLabel(account: Pick<HostedAccountState, 'displayName' | 'email'>): string {
  return account.displayName?.trim() || account.email?.trim() || 'Anonymous';
}

export function accountInitials(account: Pick<HostedAccountState, 'displayName' | 'email'>): string {
  const first = (value: string) => Array.from(value)[0] ?? '';
  const name = account.displayName?.trim();
  if (name) {
    const words = name.split(/\s+/u).filter(Boolean);
    return (words.length > 1 ? first(words[0]) + first(words.at(-1)!) : Array.from(words[0]).slice(0, 2).join('')).toUpperCase();
  }
  const email = account.email?.trim();
  if (!email) return '';
  const local = email.split('@', 1)[0];
  const parts = local.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (parts.length > 1 ? first(parts[0]) + first(parts.at(-1)!) : Array.from(local).slice(0, 2).join('')).toUpperCase();
}

/** One stable-size, decorative account image with a fallback underneath it.
 * Empty alt avoids announcing identity twice beside the visible account text. */
export function AccountAvatar({
  account,
  className = 'size-8',
  initialsClassName = 'text-xs',
}: {
  account: Pick<HostedAccountState, 'displayName' | 'email' | 'avatarUrl'>;
  className?: string;
  initialsClassName?: string;
}) {
  const imageKey = `${account.email?.trim().toLowerCase() ?? ''}\0${account.avatarUrl ?? ''}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => { setFailedKey(null); setLoadedKey(null); }, [imageKey]);
  const initials = accountInitials(account);
  const showImage = !!account.avatarUrl && failedKey !== imageKey;
  return (
    <span className={`relative inline-flex flex-none items-center justify-center overflow-hidden rounded-full bg-accent/15 text-accent ${className}`} aria-hidden="true">
      {initials
        ? <span className={`font-semibold ${initialsClassName}`}>{initials}</span>
        : <UserIcon className="size-3/5" />}
      {showImage && (
        <img
          key={imageKey}
          src={account.avatarUrl}
          alt=""
          className={`absolute inset-0 size-full object-cover ${loadedKey === imageKey ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedKey(imageKey)}
          onError={() => setFailedKey(imageKey)}
        />
      )}
    </span>
  );
}
