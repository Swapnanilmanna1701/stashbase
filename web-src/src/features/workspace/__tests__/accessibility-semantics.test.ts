/**
 * Role, name, and selection semantics for the two workspace navigation
 * surfaces — the tab strip and the file tree — asserted by rendering them.
 * These are the assertions that let the `jsx-a11y` lint rules stay warnings
 * (see `code-review/renderer-architecture.md`), so they cover this feature's
 * surfaces only; other features assert their own.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { FileTree } from '@/features/workspace/components/FileTree';
import { TabStrip } from '@/features/workspace/components/TabStrip';
import { AppProviders, type AppActions } from '@/store/contexts/AppContext';
import { initialState, makeTab, toNameSet, type Action, type State } from '@/store/state/state';

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function actions(overrides: Partial<AppActions> = {}): AppActions {
  return new Proxy(overrides, {
    get: (target, property) => property in target ? target[property as keyof AppActions] : async () => undefined,
  }) as AppActions;
}

async function renderWithState(
  state: State,
  child: React.ReactElement,
  appActions: AppActions = actions(),
  dispatch: (action: Action) => void = () => undefined,
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(
      AppProviders,
      { state, actions: appActions, dispatch, children: child },
    ));
  });
  return renderer!;
}

function byRole(root: ReactTestInstance, role: string): ReactTestInstance[] {
  return root.findAll((node) => node.props.role === role);
}

test('document tabs expose their selected tab and named close action', async () => {
  const first = makeTab();
  first.file = { name: 'First.md', format: 'md', content: '' };
  const second = makeTab();
  second.file = { name: 'Second.md', format: 'md', content: '' };
  const activated: string[] = [];
  const renderer = await renderWithState(
    { ...initialState, workspace: { ...initialState.workspace, tabs: [first, second], activeTabId: first.id } },
    createElement(TabStrip),
    actions({ activateTab: async (id) => { activated.push(id); } }),
  );

  assert.equal(byRole(renderer.root, 'tablist')[0]?.props['aria-label'], 'Open documents');
  const tabs = byRole(renderer.root, 'tab');
  assert.deepEqual(tabs.map((tab) => tab.props['aria-selected']), [true, false]);
  assert.deepEqual(tabs.map((tab) => tab.props.tabIndex), [0, -1]);
  assert.deepEqual(tabs.map((tab) => tab.props['aria-controls']), ['document-panel', 'document-panel']);
  const close = renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === 'Close First.md');
  assert.equal(close.length, 1);

  await act(async () => tabs[1].props.onKeyDown({ key: 'Enter', preventDefault() {} }));
  assert.deepEqual(activated, [second.id]);
  await act(async () => renderer.unmount());
});

test('file explorer exposes expandable and selected items plus named edit fields', async () => {
  const base = {
    ...initialState,
    workspace: {
      ...initialState.workspace,
      folderPath: '/workspace',
      folders: [{ path: 'Guides' }],
      files: [{ name: 'note.md', format: 'md' }],
      expanded: toNameSet(['Guides']),
      selectedPath: 'note.md',
    },
  } as State;
  let renderer = await renderWithState(base, createElement(FileTree));
  assert.equal(byRole(renderer.root, 'tree')[0]?.props['aria-label'], 'Files');
  const items = byRole(renderer.root, 'treeitem');
  const folder = items.find((item) => item.props['aria-label'] === 'Guides');
  const selectedFile = items.find((item) => item.props['aria-label'] === 'note.md');
  assert.equal(folder?.props['aria-expanded'], true);
  assert.equal(folder?.props.tabIndex, -1);
  assert.equal(selectedFile?.props['aria-selected'], true);
  assert.equal(selectedFile?.props.tabIndex, 0);

  const guideRow = items.find((item) => item.props['aria-label'] === 'Guides');
  await act(async () => guideRow?.props.onFocus());
  const movedItems = byRole(renderer.root, 'treeitem');
  assert.equal(movedItems.find((item) => item.props['aria-label'] === 'Guides')?.props.tabIndex, 0);
  assert.equal(movedItems.find((item) => item.props['aria-label'] === 'note.md')?.props.tabIndex, -1);
  await act(async () => renderer.unmount());

  renderer = await renderWithState({
    ...base,
    uiShell: { ...base.uiShell, renaming: { path: 'note.md', kind: 'file' } },
  }, createElement(FileTree));
  const rename = renderer.root.findAll((node) => node.type === 'input' && node.props['aria-label'] === 'Rename file note.md');
  assert.equal(rename.length, 1);
  await act(async () => renderer.unmount());

  renderer = await renderWithState({
    ...base,
    workspace: { ...base.workspace, activeFolder: '', newFolderInputOpen: true },
  }, createElement(FileTree));
  const createFolder = renderer.root.findAll((node) => node.type === 'input' && node.props['aria-label'] === 'New folder in folder root');
  assert.equal(createFolder.length, 1);
  await act(async () => renderer.unmount());
});
