import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { createDocumentNavigationRuntime } from '@/features/documents/application/navigation-runtime';

const editorHarness = vi.hoisted(() => ({
  change: null as ((context: unknown, markdown: string, previous: string) => void) | null,
  held: null as string | null,
  instances: [] as Array<{
    action: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    readonlyValues: boolean[];
    status: string;
  }>,
}));

vi.mock('@milkdown/crepe/builder', () => ({
  CrepeBuilder: class FakeCrepeBuilder {
    readonly instance = {
      action: vi.fn(),
      destroy: vi.fn(async () => undefined),
      readonlyValues: [] as boolean[],
      status: 'OnCreate',
    };

    editor = {
      action: this.instance.action,
      config: () => this.editor,
      remove: async () => this.editor,
      use: () => this.editor,
      get status() {
        return editorHarness.instances.at(-1)?.status ?? 'OnCreate';
      },
    };

    constructor() {
      editorHarness.instances.push(this.instance);
    }

    addFeature() {
      return this;
    }

    async create() {
      this.instance.status = 'Created';
    }

    destroy = this.instance.destroy;

    getMarkdown() {
      return 'body';
    }

    setReadonly(value: boolean) {
      this.instance.readonlyValues.push(value);
      return this;
    }
  },
}));

vi.mock('./changes', () => ({
  watchMarkdownChanges: (
    _editor: unknown,
    { accepts, report }: { accepts(): boolean; report(markdown: string): void },
  ) => {
    editorHarness.change = (_context, markdown) => {
      if (accepts()) report(markdown);
    };
    return {
      flush: () => {
        if (editorHarness.held === null) return false;
        const value = editorHarness.held;
        editorHarness.held = null;
        report(value);
        return true;
      },
      rebase: () => undefined,
    };
  },
}));

import { MathModeContext } from '@/shared/ui/math-mode';

import { MarkdownDocument, type MarkdownDocumentProps } from './document';

afterEach(() => {
  cleanup();
  editorHarness.change = null;
  editorHarness.held = null;
  editorHarness.instances.length = 0;
});

