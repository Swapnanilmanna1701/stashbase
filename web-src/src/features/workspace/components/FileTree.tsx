import { useMemo, type MouseEvent } from 'react';
import '@/common/styles/tree.css';
import '@/features/workspace/workspace.css';
import { VIEWABLE_FILE_EXTENSION_ALTERNATION } from '@shared/file-formats';
import { BotIcon, CancelledIcon, ChevronDownIcon, ClaudeIcon, WarningIcon } from '@/common/components/icons';
import { useTreeRowDrag } from '@/features/workspace/hooks/useTreeRowDrag';
import { TreeRovingContext, useTreeRoving, useTreeRow } from '@/features/workspace/hooks/useTreeRoving';
import { buildTree, visibleNodePaths, type FolderNode, type TreeNode } from '@/features/workspace/lib/fileTreeModel';
import { basename } from '@/common/lib/paths';
import { useAppActions, useWorkspace } from '@/store/contexts/AppContext';
import { hasName } from '@/store/state/state';
import { getFileReadiness } from '@/store/lib/fileReadiness';
import { emptyStateClass } from '@/common/lib/emptyState';
import { FileTypeIcon } from '@/common/components/FileTypeIcon';
import { NewFolderInput } from '@/features/workspace/components/NewFolderInput';
import { RenameInput, useRenameTarget } from '@/features/workspace/components/RenameInput';

const VIEWABLE_EXTENSION_RE = new RegExp(`\\.(${VIEWABLE_FILE_EXTENSION_ALTERNATION})$`, 'i');

export function FileTree() {
  const state = useWorkspace();
  const root = useMemo(
    () => buildTree(state.files, state.folders, state.fileOrder),
    [state.files, state.folders, state.fileOrder],
  );
  const visiblePaths = useMemo(
    () => visibleNodePaths(root.children, state.expanded),
    [root, state.expanded],
  );
  const roving = useTreeRoving(visiblePaths, state.selectedPath);

  const inputAtRoot = state.newFolderInputOpen && state.activeFolder === '';
  if (root.children.length === 0 && !inputAtRoot) {
    const { sourceCode = 0, other = 0 } = state.unsupportedFiles || {};
    const total = sourceCode + other;
    if (total > 0) {
      return (
        <div className={emptyStateClass + ' flex-col items-center gap-1 text-center'}>
          <div className="font-semibold text-foreground">No supported files found</div>
          {/* text-xs, the ramp's meta step — the note scales with
            * --ui-scale where the old hardcoded 11px did not. */}
          <div className="text-xs leading-snug">
            StashBase found {total} file{total === 1 ? '' : 's'} in this folder, but none can currently be displayed or indexed. Nothing on disk was changed.
          </div>
        </div>
      );
    }
    return <div className={emptyStateClass}>No notes yet — click + to create one</div>;
  }
  return (
    <TreeRovingContext.Provider value={roving}>
      <div role="tree" aria-label="Files">
        {inputAtRoot && <NewFolderInput parentPath="" depth={0} />}
        <TreeNodes nodes={root.children} depth={0} parent="" />
      </div>
    </TreeRovingContext.Provider>
  );
}

function TreeNodes({ nodes, depth, parent }: { nodes: TreeNode[]; depth: number; parent: string }) {
  // Current rendered basename order for these siblings — used by
  // drop-to-reorder so it can splice the dragged name into the right
  // position. Matches what `buildTree` produced (manual order + tail).
  const siblings = nodes.map((n) => n.name);
  return (
    <>
      {nodes.map((n) =>
        n.type === 'folder' ? (
          <FolderRow
            key={n.path}
            node={n}
            depth={depth}
            parent={parent}
            siblings={siblings}
          />
        ) : (
          <FileRow
            key={n.path}
            path={n.path}
            format={n.meta.format}
            depth={depth}
            paddingLeft={depth * 14 + 26}
            parent={parent}
            siblings={siblings}
          />
        ),
      )}
    </>
  );
}

