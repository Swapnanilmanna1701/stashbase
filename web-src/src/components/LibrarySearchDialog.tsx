import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { api, errorMessage, type KeywordMatch, type LibraryKeywordFile } from '../api';
import type { PendingHighlight } from '../store/state';
import { useApp } from '../store/AppContext';
import { openSettings } from './SettingsModal';
import { plainSnippetText, searchSnippetText } from '../lib/searchSnippet';
import { folderRefsEqual } from '../folderPath';
import {
  applyLibrarySearchPrefill,
  folderBasename,
  orderKeywordFiles,
  readLibrarySearchMemory,
  resolveSemanticHits,
  writeLibrarySearchMemory,
  type LibrarySearchMode,
  type LibrarySearchPrefill,
  type LibrarySearchScope,
  type LibrarySemanticHit,
} from '../librarySearch';
import {
  Menu, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuTrigger,
} from './ui/menu';
import { Button } from './ui/button';
import { SegmentedControl, SegmentedControlItem } from './ui/segmented-control';
import { StatusMessage } from './ui/status';
import { CheckIcon, ChevronDownIcon } from '../icons';
import { cn } from '../lib/utils';
import {
  menuSectionClass, optActiveClass, pillChevronClass, pillClass,
} from './agent/panelStyles';
import { folderMenuEntries } from './agent/folderState';
import { ScopeMenu } from './ScopeMenu';
import { FileTypeIcon } from './FileTree';
import {
  AUDIO_SOURCE_EXTENSIONS, DOCX_EXTENSIONS, HTML_NOTE_EXTENSIONS,
  IMAGE_SOURCE_EXTENSIONS, PDF_EXTENSIONS,
} from '../../../shared/file-formats.ts';
import { SemanticIndexingNotice } from './SemanticIndexingNotice';
import { PICKER_VEIL_CLASS, pickerPanelClass } from './pickerChrome';

/**
 * The library search popup — the app's one search surface. A palette-style
 * modal (Quick Open chrome) over the WHOLE library by default, narrowable to
 * any one library folder through the shared `ScopeMenu` — the same picker,
 * folder list, and rows the chat composer binds a session with. Query, mode,
 * toggles, scope, and results live in module memory (`librarySearch.ts`),
 * never in the reducer, so the popup survives close/reopen and folder
 * switches.
 *
 * Opening a result NEVER switches the window's folder: a hit in the active
 * folder opens normally; a hit in another member folder opens as an
 * out-of-folder read-only tab (`actions.openLibraryFile`), which carries its
 * own "open that folder in a new window" affordance in the document banner.
 * Only from the no-folder workspace does a pick bind the folder — there is
 * no context to preserve there.
 */

const HIT_LIST_CLASS = 'px-1.5 py-1';

/** Search-mode segments: the primitive's chunky pressed treatment (bold +
 *  raised shadow) turned down to a quiet swap of surface and colour. */
const SEARCH_MODE_SEGMENT_CLASS =
  'px-2 py-0.5 text-xs font-normal data-pressed:font-normal data-pressed:shadow-none';

/** Sentinel kept out of user-facing copy: rendering special-cases the
 *  missing-embedding-key state instead of showing a raw error line. */
const EMBEDDER_KEY_ERROR = 'embedder-key-required';

/** Also the display cap: every fetched hit is listed, strongest first,
 *  so this bounds the list itself rather than an initial slice. */
const SEMANTIC_SEARCH_CANDIDATES = 30;

type ResultEntry =
  | { kind: 'semantic'; hit: LibrarySemanticHit }
  | { kind: 'file'; file: LibraryKeywordFile }
  | { kind: 'match'; file: LibraryKeywordFile; match: KeywordMatch };

interface RowProps {
  id: string;
  role: 'option';
  'aria-selected': boolean;
  onMouseMove: () => void;
  onMouseDown: (event: ReactMouseEvent) => void;
}

