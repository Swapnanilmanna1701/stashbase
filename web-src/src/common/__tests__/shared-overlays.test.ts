/**
 * The shared interaction surfaces — dialogs, menus, toasts, tooltips, the
 * drag veil — asserted through what they RENDER.
 *
 * Every claim here used to be a regex over the component's source text,
 * which pinned each surface to one file path and one spelling. These
 * assertions mount the surface instead, so splitting `ManagedMenu.tsx` or
 * moving `ModalShell.tsx` into another folder changes nothing, while
 * dropping the Base UI primitive, the shared dialog recipe, the lazy
 * managed body, or the loading modality still fails.
 */
import '@/common/__tests__/domEnvironment';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, lazy, type ComponentType } from 'react';
import { AlertConfirmModal } from '@/app/components/AlertConfirmModal';
import { CascadePromptModal } from '@/app/components/CascadePromptModal';
import { appActions, appState, mountApp, withDom } from '@/common/__tests__/renderHarness';
import { ClipboardImportModal } from '@/common/components/ClipboardImportModal';
import { DropVeil } from '@/common/components/DropVeil';
import { LazyManagedModal } from '@/common/components/LazyManaged';
import ManagedDropVeil from '@/common/components/ManagedDropVeil';
import ManagedTooltipButton from '@/common/components/ManagedTooltipButton';
import { Menu } from '@/common/components/Menu';
import { ModalShell } from '@/common/components/ModalShell';
import { OverlayStackProvider } from '@/common/components/OverlayStack';
import { Toasts } from '@/common/components/Toasts';
import { TooltipButton } from '@/common/components/TooltipButton';
import { buttonVariants } from '@/common/components/ui/button';
import { Checkbox } from '@/common/components/ui/checkbox';
import { OPEN_SETTINGS_EVENT } from '@/common/lib/settingsTrigger';
import { pillClass } from '@/common/lib/pillMenuStyles';
import { SettingsPortal } from '@/features/settings';

function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}

function inProvider<P extends object>(Component: ComponentType<P>, props: P) {
  return h(OverlayStackProvider, null, h(Component, props));
}

test('the shared modal shell renders one Base UI dialog recipe: veil, width, title, description', async () => {
  await withDom(async (dom) => {
    await dom.render(inProvider(ModalShell, {
      title: 'Update references?',
      description: 'Renaming affects other notes.',
      onCancel: () => {},
    }));

    // Base UI owns the surface: its portal, its dialog role, its focus
    // guards. A hand-rolled portal would produce none of these.
    const portal = dom.query('[data-base-ui-portal]');
    assert.ok(portal, 'the dialog mounts through the Base UI portal');
    const dialog = dom.query('[role="dialog"]');
    assert.ok(dialog, 'the managed shell renders a Base UI dialog');

    // The one shared width recipe, and the enter/exit animation the
    // renderer's motion budget allows.
    const dialogClass = dialog.className;
    assert.match(dialogClass, /w-\[min\(420px,90vw\)\]/, 'default dialogs share one column width');
    assert.match(dialogClass, /data-open:zoom-in-95/);
    const veil = dom.query('[data-slot="dialog-overlay"]');
    assert.ok(veil, 'the dialog brings its own veil');
    assert.match(veil.className, /bg-veil/);
    assert.match(veil.className, /data-open:animate-in/);

    // Title and description are the dialog's labelling relationship, not
    // loose text: a screen reader announces them through aria-*.
    const title = dom.query('[data-slot="dialog-title"]');
    assert.equal(title?.textContent, 'Update references?');
    assert.equal(dialog.getAttribute('aria-labelledby'), title?.id);
    const description = dom.query('[data-slot="dialog-description"]');
    assert.equal(description?.textContent, 'Renaming affects other notes.');
    assert.equal(dialog.getAttribute('aria-describedby'), description?.id);
  });
});

test('the wide and narrow dialog columns are the only other shell widths', async () => {
  await withDom(async (dom) => {
    await dom.render(inProvider(ModalShell, { title: 'Wide', onCancel: () => {}, wide: true }));
    assert.match(dom.query('[role="dialog"]')!.className, /w-\[min\(480px,92vw\)\]/);
    await dom.render(inProvider(ModalShell, { title: 'Narrow', onCancel: () => {}, narrow: true }));
    assert.match(dom.query('[role="dialog"]')!.className, /w-\[min\(376px,90vw\)\]/);
  });
});

