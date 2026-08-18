import { basename } from '@/common/lib/paths';
import { useAppActions, useUiShell } from '@/store/contexts/AppContext';
import { ModalShell } from '@/common/components/ModalShell';
import { Button } from '@/common/components/ui/button';

/**
 * VSCode-style confirmation when a rename or move would update
 * cross-references in other notes. Three choices:
 *
 *   - Update    — rename + rewrite every backlink (default action).
 *   - Don't     — rename but leave backlinks pointing at the old
 *                 path (they'll break; useful when the user wants
 *                 explicit cleanup later).
 *   - Cancel    — abort the whole rename, keep current state.
 *
 * Driven by `state.cascadePrompt`; the rename actions await a
 * matching `resolveCascadePrompt(decision)` call.
 */
export function CascadePromptModal() {
  const { actions } = useAppActions();
  const { cascadePrompt: prompt } = useUiShell();

  if (!prompt) return null;

  const fromShort = basename(prompt.oldPath);
  const toShort = basename(prompt.newPath);
  const kindLabel = prompt.kind === 'folder' ? 'folder' : 'note';

  return (
    <ModalShell
      title="Update references?"
      description={
        <>
        Renaming this {kindLabel} from <strong>{fromShort}</strong> to <strong>{toShort}</strong>{' '}
        will affect {prompt.links} link{prompt.links === 1 ? '' : 's'} across{' '}
        {prompt.files} file{prompt.files === 1 ? '' : 's'}.
        </>
      }
      onCancel={() => actions.resolveCascadePrompt('cancel')}
    >
      <div className="mt-3.5 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => actions.resolveCascadePrompt('cancel')}
        >Cancel</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => actions.resolveCascadePrompt('skip')}
        >Don't update</Button>
        <Button
          type="button"
          autoFocus
          onClick={() => actions.resolveCascadePrompt('update')}
        >Update</Button>
      </div>
    </ModalShell>
  );
}
