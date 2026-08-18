/**
 * The Preparation feature's three disclosure surfaces, asserted by
 * rendering them.
 *
 * All the logic this feature owns is copy selection and suppression:
 * which sentence a given mix of hidden files earns, when a dismissed card
 * is allowed back, and when the AI Index offer is allowed to appear at
 * all. None of that is reachable from the store tests — the counts live
 * in workspace state, but the rules for turning them into a notice live
 * here. See `code-review/renderer-workspace.md`.
 */
import '@/common/__tests__/domEnvironment';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { appActions, appState, mountApp, withDom, type DomHarness } from '@/common/__tests__/renderHarness';
import { OverlayStackProvider } from '@/common/components/OverlayStack';
import type { EmbedderState, UnsupportedFileSummary } from '@/common/api/api';
import { OPEN_EMBEDDING_SETUP_EVENT } from '@/common/lib/embeddingSetupTrigger';
import { ACCOUNT_CHANGED_EVENT } from '@/common/lib/accountEvents';
import EmbeddingSetupCallout from '@/features/preparation/components/EmbeddingSetupCallout';
import UnsupportedFilesCallout from '@/features/preparation/components/UnsupportedFilesCallout';
import { UnsupportedFilesModal } from '@/features/preparation/components/UnsupportedFilesModal';

function summary(
  sourceCode: number,
  other: number,
  ...extensions: string[]
): UnsupportedFileSummary {
  return {
    sourceCode,
    other,
    otherExtensions: extensions.map((extension) => ({ extension, count: 1 })),
  };
}

function click(dom: DomHarness, target: Element): Promise<void> {
  return dom.fire(target, new MouseEvent('click', { bubbles: true }));
}

/** Text of the whole document, portalled dialogs included. */
function visibleText(): string {
  return document.body.textContent ?? '';
}

// ---------------------------------------------------------------- modal

async function showModal(dom: DomHarness, unsupportedFiles: UnsupportedFileSummary): Promise<void> {
  await dom.render(h(OverlayStackProvider, null, h(UnsupportedFilesModal, {
    unsupportedFiles,
    onClose: () => {},
  })));
}

test('the mixed-cause dialog itemises both causes instead of picking one', async () => {
  await withDom(async (dom) => {
    await showModal(dom, summary(12, 5, '.zip', '.psd'));
    assert.equal(
      dom.query('[data-slot="dialog-title"]')?.textContent,
      "Some files in this folder aren't supported",
    );
    const items = dom.queryAll('li').map((item) => item.textContent);
    assert.equal(items.length, 2, 'one bullet per cause');
    assert.match(items[0] ?? '', /12 source-code and project files/);
    assert.match(items[1] ?? '', /5 files in other unsupported formats/);
    assert.match(items[1] ?? '', /\.zip, \.psd/);
    // The reassurance is the point of the dialog: nothing was touched.
    assert.match(visibleText(), /remain unchanged on disk/);
  });
});

test('a single-cause dialog names that cause in its title and description', async () => {
  await withDom(async (dom) => {
    await showModal(dom, summary(7, 0));
    assert.equal(
      dom.query('[data-slot="dialog-title"]')?.textContent,
      "Source code files aren't supported",
    );
    assert.match(dom.query('[data-slot="dialog-description"]')?.textContent ?? '', /7 source-code and project files/);
    assert.equal(dom.queryAll('li').length, 0, 'one cause needs no list');
  });

  await withDom(async (dom) => {
    await showModal(dom, summary(0, 3, '.zip'));
    assert.equal(
      dom.query('[data-slot="dialog-title"]')?.textContent,
      "Some file formats aren't supported yet",
    );
    assert.match(dom.query('[data-slot="dialog-description"]')?.textContent ?? '', /3 files in unsupported formats.*\.zip/);
  });
});

test('a long format list is capped at three, and the remainder is counted', async () => {
  await withDom(async (dom) => {
    await showModal(dom, summary(0, 9, '.zip', '.psd', '.dmg', '.iso', '.bin'));
    const description = dom.query('[data-slot="dialog-description"]')?.textContent ?? '';
    assert.match(description, /\.zip, \.psd, \.dmg and 2 more formats/);
    assert.doesNotMatch(description, /\.iso|\.bin/, 'the tail is counted, not listed');
  });

  await withDom(async (dom) => {
    await showModal(dom, summary(0, 4, '.zip', '.psd', '.dmg', '.iso'));
    assert.match(
      dom.query('[data-slot="dialog-description"]')?.textContent ?? '',
      /and 1 more format\b/,
      'a remainder of one is singular',
    );
  });
});

