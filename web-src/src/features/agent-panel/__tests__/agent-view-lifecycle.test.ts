import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import * as React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { AgentView } from '@/features/agent-panel/components/AgentView';
import { MessageList } from '@/features/agent-panel/components/AgentMessages';
import { AgentComposer } from '@/features/agent-panel/components/AgentComposer';
import { AGENT_META } from '@/common/lib/agentCatalog';
import { api } from '@/common/api/api';
import { AppProviders, type AppActions } from '@/store/contexts/AppContext';
import { initialState, type State } from '@/store/state/state';

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
    workspace: { ...initialState.workspace, folder: 'workspace', folderPath: '/workspace' },
    chat: { ...initialState.chat, agents: [{
      id: 'codex',
      label: 'Codex',
      vendor: 'OpenAI',
      installHint: 'npm install -g @openai/codex',
      installed: true,
      launchCommand: 'codex',
      endpoint: '/ws/agent',
      state: 'available',
      capabilities: AGENT_META.codex.capabilities,
    }] },
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

async function mountAgentView(t: TestContext, state = rendererState(), agent: 'claude' | 'codex' = 'codex') {
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(
      AppProviders,
      {
        state,
        dispatch: () => {},
        actions: actionsStub(),
        children: React.createElement(AgentView, { active: true, id: 'tab-1', title: 'Untitled', agent }),
      },
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

  return { renderer, first: LifecycleWebSocket.instances[0]! };
}

test('failed runtime setup keeps Check again available after external recovery', async (t) => {
  const state = rendererState();
  state.chat.agents = [{
    ...state.chat.agents[0]!,
    installed: false,
    source: null,
    state: 'unavailable',
    bootstrap: {
      phase: 'failed',
      failure: {
        stage: 'installation',
        code: 'operation-failed',
        message: 'Download failed.',
        retryable: true,
        manualRecovery: 'install-command',
      },
    },
  }];

  let checks = 0;
  t.mock.method(api, 'prepareAgent', async () => {
    checks += 1;
    return { clis: state.chat.agents };
  });
  const { renderer } = await mountAgentView(t, state);

  buttonNamed(renderer.root, 'Check again');
  buttonNamed(renderer.root, 'Retry');
  const checkAgain = renderer.root.findAll((node) => (
    node.props.children === 'Check again' && typeof node.props.onPress === 'function'
  ))[0];
  assert.ok(checkAgain);
  await act(async () => { checkAgain.props.onPress(); });
  assert.equal(checks, 1);
});

test('Codex authentication recovery starts login with the installed runtime', async (t) => {
  const state = rendererState();
  state.chat.agents = [{
    ...state.chat.agents[0]!,
    installed: true,
    source: 'managed',
    state: 'available',
    bootstrap: {
      phase: 'failed',
      failure: {
        stage: 'authentication',
        code: 'authentication-required',
        message: 'Codex is installed, but it is not signed in.',
        retryable: true,
      },
    },
  }];

  let logins = 0;
  t.mock.method(api, 'prepareAgent', async (
    _agent: 'claude' | 'codex',
    action: 'check' | 'bootstrap' | 'login',
  ) => {
    if (action === 'login') logins += 1;
    return {
      clis: [{
        ...state.chat.agents[0]!,
        bootstrap: { phase: 'authenticating', message: 'Finish signing in to Codex in your browser…' },
      }],
    };
  });
  const { renderer } = await mountAgentView(t, state);

  buttonNamed(renderer.root, 'Sign in with ChatGPT');
  const signIn = renderer.root.findAll((node) => (
    node.props.children === 'Sign in with ChatGPT' && typeof node.props.onPress === 'function'
  ))[0];
  assert.ok(signIn);
  await act(async () => { signIn.props.onPress(); });
  assert.equal(logins, 1);
});

test('a classified turn failure explains its recovery and offers Codex sign-in in place', async (t) => {
  let logins = 0;
  t.mock.method(api, 'prepareAgent', async (
    _agent: 'claude' | 'codex',
    action: 'check' | 'bootstrap' | 'login',
  ) => {
    if (action === 'login') logins += 1;
    return { clis: rendererState().chat.agents };
  });
  const { renderer, first } = await mountAgentView(t);
  await act(async () => {
    first.event({ t: 'ready' });
    first.event({ t: 'session-id', id: 'thread-9' });
    first.event({ t: 'turn-start' });
    first.event({
      t: 'error',
      message: 'Simulated failure: 401 authentication_error — the session token has expired. Sign in again.',
      failure: { kind: 'auth-expired' },
    });
    first.event({ t: 'turn-end', isError: true });
  });

  let output = renderedText(renderer);
  assert.match(output, /Signed out of Codex/);
  assert.match(output, /Sign in with ChatGPT/);
  // The classified error already explained the turn; the generic fallback
  // must not repeat it, and the failure never blocks the panel.
  assert.doesNotMatch(output, /The Agent turn failed before returning a response/);

  const signIn = renderer.root.findAll((node) => (
    node.props.children === 'Sign in with ChatGPT' && typeof node.props.onPress === 'function'
  ))[0];
  assert.ok(signIn);
  await act(async () => { signIn.props.onPress(); });
  assert.equal(logins, 1);

  // Acting on the card settles it: the button and guidance title are gone,
  // while the provider message stays as a plain record of the failed turn.
  output = renderedText(renderer);
  assert.doesNotMatch(output, /Sign in with ChatGPT/);
  assert.doesNotMatch(output, /Signed out of Codex/);
  assert.match(output, /the session token has expired/);

  // Plan exhaustion explains the provider-side reset and offers Try again,
  // which resends the failed prompt on the live session — no reconnect.
  await act(async () => {
    renderer.root.findByType(AgentComposer).props.onSend('Ping');
  });
  await act(async () => {
    first.event({ t: 'turn-start' });
    first.event({
      t: 'error',
      message: 'Simulated failure: usage limit reached - this plan usage window is exhausted.',
      failure: { kind: 'quota' },
    });
    first.event({ t: 'turn-end', isError: true });
  });
  output = renderedText(renderer);
  assert.match(output, /Usage limit reached/);
  assert.match(output, /ChatGPT plan/);

  const promptsBefore = first.sent.map((entry) => JSON.parse(entry) as { t: string }).filter((m) => m.t === 'prompt').length;
  const tryAgain = renderer.root.findAll((node) => (
    node.props.children === 'Try again' && typeof node.props.onPress === 'function'
  ))[0];
  assert.ok(tryAgain);
  await act(async () => { tryAgain.props.onPress(); });
  output = renderedText(renderer);
  assert.doesNotMatch(output, /Usage limit reached/);
  const prompts = first.sent.map((entry) => JSON.parse(entry) as { t: string; text?: string }).filter((m) => m.t === 'prompt');
  assert.equal(prompts.length, promptsBefore + 1);
  assert.equal(prompts.at(-1)?.text, 'Ping');

  // An unclassified error stays a plain message with no invented recovery.
  await act(async () => {
    first.event({ t: 'turn-start' });
    first.event({ t: 'error', message: 'Codex failed before completing the turn.' });
    first.event({ t: 'turn-end', isError: true });
  });
  output = renderedText(renderer);
  assert.match(output, /Codex failed before completing the turn/);
  assert.doesNotMatch(output, /Rate limited|Connection problem/);
});

test('an old card acted on after later turns resends its own prompt, not the newest', async (t) => {
  const { renderer, first } = await mountAgentView(t);
  await act(async () => {
    first.event({ t: 'ready' });
    renderer.root.findByType(AgentComposer).props.onSend('First question');
  });
  await act(async () => {
    first.event({ t: 'turn-start' });
    first.event({ t: 'error', message: 'Simulated failure: usage limit reached.', failure: { kind: 'quota' } });
    first.event({ t: 'turn-end', isError: true });
  });
  // A failure never ends the session: the user chats past the open card.
  await act(async () => {
    renderer.root.findByType(AgentComposer).props.onSend('Second question');
  });
  await act(async () => {
    first.event({ t: 'turn-start' });
    first.event({ t: 'text', delta: 'An answer.' });
    first.event({ t: 'turn-end', isError: false });
  });

  const tryAgain = renderer.root.findAll((node) => (
    node.props.children === 'Try again' && typeof node.props.onPress === 'function'
  ))[0];
  assert.ok(tryAgain);
  await act(async () => { tryAgain.props.onPress(); });
  const prompts = first.sent.map((entry) => JSON.parse(entry) as { t: string; text?: string })
    .filter((message) => message.t === 'prompt');
  assert.equal(prompts.at(-1)?.text, 'First question');
});

test('Claude reconnect resumes the session and auto-retries the failed prompt', async (t) => {
  const state = rendererState();
  state.chat.agents = [{
    ...state.chat.agents[0]!,
    id: 'claude',
    label: 'Claude Code',
    vendor: 'Anthropic',
    launchCommand: 'claude',
    capabilities: AGENT_META.claude.capabilities,
  }];
  const { renderer, first } = await mountAgentView(t, state, 'claude');
  await act(async () => {
    first.event({ t: 'ready' });
    first.event({ t: 'session-id', id: 'sess-1' });
    renderer.root.findByType(AgentComposer).props.onSend('Hello Claude');
  });
  await act(async () => {
    first.event({ t: 'turn-start' });
    first.event({ t: 'error', message: 'Not logged in · Please run /login', failure: { kind: 'auth-expired' } });
    first.event({ t: 'turn-end', isError: true });
  });

  let output = renderedText(renderer);
  assert.match(output, /Signed out of Claude Code/);
  const reconnect = renderer.root.findAll((node) => (
    node.props.children === 'Reconnect' && typeof node.props.onPress === 'function'
  ))[0];
  assert.ok(reconnect);
  await act(async () => { reconnect.props.onPress(); });

  // The card settled (message kept, action gone) and a replacement
  // connection resumed the same native session.
  output = renderedText(renderer);
  assert.doesNotMatch(output, /Signed out of Claude Code/);
  assert.match(output, /Not logged in/);
  assert.equal(LifecycleWebSocket.instances.length, 2);
  const second = LifecycleWebSocket.instances[1]!;
  assert.match(second.url, /[?&]resume=sess-1(?:&|$)/);

  // Ready on the replacement fires exactly one auto-retry of the failed
  // prompt, making the recovery's outcome visible without retyping.
  await act(async () => { second.event({ t: 'ready' }); });
  const prompts = second.sent.map((entry) => JSON.parse(entry) as { t: string; text?: string })
    .filter((message) => message.t === 'prompt');
  assert.deepEqual(prompts, [{ t: 'prompt', text: 'Hello Claude' }]);
  assert.ok((renderedText(renderer).match(/Hello Claude/g) ?? []).length >= 2);

  // A later settled turn must not replay it again.
  await act(async () => { second.event({ t: 'turn-start' }); second.event({ t: 'turn-end', isError: false }); });
  assert.equal(second.sent.map((entry) => JSON.parse(entry) as { t: string }).filter((m) => m.t === 'prompt').length, 1);
});

test('mounted AgentView ready → raw close renders recovery and reconnects with transcript + resume', async (t) => {
  const { renderer, first } = await mountAgentView(t);
  await act(async () => {
    first.event({ t: 'ready' });
    first.event({ t: 'session-id', id: 'thread-123' });
    first.event({ t: 'turn-start' });
    first.event({ t: 'text', delta: String.raw`Streamed formula: \(x^2` });
    first.event({ t: 'text', delta: String.raw` + 1\).` });
    first.event({ t: 'turn-end', isError: false });
  });
  assert.match(renderedText(renderer), /Streamed formula:.*x\^2.*1/);

  await act(async () => {
    first.event({ t: 'turn-start' });
    first.event({ t: 'text', delta: 'Partial answer survives.' });
    first.event({ t: 'tool', id: 'tool-1', name: 'Bash', input: {} });
  });
  await act(async () => { first.close(); });

  let output = renderedText(renderer);
  assert.match(output, /"role":"log"/);
  assert.match(output, /"aria-label":"Agent conversation"/);
  assert.match(output, /Partial answer survives/);
  assert.match(output, /Codex disconnected unexpectedly/);
  assert.match(output, /Reconnect/);
  assert.doesNotMatch(output, /Codex is working/);
  assert.doesNotMatch(output, /Running/);
  assert.equal(renderer.root.findByType(AgentComposer).props.effort.locked, true);

  buttonNamed(renderer.root, 'Reconnect');
  await act(async () => { renderer.root.findByType(MessageList).props.onRetry(); });

  assert.equal(LifecycleWebSocket.instances.length, 2);
  assert.match(LifecycleWebSocket.instances[1]!.url, /[?&]resume=thread-123(?:&|$)/);
  output = renderedText(renderer);
  assert.match(output, /Partial answer survives/);
  assert.doesNotMatch(output, /Codex disconnected unexpectedly/);

  await act(async () => {
    LifecycleWebSocket.instances[1]!.event({ t: 'ready' });
    LifecycleWebSocket.instances[1]!.event({ t: 'exit', message: 'Codex app-server exited with code 9.' });
    LifecycleWebSocket.instances[1]!.close();
  });
  output = renderedText(renderer);
  assert.match(output, /Codex app-server exited with code 9/);
  assert.equal((output.match(/Codex app-server exited with code 9/g) ?? []).length, 1);
  assert.match(output, /Reconnect/);
});

test('edit-and-resend interrupts an active turn before starting the edited prompt', async (t) => {
  const { renderer, first } = await mountAgentView(t);
  await act(async () => {
    first.event({ t: 'ready' });
    renderer.root.findByType(AgentComposer).props.onSend('Original prompt');
    first.event({ t: 'turn-start' });
    first.event({ t: 'thinking', delta: 'Working on the original prompt' });
  });

  const sentBeforeResend = first.sent.length;
  await act(async () => {
    renderer.root.findByType(MessageList).props.onResendUserMessage('Edited prompt');
  });

  const resendWire = first.sent.slice(sentBeforeResend).map((entry) => JSON.parse(entry));
  assert.deepEqual(resendWire, [{ t: 'interrupt' }]);
  assert.deepEqual(renderer.root.findByType(MessageList).props.queuedTurns.map((turn: { text: string }) => turn.text), [
    'Edited prompt',
  ]);

  await act(async () => {
    first.event({ t: 'turn-end', isError: false });
  });

  const messages = renderer.root.findByType(MessageList).props;
  assert.equal(messages.queuedTurns.length, 0);
  assert.equal(messages.blocks.at(-1)?.kind, 'user');
  assert.equal(messages.blocks.at(-1)?.text, 'Edited prompt');
  assert.equal(messages.turnActive, true);
  assert.deepEqual(JSON.parse(first.sent.at(-1)!), { t: 'prompt', text: 'Edited prompt' });

  const output = renderedText(renderer);
  const editedPosition = output.indexOf('Edited prompt');
  const workingPosition = output.indexOf(' is working');
  assert.match(output, /You stopped/);
  assert.ok(
    editedPosition >= 0 && workingPosition >= 0 && editedPosition < workingPosition,
    JSON.stringify({ editedPosition, workingPosition }),
  );
});