function FolderRow({
  node,
  depth,
  parent,
  siblings,
}: {
  node: FolderNode;
  depth: number;
  parent: string;
  siblings: string[];
}) {
  const state = useWorkspace();
  const { dispatch, actions } = useAppActions();
  const row = useTreeRow(node.path, parent);
  const isExpanded = hasName(state.expanded, node.path);
  const isActive = state.selectedPath === node.path;
  const renaming = useRenameTarget(node.path, 'folder');
  const { dropEdge, dragProps } = useTreeRowDrag({
    kind: 'folder',
    path: node.path,
    name: node.name,
    parent,
    siblings,
  });

  const rowClass =
    'tree-row folder' +
    (isExpanded ? '' : ' collapsed') +
    (isActive ? ' active-folder' : '') +
    (dropEdge === 'into' ? ' drop-target' : '') +
    (dropEdge === 'above' ? ' drop-edge-above' : '') +
    (dropEdge === 'below' ? ' drop-edge-below' : '');

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    dispatch({
      type: 'CTX_MENU',
      menu: { x: e.clientX, y: e.clientY, target: node.path, kind: 'folder' },
    });
  }

  return (
    <>
      <div
        ref={row.ref}
        className={rowClass}
        role="treeitem"
        aria-label={node.name}
        aria-level={depth + 1}
        aria-expanded={isExpanded}
        aria-selected={isActive}
        tabIndex={row.tabIndex}
        style={{ paddingLeft: depth * 14 + 26 }}
        data-path={node.path}
        draggable={!renaming}
        {...dragProps}
        onFocus={row.onFocus}
        onClick={() => {
          if (renaming) return;
          dispatch({ type: 'TOGGLE_FOLDER', path: node.path });
        }}
        onKeyDown={(e) => {
          if (row.moveFocus(e)) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!renaming) dispatch({ type: 'TOGGLE_FOLDER', path: node.path });
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (!isExpanded) dispatch({ type: 'TOGGLE_FOLDER', path: node.path });
            else row.focusNext();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (isExpanded) dispatch({ type: 'TOGGLE_FOLDER', path: node.path });
            else row.focusParent();
          }
        }}
        onContextMenu={onContextMenu}
      >
        <span className="chev"><ChevronDownIcon /></span>
        {renaming ? (
          <RenameInput
            initialBasename={node.name}
            ext=""
            ariaLabel={`Rename folder ${node.name}`}
            onCommit={(newName) => {
              void actions.renameFolder(node.path, newName);
            }}
            onCancel={() => dispatch({ type: 'RENAMING', renaming: null })}
          />
        ) : (
          <span className="label">{node.name}</span>
        )}
      </div>
      <div
        className={'tree-children' + (isExpanded ? '' : ' collapsed')}
        role="group"
      >
        {state.newFolderInputOpen && state.activeFolder === node.path && (
          <NewFolderInput parentPath={node.path} depth={depth + 1} />
        )}
        <TreeNodes nodes={node.children} depth={depth + 1} parent={node.path} />
      </div>
    </>
  );
}