/** Event types a mount registers directly on `window`. */
async function windowListenerTypes(mount: () => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  const real = window.addEventListener.bind(window);
  const spy = (type: string, ...rest: unknown[]) => {
    seen.push(type);
    return (real as (...args: unknown[]) => void)(type, ...rest);
  };
  Object.defineProperty(window, 'addEventListener', { configurable: true, writable: true, value: spy });
  try {
    await mount();
  } finally {
    Object.defineProperty(window, 'addEventListener', { configurable: true, writable: true, value: real });
  }
  return seen;
}

test('the shell dismisses through the dialog exactly once — no hand-rolled key listener', async () => {
  // Two halves of the same rule, both of which used to be a
  // "source contains no addEventListener" regex: the dialog owns Escape
  // (one resolution, not zero and not two), and no container reaches past
  // it to wire a window-level key handler of its own.
  await withDom(async (dom) => {
    let cancels = 0;
    const types = await windowListenerTypes(() => dom.render(
      inProvider(ModalShell, { title: 'T', onCancel: () => { cancels += 1; } }),
    ));
    assert.ok(!types.includes('keydown'), `the shell wired a window key handler: ${types.join(', ')}`);
    await dom.fire(dom.query('[role="dialog"]')!, keydown('Escape'));
    assert.equal(cancels, 1, 'Escape dismisses the shell exactly once');
  });
});

test('every blocking modal container registers an overlay layer', async () => {
  // `useOverlayLayer` throws outside `OverlayStackProvider`, so mounting
  // each container bare is a direct probe of whether it still goes through
  // the shared `LazyManagedModal` primitive instead of hand-wiring Suspense.
  const containers: Array<[string, () => ReturnType<typeof h>]> = [
    ['ModalShell', () => h(ModalShell, { title: 'T', onCancel: () => {} })],
    ['ClipboardImportModal', () => h(ClipboardImportModal, {
      offer: {
        dataUrl: 'data:image/png;base64,AA==',
        mime: 'image/png',
        width: 1,
        height: 1,
        hash: 'h',
        filename: 'shot.png',
      },
      onAdd: () => {},
      onClose: () => {},
    })],
  ];
  for (const [name, element] of containers) {
    await withDom(async (dom) => {
      await assert.rejects(
        () => dom.render(element()),
        /OverlayStackProvider/,
        `${name} must register an overlay layer through LazyManagedModal`,
      );
    });
  }
});

test('the confirmation and settings containers register overlay layers too', async () => {
  // Same probe as above for the two containers that only mount once app
  // state (or a shell event) opens them.
  await withDom(async (dom) => {
    await assert.rejects(
      () => mountApp(dom, h(AlertConfirmModal), {
        state: appState({ uiShell: { modal: { type: 'confirm', message: 'Delete note?' } } }),
      }),
      /OverlayStackProvider/,
      'AlertConfirmModal must register an overlay layer through LazyManagedModal',
    );
  });

  await withDom(async (dom) => {
    await dom.render(h(SettingsPortal));
    assert.equal(dom.host.innerHTML, '', 'Settings stays unmounted until it is asked for');
    await assert.rejects(
      () => dom.fire(window as unknown as Element, new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { section: 'appearance' } })),
      /OverlayStackProvider/,
      'SettingsPortal must register an overlay layer through LazyManagedModal',
    );
  });
});

test('a confirmation is a Base UI alert dialog on the shared column width', async () => {
  await withDom(async (dom) => {
    const resolved: boolean[] = [];
    await mountApp(dom, h(OverlayStackProvider, null, h(AlertConfirmModal)), {
      state: appState({ uiShell: { modal: { type: 'confirm', message: 'Delete note?', confirmLabel: 'Delete' } } }),
      actions: appActions({ resolveModal: ((value: boolean) => { resolved.push(value); }) as never }),
    });

    const dialog = dom.query('[role="alertdialog"]');
    assert.ok(dialog, 'a confirmation uses the alert-dialog primitive, not a plain dialog');
    assert.match(dialog.className, /w-\[min\(420px,90vw\)\]/);
    assert.ok(dom.query('[data-base-ui-portal]'), 'it mounts through the Base UI portal');
    assert.match(dialog.textContent ?? '', /Delete note\?/);
  });
});

