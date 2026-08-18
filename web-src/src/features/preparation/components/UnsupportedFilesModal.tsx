import { ModalShell } from '@/common/components/ModalShell';
import { type UnsupportedFileSummary } from '@/common/api/apiTypes';
import { useWorkspace } from '@/store/contexts/AppContext';
import { useUnsupportedNotice } from '@/features/preparation/hooks/useUnsupportedNotice';
import { Button } from '@/common/components/ui/button';

function formatExtensions(otherExtensions: Array<{ extension: string; count: number }>): string {
  const list = otherExtensions.map((e) => e.extension);
  const top3 = list.slice(0, 3);
  const remaining = list.length - 3;
  let base = top3.join(', ');
  if (remaining > 0) {
    base += ` and ${remaining} more format${remaining === 1 ? '' : 's'}`;
  }
  return base;
}

const REMAIN_ON_DISK_COPY =
  'These files remain unchanged on disk, but they will not appear in the Files view or StashBase search.';

export function UnsupportedFilesModal({ unsupportedFiles, onClose }: {
  unsupportedFiles: UnsupportedFileSummary;
  onClose: () => void;
}) {
  const { sourceCode, other, otherExtensions = [] } = unsupportedFiles;

  // Decide copy based on counts
  const showSource = sourceCode > 0;
  const showOther = other > 0;

  const footer = (
    <div className="mt-3.5 flex justify-end gap-2">
      <Button type="button" autoFocus onClick={onClose}>Continue with supported files</Button>
    </div>
  );

  if (showSource && showOther) {
    // Combined Modal
    const extList = formatExtensions(otherExtensions);
    return (
      <ModalShell title="Some files in this folder aren't supported" onCancel={onClose} top>
        {/* No description slot here (a list can't nest in its <p>), so the
          * list takes the description's top offset itself. */}
        <ul className="m-0 mt-2 list-disc space-y-2 pl-5 text-base leading-normal text-muted-foreground">
          <li>
            <strong>{sourceCode} source-code and project files</strong> are not shown or indexed.
          </li>
          <li>
            <strong>{other} files in other unsupported formats</strong> are not shown or indexed: {extList}.
          </li>
        </ul>
        <p className="mt-3.5 mb-0 text-base leading-normal text-muted-foreground">{REMAIN_ON_DISK_COPY}</p>
        {footer}
      </ModalShell>
    );
  }

  if (showSource) {
    // Source code only
    return (
      <ModalShell
        title="Source code files aren't supported"
        description={<>StashBase found <strong>{sourceCode} source-code and project files</strong> in this folder.</>}
        onCancel={onClose}
        top
      >
        <p className="m-0 text-base leading-normal text-muted-foreground">
          StashBase currently shows and indexes supported documents and media, not source code. {REMAIN_ON_DISK_COPY}
        </p>
        {footer}
      </ModalShell>
    );
  }

  if (showOther) {
    // Other formats only
    const extList = formatExtensions(otherExtensions);
    return (
      <ModalShell
        title="Some file formats aren't supported yet"
        description={<>StashBase found <strong>{other} files in unsupported formats</strong>: {extList}.</>}
        onCancel={onClose}
        top
      >
        <p className="m-0 text-base leading-normal text-muted-foreground">{REMAIN_ON_DISK_COPY}</p>
        {footer}
      </ModalShell>
    );
  }

  return null;
}

export default function UnsupportedFilesModalGate() {
  const state = useWorkspace();
  const { sourceCode = 0, other = 0 } = state.unsupportedFiles || {};
  const onClose = useUnsupportedNotice(
    { sourceCode, other },
    `${state.folderPath}|${state.folder}`,
  );

  if (!state.unsupportedModalOpen || sourceCode + other === 0) return null;

  return (
    <UnsupportedFilesModal
      unsupportedFiles={state.unsupportedFiles!}
      onClose={onClose}
    />
  );
}
