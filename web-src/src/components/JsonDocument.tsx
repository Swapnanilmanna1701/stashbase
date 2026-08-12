import { json } from '@codemirror/lang-json';
import { EditorState, Compartment, type Range } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import React, { useEffect, useRef } from 'react';
import { useApp, type FindController, type FindOptions, type MatchInfo } from '../store/AppContext';

type LiveFindController = FindController & { refresh: () => MatchInfo };

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
          '.cm-gutters': { backgroundColor: 'var(--pane)', color: 'var(--muted-fg)', border: '0' },
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
      if (view.state.doc.toString() === next) return;
      applyingExternal = true;
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } }); }
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
  const { actions, activeTab, dispatch } = useApp();
  const registerFindController = actions.registerFindController;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<JsonEditorSession | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const session = createJsonEditor(host, {
      content,
      readOnly,
      onUserChange: actions.scheduleSave,
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
        getValue: () => session.view.state.doc.toString(),
        focus: () => session.view.focus(),
      });
    } else {
      actions.registerEditor(null);
    }
  }, [actions, active, readOnly]);

  useEffect(() => {
    if (activeTab?.dirty) return;
    sessionRef.current?.replaceFromDisk(content);
  }, [activeTab?.dirty, content]);

  useEffect(() => {
    if (!active) return;
    const controller = sessionRef.current?.find;
    if (!controller) return;
    registerFindController(controller);
    return () => registerFindController(null);
  }, [registerFindController, active]);

  const pendingHighlight = activeTab?.pendingHighlight ?? null;
  useEffect(() => {
    const view = sessionRef.current?.view;
    if (!pendingHighlight?.chunkText || !view) return;
    const from = view.state.doc.toString().indexOf(pendingHighlight.chunkText);
    if (from < 0) return;
    selectMatch(view, from, from + pendingHighlight.chunkText.length);
    actions.consumePendingHighlight();
  }, [actions, content, pendingHighlight]);

  return (
    <div
      ref={hostRef}
      className="json-document min-h-0 overflow-hidden"
      data-tab-id={tabId}
      role="region"
      aria-label="JSON document"
      hidden={!active}
    />
  );
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