test('the cascade prompt dismisses through the shared dialog exactly once', async () => {
  await withDom(async (dom) => {
    const decisions: string[] = [];
    const types = await windowListenerTypes(() => mountApp(dom, h(OverlayStackProvider, null, h(CascadePromptModal)), {
      state: appState({
        uiShell: {
          cascadePrompt: { kind: 'file', oldPath: 'a/old.md', newPath: 'a/new.md', files: 2, links: 3 },
        },
      }),
      actions: appActions({ resolveCascadePrompt: ((decision: string) => { decisions.push(decision); }) as never }),
    }));
    assert.ok(!types.includes('keydown'), `the prompt wired a window key handler: ${types.join(', ')}`);

    const dialog = dom.query('[role="dialog"]');
    assert.ok(dialog, 'the prompt rides the shared modal shell');
    assert.equal(dom.query('[data-slot="dialog-title"]')?.textContent, 'Update references?');
    assert.deepEqual(
      dom.queryAll('[data-slot="button"]').map((button) => button.textContent),
      ['Cancel', "Don't update", 'Update'],
    );

    await dom.fire(dialog, keydown('Escape'));
    assert.deepEqual(decisions, ['cancel'], 'Escape cancels once — the prompt adds no key listener');
  });
});

test('a modal whose managed chunk has not arrived is still a blocking, dismissible dialog', async () => {
  // The `LazyManagedModal` fallback recipe: a native modal `<dialog>` that
  // owns Esc until the real dialog takes over. Held in the pending state by
  // a lazy component that never resolves.
  const NeverArrives = lazy<ComponentType<{ isTopmost: boolean }>>(() => new Promise(() => {}));
  await withDom(async (dom) => {
    let cancels = 0;
    const opened: string[] = [];
    const proto = window.HTMLDialogElement.prototype;
    const realModal = proto.showModal;
    const realShow = proto.show;
    proto.showModal = function trackedShowModal() { opened.push('showModal'); return realModal.call(this); };
    proto.show = function trackedShow() { opened.push('show'); return realShow.call(this); };
    try {
      await dom.render(h(OverlayStackProvider, null, h(LazyManagedModal, {
        as: NeverArrives,
        open: true,
        label: 'Opening dialog…',
        onCancel: () => { cancels += 1; },
        componentProps: {},
      })));
    } finally {
      proto.showModal = realModal;
      proto.show = realShow;
    }

    const dialog = dom.query('dialog') as HTMLDialogElement | null;
    assert.ok(dialog, 'the loading placeholder is a native dialog');
    assert.equal(dialog.getAttribute('aria-label'), 'Opening dialog…');
    assert.equal(dialog.open, true, 'the placeholder opens itself');
    // Specifically showModal(), not show(): only the modal form puts the
    // dialog in the top layer and blocks the app behind it. (happy-dom
    // does not model `:modal`, so the call is what is observable here.)
    assert.deepEqual(opened, ['showModal'], 'the placeholder must open as a MODAL dialog');
    assert.match(dom.html(), /Opening dialog…/);

    await dom.fire(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    assert.equal(cancels, 1, 'the topmost placeholder owns Esc');
  });
});

test('a placeholder that is not topmost ignores Esc', async () => {
  const NeverArrives = lazy<ComponentType<{ isTopmost: boolean }>>(() => new Promise(() => {}));
  await withDom(async (dom) => {
    let cancels = 0;
    // Two layers: the FIRST is no longer topmost once the second registers.
    await dom.render(h(OverlayStackProvider, null,
      h(LazyManagedModal, {
        as: NeverArrives,
        open: true,
        label: 'Opening dialog…',
        onCancel: () => { cancels += 1; },
        componentProps: {},
      }),
      h(LazyManagedModal, {
        as: NeverArrives,
        open: true,
        label: 'Opening Settings…',
        onCancel: () => {},
        componentProps: {},
      })));

    const buried = dom.queryAll('dialog').find((node) => node.getAttribute('aria-label') === 'Opening dialog…');
    assert.ok(buried);
    await dom.fire(buried, new Event('cancel', { bubbles: false, cancelable: true }));
    assert.equal(cancels, 0, 'only the topmost layer answers Esc');
  });
});

test('the clipboard prompt rides the shared dialog and offers Dismiss plus a focused Add', async () => {
  await withDom(async (dom) => {
    let added = 0;
    let closed = 0;
    await dom.render(h(OverlayStackProvider, null, h(ClipboardImportModal, {
      offer: {
        dataUrl: 'data:image/png;base64,AA==',
        mime: 'image/png',
        width: 2,
        height: 2,
        hash: 'hash',
        filename: 'shot.png',
      },
      onAdd: () => { added += 1; },
      onClose: () => { closed += 1; },
    })));

    // Same shared shell — not a bespoke surface.
    const dialog = dom.query('[role="dialog"]');
    assert.ok(dialog);
    assert.match(dialog.className, /w-\[min\(420px,90vw\)\]/);
    assert.equal(dom.query('[data-slot="dialog-title"]')?.textContent, 'Add image to StashBase?');
    assert.ok(dom.query('.clipboard-offer-preview img'), 'the thumbnail names the source');

    const buttons = dom.queryAll('[data-slot="button"]');
    const labels = buttons.map((button) => button.textContent);
    assert.deepEqual(labels, ['Dismiss', 'Add'], 'both actions come from the shared button recipe');

    const add = buttons[1];
    assert.equal(document.activeElement, add, 'Add takes focus so Enter adds');
    await dom.fire(add, new MouseEvent('click', { bubbles: true }));
    assert.equal(added, 1);

    await dom.fire(dialog, keydown('Escape'));
    assert.equal(closed, 1, 'the dialog owns Esc — the prompt adds no listener of its own');
  });
});

test('the generic shell carries no clipboard-specific actions', async () => {
  await withDom(async (dom) => {
    await dom.render(inProvider(ModalShell, { title: 'Plain', onCancel: () => {} }));
    assert.deepEqual(dom.queryAll('[data-slot="button"]').map((b) => b.textContent), []);
    assert.doesNotMatch(dom.html(), /Add image to StashBase/);
  });
});

test('menus are Base UI popups positioned from the anchor, not hand-measured', async () => {
  await withDom(async (dom) => {
    await dom.render(h(Menu, {
      anchor: { x: 24, y: 48 },
      items: [{ label: 'Rename', onSelect: () => {} }, { separator: true as const }, { label: 'Delete', onSelect: () => {} }],
      onClose: () => {},
    }));

    assert.ok(dom.query('[data-base-ui-portal]'), 'the menu mounts through the Base UI portal');
    const popup = dom.query('[role="menu"]');
    assert.ok(popup, 'the lazy managed body renders the Base UI menu');
    assert.equal(popup.getAttribute('aria-orientation'), 'vertical');
    assert.deepEqual(
      dom.byRole('menuitem').map((item) => item.textContent),
      ['Rename', 'Delete'],
    );

    // Base UI's positioner reports side/align and places the popup from the
    // anchor. A component measuring with getBoundingClientRect() into its
    // own state would leave these absent.
    const positioner = dom.query('[data-slot="menu-positioner"]');
    assert.ok(positioner);
    assert.ok(positioner.getAttribute('data-side'), 'the positioner resolves a side');
    assert.ok(positioner.getAttribute('data-align'), 'the positioner resolves an alignment');
    assert.match(positioner.getAttribute('style') ?? '', /translate\(24px, 48px\)/);
  });
});

test('the toast viewport is a Base UI region that ships with the shell', async () => {
  await withDom(async (dom) => {
    await dom.render(h(Toasts));
    assert.ok(dom.query('[data-base-ui-portal]'), 'toasts portal out of the shell tree');
    const viewport = dom.query('[data-slot="toast-viewport"]');
    assert.ok(viewport, 'the lazy managed viewport arrives with the shell');
    assert.equal(viewport.getAttribute('role'), 'region');
    assert.equal(viewport.getAttribute('aria-label'), 'Notifications');
    assert.equal(viewport.getAttribute('aria-live'), 'polite');
  });
});

test('toast lifecycle is not reducer state', async () => {
  // Toasts live in the Base UI runtime, never in the app reducer. The
  // reducer's switch is exhaustive over its own union and returns undefined
  // for anything outside it, so an unhandled TOAST_* action proves the
  // union does not carry one.
  const { initialState, reducer } = await import('@/store/state/state');
  for (const type of ['TOAST_ADD', 'TOAST_DISMISS', 'TOAST_CLEAR']) {
    assert.equal(
      reducer(initialState, { type } as never),
      undefined,
      `${type} must not be an app reducer action`,
    );
  }
  assert.ok(reducer(initialState, { type: 'CHAT_TOGGLE' }), 'a real action still reduces');
  assert.deepEqual(
    Object.keys(initialState).filter((key) => /toast/i.test(key)),
    [],
    'no toast field lives in app state',
  );
});

test('a tooltip button is one real button carrying its own accessible name', async () => {
  await withDom(async (dom) => {
    let clicks = 0;
    await dom.render(h(TooltipButton, {
      label: 'Add folder',
      onClick: () => { clicks += 1; },
      children: h('span', null, '+'),
    }));

    const buttons = dom.queryAll('button');
    assert.equal(buttons.length, 1, 'the trigger renders one button element, not a wrapper pair');
    assert.equal(buttons[0].getAttribute('aria-label'), 'Add folder');
    // The trigger is Base UI's tooltip trigger rendered AS a real <button>,
    // not a wrapper element with a role.
    assert.ok(buttons[0].hasAttribute('data-base-ui-tooltip-trigger'));
    await dom.fire(buttons[0], new MouseEvent('click', { bubbles: true }));
    assert.equal(clicks, 1);
  });
});

test('a disabled tooltip button forwards disabled to the rendered button', async () => {
  await withDom(async (dom) => {
    await dom.render(h(TooltipButton, { label: 'Add folder', disabled: true, children: '+' }));
    const button = dom.query('button') as HTMLButtonElement;
    assert.equal(button.disabled, true);
    // The trigger is Base UI's, rendered AS a real <button> — a div with a
    // role would neither disable nor submit.
    assert.equal(button.getAttribute('data-slot'), 'tooltip-trigger');
  });
});

test('the tooltip button keeps focus when its managed chunk replaces the fallback', async () => {
  // The eager fallback flags that it held focus; the managed trigger has to
  // take it back, or the upgrade silently drops the user's keyboard place.
  await withDom(async (dom) => {
    await dom.render(h(ManagedTooltipButton, {
      label: 'Add folder',
      focusTransferRef: { current: true },
      children: '+',
    }));
    assert.equal(document.activeElement, dom.query('button'), 'the trigger reclaims focus');
  });

  await withDom(async (dom) => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    await dom.render(h(ManagedTooltipButton, {
      label: 'Add folder',
      focusTransferRef: { current: false },
      children: '+',
    }));
    assert.equal(document.activeElement, outside, 'an unfocused fallback never steals focus');
    outside.remove();
  });
});

