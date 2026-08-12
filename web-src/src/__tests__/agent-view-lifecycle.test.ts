import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { AgentView } from '../components/AgentView';
import { MessageList } from '../components/agent/AgentMessages';
import { AgentComposer } from '../components/agent/AgentComposer';
import { AGENT_META } from '../agentCatalog';
import { AppContext, type AppActions } from '../store/AppContext';
import { initialState, type State } from '../store/state';

class LifecycleWebSocket {
  static OPEN = 1;
  static instances: LifecycleWebSocket[] = [];
  readyState = LifecycleWebSocket.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    LifecycleWebSocket.instances.push(this);
  }

  send(value: string): void { this.sent.push(value); }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  event(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

function actionsStub(): AppActions {
  return new Proxy({}, {
    get: (_target, property) => {
      if (property === 'toast') return () => 'toast';
      if (property === 'loadFiles') return async () => [];
      return async () => undefined;
    },
  }) as AppActions;
}

function rendererState(): State {
  return {
    ...initialState,
    folder: 'workspace',
    folderPath: '/workspace',
    agents: [{
      id: 'codex',
      label: 'Codex',
      vendor: 'OpenAI',
      installHint: 'npm install -g @openai/codex',
      installed: true,
      launchCommand: 'codex',
      endpoint: '/ws/agent',
      state: 'available',
      capabilities: AGENT_META.codex.capabilities,
    }],
  };
}

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function buttonNamed(root: ReactTestInstance, label: string): ReactTestInstance {
  const button = root.findAll((node) => node.type === 'button' && node.children.includes(label))[0];
  assert.ok(button, `expected ${label} button`);
  return button;
}

test('mounted AgentView ready → raw close renders recovery and reconnects with transcript + resume', async (t) => {
  const previousWebSocket = globalThis.WebSocket;
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousDocument = globalThis.document;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousSVGElement = globalThis.SVGElement;
  const previousAddEventListener = globalThis.addEventListener;
  const previousRemoveEventListener = globalThis.removeEventListener;
  const previousActFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  const previousReact = (globalThis as { React?: typeof React }).React;
  LifecycleWebSocket.instances = [];
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: LifecycleWebSocket });
  const browserWindow = Object.assign(globalThis, {
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
      documentElement: { lang: 'en', dir: 'ltr' },
      body: {},
    },
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
  });
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: class TestHTMLElement { focus(): void {} },
  });
  Object.defineProperty(globalThis, 'SVGElement', {
    configurable: true,
    value: class TestSVGElement {},
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { protocol: 'http:', host: 'localhost:47831' },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { React?: typeof React }).React = React;

  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(
      AppContext.Provider,
      { value: { state: rendererState(), dispatch: () => {}, actions: actionsStub() } },
      React.createElement(AgentView, { active: true, id: 'tab-1', title: 'Untitled', agent: 'codex' }),
    ));
  });
  t.after(() => {
    act(() => renderer.unmount());
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: previousWebSocket });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: previousLocation });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: previousRequestAnimationFrame });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: previousCancelAnimationFrame });
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: previousHTMLElement });
    Object.defineProperty(globalThis, 'SVGElement', { configurable: true, value: previousSVGElement });
    Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: previousAddEventListener });
    Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: previousRemoveEventListener });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActFlag;
    (globalThis as { React?: typeof React }).React = previousReact;
  });

  const first = LifecycleWebSocket.instances[0]!;
  await act(async () => {
    first.event({ t: 'ready' });
    first.event({ t: 'session-id', id: 'thread-123' });
    first.event({ t: 'turn-start' });
    first.event({ t: 'text', delta: 'Partial answer survives.' });
    first.event({ t: 'tool', id: 'tool-1', name: 'Bash', input: {} });
  });
  await act(async () => { first.close(); });

  let output = renderedText(renderer!);
  assert.match(output, /"role":"log"/);
  assert.match(output, /"aria-label":"Agent conversation"/);
  assert.match(output, /Partial answer survives/);
  assert.match(output, /Codex disconnected unexpectedly/);
  assert.match(output, /Reconnect/);
  assert.doesNotMatch(output, /Codex is working/);
  assert.doesNotMatch(output, /Running/);
  assert.equal(renderer!.root.findByType(AgentComposer).props.effortLocked, true);

  buttonNamed(renderer!.root, 'Reconnect');
  await act(async () => { renderer!.root.findByType(MessageList).props.onRetry(); });

  assert.equal(LifecycleWebSocket.instances.length, 2);
  assert.match(LifecycleWebSocket.instances[1]!.url, /[?&]resume=thread-123(?:&|$)/);
  output = renderedText(renderer!);
  assert.match(output, /Partial answer survives/);
  assert.doesNotMatch(output, /Codex disconnected unexpectedly/);

  await act(async () => {
    LifecycleWebSocket.instances[1]!.event({ t: 'ready' });
    LifecycleWebSocket.instances[1]!.event({ t: 'exit', message: 'Codex app-server exited with code 9.' });
    LifecycleWebSocket.instances[1]!.close();
  });
  output = renderedText(renderer!);
  assert.match(output, /Codex app-server exited with code 9/);
  assert.equal((output.match(/Codex app-server exited with code 9/g) ?? []).length, 1);
  assert.match(output, /Reconnect/);
});
