/**
 * Workspace chrome asserted through rendered output: the two pane
 * separators and the file tree's focus behaviour. `FileTree.tsx`,
 * `TabStrip.tsx`, and `WorkspaceSplitters.tsx` are all on a later phase's
 * split list, so nothing here may depend on which file a row or handle
 * lives in.
 *
 * Role/name/selection semantics for the tree and tab strip live in
 * `./accessibility-semantics.test.ts`.
 */
import '@/common/__tests__/domEnvironment';
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement as h } from 'react';
import { appState, mountApp, withDom } from '@/common/__tests__/renderHarness';
import { FileTree } from '@/features/workspace/components/FileTree';
import { ChatSplitter, SidebarSplitter } from '@/features/workspace/components/WorkspaceSplitters';
import { resizeChatByKeyboard, resizeSidebarByKeyboard } from '@/store/state/stateHelpers';
import { toNameSet, type Action, type State } from '@/store/state/state';

function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}

/** Moves real DOM focus, letting the roving state it updates settle. */
async function focus(element: HTMLElement): Promise<void> {
  await act(async () => { element.focus(); });
}

test('the sidebar handle is a named, keyboard-operable separator reporting its range', async () => {
  await withDom(async (dom) => {
    const dispatched: Action[] = [];
    await mountApp(dom, h(SidebarSplitter), {
      state: appState({ workspace: { sidebarWidth: 280, sidebarCollapsed: false } }),
      dispatch: (action) => dispatched.push(action),
    });

    const [separator] = dom.byRole('separator');
    assert.ok(separator, 'the sidebar edge is exposed as a separator');
    assert.equal(separator.getAttribute('aria-label'), 'Resize sidebar');
    assert.equal(separator.getAttribute('aria-orientation'), 'vertical');
    assert.equal(separator.getAttribute('aria-valuemin'), '0');
    assert.equal(separator.getAttribute('aria-valuenow'), '280');
    assert.equal(separator.getAttribute('aria-valuetext'), '280 pixels');
    assert.equal(separator.tabIndex, 0, 'the handle is reachable by keyboard');

    // The rendered handle must move the pane by the SAME rule the store
    // exposes — a handle with its own arithmetic would drift from it.
    await dom.fire(separator, keydown('ArrowRight'));
    const expected = resizeSidebarByKeyboard(280, false, 'ArrowRight');
    assert.deepEqual(dispatched, [{ type: 'SIDEBAR_WIDTH', width: expected.width }]);
  });
});

test('a collapsed sidebar reports collapsed and reopens from the handle', async () => {
  await withDom(async (dom) => {
    const dispatched: Action[] = [];
    await mountApp(dom, h(SidebarSplitter), {
      state: appState({ workspace: { sidebarWidth: 280, sidebarCollapsed: true } }),
      dispatch: (action) => dispatched.push(action),
    });
    const [separator] = dom.byRole('separator');
    assert.equal(separator.getAttribute('aria-valuenow'), '0');
    assert.equal(separator.getAttribute('aria-valuetext'), 'Collapsed');

    await dom.fire(separator, keydown('ArrowRight'));
    assert.deepEqual(
      dispatched,
      [{ type: 'SIDEBAR_SET_COLLAPSED', collapsed: false }],
      'reopening a collapsed sidebar keeps its remembered width',
    );
  });
});

test('the chat handle is a named separator bounded by the panel range', async () => {
  await withDom(async (dom) => {
    const dispatched: Action[] = [];
    await mountApp(dom, h(ChatSplitter), {
      state: appState({ chat: { chatWidth: 480 } }),
      dispatch: (action) => dispatched.push(action),
    });

    const [separator] = dom.byRole('separator');
    assert.equal(separator.getAttribute('aria-label'), 'Resize Agent chat panel');
    assert.equal(separator.getAttribute('aria-valuenow'), '480');
    assert.notEqual(separator.getAttribute('aria-valuemin'), '0', 'the chat panel has a floor');
    assert.equal(separator.tabIndex, 0);

    await dom.fire(separator, keydown('ArrowLeft'));
    assert.deepEqual(dispatched, [{ type: 'CHAT_WIDTH', width: resizeChatByKeyboard(480, 'ArrowLeft') }]);
  });
});

