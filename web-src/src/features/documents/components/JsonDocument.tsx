import { json } from '@codemirror/lang-json';
import { EditorState, Compartment, type Range } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import './json/json-tree.css';
import { useAppActions, useWorkspace, type FindController, type FindOptions, type MatchInfo } from '@/store/contexts/AppContext';
import { analyzeJsonSource, formatPath, matchingJsonTreeNodes } from '@/features/documents/lib/json/sourceModel';
import type { JsonTreeSessionState } from '@/features/documents/components/json/JsonTreeView';

const LazyJsonTreeView = lazy(() => import('@/features/documents/components/json/JsonTreeView').then((module) => ({ default: module.JsonTreeView })));
interface RetainedJsonSession { tree: JsonTreeSessionState; viewMode: 'tree' | 'source' }
const retainedJsonSessions = new Map<string, RetainedJsonSession>();

type LiveFindController = FindController & { refresh: () => MatchInfo };
type JsonLineEnding = 'crlf' | 'cr' | 'lf';

function jsonLineEndingFor(source: string): JsonLineEnding {
  if (source.includes('\r\n')) return 'crlf';
  return source.includes('\r') ? 'cr' : 'lf';
}

/** CodeMirror stores line breaks as LF; JSON source still saves in its input convention. */
export function toJsonEditorText(source: string): string {
  return source.replace(/\r\n?/gu, '\n');
}

export function fromJsonEditorText(source: string, lineEnding: JsonLineEnding): string {
  if (lineEnding === 'lf') return source;
  return source.replace(/\n/gu, lineEnding === 'crlf' ? '\r\n' : '\r');
}

export const stashbaseJsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, class: 'cm-json-property' },
  { tag: tags.string, class: 'cm-json-string' },
  { tag: tags.bool, class: 'cm-json-boolean' },
  { tag: tags.number, class: 'cm-json-number' },
  { tag: tags.punctuation, class: 'cm-json-punctuation' },
  { tag: tags.invalid, class: 'cm-json-invalid' },
]);

const jsonInvalidDecorations = EditorView.decorations.compute(['doc'], (state) => {
  const marks: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (!node.type.isError || state.doc.length === 0) return;
      const from = node.from < node.to ? node.from : Math.max(0, node.from - 1);
      const to = node.from < node.to ? node.to : Math.min(state.doc.length, node.from + 1);
      if (from < to) marks.push(Decoration.mark({ class: 'cm-json-invalid' }).range(from, to));
    },
  });
  return Decoration.set(marks, true);
});

export interface JsonEditorSession {
  view: EditorView;
  find: LiveFindController;
  setReadOnly: (readOnly: boolean) => void;
  replaceFromDisk: (content: string) => void;
  destroy: () => void;
}

/** DOM-level editor seam used by React and lifecycle regression tests. */
export function createJsonEditor(host: HTMLElement, opts: {
  content: string;
  readOnly: boolean;
  onUserChange: () => void;
  onContentChange?: (content: string) => void;
  onFindInfo: (info: MatchInfo) => void;
}): JsonEditorSession {
  const readOnly = new Compartment();
  let applyingExternal = false;
  let find: LiveFindController;
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: opts.content,
      extensions: [
        lineNumbers(), history(), json(), syntaxHighlighting(stashbaseJsonHighlightStyle),
        jsonInvalidDecorations,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        readOnly.of([EditorState.readOnly.of(opts.readOnly), EditorView.editable.of(!opts.readOnly)]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          opts.onContentChange?.(update.state.doc.toString());
          if (!applyingExternal) opts.onUserChange();
          // CodeMirror forbids nested dispatch from an update listener. Re-run
          // the live query after the document transaction has settled so match
          // positions and counts can never refer to an older document.
          queueMicrotask(() => opts.onFindInfo(find.refresh()));
        }),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--fg)' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, ui-monospace, monospace)' },
          '.cm-content': { padding: '20px 0 72px', caretColor: 'var(--focus-ring)' },
          '.cm-line': { padding: '0 20px' },
          '.cm-gutters': { backgroundColor: 'var(--pane)', color: 'var(--muted)', border: '0' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
          '&.cm-focused': { outline: 'none' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' },
          '.cm-json-property': { color: 'var(--syntax-json-property)' },
          '.cm-json-string': { color: 'var(--syntax-json-string)' },
          '.cm-json-boolean': { color: 'var(--syntax-json-boolean)' },
          '.cm-json-number': { color: 'var(--syntax-json-number)' },
          '.cm-json-punctuation': { color: 'var(--syntax-json-punctuation)' },
          '.cm-json-invalid': {
            color: 'var(--syntax-json-invalid)',
            textDecoration: 'underline wavy var(--syntax-json-invalid)',
            textUnderlineOffset: '2px',
          },
        }),
      ],
    }),
  });
  find = makeJsonFindController(() => view);
  return {
    view,
    find,
    setReadOnly: (next) => view.dispatch({ effects: readOnly.reconfigure([
      EditorState.readOnly.of(next), EditorView.editable.of(!next),
    ]) }),
    replaceFromDisk: (next) => {
      // CodeMirror stores documents LF-normalized, so compare and insert in
      // that space — raw CRLF disk content would never equal doc.toString()
      // and every clean save would trigger a spurious whole-document replace.
      const normalized = toJsonEditorText(next);
      if (view.state.doc.toString() === normalized) return;
      applyingExternal = true;
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: normalized } }); }
      finally { applyingExternal = false; }
    },
    destroy: () => view.destroy(),
  };
}

