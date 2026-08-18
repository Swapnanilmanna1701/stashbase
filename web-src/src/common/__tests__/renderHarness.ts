/**
 * Shared renderer test harness.
 *
 * Renderer invariants — roles, accessible names, the class recipes a
 * component actually emits, the wiring between an eager container and its
 * lazy managed body — are asserted against RENDERED OUTPUT, never against a
 * component's source text. Source text pins a component to one file and one
 * spelling, so a pure move or split breaks CI while the user-visible
 * contract is untouched; rendered output survives both and still fails when
 * the contract does. See `code-review/ui-regression-testing.md`.
 *
 * IMPORTANT: a test file that mounts components must import
 * `@/common/__tests__/domEnvironment` as its FIRST import — see the note in
 * that module for why. This harness re-exports nothing that would let a file
 * skip that step, because import order, not this module, is what decides
 * whether Base UI's portals believe they are in a browser.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProviders, type AppActions } from '@/store/contexts/AppContext';
import { initialState, type Action, type State } from '@/store/state/state';

export interface DomHarness {
  /** The mount point the tree was rendered into. */
  host: HTMLElement;
  /** Markup of the entire document body — portalled surfaces included. */
  html: () => string;
  render: (element: ReactElement | null) => Promise<void>;
  /** Lets pending microtasks and timers (lazy chunks, effects) settle. */
  flush: () => Promise<void>;
  /** Dispatches a real DOM event inside `act` so React state settles. */
  fire: (target: Element, event: Event) => Promise<void>;
  query: (selector: string) => HTMLElement | null;
  queryAll: (selector: string) => HTMLElement[];
  /** Every element carrying this accessible name. */
  byLabel: (label: string) => HTMLElement[];
  byRole: (role: string) => HTMLElement[];
}

/** Every element in the document matching `selector`, portals included. */
function search(selector: string): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>(selector)];
}

/**
 * Mounts a React root into a fresh host element, runs `body`, then unmounts
 * and removes the host — pass or throw — so tests in one file stay
 * independent even though they share the file's document.
 */
export async function withDom<T>(body: (dom: DomHarness) => Promise<T>): Promise<T> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const dom: DomHarness = {
    host,
    html: () => document.body.innerHTML,
    render: async (element) => { await act(async () => { root.render(element); }); },
    flush: async () => {
      await act(async () => {
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      });
    },
    fire: async (target, event) => { await act(async () => { target.dispatchEvent(event); }); },
    query: (selector) => search(selector)[0] ?? null,
    queryAll: search,
    byLabel: (label) => search(`[aria-label="${label.replaceAll('"', '&quot;')}"]`),
    byRole: (role) => search(`[role="${role}"]`),
  };
  try {
    return await body(dom);
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
  }
}

/**
 * The `AppActions` bag as a permissive stub: any command not overridden
 * resolves to `undefined`, so a test only names the commands it asserts on.
 */
export function appActions(overrides: Partial<AppActions> = {}): AppActions {
  // Each stub is created once and cached: the real actions bag hands out
  // referentially stable commands, and a harness that minted a fresh
  // function per property read would make effects churn for reasons the
  // production shell never has.
  const stubs = new Map<PropertyKey, () => Promise<undefined>>();
  return new Proxy(overrides, {
    get: (target, property) => {
      if (property in target) return target[property as keyof AppActions];
      if (!stubs.has(property)) stubs.set(property, async () => undefined);
      return stubs.get(property);
    },
  }) as AppActions;
}

/**
 * `initialState` with per-slice overrides merged in — `appState({ workspace:
 * { tabs } })`. Slice-shaped rather than flat so a fixture names the same
 * path a component reads (`useWorkspace().tabs` ← `state.workspace.tabs`)
 * and the compiler keeps rejecting a field placed in the wrong slice.
 */
export function appState(overrides: {
  workspace?: Partial<State['workspace']>;
  chat?: Partial<State['chat']>;
  uiShell?: Partial<State['uiShell']>;
} = {}): State {
  return {
    workspace: { ...initialState.workspace, ...overrides.workspace },
    chat: { ...initialState.chat, ...overrides.chat },
    uiShell: { ...initialState.uiShell, ...overrides.uiShell },
  };
}

/** Mounts `element` under the real four-context provider stack. */
export async function mountApp(
  dom: DomHarness,
  element: ReactElement,
  {
    state = appState(),
    actions = appActions(),
    dispatch = () => undefined,
  }: {
    state?: State;
    actions?: AppActions;
    dispatch?: (action: Action) => void;
  } = {},
): Promise<void> {
  await dom.render(createElement(AppProviders, { state, actions, dispatch, children: element }));
}
