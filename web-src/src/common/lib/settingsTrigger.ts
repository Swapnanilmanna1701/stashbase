/** How any surface asks Settings to open, and the section vocabulary it can
 * name. The dialog that listens for this stays in the Settings feature; only
 * the request entry point is shared, so no feature has to reach into another
 * to offer "Open Settings". */

export type SettingsSection = 'general' | 'appearance' | 'agents' | 'embedding' | 'transcription' | 'mcp';

export const OPEN_SETTINGS_EVENT = 'stashbase-open-settings';

export interface SettingsOpenDetail {
  section?: SettingsSection;
}

export function openSettings(section?: SettingsSection): void {
  window.dispatchEvent(
    new CustomEvent<SettingsOpenDetail>(OPEN_SETTINGS_EVENT, { detail: { section } }),
  );
}
