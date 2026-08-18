import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AgentView } from '@/features/agent-panel/components/AgentView';
import { AgentComposer } from '@/features/agent-panel/components/AgentComposer';
import { MessageList } from '@/features/agent-panel/components/AgentMessages';
import { AGENT_META } from '@/common/lib/agentCatalog';
import { AppProviders, type AppActions } from '@/store/contexts/AppContext';
import { initialState, type Action, type State } from '@/store/state/state';
import { reducer } from '@/store/state/stateReducer';

class HistoryWebSocket {
  static OPEN = 1;
  static instances: HistoryWebSocket[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) { HistoryWebSocket.instances.push(this); }
  send(): void {}
  close(): void { this.readyState = 3; }
  event(value: unknown): void { this.onmessage?.({ data: JSON.stringify(value) }); }
}

function state(): State {
  return {
    ...initialState,
    workspace: { ...initialState.workspace, folder: 'workspace', folderPath: '/workspace' },
    chat: { ...initialState.chat, agents: [{
      id: 'claude', label: 'Claude Code', vendor: 'Anthropic',
      installHint: 'npm install -g @anthropic-ai/claude-code',
      installed: true, launchCommand: 'claude', endpoint: '/ws/agent',
      state: 'available', capabilities: AGENT_META.claude.capabilities,
    }] },
  };
}

const actions = new Proxy({}, {
  get: (_target, property) => property === 'toast' ? () => 'toast' : async () => undefined,
}) as AppActions;

test('restored Claude effort and native identity survive an idle effort reconnect', async (t) => {
  const originals = {
    WebSocket: globalThis.WebSocket,
    window: globalThis.window,
    location: globalThis.location,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    SVGElement: globalThis.SVGElement,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    fetch: globalThis.fetch,
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    React: (globalThis as { React?: typeof React }).React,
    act: (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT,
  };
  HistoryWebSocket.instances = [];
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: HistoryWebSocket });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: () => {} });
  Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: () => {} });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'http:', host: 'localhost:47831' } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    addEventListener() {}, removeEventListener() {}, documentElement: { lang: 'en', dir: 'ltr' }, body: {},
  } });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class { focus(): void {} } });
  Object.defineProperty(globalThis, 'SVGElement', { configurable: true, value: class {} });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (fn: FrameRequestCallback) => { fn(0); return 1; } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => {} });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    assert.match(url, /\/sessions\/native-[12]\/replay(?:\?|$)/);
    return new Response(JSON.stringify({
      protocol: 2,
      messages: [
        { kind: 'user', id: 'h0', text: 'question' },
        { kind: 'assistant', id: 'h1', text: 'answer' },
      ],
      effort: url.includes('native-2') ? null : 'max',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  let dispatchFromTest!: React.Dispatch<Action>;
  function Harness() {
    const [appState, dispatch] = React.useReducer(reducer, undefined, state);
    dispatchFromTest = dispatch;
    return React.createElement(
      AppProviders,
      {
        state: appState,
        dispatch,
        actions,
        children: React.createElement(AgentView, { active: true, id: 'tab-1', title: 'New Chat', agent: 'claude' }),
      },
    );
  }

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  t.after(() => {
    act(() => renderer.unmount());
    for (const [key, value] of Object.entries(originals)) {
      if (key === 'React') (globalThis as { React?: typeof React }).React = value as typeof React | undefined;
      else if (key === 'act') (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value as boolean | undefined;
      else Object.defineProperty(globalThis, key, { configurable: true, value });
    }
  });

  await act(async () => {
    dispatchFromTest({ type: 'CHAT_RESUME_REQUEST', resume: { agent: 'claude', sessionId: 'native-1', folder: '/workspace' } });
  });
  assert.equal(HistoryWebSocket.instances.length, 2);
  let resumed = new URL(HistoryWebSocket.instances[1]!.url);
  assert.equal(resumed.searchParams.get('resume'), 'native-1');
  assert.equal(resumed.searchParams.get('effort'), 'max');
  assert.equal(renderer.root.findByType(AgentComposer).props.effort.level, 'max');
  assert.equal(renderer.root.findByType(AgentComposer).props.effort.locked, false);
  assert.equal(renderer.root.findByType(MessageList).props.blocks.length, 2);

  await act(async () => { HistoryWebSocket.instances[1]!.event({ t: 'ready' }); });
  await act(async () => { renderer.root.findByType(AgentComposer).props.effort.onSet('high'); });
  assert.equal(HistoryWebSocket.instances.length, 3);
  resumed = new URL(HistoryWebSocket.instances[2]!.url);
  assert.equal(resumed.searchParams.get('resume'), 'native-1');
  assert.equal(resumed.searchParams.get('effort'), 'high');
  assert.equal(renderer.root.findByType(MessageList).props.blocks.length, 2);

  // Sidebar History never hijacks a populated tab; it activates a fresh
  // blank tab for another session. Recreate that blank-tab boundary before
  // exercising the second native transcript.
  await act(async () => { renderer.unmount(); });
  await act(async () => { renderer = create(React.createElement(Harness)); });
  await act(async () => {
    dispatchFromTest({ type: 'CHAT_RESUME_REQUEST', resume: { agent: 'claude', sessionId: 'native-2', folder: '/workspace' } });
  });
  const inherited = renderer.root.findByType(AgentComposer).props;
  assert.equal(inherited.effort.level, undefined);
  assert.equal(inherited.effort.inherited, true);
  assert.equal(inherited.effort.locked, false);
  resumed = new URL(HistoryWebSocket.instances.at(-1)!.url);
  assert.equal(resumed.searchParams.get('resume'), 'native-2');
  assert.equal(resumed.searchParams.get('effort'), null);

  await act(async () => { HistoryWebSocket.instances.at(-1)!.event({ t: 'ready' }); });
  await act(async () => { renderer.root.findByType(AgentComposer).props.effort.onSet('max'); });
  resumed = new URL(HistoryWebSocket.instances.at(-1)!.url);
  assert.equal(resumed.searchParams.get('resume'), 'native-2');
  assert.equal(resumed.searchParams.get('effort'), 'max');
  assert.equal(renderer.root.findByType(MessageList).props.blocks.length, 2);
});
