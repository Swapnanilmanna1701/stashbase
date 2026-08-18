import { useEffect, useMemo, useState } from 'react';
import { api, type FileMeta, type FolderMeta } from '@/common/api/api';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import type { LibraryScope } from '@/common/lib/libraryScope';
import type { WorkspaceState } from '@/store/contexts/AppContext';
import { mentionListingPlan } from '@/features/agent-panel/lib/folderState';

/** Scope-specific file listing: `@` mentions, folder-file attachment
 *  validation, and context resolution run against the session's bound
 *  folder, not the window's current one. Library-wide chats have no
 *  single folder listing, so mentions are disabled there.
 *
 *  The session core owns the events that invalidate this listing (a tool
 *  wrote files, a cross-folder session became ready), so it re-fetches
 *  through the returned `bumpSessionListing` rather than by watching the
 *  socket itself. */
export function useAgentMentionListing({
  connectedScope,
  workspace,
}: {
  connectedScope: LibraryScope | null;
  workspace: WorkspaceState;
}) {
  const listingPlan = connectedScope
    ? mentionListingPlan(connectedScope, workspace.folderPath)
    : { kind: 'window' as const };
  const listingRoot = listingPlan.kind === 'folder' ? listingPlan.root : null;
  const mentionsDisabled = listingPlan.kind === 'disabled';
  const [sessionListing, setSessionListing] = useState<{ files: FileMeta[]; folders: FolderMeta[] } | null>(null);
  const [sessionListingNonce, setSessionListingNonce] = useState(0);
  useEffect(() => {
    if (!listingRoot) {
      setSessionListing(null);
      return;
    }
    let cancelled = false;
    void api.listFiles(listingRoot)
      .then((payload) => {
        if (!cancelled) setSessionListing({ files: payload.files, folders: payload.folders });
      })
      .catch(() => {
        // Keep whatever listing we had; the next turn/tool refresh retries.
      });
    return () => { cancelled = true; };
  }, [listingRoot, sessionListingNonce]);
  const mentionFiles = mentionsDisabled ? [] : listingRoot ? sessionListing?.files ?? [] : workspace.files;
  const mentionFolders = mentionsDisabled ? [] : listingRoot ? sessionListing?.folders ?? [] : workspace.folders;
  const knownFilePaths = useMemo(() => new Set(mentionFiles.map((f) => f.name)), [mentionFiles]);
  // Mirrored for prompt sends driven from the once-bound WS handler
  // (queued prompts fire on `turn-end`): `resolveFolderContext` must
  // validate against the listing as of send time, not connect time.
  const knownFilePathsRef = useLatestRef(knownFilePaths);

  function bumpSessionListing() {
    setSessionListingNonce((n) => n + 1);
  }

  return {
    mentionFiles,
    mentionFolders,
    knownFilePaths,
    knownFilePathsRef,
    bumpSessionListing,
  };
}
