/**
 * Agent panel accessibility semantics asserted through rendered output.
 * `ChatPane.tsx` is still on a later phase's split list and the transcript
 * now spans several modules, so these mount the surfaces rather than
 * reading their source.
 */
import '@/common/__tests__/domEnvironment';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { appState, mountApp, withDom } from '@/common/__tests__/renderHarness';
import { MessageList } from '@/features/agent-panel/components/AgentMessages';
import ChatPane from '@/features/agent-panel/components/ChatPane';
import { makeChatTab, type Action } from '@/store/state/state';

const emptyList = {
  blocks: [],
  queuedTurns: [],
  turnActive: false,
  turnMeta: {},
  phase: 'live' as const,
  fatal: null,
  fatalRecoveryLabel: 'Retry' as const,
  agentKind: 'codex' as const,
  agentShortName: 'Codex',
  onPermission: () => {},
  onSteerQueued: () => {},
  onCopyUserMessage: () => {},
  onResendUserMessage: () => {},
  onRetry: () => {},
  onOpenArtifact: () => {},
  onTurnFailureAction: () => {},
};

test('chat sessions are a named tab list whose tabs and panels reference each other', async () => {
  const first = { ...makeChatTab('codex', []), title: 'Chat 1' };
  const second = { ...makeChatTab('codex', [first]), title: 'Chat 2' };

  await withDom(async (dom) => {
    const dispatched: Action[] = [];
    await mountApp(dom, h(ChatPane), {
      state: appState({ chat: { chatOpen: true, chatTabs: [first, second], activeChatTabId: first.id } }),
      dispatch: (action) => dispatched.push(action),
    });

    const [tablist] = dom.byRole('tablist');
    assert.ok(tablist, 'the chat strip is a tab list');
    assert.equal(tablist.getAttribute('aria-label'), 'Chat sessions');

    const tabs = dom.byRole('tab');
    assert.equal(tabs.length, 2);
    assert.deepEqual(tabs.map((tab) => tab.getAttribute('aria-selected')), ['true', 'false']);
    // Roving tabindex: one stop for the whole strip.
    assert.deepEqual(tabs.map((tab) => tab.tabIndex), [0, -1]);

    // Every tab must point at its OWN panel, and that panel back at the tab
    // — a shared id would leave a screen reader on the wrong session.
    const panels = dom.byRole('tabpanel');
    assert.equal(panels.length, 2);
    for (const [index, tab] of tabs.entries()) {
      const controlled = tab.getAttribute('aria-controls');
      assert.ok(controlled);
      assert.equal(panels[index].id, controlled);
      assert.equal(panels[index].getAttribute('aria-labelledby'), tab.id);
    }
    assert.notEqual(panels[0].id, panels[1].id, 'chat panels are per session');

    await dom.fire(tabs[1], new MouseEvent('click', { bubbles: true }));
    assert.deepEqual(dispatched.at(-1), { type: 'CHAT_TAB_ACTIVATE', id: second.id });
  });
});

test('each chat tab offers a close action named for its session', async () => {
  const tab = { ...makeChatTab('codex', []), title: 'Release notes' };
  await withDom(async (dom) => {
    await mountApp(dom, h(ChatPane), {
      state: appState({ chat: { chatOpen: true, chatTabs: [tab], activeChatTabId: tab.id } }),
    });
    assert.equal(dom.byLabel('Close Release notes').length, 1);
  });
});

test('the transcript is a polite live log with an accessible name', async () => {
  await withDom(async (dom) => {
    await dom.render(h(MessageList, emptyList));
    const [log] = dom.byRole('log');
    assert.ok(log, 'the transcript announces itself as a log');
    assert.equal(log.getAttribute('aria-label'), 'Agent conversation');
    assert.equal(log.getAttribute('aria-live'), 'polite');
    assert.equal(log.getAttribute('aria-busy'), 'false');
  });
});

test('a running turn marks the transcript busy', async () => {
  await withDom(async (dom) => {
    await dom.render(h(MessageList, { ...emptyList, turnActive: true }));
    assert.equal(dom.byRole('log')[0].getAttribute('aria-busy'), 'true');
  });
});

test('a non-fatal runtime notice is polite status, not an alert', async () => {
  await withDom(async (dom) => {
    await dom.render(h(MessageList, {
      ...emptyList,
      blocks: [{ kind: 'notice', id: 'notice-1', text: 'Skill descriptions were shortened.' }],
      turnActive: true,
    }));

    const [status] = dom.byRole('status');
    assert.ok(status, 'the notice is exposed as status');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.equal(dom.byRole('alert').length, 0);
  });
});
