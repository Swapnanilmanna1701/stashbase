export function isMacPlatform(platform: string): boolean {
  return platform.toLowerCase().includes('mac');
}

export function formatPrimaryShiftShortcut(
  key: string,
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
): string {
  return isMacPlatform(platform)
    ? `⌘⇧${key.toUpperCase()}`
    : `Ctrl+Shift+${key.toUpperCase()}`;
}
