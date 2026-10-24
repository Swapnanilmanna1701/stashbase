import { describe, expect, it, vi } from 'vite-plus/test';

import type { HttpClient } from '@/platform/http/client';

import { createProjectRegistryAdapter } from './api';

describe('project API', () => {
  it('validates and maps project snapshots', async () => {
    const client: HttpClient = {
      request: vi.fn(async () => ({
        body: {
          current: { name: 'Notes', path: '/project/notes' },
          homeDir: '/project',
          recent: [
            { favorite: true, openedAt: '2026-08-31T12:00:00.000Z', path: '/project/notes' },
          ],
        },
        status: 200,
      })),
    };
    const api = createProjectRegistryAdapter(client);
    await expect(api.load(new AbortController().signal)).resolves.toEqual({
      activeFolder: { name: 'Notes', path: '/project/notes' },
      homeDirectory: '/project',
      projects: [{ favorite: true, openedAt: '2026-08-31T12:00:00.000Z', path: '/project/notes' }],
    });
  });

  it('rejects malformed success and classifies unavailable responses', async () => {
    const malformed = createProjectRegistryAdapter({
      request: vi.fn(async () => ({ body: { current: 'wrong' }, status: 200 })),
    });
    await expect(malformed.load(new AbortController().signal)).rejects.toMatchObject({
      kind: 'invalid-response',
    });

    const unavailable = createProjectRegistryAdapter({
      request: vi.fn(async () => ({
        body: { code: 'FOLDER_MISSING', error: 'private path detail' },
        status: 400,
      })),
    });
    await expect(
      unavailable.openFolder('/project/missing', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'unavailable', message: 'The project is unavailable.' });
  });

  it('posts a strict project math preference and retains it in snapshots', async () => {
    const request = vi.fn(async () => ({
      status: 200,
      body: {
        current: null,
        homeDir: '/project',
        recent: [{ path: '/project/notes', openedAt: 'today', mathMode: true }],
      },
    }));
    const signal = new AbortController().signal;
    const result = await createProjectRegistryAdapter({ request }).setMathMode(
      '/project/notes',
      true,
      signal,
    );
    expect(result.projects[0]?.mathMode).toBe(true);
    expect(request).toHaveBeenCalledWith({
      body: { path: '/project/notes', enabled: true },
      method: 'POST',
      path: '/api/projects/math-mode',
      signal,
    });
  });

  it('posts validated removal and maps its authoritative snapshot', async () => {
    const client: HttpClient = {
      request: vi.fn(async () => ({
        body: { current: null, homeDir: '/project', recent: [] },
        status: 200,
      })),
    };
    const signal = new AbortController().signal;

    await expect(
      createProjectRegistryAdapter(client).removeFolder('/project/notes', signal),
    ).resolves.toEqual({
      activeFolder: null,
      homeDirectory: '/project',
      projects: [],
    });
    expect(client.request).toHaveBeenCalledWith({
      body: { path: '/project/notes' },
      method: 'POST',
      path: '/api/projects/remove',
      signal,
    });
  });
});
