export const ACCOUNT_CHANGED_EVENT = 'stashbase-account-changed';

export function notifyAccountChanged(): void {
  window.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT));
}
