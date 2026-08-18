/**
 * Document surfaces asserted through what they render and how they behave
 * when the shell re-renders around them.
 *
 * The Find-registration tests here are the behavioural form of a rule that
 * used to be a regex over each viewer's dependency array: an effect must
 * depend on the ONE command it uses, never on the whole `actions` bag. The
 * bag's identity changes on shell re-renders, and a viewer that keyed off
 * it would tear down and re-register its Find controller each time —
 * dropping the user's active match mid-search.
 */
import '@/common/__tests__/domEnvironment';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { appActions, appState, mountApp, withDom } from '@/common/__tests__/renderHarness';
import { DocumentOutlineProvider } from '@/common/components/DocumentOutlineContext';
import { CrepeDocument } from '@/features/documents/components/CrepeDocument';
import { JsonDocument } from '@/features/documents/components/JsonDocument';
import { makeTab, type State } from '@/store/state/state';
import type { AppActions } from '@/store/contexts/AppContext';

function markdownTab(name = 'Release Notes.md') {
  const tab = makeTab();
  tab.file = { name, format: 'md', content: '# Heading\n\nBody.\n' };
  return tab;
}

function jsonTab() {
  const tab = makeTab();
  tab.file = { name: 'data.json', format: 'json', content: '{"value": 1}' };
  return tab;
}

test('a Markdown surface is a named region carrying the document name', async () => {
  const tab = markdownTab('Guides/Release Notes.md');
  await withDom(async (dom) => {
    await mountApp(dom, h(DocumentOutlineProvider, null, h(CrepeDocument, {
      tabId: tab.id,
      name: 'Guides/Release Notes.md',
      content: tab.file!.content,
      readOnly: true,
      active: true,
      dirty: false,
    })), { state: appState({ tabs: [tab], activeTabId: tab.id } as Partial<State>) });

    const [region] = dom.byRole('region');
    assert.ok(region, 'the Markdown surface announces itself as a region');
    // The BASENAME, not the stored path — the announced name is what the
    // user calls the file.
    assert.equal(region.getAttribute('aria-label'), 'Release Notes.md Markdown document');
  });
});

test('a JSON surface is a named region', async () => {
  const tab = jsonTab();
  await withDom(async (dom) => {
    await mountApp(dom, h(JsonDocument, {
      tabId: tab.id, content: tab.file!.content, readOnly: true, active: true,
    }), { state: appState({ tabs: [tab], activeTabId: tab.id } as Partial<State>) });

    const region = dom.byRole('region').find((node) => node.getAttribute('aria-label') === 'JSON document');
    assert.ok(region, 'the JSON surface announces itself as a named region');
  });
});

test('Markdown Find registration survives a new actions bag', async () => {
  const tab = markdownTab();
  await withDom(async (dom) => {
    const registrations: unknown[] = [];
    const registerFindController = ((controller: unknown) => { registrations.push(controller); }) as
      unknown as AppActions['registerFindController'];
    const state = appState({ tabs: [tab], activeTabId: tab.id } as Partial<State>);
    const view = h(DocumentOutlineProvider, null, h(CrepeDocument, {
      tabId: tab.id,
      name: tab.file!.name,
      content: tab.file!.content,
      readOnly: true,
      active: true,
      dirty: false,
    }));

    await mountApp(dom, view, { state, actions: appActions({ registerFindController }) });
    assert.deepEqual(
      registrations.map((entry) => entry === null),
      [false],
      'an active Markdown document registers its Find controller once',
    );

    // A brand-new bag object with the SAME command inside: exactly what a
    // shell re-render hands every viewer.
    await mountApp(dom, view, { state, actions: appActions({ registerFindController }) });
    assert.deepEqual(
      registrations.map((entry) => entry === null),
      [false],
      'a fresh actions bag must not re-register the Find controller',
    );
  });
});

test('JSON Find registration survives a new actions bag', async () => {
  const tab = jsonTab();
  await withDom(async (dom) => {
    const registrations: unknown[] = [];
    const registerFindController = ((controller: unknown) => { registrations.push(controller); }) as
      unknown as AppActions['registerFindController'];
    const state = appState({ tabs: [tab], activeTabId: tab.id } as Partial<State>);
    const view = h(JsonDocument, {
      tabId: tab.id, content: tab.file!.content, readOnly: true, active: true,
    });

    await mountApp(dom, view, { state, actions: appActions({ registerFindController }) });
    const afterMount = registrations.length;
    assert.ok(afterMount >= 1, 'an active JSON document registers its Find controller');
    assert.notEqual(registrations.at(-1), null, 'and leaves it registered');

    await mountApp(dom, view, { state, actions: appActions({ registerFindController }) });
    assert.equal(
      registrations.length,
      afterMount,
      'a fresh actions bag must not re-register the Find controller',
    );
  });
});

test('an inactive document releases Find, and reactivating registers once', async () => {
  const tab = jsonTab();
  await withDom(async (dom) => {
    const registrations: unknown[] = [];
    const registerFindController = ((controller: unknown) => { registrations.push(controller); }) as
      unknown as AppActions['registerFindController'];
    const state = appState({ tabs: [tab], activeTabId: tab.id } as Partial<State>);
    const actions = appActions({ registerFindController });
    const view = (active: boolean) => h(JsonDocument, {
      tabId: tab.id, content: tab.file!.content, readOnly: true, active,
    });

    await mountApp(dom, view(true), { state, actions });
    await mountApp(dom, view(false), { state, actions });
    assert.equal(registrations.at(-1), null, 'a backgrounded document drops its Find controller');
    await mountApp(dom, view(true), { state, actions });
    assert.notEqual(registrations.at(-1), null, 'reactivating registers again');
  });
});