function FileRow({
  path,
  format,
  depth,
  paddingLeft,
  parent,
  siblings,
}: {
  path: string;
  format: 'md' | 'html' | 'json' | 'pdf' | 'image' | 'docx' | 'audio';
  depth: number;
  paddingLeft: number;
  parent: string;
  siblings: string[];
}) {
  const state = useWorkspace();
  const { actions, dispatch } = useAppActions();
  const row = useTreeRow(path, parent);
  const isActive = state.selectedPath === path;
  const readiness = getFileReadiness(state, path);
  const renaming = useRenameTarget(path, 'file');

  // Names keep their extension. Three viewer formats (md / html / pdf)
  // coexist — PDF-derived notes ship as a `paper.pdf` + `paper.html` pair,
  // and collapsing both to "paper" leaves them indistinguishable. The ICP
  // is developers who already read extensions in the IDE, Finder, and git.
  const name = basename(path);
  // Named agent rules-books are tagged by their owner's logo. They are still
  // ordinary Markdown files in the tree; only the glyph changes.
  const metaIcon = agentRulesIcon(name);
  const { dropEdge, dragProps } = useTreeRowDrag({
    kind: 'file',
    path,
    name,
    parent,
    siblings,
  });

  const rowClass =
    `tree-row file format-${format}` +
    (isActive ? ' active' : '') +
    (readiness.preparationFailure ? ' preparation-failed' : '') +
    (readiness.preparationCancellation ? ' preparation-cancelled' : '') +
    (dropEdge === 'above' ? ' drop-edge-above' : '') +
    (dropEdge === 'below' ? ' drop-edge-below' : '');

  const title = readiness.preparationFailure
    ? `File preparation failed; this file may not be searchable. ${path}`
    : readiness.preparationCancellation
      ? `File preparation was cancelled; this file is not searchable until reprocessed. ${path}`
    : path;
  // Protect the extension during inline rename for every recognised
  // format — notes (md/html) *and* the binary viewer formats (pdf +
  // images). Without the binaries here, editing "photo.png" exposes the
  // whole name and a user can drop ".png", which silently breaks format
  // detection (the row vanishes) and orphans the derived OCR note.
  const extMatch = name.match(VIEWABLE_EXTENSION_RE);
  const ext = extMatch ? extMatch[0] : '';

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    dispatch({
      type: 'CTX_MENU',
      menu: { x: e.clientX, y: e.clientY, target: path, kind: 'file' },
    });
  }

  function openFile() {
    const activeTab = state.activeTab;
    // An out-of-folder tab with the same relative name is a different file.
    if (activeTab?.file?.name === path && !activeTab.file.folder) {
      dispatch({ type: 'SELECT_PATH', path });
    } else {
      void actions.selectFile(path);
    }
  }

  return (
    <div
      ref={row.ref}
      className={rowClass}
      role="treeitem"
      aria-label={name}
      aria-level={depth + 1}
      aria-selected={isActive}
      tabIndex={row.tabIndex}
      style={{ paddingLeft }}
      data-path={path}
      title={title}
      draggable={!renaming}
      {...dragProps}
      onFocus={row.onFocus}
      onClick={() => {
        if (renaming) return;
        // Single-click → open the file in its own persistent tab (or
        // focus the tab that already has it). The wasteful reload case
        // (clicking the file open in THIS tab) is handled inside
        // `selectFile` — it sees the file is already shown and just
        // re-selects the row. There is no double-click open: one click
        // always opens a lasting tab.
        openFile();
      }}
      onKeyDown={(e) => {
        if (row.moveFocus(e)) return;
        if (e.key === 'ArrowLeft') {
          if (row.focusParent()) e.preventDefault();
          return;
        }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (!renaming) openFile();
      }}
      onContextMenu={onContextMenu}
    >
      <span className="icon">{metaIcon ?? <FileTypeIcon format={format} />}</span>
      {renaming ? (
        <RenameInput
          initialBasename={ext ? name.slice(0, -ext.length) : name}
          ext={ext}
          ariaLabel={`Rename file ${name}`}
          onCommit={(newBasename) => {
            void actions.renameFile(path, newBasename);
          }}
          onCancel={() => dispatch({ type: 'RENAMING', renaming: null })}
        />
      ) : (
        <span className="label">{name}</span>
      )}
      {readiness.preparationFailure ? (
        <span
          className="preparation-status-icon preparation-failure-icon"
          aria-label="File preparation failed"
          title="File preparation failed; this file may not be searchable."
        >
          <WarningIcon />
        </span>
      ) : readiness.preparationCancellation ? (
        <span
          className="preparation-status-icon preparation-cancelled-icon"
          aria-label="File preparation cancelled"
          title="File preparation was cancelled. Reprocess it when you want searchable text."
        >
          <CancelledIcon />
        </span>
      ) : null}
    </div>
  );
}

function agentRulesIcon(basename: string) {
  const normalized = basename.toLowerCase();
  // The Claude mark keeps its baked-in brand coral. It is now the only
  // coloured glyph in the tree — the format icons went muted — but it is a
  // LOGO, not a state or a category, and CLAUDE.md appears at most once per
  // folder, so it stays inside the one-small-moment colour budget rather
  // than becoming a hue-per-row.
  // AGENTS.md stays muted — its bot represents a vendor-neutral contract.
  if (normalized === 'claude.md') return <ClaudeIcon />;
  if (normalized === 'agents.md') return <BotIcon className="agent-rules-icon" />;
  return null;
}
