import { useCallback, type MutableRefObject } from 'react';
import { AUDIO_SOURCE_EXTENSION_ALTERNATION } from '../../../shared/file-formats.ts';
import { api, ApiError } from '../api';
import { folderRefsEqual } from '../folderPath';
import type { EditorHandle } from './actionTypes';
import {
  isFolderFileTab,
  keywordFindCaseSensitive,
  waitForNextFrame,
} from './appContextHelpers';
import { getActiveTab, type Action, type PendingHighlight, type State } from './state';
import type { ToastOptions } from './useFeedbackActions';

const AUTOSAVE_DEBOUNCE_MS = 1200;
const AUDIO_SOURCE_RE = new RegExp(`\\.(${AUDIO_SOURCE_EXTENSION_ALTERNATION})$`, 'i');
const scheduleWithTimeout = (callback: () => void, delayMs: number) => setTimeout(callback, delayMs);
const cancelTimeout = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer);

type Dispatch = (action: Action) => void;
type Toast = (message: string, opts?: ToastOptions) => string;

interface DocumentActionRefs {
  state: MutableRefObject<State>;
  editor: MutableRefObject<EditorHandle | null>;
  saveTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  saveInFlight: MutableRefObject<Promise<boolean> | null>;
}

interface DocumentActionDependencies {
  loadFiles: (expectedFolderPath?: string) => Promise<State['files']>;
  refreshIndexState: (folderPath?: string) => Promise<void>;
  toast: Toast;
  primeFind: (query: string, opts: { wholeWord: boolean; caseSensitive: boolean }) => void;
  scheduleAfter?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelScheduled?: (timer: ReturnType<typeof setTimeout>) => void;
}

function isDocxName(name: string): boolean {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name;
  return /\.docx$/i.test(base) && !base.startsWith('~$') && !base.startsWith('.~');
}

function isAudioName(name: string): boolean {
  return AUDIO_SOURCE_RE.test(name);
}

