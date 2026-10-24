import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { useProject } from '@/features/workspace/hooks/use-project';
import { projectApi, projectRegistrySnapshot } from '@/test/fakes/workspace';
import { withQueryClient } from '@/test/query';

import { ProjectMathToggle } from './project-math-toggle';

afterEach(cleanup);

describe('Project math mode', () => {
  it('waits for persistence and reloads the confirmed project preference', async () => {
    let enabled = false;
    let finish: (() => void) | undefined;
    const snapshot = () =>
      projectRegistrySnapshot({
        projects: [{ path: '/project', favorite: false, openedAt: 'today', mathMode: enabled }],
      });
    const port = projectApi({
      load: vi.fn(async () => snapshot()),
      setMathMode: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        enabled = true;
        return snapshot();
      }),
    });
    function Connected() {
      const project = useProject(port);
      return (
        <ProjectMathToggle
          enabled={project.data?.projects[0]?.mathMode === true}
          folderPath="/project"
          port={port}
        />
      );
    }
    withQueryClient(<Connected />);
    await waitFor(() => expect(port.load).toHaveBeenCalledOnce());
    const button = screen.getByRole('button', { name: 'Project math mode' });
    await userEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(port.setMathMode).toHaveBeenCalledWith('/project', true, expect.any(AbortSignal));
    finish?.();
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
  });

  it('reports a refused write without changing the displayed preference', async () => {
    const port = projectApi({
      setMathMode: vi.fn(async () => {
        throw new Error('refused');
      }),
    });
    withQueryClient(<ProjectMathToggle enabled folderPath="/project" port={port} />);
    const button = screen.getByRole('button', { name: 'Project math mode' });
    await userEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not save math mode');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