/** A raw JSON source surface. JSON validity never gates opening or saving. */
export function JsonDocument({ tabId, content, readOnly, active }: {
  tabId: string;
  content: string;
  readOnly: boolean;
  active: boolean;
}) {
  const { activeTab } = useWorkspace();
  const { actions, dispatch } = useAppActions();
  const registerFindController = actions.registerFindController;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<JsonEditorSession | null>(null);
  const initialAnalysis = useMemo(() => analyzeJsonSource(content), [tabId]);
  const retained = retainedJsonSessions.get(tabId);
  const [source, setSource] = useState(content);
  const [viewMode, setViewModeState] = useState<'tree' | 'source'>(retained?.viewMode ?? (initialAnalysis.available ? 'tree' : 'source'));
  const [treeSession, setTreeSession] = useState<JsonTreeSessionState>(() => retained?.tree ?? {
    expanded: new Set(['$']), selectedPath: '$', search: '', searchOptions: { wholeWord: false, caseSensitive: false },
  });
  const analysis = useMemo(() => analyzeJsonSource(source), [source]);
  const sourceRef = useRef(source);
  const lineEndingRef = useRef(jsonLineEndingFor(content));
  const treeSessionRef = useRef(treeSession);
  sourceRef.current = source;
  treeSessionRef.current = treeSession;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const session = createJsonEditor(host, {
      content,
      readOnly,
      onUserChange: actions.scheduleSave,
      onContentChange: (next) => setSource(fromJsonEditorText(next, lineEndingRef.current)),
      onFindInfo: (info) => dispatch({ type: 'FIND_SET', patch: info }),
    });
    sessionRef.current = session;
    return () => {
      if (sessionRef.current === session) sessionRef.current = null;
      actions.registerEditor(null);
      actions.registerFindController(null);
      session.destroy();
    };
    // One CodeMirror instance per tab preserves undo history and selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.setReadOnly(readOnly);
    if (!readOnly && active) {
      actions.registerEditor({
        getValue: () => fromJsonEditorText(session.view.state.doc.toString(), lineEndingRef.current),
        focus: () => session.view.focus(),
      });
    } else {
      actions.registerEditor(null);
    }
  }, [actions, active, readOnly]);

  useEffect(() => {
    if (activeTab?.dirty) return;
    lineEndingRef.current = jsonLineEndingFor(content);
    sessionRef.current?.replaceFromDisk(content);
    setSource(content);
  }, [activeTab?.dirty, content]);

  const retainSession = (tree: JsonTreeSessionState, mode: 'tree' | 'source') => {
    retainedJsonSessions.delete(tabId);
    retainedJsonSessions.set(tabId, { tree, viewMode: mode });
    while (retainedJsonSessions.size > 20) retainedJsonSessions.delete(retainedJsonSessions.keys().next().value!);
  };
  const setViewMode = (mode: 'tree' | 'source') => {
    setViewModeState(mode);
    retainSession(treeSession, mode);
  };
  const updateTreeSession = (next: JsonTreeSessionState) => {
    retainSession(next, viewMode);
    setTreeSession(next);
  };
  const treeSessionUpdaterRef = useRef(updateTreeSession);
  treeSessionUpdaterRef.current = updateTreeSession;
  const treeFindRef = useRef<FindController | null>(null);
  if (!treeFindRef.current) treeFindRef.current = makeJsonTreeFindController(
    () => sourceRef.current,
    () => treeSessionRef.current,
    (next) => treeSessionUpdaterRef.current(next),
  );
  useEffect(() => {
    if (!active) return;
    const controller = viewMode === 'tree' ? treeFindRef.current : sessionRef.current?.find;
    if (!controller) return;
    registerFindController(controller);
    return () => registerFindController(null);
  }, [registerFindController, active, viewMode]);
  const pendingHighlight = activeTab?.pendingHighlight ?? null;
  useEffect(() => {
    if (!pendingHighlight?.chunkText) return;
    if (viewMode === 'tree' && analysis.available) {
      const selectedPath = jsonTreeHighlightPath(analysis, pendingHighlight.chunkText);
      if (!selectedPath) { setViewMode('source'); return; }
      const node = matchingJsonTreeNodes(analysis.root, pendingHighlight.chunkText, { caseSensitive: true, wholeWord: false })[0];
      if (!node) return;
      const expanded = new Set(treeSession.expanded);
      for (let length = 0; length < node.path.length; length++) expanded.add(formatPath(node.path.slice(0, length)));
      updateTreeSession({ ...treeSession, selectedPath, expanded });
      actions.consumePendingHighlight();
      return;
    }
    const view = sessionRef.current?.view;
    if (!view) return;
    const from = view.state.doc.toString().indexOf(pendingHighlight.chunkText);
    if (from < 0) return;
    selectMatch(view, from, from + pendingHighlight.chunkText.length);
    actions.consumePendingHighlight();
  }, [actions, analysis, pendingHighlight, viewMode]);
  const applyTreeSource = (next: string) => {
    const view = sessionRef.current?.view;
    if (!view || next === source) return;
    const current = view.state.doc.toString();
    const editorText = toJsonEditorText(next);
    let from = 0;
    while (from < current.length && from < editorText.length && current[from] === editorText[from]) from++;
    let currentTo = current.length;
    let nextTo = editorText.length;
    while (currentTo > from && nextTo > from && current[currentTo - 1] === editorText[nextTo - 1]) { currentTo--; nextTo--; }
    view.dispatch({ changes: { from, to: currentTo, insert: editorText.slice(from, nextTo) } });
  };

  return <div className="json-document min-h-0 overflow-hidden" data-tab-id={tabId} role="region" aria-label="JSON document" hidden={!active}>
    <div className="json-view-mode" role="group" aria-label="JSON view mode">
      <button type="button" aria-pressed={viewMode === 'tree'} disabled={!analysis.available} title={analysis.available ? 'Inspect JSON as a tree' : analysis.message} onClick={() => setViewMode('tree')}>Tree</button>
      <button type="button" aria-pressed={viewMode === 'source'} onClick={() => setViewMode('source')}>Source</button>
      {!analysis.available && <span role="status">{analysis.message}</span>}
    </div>
    <div ref={hostRef} className="json-source" hidden={viewMode !== 'source'} />
    {viewMode === 'tree' && analysis.available && <Suspense fallback={<div className="json-tree-loading" role="status">Building JSON tree…</div>}>
      <LazyJsonTreeView source={source} editable={!readOnly} session={treeSession} onSessionChange={updateTreeSession} onSourceChange={applyTreeSource} onRequestSource={() => setViewMode('source')} />
    </Suspense>}
  </div>;
}