/** Collect ranked results under their folder WITHOUT resorting them: a
 *  folder's group lands where its first (strongest) member would have, and
 *  members keep the order they arrived in. `index` is filled by the caller
 *  as it pushes keyboard entries, so nav order always matches render
 *  order. */
function groupByFolder<T>(items: readonly T[], folderOf: (item: T) => string) {
  const groups: { folder: string; rows: { item: T; index: number }[] }[] = [];
  const byFolder = new Map<string, (typeof groups)[number]>();
  for (const item of items) {
    const folder = folderOf(item);
    let group = byFolder.get(folder);
    if (!group) {
      group = { folder, rows: [] };
      byFolder.set(folder, group);
      groups.push(group);
    }
    group.rows.push({ item, index: -1 });
  }
  return groups;
}

/** Folder band above each group — the quiet section-strip treatment the
 *  sidebar uses, so "this run of results lives here" reads as structure
 *  rather than as another result. */
const FOLDER_HEADER_CLASS =
  'sticky top-0 z-1 -mx-1.5 bg-card/95 px-4 pt-2 pb-1 text-xs font-medium text-muted-foreground backdrop-blur-sm';

export default function LibrarySearchDialog({ prefill, onClose }: {
  prefill?: LibrarySearchPrefill | null;
  onClose: () => void;
}) {
  const { state, actions, dispatch } = useApp();
  const initial = useRef(applyLibrarySearchPrefill(readLibrarySearchMemory(), prefill)).current;
  const [query, setQuery] = useState(initial.query);
  const [mode, setMode] = useState<LibrarySearchMode>(initial.mode);
  const [scope, setScope] = useState<LibrarySearchScope>(initial.scope);
  const [semanticHits, setSemanticHits] = useState(initial.semanticHits);
  const [keywordResult, setKeywordResult] = useState(initial.keywordResult);
  const [error, setError] = useState(initial.error);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const folderPathRef = useRef(state.folderPath);
  folderPathRef.current = state.folderPath;
  const folderRootsRef = useRef<string[]>([]);
  folderRootsRef.current = useMemo(() => {
    const roots = state.recent.map((entry) => entry.path);
    if (state.folderPath && !roots.some((root) => folderRefsEqual(root, state.folderPath))) {
      roots.push(state.folderPath);
    }
    return roots;
  }, [state.recent, state.folderPath]);
  const hasLibrary = folderRootsRef.current.length > 0;

  // Every state change lands in module memory so close/reopen — and any
  // folder switch while the popup is away — restore it exactly.
  useEffect(() => {
    writeLibrarySearchMemory({ query, mode, scope, semanticHits, keywordResult, error });
  }, [query, mode, scope, semanticHits, keywordResult, error]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, []);

  interface RunOpts {
    query: string;
    mode: LibrarySearchMode;
    scope: LibrarySearchScope;
  }

  const runSearch = useCallback(async (opts: RunOpts) => {
    const myGen = ++generation.current;
    const q = opts.query.trim();
    if (!q) {
      setSemanticHits(null);
      setKeywordResult(null);
      setError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const stale = () => myGen !== generation.current;
    // A folder scope names its folder outright, so it needs no reference
    // to the window's current folder and survives a switch untouched.
    const folderScope = opts.scope.kind === 'folder' ? { folder: opts.scope.path } : {};
    try {
      if (opts.mode === 'keyword') {
        // Exact search is plain, case-insensitive substring matching:
        // the popup offers no case/whole-word latches, so it must never
        // send options the user cannot see or unset.
        const result = await api.libraryKeywordSearch(q, folderScope);
        if (stale()) return;
        setKeywordResult(result);
        setSemanticHits(null);
        setError(null);
      } else {
        const embedder = await api.getEmbedder();
        if (stale()) return;
        dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: embedder.hasKey });
        if (!embedder.hasKey) {
          setError(EMBEDDER_KEY_ERROR);
          setSemanticHits(null);
          setSearching(false);
          return;
        }
        const { hits } = await api.librarySearch(q, SEMANTIC_SEARCH_CANDIDATES, folderScope);
        if (stale()) return;
        const resolved = resolveSemanticHits(hits, folderRootsRef.current);
        setSemanticHits(resolved);
        setKeywordResult(null);
        setError(null);
      }
      setSearching(false);
    } catch (err) {
      if (stale()) return;
      const message = errorMessage(err);
      console.warn(`[library-search:${opts.mode}] failed:`, message);
      setError(message);
      setSearching(false);
    }
  }, [dispatch]);

  // Keep results fresh against current content: fires on mount (a reopened
  // popup silently refreshes its remembered results) and whenever a note
  // lands or a conversion finishes while the popup stays open. Old results
  // stay visible until the fresh response arrives, so this never flashes.
  useEffect(() => {
    if (query.trim()) void runSearch({ query, mode, scope });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.files, state.pendingConversions]);

  /** Cancel a pending keystroke debounce — every immediate run must win
   *  over it, or the debounce would later re-run with stale options. */
  function cancelDebounce() {
    if (debounce.current) {
      clearTimeout(debounce.current);
      debounce.current = null;
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setActive(0);
    cancelDebounce();
    if (!value.trim()) {
      void runSearch({ query: '', mode, scope });
      return;
    }
    debounce.current = setTimeout(() => {
      debounce.current = null;
      void runSearch({ query: value, mode, scope });
    }, 250);
  }

  function rerun(next: Partial<RunOpts>) {
    cancelDebounce();
    if (query.trim()) void runSearch({ query, mode, scope, ...next });
  }

  function setSearchMode(next: LibrarySearchMode) {
    setMode(next);
    setActive(0);
    rerun({ mode: next });
  }

  function setSearchScope(next: LibrarySearchScope) {
    setScope(next);
    setActive(0);
    rerun({ scope: next });
  }

  const activeFolderPath = state.folderPath;
  const librarySpansFolders = folderRootsRef.current.length > 1;

  // One flat entry list drives keyboard navigation, aria ids, and click
  // handling; the render below walks the same structures in the same order.
  const { entries, semanticView, keywordGroups } = useMemo(() => {
    const entries: ResultEntry[] = [];
    if (mode === 'semantic' && semanticHits) {
      // Every fetched hit is listed — the fetch cap is the only limit, so
      // the list needs no disclosure control — collected under its folder.
      // Grouping keeps a folder's hits in ONE place instead of scattering
      // them down the list, and relevance still drives both levels: a
      // group sits where its strongest hit would have, and hits stay in
      // rank order inside it.
      const groups = groupByFolder(semanticHits, (hit) => hit.folder);
      for (const group of groups) {
        for (const row of group.rows) {
          entries.push({ kind: 'semantic', hit: row.item });
          row.index = entries.length - 1;
        }
      }
      return {
        entries,
        semanticView: { groups, total: semanticHits.length },
        keywordGroups: [],
      };
    }
    if (mode === 'keyword' && keywordResult) {
      // Same folder grouping over the file groups: active-folder files
      // lead (orderKeywordFiles), so their folder leads too.
      const groups = groupByFolder(
        orderKeywordFiles(keywordResult.files, activeFolderPath),
        (file) => file.folder,
      ).map((group) => ({
        folder: group.folder,
        files: group.rows.map(({ item: file }) => {
          entries.push({ kind: 'file', file });
          const fileIndex = entries.length - 1;
          const matches = file.matches.map((match) => {
            entries.push({ kind: 'match', file, match });
            return { match, index: entries.length - 1 };
          });
          return { file, index: fileIndex, matches, hiddenCount: file.totalMatches - file.matches.length };
        }),
      }));
      return { entries, semanticView: null, keywordGroups: groups };
    }
    return { entries, semanticView: null, keywordGroups: [] };
  }, [mode, semanticHits, keywordResult, activeFolderPath]);

  useEffect(() => {
    if (active >= entries.length) setActive(Math.max(0, entries.length - 1));
  }, [active, entries.length]);

  useEffect(() => {
    document.getElementById(`library-search-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = onClose;

  /** Open one result WITHOUT switching the window's folder: same-folder
   *  hits go through normal selection, cross-folder hits open an
   *  out-of-folder read-only tab. Only the no-folder workspace binds the
   *  folder first — there is no context to preserve there. */
  function openTarget(folder: string, rel: string, hit: PendingHighlight) {
    close();
    const current = folderPathRef.current;
    if (!current) {
      void actions.openFolder(folder)
        .then(() => {
          // A superseding open may have won the race — never select into
          // whatever folder happens to be current now.
          if (!folderRefsEqual(folderPathRef.current, folder)) return;
          return actions.selectFileWithHighlight(rel, hit).then(() => revealAncestors(rel));
        })
        .catch((err: unknown) => {
          actions.toast(`Could not open ${folderBasename(folder)}: ${errorMessage(err)}`, { level: 'error' });
        });
      return;
    }
    const sameFolder = folderRefsEqual(folder, current);
    void actions.openLibraryFile(folder, rel, { hit }).then(() => {
      if (sameFolder) revealAncestors(rel);
    });
  }

  /** The tree keeps ancestors collapsed after switches; expand the opened
   *  file's chain so its selected row is actually visible. Active-folder
   *  targets only — the tree does not show other folders. */
  function revealAncestors(rel: string) {
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) {
      dispatch({ type: 'EXPAND_FOLDER', path: parts.slice(0, i).join('/') });
    }
  }

  function keywordHighlight(match: KeywordMatch | undefined): PendingHighlight {
    return {
      startLine: match?.line,
      chunkText: query.trim(),
      audioSeekText: match?.text,
      audioSeekMs: match?.audioTimestampMs,
      openFindBar: true,
      pdfPage: match?.pdfPage,
    };
  }

  function activateEntry(entry: ResultEntry) {
    switch (entry.kind) {
      case 'semantic':
        openTarget(entry.hit.folder, entry.hit.rel, {
          startLine: entry.hit.startLine,
          endLine: entry.hit.endLine,
          chunkText: entry.hit.content,
          pdfPage: entry.hit.pdfPage,
        });
        break;
      case 'file':
        openTarget(entry.file.folder, entry.file.path, keywordHighlight(entry.file.matches[0]));
        break;
      case 'match':
        openTarget(entry.file.folder, entry.file.path, keywordHighlight(entry.match));
        break;
    }
  }

  const rowProps = (index: number): RowProps => ({
    id: `library-search-${index}`,
    role: 'option',
    'aria-selected': index === active,
    onMouseMove: () => setActive(index),
    onMouseDown: (event) => {
      event.preventDefault();
      activateEntry(entries[index]);
    },
  });

  const isKeyword = mode === 'keyword';
  const trimmedQuery = query.trim();
  // Same membership list, order, and "ensure the window folder" rule the
  // composer's picker uses — the two menus must offer the same folders.
  const folderEntries = folderMenuEntries(state.recent, state.folderPath);

  return (
    <div
      className={`library-search-veil quick-open-blocking ${PICKER_VEIL_CLASS}`}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
      // Escape must dismiss from ANY focus inside the popup — the mode
      // toggles, scope pill, and banner buttons are all focusable.
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {/* FIXED height, not a content cap: results stream in and change
        * count as the user types, and a panel that resizes under the
        * pointer makes the list impossible to aim at. The list scrolls
        * inside instead. */}
      <div className={cn(pickerPanelClass('wide'), 'flex h-[min(480px,calc(100vh-64px))] flex-col')} role="dialog" aria-modal="true" aria-label="Search library">
        {/* Query and the two search settings share ONE row: the settings
          * belong to the query being typed, and a separate toolbar band
          * under the field spent a whole row on two short controls. The
          * result tally is gone with it — the list itself already shows
          * how much came back, and a live count next to the caret is
          * movement the eye must ignore on every keystroke. */}
        <div className="flex items-center gap-1 border-b border-border pr-3">
          <input
            ref={inputRef}
            /* Placeholder at 55% of muted: at this 20px size a full-strength
               muted line reads as typed text and the empty popup looks
               pre-filled. */
            className="min-w-0 flex-1 border-0 bg-transparent px-3.75 py-3.25 [font-family:inherit] text-xl text-foreground outline-0 placeholder:text-placeholder"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="library-search-results"
            aria-expanded="true"
            aria-activedescendant={entries.length ? `library-search-${active}` : undefined}
            /* Names the live scope rather than listing formats: the old
               "notes, PDFs, images, and media transcripts" taught coverage
               once and then sat there as a long line the user re-read on
               every open. */
            placeholder={scope.kind === 'folder'
              ? `Search in ${folderBasename(scope.path)}`
              : 'Search in library'}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, Math.max(0, entries.length - 1))); }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
              else if (event.key === 'Home' && !query) { event.preventDefault(); setActive(0); }
              else if (event.key === 'End' && !query) { event.preventDefault(); setActive(Math.max(0, entries.length - 1)); }
              else if (event.key === 'Enter' && entries[active]) { event.preventDefault(); activateEntry(entries[active]); }
            }}
          />
          {/* Where it looks, then how it matches. Mode is a two-segment
            * control, not a single state-showing button: one button had
            * to answer "is this label what I AM or what I'd BECOME?" in
            * its copy, and no wording settles that. Both options visible,
            * one pressed, question gone. */}
          <ScopeMenu
            scope={scope}
            entries={folderEntries}
            homeDir={state.homeDir ?? ''}
            heading="Search scope"
            libraryDetail="Search every folder in your library"
            side="bottom"
            ariaLabel="Search scope"
            onSetScope={setSearchScope}
          />
          {/* Lighter than the Settings pickers this primitive was built
            * for: no outer border, a quiet track, and the pressed segment
            * keeps NORMAL weight — bold-on-white beside a 20px query line
            * read as the loudest thing in the popup. Surface and colour
            * carry the selection instead. */}
          <SegmentedControl aria-label="Search mode" className="border-0 bg-muted/70 p-0.5" value={[mode]} onValueChange={(next) => {
            const picked = next[0] as LibrarySearchMode | undefined;
            if (picked && picked !== mode) setSearchMode(picked);
          }}>
            <SegmentedControlItem
              value="semantic"
              className={SEARCH_MODE_SEGMENT_CLASS}
              title={state.embedderHasKey === false
                ? 'Match by meaning — needs AI Index'
                : 'Match by meaning'}
            >
              Similar
            </SegmentedControlItem>
            <SegmentedControlItem value="keyword" className={SEARCH_MODE_SEGMENT_CLASS} title="Match exact text">
              Exact
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
        <SemanticIndexingNotice />
        <SearchStatusBanner semanticMode={!isKeyword} onNavigateAway={close} />
        <div id="library-search-results" role="listbox" aria-label="Search results" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {!hasLibrary ? (
            <div className="empty-list">
              <div>Your library has no folders yet.</div>
              <div>Add a folder from the sidebar to make it searchable.</div>
            </div>
          ) : !trimmedQuery ? (
            /* Nothing typed, nothing to say: the placeholder and the scope
             * pill on the row above already name where a search will look,
             * and a third line repeating it was the only thing in an
             * otherwise empty panel. */
            null
          ) : error === EMBEDDER_KEY_ERROR || (error && error.startsWith('AI Index is disabled')) ? (
            <div className="empty-list">
              <div>Set up AI Index to search by meaning.</div>
              <div>Exact text search works without AI Index.</div>
            </div>
          ) : error ? (
            <div className="empty-list">Search failed: {error}</div>
          ) : isKeyword ? (
            searching && !keywordResult ? (
              <div className="empty-list">Searching…</div>
            ) : !keywordResult || keywordResult.files.length === 0 ? (
              <div className="empty-list">No matches</div>
            ) : (
              <div className={HIT_LIST_CLASS}>
                {keywordGroups.map((folderGroup) => (
                  <div key={folderGroup.folder}>
                    {librarySpansFolders && (
                      <div className={FOLDER_HEADER_CLASS}>{folderBasename(folderGroup.folder)}</div>
                    )}
                    {folderGroup.files.map((group) => (
                      <div className="mb-1.5" key={`${group.file.folder}::${group.file.path}`}>
                        <div
                          className={cn(
                            'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 hover:bg-muted',
                            group.index === active && 'bg-muted',
                          )}
                          title={`${group.file.folder}/${group.file.path}`}
                          {...rowProps(group.index)}
                        >
                          {/* Same identity line as the semantic rows —
                            * the folder now lives in the band above, so
                            * only the match count keeps the right edge. */}
                          <span className="inline-flex size-4 flex-none items-center justify-center [&_svg]:size-3.5">
                            <FileTypeIcon format={searchHitFormat(group.file.path)} />
                          </span>
                          <span className="min-w-0 truncate text-base font-medium text-foreground">
                            {group.file.path.split('/').pop() ?? group.file.path}
                          </span>
                          <span className="ml-auto min-w-4 shrink-0 rounded-lg bg-muted px-1.25 text-center text-2xs leading-4 text-muted-foreground">{group.file.totalMatches}</span>
                        </div>
                        {group.matches.map(({ match, index }) => (
                          <div
                            key={`${match.line}#${index}`}
                            className={cn(
                              'flex cursor-pointer items-baseline gap-2 rounded-sm py-0.5 pr-2.5 pl-4 text-sm leading-normal hover:bg-muted',
                              index === active && 'bg-muted',
                            )}
                            title={`Line ${match.line}`}
                            {...rowProps(index)}
                          >
                            <span className="min-w-6.5 shrink-0 text-right text-muted-foreground tabular-nums select-none">{match.line}</span>
                            <span className="min-w-0 flex-1 truncate text-foreground [&_mark]:rounded-xs [&_mark]:bg-accent-amber/30 [&_mark]:px-px [&_mark]:text-inherit">
                              {highlightRanges(match.text, match.ranges)}
                            </span>
                          </div>
                        ))}
                        {group.hiddenCount > 0 && (
                          <div className="cursor-default py-0.5 pr-2.5 pl-4 text-xs text-muted-foreground">+ {group.hiddenCount} more in this file</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          ) : searching && !semanticHits ? (
            <div className="empty-list">Searching…</div>
          ) : !semanticView || semanticView.total === 0 ? (
            <div className="empty-list">No matches</div>
          ) : (
            <div className={HIT_LIST_CLASS}>
              {semanticView.groups.map((group) => (
                <div key={group.folder}>
                  {librarySpansFolders && (
                    <div className={FOLDER_HEADER_CLASS}>{folderBasename(group.folder)}</div>
                  )}
                  {group.rows.map(({ item: hit, index }) => (
                    <SemanticHitRow
                      key={`${hit.fileName}#${hit.chunkIndex}#${index}`}
                      hit={hit}
                      isActive={index === active}
                      rowProps={rowProps(index)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The file-tree glyph for a hit, chosen from its extension — the search
 *  list and the tree name the same file with the same mark. Anything the
 *  viewer cannot classify falls back to the Markdown note glyph, which is
 *  what the index overwhelmingly holds. */
function searchHitFormat(name: string): 'md' | 'html' | 'pdf' | 'image' | 'docx' | 'audio' {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (PDF_EXTENSIONS.includes(ext as never)) return 'pdf';
  if (HTML_NOTE_EXTENSIONS.includes(ext as never)) return 'html';
  if (IMAGE_SOURCE_EXTENSIONS.includes(ext as never)) return 'image';
  if (DOCX_EXTENSIONS.includes(ext as never)) return 'docx';
  if (AUDIO_SOURCE_EXTENSIONS.includes(ext as never)) return 'audio';
  return 'md';
}

function SemanticHitRow({ hit, isActive, rowProps }: {
  hit: LibrarySemanticHit;
  isActive: boolean;
  rowProps: RowProps;
}) {
  const fileBasename = hit.rel.split('/').pop() ?? hit.rel;
  // No term highlighting on semantic snippets: a semantic hit isn't a literal
  // substring match, so marking the query words would mislead. Frontmatter
  // and Markdown syntax are stripped for DISPLAY only — `hit.content` stays
  // raw because it anchors click-through navigation.
  const snippetSource = plainSnippetText(searchSnippetText(hit.content));
  const snippet = snippetSource.length > 200 ? snippetSource.slice(0, 200) + '…' : snippetSource;
  // The heading arrives as the source line, so a `**Step 4**` heading kept
  // its asterisks — it needs the same flattening as the snippet.
  const heading = hit.heading ? plainSnippetText(hit.heading) : '';
  return (
    /* Identity first, evidence second. A row led by its snippet made every
     * result a wall of same-weight prose with the file name buried at the
     * bottom; leading with the file (strong) over a muted two-line snippet
     * gives the list one scannable left column. Selection is the sidebar's
     * quiet tinted pill — no border, which read as a stack of boxes. */
    <div
      className={cn('cursor-pointer rounded-md px-2.5 py-1.5 hover:bg-muted', isActive && 'bg-muted')}
      title={hit.fileName}
      {...rowProps}
    >
      {/* Identity line: the file, then where inside it the hit sits —
        * pushed to the right edge, because "Page 53" / a section title is
        * a locator, not part of the name. Trailing it keeps the file
        * names flush left as one scannable column. The FOLDER is not
        * repeated here: it heads the group this row sits in. */}
      <div className="flex items-baseline gap-2">
        <span className="inline-flex size-4 flex-none translate-y-0.5 items-center justify-center [&_svg]:size-3.5">
          <FileTypeIcon format={searchHitFormat(fileBasename)} />
        </span>
        <span className="min-w-0 truncate text-base font-medium text-foreground">{fileBasename}</span>
        {heading && (
          <span className="ml-auto max-w-[45%] flex-none truncate text-xs text-muted-foreground">{heading}</span>
        )}
      </div>
      {/* No match-strength bar: hybrid scores carry no absolute meaning,
        * so a per-hit gauge invited comparisons it could not support.
        * Rank order alone communicates relative strength. */}
      <div className="mt-0.5 line-clamp-2 pl-5.5 text-sm text-muted-foreground">{snippet}</div>
    </div>
  );
}

/** One readiness/problem banner: title + detail copy on the left, optional
 *  compact actions on the right, on the status token ramp. */
function SearchBanner({ tone, title, detail, actions }: {
  tone: 'warning' | 'info';
  title: ReactNode;
  detail: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <StatusMessage tone={tone} className="mx-3 mb-2 flex items-start justify-between gap-2.5 px-2.25 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="font-semibold">{title}</div>
        <div className="leading-snug opacity-90">{detail}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </StatusMessage>
  );
}

/** Readiness explanation for the ACTIVE folder — preparation, indexing, and
 *  failure counts come from the folder-scoped status poll. Other folders'
 *  readiness is not reported here (no library-wide status surface yet).
 *  `onNavigateAway` closes the popup before opening Settings — the Settings
 *  dialog stacks BELOW the picker veil. */
function SearchStatusBanner({ semanticMode, onNavigateAway }: {
  semanticMode: boolean;
  onNavigateAway: () => void;
}) {
  const { state, actions } = useApp();
  const semanticDisabled = state.embedderHasKey === false;
  const conversionPendingCount = state.pendingConversions.length;
  const semanticPendingPaths = new Set<string>();
  for (const path of state.pendingSemanticNames) semanticPendingPaths.add(path);
  for (const path of state.pendingConversions) semanticPendingPaths.add(path);
  const semanticPendingCount = semanticPendingPaths.size;
  const pendingCount = semanticMode ? semanticPendingCount : conversionPendingCount;
  const failedCount = state.preparationFailures.filter((problem) => problem.status !== 'cancelled').length;
  const cancelledCount = state.preparationFailures.length - failedCount;
  const failureCount = failedCount + cancelledCount;
  const blockedCount = state.blockedConversions.length;
  const total = state.files.length;
  const unavailablePaths = new Set([
    ...state.pendingConversions,
    ...state.preparationFailures.map((failure) => failure.path),
    ...state.blockedConversions,
    ...(semanticMode ? [...state.pendingSemanticNames] : []),
  ]);
  const readyCount = Math.max(0, total - unavailablePaths.size);

  if (state.semanticIndexing && ['awaiting-decision', 'paused', 'partial-paused'].includes(state.semanticIndexing.state)) return null;

  if (semanticMode && state.indexWarning) {
    return (
      <SearchBanner
        tone="warning"
        title="Search needs attention"
        detail={<>Search may be incomplete: {state.indexWarning.message}</>}
        actions={
          <>
            <Button variant="outline" size="xs" onClick={() => { void actions.runSync(); }}>Retry</Button>
            <Button variant="outline" size="xs" onClick={() => { void actions.dismissIndexWarning(); }}>Dismiss</Button>
          </>
        }
      />
    );
  }

  if (failureCount > 0) {
    return (
      <SearchBanner
        tone="warning"
        title={failedCount > 0 ? 'Some files could not be prepared for search.' : 'Some file preparation was cancelled.'}
        detail={
          <>
            {[
              failedCount > 0 ? `${failedCount} failed` : '',
              cancelledCount > 0 ? `${cancelledCount} cancelled` : '',
            ].filter(Boolean).join(' · ')}. Open a file to retry it.
          </>
        }
      />
    );
  }

  if (blockedCount > 0) {
    return (
      <SearchBanner
        tone="warning"
        title="Transcription setup required"
        detail={
          <>
            {readyCount} file{readyCount === 1 ? ' is' : 's are'} ready to search. {blockedCount} media file{blockedCount === 1 ? '' : 's'} need transcription setup.
          </>
        }
        actions={
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              onNavigateAway();
              openSettings('transcription');
            }}
          >
            Open Settings
          </Button>
        }
      />
    );
  }

  if (semanticMode && semanticDisabled) return null;

  if (pendingCount > 0) {
    const readyLabel = `${readyCount} file${readyCount === 1 ? '' : 's'} ${readyCount === 1 ? 'is' : 'are'} ready to search.`;
    const pendingLabel = semanticMode
      ? `${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} still being prepared.`
      : `${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} still being converted.`;
    return (
      <SearchBanner
        tone="info"
        title={semanticMode ? 'Making files searchable' : 'Preparing text for exact search'}
        detail={<>{readyLabel} {pendingLabel}</>}
      />
    );
  }

  return null;
}

function highlightRanges(text: string, ranges: Array<[number, number]>) {
  if (ranges.length === 0) return <span>{text}</span>;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push(<span key={`g${cursor}`}>{text.slice(cursor, start)}</span>);
    parts.push(<mark key={`m${start}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) parts.push(<span key={`g${cursor}`}>{text.slice(cursor)}</span>);
  return <>{parts}</>;
}
