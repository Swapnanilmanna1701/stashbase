import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '@/common/api/api';

test('history replay uses protocol-v2 effort metadata when available', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    protocol: 2,
    messages: [{ kind: 'assistant', id: 'h0', text: 'answer' }],
    effort: 'max',
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.deepEqual(await api.getSessionReplay('s1', 'claude'), {
    protocol: 2,
    messages: [{ kind: 'assistant', id: 'h0', text: 'answer' }],
    effort: 'max',
  });
});

test('history replay falls back to protocol-v1 messages after replay 404', async (t) => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    paths.push(String(input));
    if (paths.length === 1) {
      return new Response(JSON.stringify({ error: 'replay metadata unavailable' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify([{ kind: 'assistant', id: 'h0', text: 'legacy' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  assert.deepEqual(await api.getSessionReplay('s1', 'claude'), {
    protocol: 2,
    messages: [{ kind: 'assistant', id: 'h0', text: 'legacy' }],
    effort: null,
  });
  assert.deepEqual(paths, [
    '/api/agents/claude/sessions/s1/replay',
    '/api/agents/claude/sessions/s1/messages',
  ]);
});