describe('Markdown document surface', () => {
  it('flushes held text and waits for a clean document before changing its project parser', async () => {
    const onChange = vi.fn();
    const props: MarkdownDocumentProps = {
      active: true,
      canChangeMode: true,
      dirty: false,
      holdEdits: () => () => undefined,
      mode: 'writer',
      name: 'math.md',
      onChange,
      onNavigate: vi.fn(),
      onModeChange: vi.fn(),
      onOpenExternal: vi.fn(async () => true),
      navigation: createDocumentNavigationRuntime('math'),
      revision: { onPending: vi.fn(), state: { kind: 'idle' } },
      readOnly: false,
      source: { folderPath: '/project', path: 'math.md' },
      tabId: 'math',
      value: '$x$',
    };
    const view = (enabled: boolean, dirty = false, folderPath = '/project') => (
      <MathModeContext value={{ folderPath, enabled }}>
        <MarkdownDocument {...props} dirty={dirty} />
      </MathModeContext>
    );
    const { rerender } = render(view(false));
    await waitFor(() =>
      expect(screen.getByRole('document').getAttribute('data-markdown-state')).toBe('ready'),
    );
    editorHarness.held = 'typed $x$';
    rerender(view(true));
    expect(onChange).toHaveBeenCalledWith('typed $x$');
    expect(editorHarness.instances).toHaveLength(1);
    rerender(view(true, true));
    expect(editorHarness.instances).toHaveLength(1);
    props.value = 'typed $x$';
    rerender(view(true));
    await waitFor(() => expect(editorHarness.instances).toHaveLength(2));
    expect(onChange).toHaveBeenCalledOnce();
    rerender(view(false, false, '/other'));
    await waitFor(() => expect(editorHarness.instances).toHaveLength(3));
    rerender(view(true, false, '/other'));
    expect(editorHarness.instances).toHaveLength(3);
  });

  it('names the read-only document canvas and offers its mode switch', () => {
    const navigation = createDocumentNavigationRuntime('tab-1');
    render(
      <MarkdownDocument
        active
        canChangeMode
        dirty={false}
        holdEdits={() => () => undefined}
        mode="reading"
        name="plan.md"
        onChange={vi.fn()}
        onNavigate={vi.fn()}
        onModeChange={vi.fn()}
        onOpenExternal={vi.fn(async () => true)}
        navigation={navigation}
        revision={{ onPending: vi.fn(), state: { kind: 'idle' } }}
        readOnly
        source={{ folderPath: '/project/notes', path: 'plan.md' }}
        tabId="tab-1"
        value="# Plan"
      />,
    );

    const canvas = screen.getByRole('document', { name: 'plan.md Markdown content' });
    expect(canvas.getAttribute('data-read-only')).toBe('true');
    expect(screen.getByRole('tablist', { name: 'Markdown mode' })).not.toBeNull();
  });

  it('reattaches valid frontmatter when Milkdown serializes a Writer change', async () => {
    const onChange = vi.fn();
    const navigation = createDocumentNavigationRuntime('tab-1');
    render(
      <MarkdownDocument
        active
        canChangeMode
        dirty={false}
        holdEdits={() => () => undefined}
        mode="writer"
        name="plan.md"
        onChange={onChange}
        onNavigate={vi.fn()}
        onModeChange={vi.fn()}
        onOpenExternal={vi.fn(async () => true)}
        navigation={navigation}
        revision={{ onPending: vi.fn(), state: { kind: 'idle' } }}
        readOnly={false}
        source={{ folderPath: '/project/notes', path: 'plan.md' }}
        tabId="tab-1"
        value={'---\ntitle: Plan\n---\nbody'}
      />,
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('document', { name: 'plan.md Markdown content' })
          .getAttribute('data-markdown-state'),
      ).toBe('ready'),
    );

    act(() => editorHarness.change?.({}, 'updated body', 'body'));

    expect(onChange).toHaveBeenCalledWith('---\ntitle: Plan\n---\nupdated body');
  });

  it('changes the retained editor boundary in place and destroys it on unmount', async () => {
    const navigation = createDocumentNavigationRuntime('tab-1');
    const { rerender, unmount } = render(
      <MarkdownDocument
        active
        canChangeMode
        dirty={false}
        holdEdits={() => () => undefined}
        mode="writer"
        name="plan.md"
        onChange={vi.fn()}
        onNavigate={vi.fn()}
        onModeChange={vi.fn()}
        onOpenExternal={vi.fn(async () => true)}
        navigation={navigation}
        revision={{ onPending: vi.fn(), state: { kind: 'idle' } }}
        readOnly={false}
        source={{ folderPath: '/project/notes', path: 'plan.md' }}
        tabId="tab-1"
        value="body"
      />,
    );
    await waitFor(() => expect(editorHarness.instances).toHaveLength(1));
    const instance = editorHarness.instances[0];
    if (!instance) throw new Error('Expected a Milkdown editor instance.');

    rerender(
      <MarkdownDocument
        active
        canChangeMode
        dirty={false}
        holdEdits={() => () => undefined}
        mode="reading"
        name="plan.md"
        onChange={vi.fn()}
        onNavigate={vi.fn()}
        onModeChange={vi.fn()}
        onOpenExternal={vi.fn(async () => true)}
        navigation={navigation}
        revision={{ onPending: vi.fn(), state: { kind: 'idle' } }}
        readOnly
        source={{ folderPath: '/project/notes', path: 'plan.md' }}
        tabId="tab-1"
        value="body"
      />,
    );

    expect(editorHarness.instances).toHaveLength(1);
    expect(instance.readonlyValues.at(-1)).toBe(true);
    unmount();
    expect(instance.destroy).toHaveBeenCalledOnce();
  });
});
