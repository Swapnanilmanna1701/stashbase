/**
 * Session-history popover for one history scope: the active folder's
 * header row lists that folder's sessions, and the New Chat row lists
 * ALL sessions across the library (each row labeled with its home and
 * resumed in its own scope). The menu merges BOTH agents' sessions
 * (newest first, each row carrying its agent's glyph — the New Chat
 * row's agent label is only the default for NEW chats, never a history
 * filter); rename/delete route through the row's agent and scope, and
 * resume hands off through the store's pending-resume channel (see
 * `sessionHistory.ts`).
 *
 * The sidebar owns the clock trigger and lazy-mounts this component at
 * the interaction boundary (react-aria stays out of the initial renderer
 * chunk), so the popover is standalone: `triggerRef` anchors it and it is
 * open for exactly as long as it is mounted.
 */
import { useMemo, useState, type RefObject } from 'react';
import { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay, Popover } from 'react-aria-components';
import { AGENTS, AGENT_META, type AgentKind } from '@/common/lib/agentCatalog';
import { EditIcon, TrashIcon } from '@/common/components/icons';
import { basename } from '@/common/lib/paths';
import { buttonVariants } from '@/common/components/ui/button';
import { Input } from '@/common/components/ui/input';
import { emptyStateClass } from '@/common/lib/emptyState';
import type { HistoryScope } from '@/common/lib/libraryScope';
import { rowResumeFolder, type MergedSessionRow } from '@/features/agent-panel/lib/sessionHistory';
import { useSessionHistory } from '@/features/agent-panel/hooks/useSessionHistory';

function relTime(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(ms).toLocaleDateString();
}

const rowKey = (row: MergedSessionRow) => `${row.agent}:${row.id}`;

export function SessionHistoryMenu({
  scope, ariaLabel, triggerRef, onClose, onResume,
}: {
  /** The scope whose sessions this menu lists — fixed per anchor,
   *  independent of any chat tab's picked scope. `all` (the New Chat
   *  row) lists every session across the library, each row labeled and
   *  resumed in its own scope. */
  scope: HistoryScope;
  ariaLabel: string;
  /** The sidebar clock button this popover anchors to. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Dismissal (outside press / Escape). Selecting a session calls
   *  `onResume` instead; the owner closes in both paths. */
  onClose: () => void;
  onResume: (agent: AgentKind, sessionId: string, folder: string | null) => void;
}) {
  const { rows, failedAgents, loading, rename, remove } = useSessionHistory(scope);
  const [q, setQ] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((row) => row.title.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  const allFailed = failedAgents.length === AGENTS.length;

  async function commitRename(row: MergedSessionRow) {
    const title = editText.trim();
    setEditingKey(null);
    if (!title) return;
    await rename(row, title);
  }

  async function removeRow(row: MergedSessionRow): Promise<boolean> {
    const ok = await remove(row);
    if (!ok) setDeleteError('Could not delete this session. Try again.');
    return ok;
  }

  return (
    <Popover
      triggerRef={triggerRef}
      isOpen
      onOpenChange={(next) => { if (!next) onClose(); }}
      className="session-history-popover z-20 w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-card p-1.5 shadow-elevation"
      placement="bottom end"
    >
      <Dialog aria-label={ariaLabel}>
        <div className="px-0.5 pt-0.5 pb-1.5">
          <Input
            type="text"
            autoFocus
            placeholder="Search sessions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && <div className={emptyStateClass}>Loading…</div>}
          {!loading && allFailed && <div className={emptyStateClass}>Could not load sessions.</div>}
          {!loading && !allFailed && failedAgents.length > 0 && (
            // Partial failure stays quiet: the loaded agent's rows render
            // normally with one muted note for the missing runtime.
            <div className="px-2.25 pt-0.5 pb-1 text-xs text-muted-foreground" role="status">
              {failedAgents.map((agent) => AGENT_META[agent].shortName).join(' and ')} history could not be loaded.
            </div>
          )}
          {!loading && !allFailed && shown.length === 0 && (
            <div className={emptyStateClass}>{q ? 'No matches.' : 'No sessions yet.'}</div>
          )}
          {!loading && !allFailed && shown.map((row) => {
            const key = rowKey(row);
            const AgentIcon = AGENT_META[row.agent].Icon;
            return (
              // Time and hover-revealed actions share the one right-hand
              // slot: time shows at rest, hover/focus swaps in edit/delete.
              <div
                key={key}
                className="group/row relative flex items-center rounded-md hover:bg-muted"
              >
                {editingKey === key ? (
                  <input
                    className="mx-1.5 my-1 min-w-0 flex-1 rounded-md border border-accent bg-background px-1.75 py-1 text-base text-foreground outline-none"
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void commitRename(row); }
                      else if (e.key === 'Escape') setEditingKey(null);
                    }}
                    onBlur={() => void commitRename(row)}
                  />
                ) : (
                  <Button
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.25 py-1.75 text-left text-foreground"
                    aria-label={`Resume ${row.title}`}
                    onPress={() => onResume(row.agent, row.id, rowResumeFolder(scope, row))}
                  >
                    <AgentIcon className="size-3.25 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-base">{row.title}</span>
                    <span className="shrink-0 truncate text-xs text-muted-foreground group-hover/row:hidden group-focus-within/row:hidden">
                      {/* The all-scope listing names each row's home so
                        * "which folder was this?" never needs a click. */}
                      {scope.kind === 'all' && `${row.folder ? basename(row.folder) : 'Library'} · `}
                      {relTime(row.lastModified)}
                    </span>
                  </Button>
                )}
                <div className="hidden shrink-0 gap-px pr-1.25 group-hover/row:flex group-focus-within/row:flex">
                  <Button
                    className="grid size-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.75"
                    aria-label={`Rename ${row.title}`}
                    onPress={() => { setEditingKey(key); setEditText(row.title); }}
                  >
                    <EditIcon />
                  </Button>
                  <DialogTrigger onOpenChange={(isOpen) => { if (isOpen) setDeleteError(null); }}>
                    <Button
                      className="grid size-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.75"
                      aria-label={`Delete ${row.title}`}
                    >
                      <TrashIcon />
                    </Button>
                    <ModalOverlay className="fixed inset-0 z-[100] grid place-items-center bg-veil p-4" isDismissable>
                      <Modal className="w-[min(420px,90vw)] rounded-xl border border-border bg-background px-6 pt-5.5 pb-5 text-foreground shadow-elevation">
                        <Dialog role="alertdialog" aria-label="Delete chat session">
                          {({ close }) => (
                            <>
                              <Heading slot="title" className="m-0 text-base leading-none font-medium">Delete chat?</Heading>
                              <p className="mt-2 mb-0 text-base leading-normal text-muted-foreground">Delete “{row.title}”? This cannot be undone.</p>
                              {deleteError && <div className="mt-2 text-sm text-status-danger" role="alert">{deleteError}</div>}
                              <div className="mt-3.5 flex justify-end gap-2">
                                <Button className={buttonVariants({ variant: 'outline' })} onPress={close}>Cancel</Button>
                                <Button
                                  className={buttonVariants({ variant: 'destructive' })}
                                  onPress={() => { void removeRow(row).then((deleted) => { if (deleted) close(); }); }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </>
                          )}
                        </Dialog>
                      </Modal>
                    </ModalOverlay>
                  </DialogTrigger>
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>
    </Popover>
  );
}