export function jsonTreeHighlightPath(analysis: ReturnType<typeof analyzeJsonSource>, chunkText: string): string | null {
  if (!analysis.available || !chunkText) return null;
  const node = matchingJsonTreeNodes(analysis.root, chunkText, { caseSensitive: true, wholeWord: false })[0];
  return node ? formatPath(node.path) : null;
}

export function makeJsonTreeFindController(
  getSource: () => string,
  getSession: () => JsonTreeSessionState,
  setSession: (session: JsonTreeSessionState) => void,
): FindController {
  let matches: string[] = [];
  let current = -1;
  let query = '';
  let options: FindOptions = { wholeWord: false, caseSensitive: false };
  const info = (): MatchInfo => ({ current: current < 0 ? 0 : current + 1, total: matches.length });
  const collect = () => {
    const analysis = analyzeJsonSource(getSource());
    if (!analysis.available || !query) { matches = []; current = -1; return; }
    matches = matchingJsonTreeNodes(analysis.root, query, options).map((node) => formatPath(node.path));
    if (!matches.length) current = -1;
    else if (current < 0 || current >= matches.length) current = 0;
  };
  const select = () => {
    if (current < 0) return;
    const session = getSession();
    const path = matches[current];
    const expanded = new Set(session.expanded);
    const analysis = analyzeJsonSource(getSource());
    if (analysis.available) {
      const node = matchingJsonTreeNodes(analysis.root, query, options).find((candidate) => formatPath(candidate.path) === path);
      if (node) for (let length = 0; length < node.path.length; length++) expanded.add(formatPath(node.path.slice(0, length)));
    }
    setSession({ ...session, search: query, searchOptions: options, selectedPath: path, expanded });
  };
  const setQuery = (next: string, nextOptions: FindOptions) => {
    query = next; options = nextOptions; current = -1; collect(); select(); return info();
  };
  const move = (delta: number) => { collect(); if (matches.length) { current = (current + delta + matches.length) % matches.length; select(); } return info(); };
  return { setQuery, restoreQuery: setQuery, next: () => move(1), prev: () => move(-1), close: () => { matches = []; current = -1; query = ''; setSession({ ...getSession(), search: '' }); } };
}