test('the drag veil upgrades to the reduced-motion-aware animated chunk', async () => {
  await withDom(async (dom) => {
    await dom.render(h(DropVeil, { hot: false }));
    assert.equal(dom.host.innerHTML, '', 'no veil, no motion chunk, until a drag begins');

    await dom.render(h(DropVeil, { hot: true }));
    const veil = dom.query('.drop-veil.hot');
    assert.ok(veil, 'the veil appears for an active drag');
    assert.equal(veil.textContent, 'Release to import');
    // The plain fallback has no inline opacity; only the managed motion
    // body drives one, so this is what proves the lazy pair is wired.
    assert.match(veil.getAttribute('style') ?? '', /opacity:/);
  });

  // Reduced-motion honouring and the opacity-only enter are the managed
  // body's own output.
  const managed = ManagedDropVeil() as {
    props: { reducedMotion?: string; children: { props: Record<string, unknown> } };
  };
  assert.equal(managed.props.reducedMotion, 'user', 'motion follows the OS reduced-motion setting');
  assert.deepEqual(managed.props.children.props.initial, { opacity: 0 });
  assert.deepEqual(managed.props.children.props.animate, { opacity: 1 });
});

test('buttons are items on the control corner step, never container boxes', () => {
  // A single `rounded-lg` anywhere in the recipe would turn every 32px
  // button into a capsule, since lg/xl/2xl all collapse onto the container
  // role. Reading the generated class strings covers every variant and
  // size, which a regex over one file's text never did.
  const variants = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'destructive-outline', 'link'] as const;
  const sizes = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;
  for (const variant of variants) {
    for (const size of sizes) {
      const classes = buttonVariants({ variant, size });
      assert.doesNotMatch(classes, /rounded-(lg|xl|2xl)/, `${variant}/${size} reaches for a container corner`);
      assert.match(classes, /rounded-md/, `${variant}/${size} lost the control corner`);
    }
  }
});

test('a checkbox is a Base UI control that sits on its label\'s baseline', async () => {
  await withDom(async (dom) => {
    await dom.render(h('label', null, h(Checkbox, { name: 'clipboardImageImport' }), 'Import clipboard images'));
    // Base UI renders the real control; a hand-rolled div would carry no
    // checkbox role and no checked state for a screen reader to announce.
    const box = dom.query('[role="checkbox"]');
    assert.ok(box, 'the checkbox renders a Base UI checkbox');
    assert.equal(box.getAttribute('data-slot'), 'checkbox');
    // Settings rows align the control with its label through the row's own
    // flex baseline. A margin baked into the primitive would nudge it out of
    // alignment in every row that does NOT expect one.
    assert.doesNotMatch(box.className, /\bmt-/, 'the checkbox bakes in a vertical offset');
  });
});

test('composer pills yield width under pressure instead of clipping Send', () => {
  // `min-w-0` on the trigger is what lets a tight chat bar truncate a pill
  // label rather than push the send button off the row.
  assert.match(pillClass, /^inline-flex min-w-0 /);
});