test('a dialog with nothing to disclose renders nothing at all', async () => {
  await withDom(async (dom) => {
    await showModal(dom, summary(0, 0));
    assert.equal(dom.query('[role="dialog"]'), null);
  });
});

test('the dialog offers exactly one way out, and it is the reassuring one', async () => {
  await withDom(async (dom) => {
    let closed = 0;
    await dom.render(h(OverlayStackProvider, null, h(UnsupportedFilesModal, {
      unsupportedFiles: summary(1, 1, '.zip'),
      onClose: () => { closed += 1; },
    })));
    const buttons = dom.queryAll('[data-slot="button"]');
    assert.deepEqual(buttons.map((button) => button.textContent), ['Continue with supported files']);
    await click(dom, buttons[0]);
    assert.equal(closed, 1);
  });
});

// -------------------------------------------------------------- callout

const DISMISS_KEY = 'stashbase.unsupported-callout-dismissed';

async function showCallout(
  dom: DomHarness,
  unsupportedFiles: UnsupportedFileSummary | undefined,
  folderPath: string | undefined,
  dispatch: (action: unknown) => void = () => undefined,
): Promise<void> {
  await mountApp(dom, h(UnsupportedFilesCallout), {
    state: appState({ workspace: { unsupportedFiles, folderPath } }),
    actions: appActions(),
    dispatch: dispatch as never,
  });
}

test('the sidebar card stays away unless this folder actually hides something', async () => {
  window.localStorage.clear();
  await withDom(async (dom) => {
    await showCallout(dom, summary(0, 0), '/workspace');
    assert.equal(dom.host.innerHTML, '', 'no hidden files, no card');

    await showCallout(dom, summary(3, 0), undefined);
    assert.equal(dom.host.innerHTML, '', 'a card with no folder to be about is not shown');
  });
});

test('the card names the cause it is about', async () => {
  window.localStorage.clear();
  await withDom(async (dom) => {
    await showCallout(dom, summary(4, 0), '/workspace');
    assert.match(visibleText(), /Source code is hidden/);
    assert.match(visibleText(), /4 source-code and project files are not shown or indexed/);

    await showCallout(dom, summary(0, 2, '.zip', '.psd'), '/workspace');
    assert.match(visibleText(), /Some file formats are hidden/);
    assert.match(visibleText(), /2 unsupported files \(\.zip, \.psd\)/);

    await showCallout(dom, summary(4, 2, '.zip'), '/workspace');
    assert.match(visibleText(), /Some files are hidden/);
    assert.match(visibleText(), /4 source-code files · 2 other unsupported files/);
  });
});

test('Details hands off to the full dialog rather than expanding in place', async () => {
  window.localStorage.clear();
  await withDom(async (dom) => {
    const dispatched: unknown[] = [];
    await showCallout(dom, summary(2, 0), '/workspace', (action) => dispatched.push(action));
    const details = dom.queryAll('button').find((button) => button.textContent === 'Details');
    assert.ok(details);
    await click(dom, details);
    assert.deepEqual(dispatched, [{ type: 'UNSUPPORTED_MODAL', open: true }]);
  });
});

test('dismissal is remembered per folder, and only for the categories disclosed', async () => {
  window.localStorage.clear();
  await withDom(async (dom) => {
    await showCallout(dom, summary(0, 2, '.zip'), '/workspace');
    const dismiss = dom.byLabel('Dismiss')[0];
    assert.ok(dismiss, 'the card can be waved off');
    await click(dom, dismiss);
    assert.equal(dom.host.innerHTML, '', 'dismissing hides it in place');

    // Persisted, so a remount in the same folder stays quiet.
    assert.deepEqual(
      JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? '{}'),
      { '/workspace': '.zip' },
    );
    await showCallout(dom, summary(0, 2, '.zip'), '/workspace');
    assert.equal(dom.host.innerHTML, '');

    // MORE files of an already-disclosed kind is not news.
    await showCallout(dom, summary(0, 40, '.zip'), '/workspace');
    assert.equal(dom.host.innerHTML, '', 'the signature tracks categories, not counts');

    // A NEW category is.
    await showCallout(dom, summary(0, 3, '.zip', '.psd'), '/workspace');
    assert.match(visibleText(), /Some file formats are hidden/);

    // And the dismissal never carries to another folder.
    await showCallout(dom, summary(0, 2, '.zip'), '/other');
    assert.match(visibleText(), /Some file formats are hidden/);
  });
  window.localStorage.clear();
});