/** Owns editor persistence, document loading, and tab navigation semantics. */
export function useDocumentActions(
  refs: DocumentActionRefs,
  dependencies: DocumentActionDependencies,
  dispatch: Dispatch,
) {
  const { editor, saveInFlight, saveTimer, state } = refs;
  const { loadFiles, refreshIndexState, toast, primeFind } = dependencies;
  const scheduleAfter = dependencies.scheduleAfter ?? scheduleWithTimeout;
  const cancelScheduled = dependencies.cancelScheduled ?? cancelTimeout;

  const flushSave = useCallback(async () => {
    const inFlight = saveInFlight.current;
    if (inFlight) {
      const ok = await inFlight;
      if (!ok) return false;
    }
    if (saveTimer.current) {
      cancelScheduled(saveTimer.current);
      saveTimer.current = null;
    }

    const run = (async () => {
      const tabAtStart = getActiveTab(state.current);
      const currentFile = tabAtStart?.file ?? null;
      const tabId = tabAtStart?.id ?? null;
      const handle = editor.current;
      if (!currentFile || !handle) return true;
      // Out-of-folder tabs are read-only; a PUT would write a same-named
      // file into the ACTIVE folder.
      if (currentFile.folder) return true;
      if (!tabAtStart?.dirty) return true;
      const content = handle.getValue();
      if (content === currentFile.content) {
        dispatch({ type: 'DOCUMENT_DIRTY', dirty: false });
        dispatch({ type: 'SAVE_STATUS', status: { text: 'Saved', cls: 'saved' } });
        return true;
      }
      dispatch({ type: 'SAVE_STATUS', status: { text: 'Saving…', cls: '' } });
      const saveContent = async (baseVersion?: string) => {
        const result = await api.putFile(currentFile.name, content, baseVersion);
        if (result.indexWarning) toast(result.indexWarning, { level: 'warning' });
        return result;
      };
      try {
        let savedResult: Awaited<ReturnType<typeof saveContent>>;
        try {
          savedResult = await saveContent(currentFile.version);
        } catch (err: unknown) {
          if (!(err instanceof ApiError && err.status === 409)) throw err;
          const latestTab = getActiveTab(state.current);
          const sameTab = latestTab?.id === tabId && latestTab.file?.name === currentFile.name;
          const liveValue = editor.current?.getValue();
          if (!sameTab || liveValue !== content) return false;
          savedResult = await saveContent(undefined);
          toast('Saved over a newer disk copy from sync.', { level: 'info' });
        }
        const latestTab = getActiveTab(state.current);
        const sameTab = latestTab?.id === tabId && latestTab.file?.name === currentFile.name;
        if (!sameTab) return true;

        const liveValue = editor.current?.getValue();
        // Keep the tab's retained source aligned with the accepted save so a
        // later tab reactivation does not remount from its original content.
        // Document surfaces ignore incoming source while dirty; for a clean
        // acknowledgement this value already equals the live editor.
        dispatch({ type: 'FILE_PATCH', patch: { content, version: savedResult.version } });
        if (liveValue === content) {
          dispatch({ type: 'DOCUMENT_DIRTY', dirty: false });
          dispatch({ type: 'SAVE_STATUS', status: { text: 'Saved', cls: 'saved' } });
        } else {
          dispatch({ type: 'SAVE_STATUS', status: { text: 'Unsaved', cls: '' } });
          if (!saveTimer.current) {
            saveTimer.current = scheduleAfter(() => { void flushSave(); }, AUTOSAVE_DEBOUNCE_MS);
          }
        }
        void loadFiles();
        return true;
      } catch (err: unknown) {
        const latestTab = getActiveTab(state.current);
        const sameTab = latestTab?.id === tabId && latestTab.file?.name === currentFile.name;
        if (!sameTab) return false;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'SAVE_STATUS', status: { text: 'Save failed: ' + message, cls: 'error' } });
        return false;
      }
    })();

    saveInFlight.current = run;
    try {
      return await run;
    } finally {
      if (saveInFlight.current === run) saveInFlight.current = null;
    }
  }, [cancelScheduled, dispatch, editor, loadFiles, saveInFlight, saveTimer, scheduleAfter, state, toast]);

  const scheduleSave = useCallback(() => {
    dispatch({ type: 'DOCUMENT_DIRTY', dirty: true });
    dispatch({ type: 'SAVE_STATUS', status: { text: 'Unsaved', cls: '' } });
    if (saveTimer.current) cancelScheduled(saveTimer.current);
    saveTimer.current = scheduleAfter(() => { void flushSave(); }, AUTOSAVE_DEBOUNCE_MS);
  }, [cancelScheduled, dispatch, flushSave, saveTimer, scheduleAfter]);

  const loadFile = useCallback(async (
    name: string,
    opts: {
      newTab?: boolean;
      anchor?: string;
      expectedFolder?: string;
      /** Read from this explicit member folder instead of the window's own —
       *  the resulting tab is an out-of-folder read-only viewer. */
      libraryFolder?: string;
    },
  ) => {
    if (opts.expectedFolder && state.current.folderPath !== opts.expectedFolder) return;
    const currentFile = getActiveTab(state.current)?.file ?? null;
    if (editor.current && currentFile && currentFile.name !== name && !opts.newTab) {
      if (!(await flushSave())) return;
    }
    if (opts.expectedFolder && state.current.folderPath !== opts.expectedFolder) return;
    const readOpts = opts.libraryFolder ? { folder: opts.libraryFolder } : undefined;

    let body;
    if (/\.pdf$/i.test(name)) {
      try {
        const stat = await api.statFile(name, readOpts);
        body = { name, format: 'pdf' as const, content: '', version: stat.version };
      } catch (err: unknown) {
        dispatch({ type: 'SAVE_STATUS', status: { text: err instanceof Error ? err.message : String(err), cls: 'error' } });
        return;
      }
    } else if (isDocxName(name)) {
      try {
        const stat = await api.statFile(name, readOpts);
        body = { name, format: 'docx' as const, content: '', version: stat.version };
      } catch (err: unknown) {
        dispatch({ type: 'SAVE_STATUS', status: { text: err instanceof Error ? err.message : String(err), cls: 'error' } });
        return;
      }
      const folder = opts.libraryFolder ?? opts.expectedFolder ?? state.current.folderPath;
      void api.prepareDocx(name, { folder: folder || undefined })
        .then(() => refreshIndexState(folder || undefined))
        .catch((err: unknown) => {
          console.warn('[docx] interactive preparation request failed:', err);
        });
    } else if (isAudioName(name)) {
      try {
        const stat = await api.statFile(name, readOpts);
        body = { name, format: 'audio' as const, content: '', version: stat.version };
      } catch (err: unknown) {
        dispatch({ type: 'SAVE_STATUS', status: { text: err instanceof Error ? err.message : String(err), cls: 'error' } });
        return;
      }
      const folder = opts.libraryFolder ?? opts.expectedFolder ?? state.current.folderPath;
      void api.prepareAudio(name, { folder: folder || undefined })
        .then(() => refreshIndexState(folder || undefined))
        .catch((err: unknown) => {
          console.warn('[audio] interactive preparation request failed:', err);
        });
    } else if (/\.(png|jpe?g|webp)$/i.test(name)) {
      try {
        const stat = await api.statFile(name, readOpts);
        body = { name, format: 'image' as const, content: '', version: stat.version };
      } catch (err: unknown) {
        dispatch({ type: 'SAVE_STATUS', status: { text: err instanceof Error ? err.message : String(err), cls: 'error' } });
        return;
      }
    } else {
      try {
        body = await api.getFile(name, readOpts);
      } catch (err: unknown) {
        dispatch({ type: 'SAVE_STATUS', status: { text: err instanceof Error ? err.message : String(err), cls: 'error' } });
        return;
      }
    }
    if (opts.expectedFolder && state.current.folderPath !== opts.expectedFolder) return;
    const noActiveTab = state.current.activeTabId == null || !getActiveTab(state.current);
    const newTabMode = !!opts.newTab || noActiveTab;
    dispatch({
      type: 'FILE_OPEN',
      body,
      newTab: newTabMode ? !noActiveTab : undefined,
      libraryFolder: opts.libraryFolder,
    });
    dispatch({ type: 'PENDING_SCROLL', anchor: opts.anchor ?? null });
  }, [dispatch, editor, flushSave, refreshIndexState, state]);

  // A sidebar single-click opens the file in its own persistent tab.
  // Already open → focus it; the active tab is a blank `+` tab → fill
  // it in place; otherwise open a fresh tab. No preview/replace mode:
  // one click, one lasting tab.
  const selectFile = useCallback(async (name: string) => {
    const expectedFolder = state.current.folderPath;
    if (editor.current && !(await flushSave())) return;
    if (state.current.folderPath !== expectedFolder) return;
    const currentState = state.current;
    const existing = currentState.tabs.find((tab) => isFolderFileTab(tab, name));
    if (existing) {
      if (currentState.activeTabId !== existing.id) dispatch({ type: 'ACTIVATE_TAB', id: existing.id });
      return;
    }
    const active = getActiveTab(currentState);
    if (active && !active.file) {
      await loadFile(name, { expectedFolder });
      return;
    }
    await loadFile(name, { newTab: true, expectedFolder });
  }, [dispatch, editor, flushSave, loadFile, state]);

  const armHighlight = useCallback((hit: PendingHighlight) => {
    dispatch({ type: 'PENDING_HIGHLIGHT', highlight: hit });
    if (hit.openFindBar && hit.chunkText) {
      primeFind(hit.chunkText, {
        wholeWord: hit.findWholeWord ?? false,
        caseSensitive: keywordFindCaseSensitive(hit.chunkText, hit.findCaseStrict ?? false),
      });
    }
  }, [dispatch, primeFind]);

  const selectFileWithHighlight = useCallback(async (name: string, hit: PendingHighlight) => {
    const expectedFolder = state.current.folderPath;
    const isTarget = () => {
      const file = getActiveTab(state.current)?.file;
      // Same rel name on an out-of-folder tab is a different document.
      return file?.name === name && !file.folder;
    };
    await selectFile(name);
    if (state.current.folderPath !== expectedFolder) return;
    for (let i = 0; i < 8; i++) {
      if (isTarget()) break;
      await waitForNextFrame();
      if (state.current.folderPath !== expectedFolder) return;
    }
    if (!isTarget()) return;
    armHighlight(hit);
  }, [armHighlight, selectFile, state]);

  const openInNewTab = useCallback(async (name: string, expectedFolder?: string) => {
    const targetFolder = expectedFolder ?? state.current.folderPath;
    if (targetFolder && state.current.folderPath !== targetFolder) return;
    if (editor.current && !(await flushSave())) return;
    if (targetFolder && state.current.folderPath !== targetFolder) return;
    const currentState = state.current;
    const existing = currentState.tabs.find((tab) => isFolderFileTab(tab, name));
    if (existing) {
      if (currentState.activeTabId !== existing.id) dispatch({ type: 'ACTIVATE_TAB', id: existing.id });
      return;
    }
    await loadFile(name, { newTab: true, expectedFolder: targetFolder });
  }, [dispatch, editor, flushSave, loadFile, state]);

  const newTab = useCallback(async () => {
    if (editor.current && !(await flushSave())) return;
    dispatch({ type: 'NEW_TAB' });
  }, [dispatch, editor, flushSave]);

  const closeTab = useCallback(async (id: string) => {
    const currentState = state.current;
    if (currentState.activeTabId === id && editor.current && !(await flushSave())) return;
    dispatch({ type: 'CLOSE_TAB', id });
  }, [dispatch, editor, flushSave, state]);

  const closeActiveTab = useCallback(async () => {
    const id = state.current.activeTabId;
    if (id) await closeTab(id);
  }, [closeTab, state]);

  const activateTab = useCallback(async (id: string) => {
    const currentState = state.current;
    if (currentState.activeTabId === id) return;
    if (editor.current && !(await flushSave())) return;
    dispatch({ type: 'ACTIVATE_TAB', id });
  }, [dispatch, editor, flushSave, state]);

  const navigateTo = useCallback(async (name: string, anchor?: string) => {
    const expectedFolder = state.current.folderPath;
    const currentFile = getActiveTab(state.current)?.file ?? null;
    if (currentFile?.name === name) {
      if (anchor) dispatch({ type: 'PENDING_SCROLL', anchor });
      return;
    }
    if (editor.current && !(await flushSave())) return;
    if (state.current.folderPath !== expectedFolder) return;
    const existing = state.current.tabs.find((tab) => isFolderFileTab(tab, name));
    if (existing) {
      if (state.current.activeTabId !== existing.id) dispatch({ type: 'ACTIVATE_TAB', id: existing.id });
      if (anchor) dispatch({ type: 'PENDING_SCROLL', anchor });
      return;
    }
    await loadFile(name, { newTab: true, anchor, expectedFolder });
  }, [dispatch, editor, flushSave, loadFile, state]);

  /** Open a file by (member folder, rel path). A target in the window's
   *  own folder goes through the normal selection path; anything else opens
   *  an out-of-folder read-only tab WITHOUT switching the window's folder. */
  const openLibraryFile = useCallback(async (
    folder: string,
    name: string,
    opts?: { hit?: PendingHighlight; anchor?: string },
  ) => {
    const startState = state.current;
    if (startState.folderPath && folderRefsEqual(folder, startState.folderPath)) {
      if (opts?.hit) await selectFileWithHighlight(name, opts.hit);
      else if (opts?.anchor) await navigateTo(name, opts.anchor);
      else await selectFile(name);
      return;
    }
    if (editor.current && !(await flushSave())) return;
    const isTarget = () => {
      const file = getActiveTab(state.current)?.file;
      return file?.name === name && file.folder != null && folderRefsEqual(file.folder, folder);
    };
    const existing = state.current.tabs.find((tab) =>
      tab.file?.name === name && tab.file.folder != null && folderRefsEqual(tab.file.folder, folder));
    if (existing) {
      if (state.current.activeTabId !== existing.id) dispatch({ type: 'ACTIVATE_TAB', id: existing.id });
      if (opts?.anchor) dispatch({ type: 'PENDING_SCROLL', anchor: opts.anchor });
    } else {
      // Mirror selectFile: fill a blank tab in place, otherwise open a
      // fresh persistent tab.
      const active = getActiveTab(state.current);
      if (active && !active.file) {
        await loadFile(name, { libraryFolder: folder, anchor: opts?.anchor });
      } else {
        await loadFile(name, { newTab: true, libraryFolder: folder, anchor: opts?.anchor });
      }
    }
    const hit = opts?.hit;
    if (!hit) return;
    for (let i = 0; i < 8; i++) {
      if (isTarget()) break;
      await waitForNextFrame();
    }
    if (!isTarget()) return;
    armHighlight(hit);
  }, [armHighlight, dispatch, editor, flushSave, loadFile, navigateTo, selectFile, selectFileWithHighlight, state]);


  const consumePendingScroll = useCallback(() => {
    dispatch({ type: 'PENDING_SCROLL', anchor: null });
  }, [dispatch]);

  const consumePendingHighlight = useCallback(() => {
    dispatch({ type: 'PENDING_HIGHLIGHT', highlight: null });
  }, [dispatch]);

  const toggleEditMode = useCallback(async () => {
    const tab = getActiveTab(state.current);
    if (!tab?.file) return;
    // Out-of-folder tabs never edit — their save path would write into
    // the ACTIVE folder.
    if (tab.file.folder) return;
    if (tab.editMode) {
      if (!(await flushSave())) return;
      dispatch({ type: 'EDIT_MODE', on: false });
    } else {
      dispatch({ type: 'EDIT_MODE', on: true });
    }
  }, [dispatch, flushSave, state]);

  const registerEditor = useCallback((handle: EditorHandle | null) => {
    editor.current = handle;
  }, [editor]);

  const updateTabPdfPage = useCallback((tabId: string, page: number) => {
    dispatch({ type: 'TAB_PDF_PAGE', id: tabId, page });
  }, [dispatch]);

  const setUnsupportedModalOpen = useCallback((open: boolean) => {
    dispatch({ type: 'UNSUPPORTED_MODAL', open });
  }, [dispatch]);

  return {
    activateTab,
    closeActiveTab,
    closeTab,
    consumePendingHighlight,
    consumePendingScroll,
    flushSave,
    navigateTo,
    newTab,
    openInNewTab,
    openLibraryFile,
    registerEditor,
    scheduleSave,
    selectFile,
    selectFileWithHighlight,
    setUnsupportedModalOpen,
    toggleEditMode,
    updateTabPdfPage,
  };
}
