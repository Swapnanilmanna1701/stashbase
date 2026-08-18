import type { AppearancePreferences } from '@/common/api/api';

/** Apply only CSS-facing state; persistence stays in the Settings API. */
export function applyAppearance(preferences: AppearancePreferences): void {
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.dataset.uiScale = preferences.uiScale;
  root.dataset.readingTextSize = preferences.readingTextSize;
}

let channel: BroadcastChannel | undefined;

function appearanceChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  channel ??= new BroadcastChannel('stashbase-appearance');
  return channel;
}

/** Keep existing Electron windows in sync without adding appearance state to
 * the server's per-window folder context. */
export function publishAppearance(preferences: AppearancePreferences): void {
  applyAppearance(preferences);
  appearanceChannel()?.postMessage(preferences);
}

export function subscribeToAppearance(listener: (preferences: AppearancePreferences) => void): () => void {
  const current = appearanceChannel();
  if (!current) return () => {};
  const onMessage = (event: MessageEvent<AppearancePreferences>) => listener(event.data);
  current.addEventListener('message', onMessage);
  return () => current.removeEventListener('message', onMessage);
}