// ------------------------------------------------------- embedding offer

function embedder(authorized: boolean): EmbedderState {
  return {
    provider: 'openai',
    hasKey: authorized,
    authorized,
    source: 'key',
    model: 'text-embedding-3-small',
    account: {},
  } as unknown as EmbedderState;
}

/** Serves `/api/embedder` from a mutable slot and counts the reads. */
function stubEmbedder(initial: EmbedderState | 'fail'): {
  set: (next: EmbedderState) => void;
  reads: () => number;
  restore: () => void;
} {
  const realFetch = globalThis.fetch;
  let current = initial;
  let reads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (!String(input).includes('/api/embedder')) return new Response('{}', { status: 200 });
    reads += 1;
    if (current === 'fail') return new Response('boom', { status: 500 });
    return new Response(JSON.stringify(current), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    set: (next) => { current = next; },
    reads: () => reads,
    restore: () => { globalThis.fetch = realFetch; },
  };
}

test('the AI Index offer stays hidden until the server says it is needed', async () => {
  // Unknown embedder state (the boot race) and an authorized one are both
  // silence — the offer only exists for a user who does NOT have it on.
  const failing = stubEmbedder('fail');
  try {
    await withDom(async (dom) => {
      await dom.render(h(EmbeddingSetupCallout));
      await dom.flush();
      assert.equal(dom.host.innerHTML, '', 'a failed read never renders a stale offer');
    });
  } finally {
    failing.restore();
  }

  const authorized = stubEmbedder(embedder(true));
  try {
    await withDom(async (dom) => {
      await dom.render(h(EmbeddingSetupCallout));
      await dom.flush();
      assert.equal(dom.host.innerHTML, '', 'nothing to offer once indexing is authorized');
    });
  } finally {
    authorized.restore();
  }
});

test('an unauthorized folder gets one quiet line that opens setup', async () => {
  const stub = stubEmbedder(embedder(false));
  try {
    await withDom(async (dom) => {
      await dom.render(h(EmbeddingSetupCallout));
      await dom.flush();
      assert.match(visibleText(), /AI Index isn’t enabled/);

      const buttons = dom.queryAll('button');
      assert.equal(buttons.length, 1, 'one action, no dismiss — the line IS the calm route');
      assert.equal(buttons[0].textContent, 'Set up');

      // It asks the Settings gate to open rather than owning a dialog.
      const opened: Event[] = [];
      const listener = (event: Event) => opened.push(event);
      window.addEventListener(OPEN_EMBEDDING_SETUP_EVENT, listener);
      try {
        await click(dom, buttons[0]);
      } finally {
        window.removeEventListener(OPEN_EMBEDDING_SETUP_EVENT, listener);
      }
      assert.equal(opened.length, 1);
    });
  } finally {
    stub.restore();
  }
});

test('signing in re-reads the embedder so the offer clears itself', async () => {
  const stub = stubEmbedder(embedder(false));
  try {
    await withDom(async (dom) => {
      await dom.render(h(EmbeddingSetupCallout));
      await dom.flush();
      assert.match(visibleText(), /AI Index isn’t enabled/);
      const before = stub.reads();

      // An account change can authorize indexing without this component
      // being told anything else; it must not keep offering setup.
      stub.set(embedder(true));
      await dom.fire(window as unknown as Element, new CustomEvent(ACCOUNT_CHANGED_EVENT));
      await dom.flush();
      assert.ok(stub.reads() > before, 'the account event triggers a re-read');
      assert.equal(dom.host.innerHTML, '', 'and the offer withdraws itself');
    });
  } finally {
    stub.restore();
  }
});
