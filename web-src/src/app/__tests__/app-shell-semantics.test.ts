/**
 * The app shell's own surfaces — sidebar, main pane, and the composition
 * root — asserted through what they RENDER rather than what their source
 * files spell. The sidebar is on the list of files a later phase splits, so
 * none of these may depend on which module a header, button, or drag zone
 * ends up living in.
 */
import '@/common/__tests__/domEnvironment';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { App } from '@/app/App';
import { MainPane } from '@/app/components/MainPane';
import { Sidebar } from '@/app/components/Sidebar';
import { appActions, appState, mountApp, withDom } from '@/common/__tests__/renderHarness';
import { DocumentOutlineProvider } from '@/common/components/DocumentOutlineContext';
import { OverlayStackProvider, useOverlayLayer } from '@/common/components/OverlayStack';
import { makeTab, type State } from '@/store/state/state';

function sidebar(workspace: Partial<State['workspace']> = {}) {
  return {
    element: h(DocumentOutlineProvider, null, h(Sidebar)),
    state: appState({
      workspace: { folderPath: '/library/workspace', folder: 'workspace', ...workspace },
    }),
  };
}

test('the sidebar column carries the macOS window drag zone as a non-interactive band', async () => {
  await withDom(async (dom) => {
    const { element, state } = sidebar();
    await mountApp(dom, element, { state });
    // `-webkit-app-region` needs a real element, and the traffic lights
    // float over it — so it must exist and must never be announced.
    const zone = dom.query('.sidebar-drag-zone');
    assert.ok(zone, 'the sidebar owns the titlebar drag band');
    assert.equal(zone.getAttribute('aria-hidden'), 'true');
    assert.equal(zone.textContent, '', 'the drag band holds no content of its own');
  });
});

test('the folder header names its root as a real button that selects the folder root', async () => {
  await withDom(async (dom) => {
    let dispatched: unknown = null;
    const { element, state } = sidebar({ folders: [{ path: 'Guides' }], files: [{ name: 'note.md', format: 'md', heading: 'note', snippet: '' }] });
    await mountApp(dom, element, { state, dispatch: (action) => { dispatched = action; } });

    const [root] = dom.byLabel('Select workspace folder root');
    assert.ok(root, 'the folder root is reachable by name');
    // A ghost Button, not a bare span with a click handler: keyboard users
    // reach it, and it stays transparent at rest.
    assert.equal(root.tagName, 'BUTTON');
    assert.equal(root.getAttribute('data-slot'), 'button');
    // A word-bounded match: `hover:bg-transparent` is a different rule, and
    // matching it would let an `outline` variant pass as `ghost`.
    assert.match(root.className, /(^| )bg-transparent( |$)/, 'the header title is a ghost button');
    assert.equal(root.textContent, 'workspace');

    await dom.fire(root, new MouseEvent('click', { bubbles: true }));
    assert.deepEqual(dispatched, { type: 'ACTIVE_FOLDER', path: '' });
  });
});

test('the new-note action names the folder it will write into', async () => {
  await withDom(async (dom) => {
    const { element, state } = sidebar({ activeFolder: 'Guides' });
    await mountApp(dom, element, { state });
    assert.equal(dom.byLabel('New note in Guides').length, 1);
  });

  await withDom(async (dom) => {
    const { element, state } = sidebar({ activeFolder: '', folder: '' });
    await mountApp(dom, element, { state });
    assert.equal(
      dom.byLabel('New note in folder root').length,
      1,
      'with no folder in play the label falls back to the root',
    );
  });
});

test('the folder fold toggle is named for the action it performs', async () => {
  await withDom(async (dom) => {
    const { element, state } = sidebar();
    await mountApp(dom, element, { state });
    assert.equal(dom.byLabel('Collapse files in workspace').length, 1);
  });
  await withDom(async (dom) => {
    const { element, state } = sidebar({ folderCollapsed: true });
    await mountApp(dom, element, { state });
    assert.equal(dom.byLabel('Expand files in workspace').length, 1);
  });
});

test('exactly one document panel carries the id the tab strip points at', async () => {
  const tab = makeTab();
  tab.file = { name: 'Note.md', format: 'md', content: '# Hello' };

  await withDom(async (dom) => {
    await mountApp(dom, h(DocumentOutlineProvider, null, h(MainPane)), {
      state: appState({ workspace: { folderPath: '/library', tabs: [tab], activeTabId: tab.id } }),
      actions: appActions(),
    });
    const panels = dom.queryAll('#document-panel');
    assert.equal(panels.length, 1, 'one open document, one panel id');
    assert.equal(panels[0].getAttribute('role'), 'tabpanel');
    // Every tab points at this one panel, so the id must not be per-tab.
    const tabs = dom.byRole('tab');
    assert.deepEqual(tabs.map((node) => node.getAttribute('aria-controls')), ['document-panel']);
    assert.equal(panels[0].getAttribute('aria-labelledby'), tabs[0].id);
  });

  await withDom(async (dom) => {
    await mountApp(dom, h(DocumentOutlineProvider, null, h(MainPane)), { state: appState() });
    assert.deepEqual(
      dom.queryAll('#document-panel'),
      [],
      'with no document open there is nothing for a tab to control',
    );
  });
});

/** Depth-first search of a React element tree for a component type. */
function findElement(node: ReactNode, type: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child as ReactNode, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node;
  return findElement((node.props as { children?: ReactNode }).children, type);
}

/** A blocking surface, reduced to the one thing every one of them does. */
function OverlayLayerProbe() {
  useOverlayLayer(true);
  return null;
}

test('the shell wraps its body in the overlay stack every blocking surface needs', async () => {
  // `useOverlayLayer` throws without a provider, so this pairing is the
  // whole invariant: the shell must supply one, and a surface outside one
  // must fail loudly rather than silently mis-report topmost.
  await withDom(async (dom) => {
    await assert.rejects(() => dom.render(h(OverlayLayerProbe)), /OverlayStackProvider/);
    await dom.render(h(OverlayStackProvider, null, h(OverlayLayerProbe)));
  });

  // The shell is not mountable under the node harness (its real store polls
  // the local server), so this reads the element tree App itself produces —
  // still its output, never its source text.
  assert.ok(
    findElement(App(), OverlayStackProvider),
    'App must mount an OverlayStackProvider around the shell body',
  );
});