test('opening a tree row context menu moves DOM focus to that row first', async () => {
  // The row must hold focus while the menu is up so dismissing the menu
  // returns focus to the row the user acted on — and it must take that
  // focus without scrolling the tree under the pointer.
  const base = appState({
    workspace: {
      folderPath: '/workspace',
      folders: [{ path: 'Guides' }],
      files: [{ name: 'note.md', format: 'md', heading: 'note', snippet: '' }],
      expanded: toNameSet(['Guides']),
    },
  });

  for (const label of ['Guides', 'note.md']) {
    await withDom(async (dom) => {
      const dispatched: Action[] = [];
      await mountApp(dom, h(FileTree), { state: base, dispatch: (action) => dispatched.push(action) });

      const [row] = dom.byLabel(label);
      assert.ok(row, `${label} renders a row`);
      assert.notEqual(document.activeElement, row);

      let preventedScroll: boolean | undefined;
      const realFocus = row.focus.bind(row);
      row.focus = (options?: FocusOptions) => {
        preventedScroll = options?.preventScroll;
        realFocus(options);
      };

      await dom.fire(row, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      assert.equal(document.activeElement, row, `${label} takes focus before its menu opens`);
      assert.equal(preventedScroll, true, `${label} must not scroll the tree while taking focus`);
      assert.equal(dispatched.at(-1)?.type, 'CTX_MENU');
    });
  }
});

/** One folder holding one file, beside a file at the root. */
function nestedTree(expanded: string[]): State {
  return appState({
    workspace: {
      folderPath: '/workspace',
      folders: [{ path: 'Guides' }],
      files: [
        { name: 'Guides/inner.md', format: 'md', heading: 'inner', snippet: '' },
        { name: 'top.md', format: 'md', heading: 'top', snippet: '' },
      ],
      expanded: toNameSet(expanded),
    },
  });
}

test('arrow keys rove the tree over the rows that are actually on screen', async () => {
  // Every row is rendered whether or not its folder is open — collapsing
  // only hides a subtree with CSS — so "which rows can I reach" is a real
  // question. It is answered by the visible-path list the tree renders
  // from (`useTreeRoving`), not by re-reading the DOM for a class name.
  await withDom(async (dom) => {
    await mountApp(dom, h(FileTree), { state: nestedTree(['Guides']) });
    const row = (label: string) => {
      const [element] = dom.byLabel(label);
      assert.ok(element, `${label} renders a row`);
      return element;
    };

    await focus(row('Guides'));
    await dom.fire(document.activeElement!, keydown('ArrowDown'));
    assert.equal(document.activeElement, row('inner.md'), 'ArrowDown enters the open folder');
    await dom.fire(document.activeElement!, keydown('ArrowDown'));
    assert.equal(document.activeElement, row('top.md'));
    await dom.fire(document.activeElement!, keydown('ArrowDown'));
    assert.equal(document.activeElement, row('top.md'), 'the last row is the end of the line');

    await dom.fire(document.activeElement!, keydown('Home'));
    assert.equal(document.activeElement, row('Guides'));
    await dom.fire(document.activeElement!, keydown('ArrowUp'));
    assert.equal(document.activeElement, row('Guides'), 'and the first row is the start');
    await dom.fire(document.activeElement!, keydown('End'));
    assert.equal(document.activeElement, row('top.md'));

    // ArrowLeft climbs out of a folder rather than moving one row up.
    await focus(row('inner.md'));
    await dom.fire(document.activeElement!, keydown('ArrowLeft'));
    assert.equal(document.activeElement, row('Guides'));
  });

  await withDom(async (dom) => {
    await mountApp(dom, h(FileTree), { state: nestedTree([]) });
    const [folder] = dom.byLabel('Guides');
    assert.ok(dom.byLabel('inner.md')[0], 'a collapsed folder still renders its children');

    await focus(folder);
    await dom.fire(document.activeElement!, keydown('ArrowDown'));
    assert.equal(
      document.activeElement,
      dom.byLabel('top.md')[0],
      'ArrowDown steps over the collapsed subtree, not into it',
    );
  });
});
