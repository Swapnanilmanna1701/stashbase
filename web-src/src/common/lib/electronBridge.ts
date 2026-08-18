import type { ClipboardOffer } from '@/common/components/ClipboardImportModal';

export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error'
  | 'unsupported';

export type DesktopUpdateSimulation = 'off' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';

export interface DesktopUpdateState {
  phase: DesktopUpdatePhase;
  currentVersion: string;
  platform: string;
  autoCheckEnabled: boolean;
  releaseUrl: string;
  availableVersion?: string;
  releaseName?: string;
  releaseDate?: string;
  percent?: number;
  message?: string;
  simulation?: {
    enabled: boolean;
    value: DesktopUpdateSimulation;
  };
}

/** The renderer-visible surface of `electron/preload.cjs`. One declaration
 * for the whole renderer — feature code must not re-declare partial copies
 * or cast `window` inline. Every member is optional because the browser dev
 * shell has no bridge at all. */
export interface ElectronBridge {
  /** Stable per-window identity assigned by the main process at spawn. */
  windowId?: string;
  openFolderDialog?: (opts?: {
    title?: string;
    buttonLabel?: string;
    defaultPath?: string;
    allowCreateDirectory?: boolean;
  }) => Promise<string | null>;
  openExternal?: (url: string) => Promise<boolean>;
  /** Opens the main-process bug-report review for the sender's window. */
  reportBug?: () => Promise<boolean>;
  /** Reloads only after main confirms the renderer save barrier. */
  reloadWindow?: () => Promise<boolean>;
  openFolderWindow?: (folder: string) => Promise<boolean>;
  setWindowFolder?: (folder: string | null) => Promise<boolean>;
  onPrepareContextRelease?: (handler: (reason: string) => Promise<boolean>) => (() => void);
  contextReleaseReady?: () => boolean;
  prepareFolderRemoval?: (folder: string) => Promise<boolean>;
  notifyFolderRemoved?: (folder: string) => Promise<boolean>;
  notifyLibraryFolderAdded?: (folder: string) => Promise<boolean>;
  onFolderRemoved?: (handler: (folder: string) => void) => (() => void);
  onLibraryFolderAdded?: (handler: (folder: string) => void) => (() => void);
  onClipboardImage?: (handler: (offer: ClipboardOffer) => void) => (() => void);
  refreshClipboardWatch?: () => Promise<boolean>;
  getUpdateState?: () => Promise<DesktopUpdateState | null>;
  checkForUpdates?: () => Promise<DesktopUpdateState | null>;
  runUpdateAction?: () => Promise<DesktopUpdateState | null>;
  openUpdateDownloadPage?: () => Promise<boolean>;
  refreshUpdatePreference?: () => Promise<DesktopUpdateState | null>;
  setUpdateSimulation?: (simulation: DesktopUpdateSimulation) => Promise<DesktopUpdateState | null>;
  onUpdateState?: (handler: (state: DesktopUpdateState) => void) => (() => void);
  markClipboardHandled?: (hash: string) => void;
  markCurrentClipboardImageHandled?: () => void;
  setAgentComposerFocused?: (focused: boolean) => void;
}

/** The preload bridge, or undefined outside Electron (browser dev shell). */
export function electronBridge(): ElectronBridge | undefined {
  return (window as { electron?: ElectronBridge }).electron;
}
