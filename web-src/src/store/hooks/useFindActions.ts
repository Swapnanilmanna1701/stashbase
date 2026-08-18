import { useCallback, useRef, type MutableRefObject } from 'react';
import type { FindController, MatchInfo } from '@/store/state/editorTypes';
import type { Action, State } from '@/store/state/state';

type Dispatch = (action: Action) => void;

/** Owns the active document view's find controller. */
export function useFindActions(stateRef: MutableRefObject<State>, dispatch: Dispatch) {
  const findControllerRef = useRef<FindController | null>(null);
  const findRequestSeq = useRef(0);

  const applyMatchInfo = useCallback(async (
    pending: MatchInfo | Promise<MatchInfo>,
  ): Promise<void> => {
    // Last call wins: async controllers (PDF) can resolve out of order, and
    // a stale "N of M" landing after a newer one would stick in the FindBar.
    const seq = ++findRequestSeq.current;
    const info = await Promise.resolve(pending);
    if (seq !== findRequestSeq.current) return;
    dispatch({ type: 'FIND_SET', patch: { current: info.current, total: info.total } });
  }, [dispatch]);

  const registerFindController = useCallback((controller: FindController | null) => {
    const previous = findControllerRef.current;
    if (previous && previous !== controller) previous.close();
    findControllerRef.current = controller;
    if (!controller) return;
    const { query, wholeWord, caseSensitive, open } = stateRef.current.uiShell.find;
    if (open && query) {
      void applyMatchInfo((controller.restoreQuery ?? controller.setQuery)(query, { wholeWord, caseSensitive }));
    }
  }, [applyMatchInfo, stateRef]);

  const openFind = useCallback(() => {
    dispatch({ type: 'FIND_OPEN' });
  }, [dispatch]);

  /** Arms and opens the find bar with a full query state, then runs the
   *  live controller. A keyword hit that targets the already-open file
   *  never remounts the viewer and never reloads content, so neither
   *  registration-time priming nor the load-time re-apply fires there;
   *  this direct call is what makes such hits show matches immediately. */
  const primeFind = useCallback((query: string, opts: { wholeWord: boolean; caseSensitive: boolean }) => {
    dispatch({
      type: 'FIND_SET',
      patch: { query, wholeWord: opts.wholeWord, caseSensitive: opts.caseSensitive },
    });
    dispatch({ type: 'FIND_OPEN' });
    const controller = findControllerRef.current;
    if (controller) void applyMatchInfo(controller.setQuery(query, opts));
  }, [applyMatchInfo, dispatch]);

  const closeFind = useCallback(() => {
    findControllerRef.current?.close();
    dispatch({ type: 'FIND_CLOSE' });
  }, [dispatch]);

  const setFindQuery = useCallback((query: string) => {
    dispatch({ type: 'FIND_SET', patch: { query } });
    const controller = findControllerRef.current;
    if (!controller) {
      dispatch({ type: 'FIND_SET', patch: { current: 0, total: 0 } });
      return;
    }
    const { wholeWord, caseSensitive } = stateRef.current.uiShell.find;
    void applyMatchInfo(controller.setQuery(query, { wholeWord, caseSensitive }));
  }, [applyMatchInfo, dispatch, stateRef]);

  const toggleFindCaseSensitive = useCallback(() => {
    const next = !stateRef.current.uiShell.find.caseSensitive;
    dispatch({ type: 'FIND_SET', patch: { caseSensitive: next } });
    const controller = findControllerRef.current;
    if (!controller) return;
    const { query, wholeWord } = stateRef.current.uiShell.find;
    void applyMatchInfo(controller.setQuery(query, { wholeWord, caseSensitive: next }));
  }, [applyMatchInfo, dispatch, stateRef]);

  const toggleFindWholeWord = useCallback(() => {
    const next = !stateRef.current.uiShell.find.wholeWord;
    dispatch({ type: 'FIND_SET', patch: { wholeWord: next } });
    const controller = findControllerRef.current;
    if (!controller) return;
    const { query, caseSensitive } = stateRef.current.uiShell.find;
    void applyMatchInfo(controller.setQuery(query, { wholeWord: next, caseSensitive }));
  }, [applyMatchInfo, dispatch, stateRef]);

  const findNext = useCallback(() => {
    const controller = findControllerRef.current;
    if (controller) void applyMatchInfo(controller.next());
  }, [applyMatchInfo]);

  const findPrev = useCallback(() => {
    const controller = findControllerRef.current;
    if (controller) void applyMatchInfo(controller.prev());
  }, [applyMatchInfo]);

  return {
    closeFind,
    findNext,
    findPrev,
    openFind,
    primeFind,
    registerFindController,
    setFindQuery,
    toggleFindCaseSensitive,
    toggleFindWholeWord,
  };
}