export function makeJsonFindController(getView: () => EditorView | null): LiveFindController {
  let matches: Array<{ from: number; to: number }> = [];
  let current = -1;
  let query = '';
  let options: FindOptions = { wholeWord: false, caseSensitive: false };

  const info = (): MatchInfo => ({ current: matches.length ? current + 1 : 0, total: matches.length });
  const move = (delta: number): MatchInfo => {
    const view = getView();
    if (!view || matches.length === 0) return info();
    current = (current + delta + matches.length) % matches.length;
    selectMatch(view, matches[current].from, matches[current].to);
    return info();
  };
  const setQuery = (nextQuery: string, opts: FindOptions): MatchInfo => {
    query = nextQuery;
    options = opts;
    const view = getView();
    matches = view ? textMatches(view.state.doc.toString(), query, opts) : [];
    current = matches.length ? 0 : -1;
    if (view && current >= 0) selectMatch(view, matches[current].from, matches[current].to);
    return info();
  };
  const refresh = (): MatchInfo => {
    const view = getView();
    if (!view) { matches = []; current = -1; return info(); }
    const cursor = view.state.selection.main.from;
    matches = textMatches(view.state.doc.toString(), query, options);
    if (matches.length === 0) current = -1;
    else {
      const atOrAfterCursor = matches.findIndex((match) => match.from >= cursor);
      current = atOrAfterCursor >= 0 ? atOrAfterCursor : 0;
    }
    // Do not dispatch a selection here: refresh runs after a user edit and
    // must not steal the typing cursor. Explicit next/previous navigation
    // selects from these freshly computed offsets.
    return info();
  };
  return {
    setQuery,
    restoreQuery: setQuery,
    next: () => move(1),
    prev: () => move(-1),
    close: () => { matches = []; current = -1; },
    refresh,
  };
}

export function textMatches(text: string, query: string, opts: FindOptions): Array<{ from: number; to: number }> {
  if (!query) return [];
  const haystack = opts.caseSensitive ? text : text.toLocaleLowerCase();
  const needle = opts.caseSensitive ? query : query.toLocaleLowerCase();
  const out: Array<{ from: number; to: number }> = [];
  for (let from = 0; from <= haystack.length - needle.length;) {
    const hit = haystack.indexOf(needle, from);
    if (hit < 0) break;
    const end = hit + needle.length;
    if (!opts.wholeWord || (isBoundary(text, hit - 1) && isBoundary(text, end))) out.push({ from: hit, to: end });
    from = Math.max(end, hit + 1);
  }
  return out;
}

function isBoundary(text: string, index: number): boolean {
  return index < 0 || index >= text.length || !/[\p{L}\p{N}_]/u.test(text[index]);
}

function selectMatch(view: EditorView, from: number, to: number): void {
  if (from < 0 || to < from || to > view.state.doc.length) return;
  view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
}
