import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement, StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccountSignInForm } from '@/common/components/AccountSignInForm';

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    });
  }
}

test('account Sign in immediately opens one Supabase Google OAuth flow without an email form', async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const opened: string[] = [];
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  Object.assign(globalThis, {
    window: {
      electron: undefined,
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      open: (url: string) => { opened.push(url); },
      setTimeout: (callback: () => void) => setTimeout(callback, 0),
      clearTimeout,
    },
    fetch: async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({ url, method: init.method ?? 'GET' });
      if (url === '/api/account/oauth/start') {
        return Response.json({
          flowId: 'flow-1',
          url: 'https://example.supabase.co/auth/v1/authorize?provider=google',
        });
      }
      if (url === '/api/account/oauth/status?flow=flow-1') {
        return Response.json({ state: 'error', error: 'Test flow finished.' });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const mounted: { renderer?: ReactTestRenderer } = {};
  try {
    await act(async () => {
      mounted.renderer = create(createElement(
        StrictMode,
        null,
        createElement(AccountSignInForm, { onSignedIn: () => undefined }),
      ));
    });
    await waitUntil(
      () => JSON.stringify(mounted.renderer?.toJSON()).includes('Test flow finished.'),
      'sign-in error did not settle',
    );

    assert.equal(requests[0]?.url, '/api/account/oauth/start');
    assert.equal(requests[0]?.method, 'POST');
    assert.equal(requests.filter((request) => request.url === '/api/account/oauth/start').length, 1);
    assert.deepEqual(opened, ['https://example.supabase.co/auth/v1/authorize?provider=google']);
    assert.equal(mounted.renderer!.root.findAll((node) => node.type === 'input').length, 0);
    assert.match(JSON.stringify(mounted.renderer!.toJSON()), /Finish signing in with Google/);
    assert.match(JSON.stringify(mounted.renderer!.toJSON()), /Test flow finished\./);
  } finally {
    if (mounted.renderer) await act(async () => mounted.renderer?.unmount());
    Object.assign(globalThis, { window: originalWindow, fetch: originalFetch });
  }
});

test('completed browser sign-in leaves native return to the authenticated callback deep link', async () => {
  let signedInEmail: string | undefined;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const originalCustomEvent = globalThis.CustomEvent;

  Object.assign(globalThis, {
    CustomEvent: class TestCustomEvent {
      constructor(public type: string) {}
    },
    window: {
      electron: {},
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
      open: () => undefined,
      setTimeout: (callback: () => void) => setTimeout(callback, 0),
      clearTimeout,
      dispatchEvent: () => true,
    },
    fetch: async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/account/oauth/start') {
        return Response.json({
          flowId: 'flow-complete',
          url: 'https://example.supabase.co/auth/v1/authorize?provider=google',
        });
      }
      if (url === '/api/account/oauth/status?flow=flow-complete') {
        return Response.json({ state: 'complete' });
      }
      if (url === '/api/account?refresh=1') {
        return Response.json({
          signedIn: true,
          active: true,
          email: 'person@example.com',
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(createElement(AccountSignInForm, {
        onSignedIn: (account) => { signedInEmail = account.email; },
      }));
    });
    await waitUntil(() => signedInEmail !== undefined, 'completed sign-in did not settle');

    assert.equal(signedInEmail, 'person@example.com');
  } finally {
    if (renderer) await act(async () => renderer?.unmount());
    Object.assign(globalThis, {
      window: originalWindow,
      fetch: originalFetch,
      CustomEvent: originalCustomEvent,
    });
  }
});
