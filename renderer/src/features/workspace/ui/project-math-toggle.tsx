import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import type { ProjectRegistryPort } from '@/features/workspace/application/ports';
import { workspaceQueryKeys } from '@/features/workspace/application/queries';
import { useRequestSignals } from '@/shared/runtime/use-request-signals';

/** A confirmed project preference; a failed write leaves the current mode visible. */
export function ProjectMathToggle({
  enabled,
  folderPath,
  port,
}: {
  enabled: boolean;
  folderPath: string;
  port: ProjectRegistryPort;
}) {
  const client = useQueryClient();
  const signalFor = useRequestSignals<'math-mode'>();
  const write = useMutation({
    mutationFn: (next: boolean) => port.setMathMode(folderPath, next, signalFor('math-mode')),
    onSuccess: () => client.invalidateQueries({ queryKey: workspaceQueryKeys.project }),
  });
  return (
    <div className="flex items-center gap-2">
      {write.isError && <span role="alert">Could not save math mode. Try again.</span>}
      <Tooltip
        content={
          enabled
            ? 'Math mode on for this project. $x$ renders math; use \\$ for a literal dollar. Unsaved documents apply changes after saving.'
            : 'Math mode off for this project. Enable $x$ formulas in Documents and Chat.'
        }
        side="bottom"
      >
        <Button
          aria-label="Project math mode"
          aria-pressed={enabled}
          disabled={write.isPending}
          onClick={() => write.mutate(!enabled)}
          size="compact"
          variant={enabled ? 'secondary' : 'ghost'}
        >
          Math
        </Button>
      </Tooltip>
    </div>
  );
}
