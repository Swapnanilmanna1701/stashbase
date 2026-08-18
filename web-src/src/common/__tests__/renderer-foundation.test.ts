/**
 * Design-token discipline for the renderer's foundation.
 *
 * WHY THIS FILE READS SOURCE TEXT, AND WHY THAT IS ONLY EVER STYLESHEETS
 * --------------------------------------------------------------------
 * A stylesheet has no rendered output to assert against. `--radius-lg:
 * var(--radius-container)` is not observable from any component: nothing
 * mounts it, jsdom/happy-dom resolve `var()` only for declarations they
 * were handed, and the rule these tests protect is about which ROLE a token
 * forwards, not about any pixel that lands on screen. The text of the
 * stylesheet is the artefact. Reading it is the assertion.
 *
 * A component is the opposite. `aria-label`, `role`, a class recipe, the
 * Base UI primitive a surface delegates to, whether a lazy container really
 * loads its managed body — every one of those is observable by mounting the
 * component, and every one of them is invisible to a regex the moment the
 * component moves file, gets split in two, or spells the same output a
 * different way. Component invariants therefore live in tests that RENDER:
 * see `shared-overlays.test.ts`,
 * `@/features/workspace/__tests__/accessibility-semantics.test.ts`,
 * `@/app/__tests__/app-shell-semantics.test.ts`, and the per-feature
 * `__tests__` folders. Do not move a component assertion back into this
 * file, and do not "clean up" the stylesheet reads that remain — they are
 * the only form those assertions can take.
 *
 * The two `walkCss` / `walkSources` scans below are the one deliberate
 * exception on the source-text side: they are repo-wide bans on specific
 * literals (a legacy accent blue, an arbitrary-value escape, a hand-stamped
 * platform class) that must hold in EVERY file, including inside injected
 * `<style>` strings that no render can reach. They walk the tree rather
 * than naming paths, so a file moving between feature folders neither
 * breaks them nor silently drops out of their coverage.
 *
 * `electron/preload.cjs` is read for the same reason as a stylesheet: it is
 * a main-process file with no renderer to mount.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('renderer foundation keeps Tailwind utility-only and maps semantic tokens', () => {
  const styles = read('web-src/src/styles.css');
  assert.match(styles, /tailwindcss\/theme\.css/);
  assert.match(styles, /tailwindcss\/utilities\.css/);
  assert.doesNotMatch(styles, /tailwindcss\/preflight\.css/);
  for (const token of [
    'background', 'foreground', 'pane', 'card', 'border', 'accent', 'focus', 'danger',
    'status-info', 'status-success', 'status-warning', 'status-danger',
    'scrim', 'veil', 'veil-quiet', 'stroke-strong',
  ]) {
    assert.match(styles, new RegExp(`--color-${token}:`));
  }
  assert.match(styles, /--spacing-density:/);
  assert.match(styles, /--radius-control:/);
});

test('theme maps shadcn surface/text semantics and the app dark variant', () => {
  const styles = read('web-src/src/styles.css');
  // `muted` is the subtle SURFACE role; `muted-foreground` the subdued text.
  assert.match(styles, /--color-muted: var\(--hover\);/);
  assert.match(styles, /--color-muted-foreground: var\(--muted\);/);
  assert.match(styles, /--color-input:/);
  // dark: must follow data-theme, not the raw media query.
  assert.match(styles, /@custom-variant dark/);
  assert.match(styles, /:root\[data-theme='dark'\] &/);
});

test('chrome type scale and radius scale are the only visual values', () => {
  const styles = read('web-src/src/styles.css');
  // Every text-* utility scales with the interface-size preference.
  for (const step of ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']) {
    assert.match(styles, new RegExp(`--text-${step}: calc\\([0-9]+px \\* var\\(--ui-scale\\)\\);`));
  }
  // Brand role: the amber counterpoint is a named token, so warmth-budget
  // surfaces never restate the literal.
  assert.match(styles, /--color-accent-amber: var\(--accent-amber\);/);
  // Every corner step forwards a globals.css role instead of restating a
  // literal — that is what lets styles/*.css reach the same roles through
  // var(--radius-container) and friends, and what keeps one edit re-shaping
  // the whole app. lg/xl/2xl collapsing onto ONE container role is the
  // contract, not an oversight: boxes are not graded by size here, so a
  // component reaching for any of the three must land on the same corner.
  for (const [name, role] of [
    ['xs', 'var(--radius-xs)'],
    ['sm', 'var(--radius-control)'],
    ['md', 'var(--radius-ui)'],
    ['lg', 'var(--radius-container)'],
    ['xl', 'var(--radius-container)'],
    ['2xl', 'var(--radius-container)'],
  ]) {
    assert.match(styles, new RegExp(`--radius-${name}: ${role.replace(/[()*]/g, (c) => '\\' + c)};`));
  }
  // Buttons are items, not boxes: the Button recipe must never reach for a
  // container step. That one is asserted against the class strings the
  // component actually emits — see `shared-overlays.test.ts`.

  // Legacy CSS stays on the shared scale: no half-pixel chrome sizes, no
  // off-palette accent blues, no odd font weights. Scans every colocated
  // .css file (not a hardcoded list) so this coverage survives a file
  // moving to a new feature folder without silently going stale.
  const walkCss = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walkCss(rel);
      return entry.name.endsWith('.css') ? [rel] : [];
    });
  const legacy = walkCss('web-src/src')
    .map((file) => read(file))
    .join('\n');
  const legacyBlue = /46, ?116, ?230|#4a8cff|#4f7cff|#1a73e8/;
  assert.doesNotMatch(legacy, /font-size: calc\((9|10|11|12|13)\.5px/);
  assert.doesNotMatch(legacy, /font-weight: *(650|800)\b/);
  assert.doesNotMatch(legacy, legacyBlue);
  // The ban covers TS/TSX too: the legacy blue once hid inside injected
  // <style> strings (previewChunkHighlight, findIframe) where a CSS-only
  // scan could not see it.
  const walkSources = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walkSources(rel);
      return /\.tsx?$/.test(entry.name) ? [rel] : [];
    });
  for (const file of walkSources('web-src/src')) {
    assert.doesNotMatch(read(file), legacyBlue, `${file} carries a legacy accent blue`);
    // Cursor-style chrome has no `is-electron` switch: platform classes are
    // stamped ONCE by `electron/preload.cjs` as `platform-${process.platform}`
    // (asserted below), and the app-shell CSS keys off those. A renderer
    // module stamping its own class would fork that contract, so the ban is
    // repo-wide rather than pinned to whichever file composes the shell.
    assert.doesNotMatch(read(file), /is-electron/, `${file} stamps its own Electron class`);
  }
  // Corners come off the scale too. The transcript's jump-to-latest
  // capsule is the one sanctioned literal — a 999px pill is a shape, not
  // a scale step, and it opts out of the squircle for the same reason.
  assert.deepEqual(legacy.match(/border-radius: *\d+px/g) ?? [], ['border-radius: 999px']);
  // The squircle is what makes the corners read as continuous rather than
  // merely large; losing it silently would flatten the whole app.
  assert.match(legacy, /corner-shape: squircle;/);

  // Migrated components consume named tokens, not arbitrary-value escapes.
  // Reuses walkSources above (rather than a hardcoded directory list) so
  // this coverage survives feature-folder moves without silently going stale.
  for (const file of walkSources('web-src/src').filter((f) => f.endsWith('.tsx'))) {
    const source = read(file);
    assert.doesNotMatch(source, /text-\[calc\(/, `${file} uses an arbitrary scaled font size — use the text-* ramp`);
    assert.doesNotMatch(source, /bg-\[var\(--hover\)\]/, `${file} uses bg-[var(--hover)] — use bg-muted`);
    assert.doesNotMatch(source, /rounded-\[\d+(?:\.\d+)?px\]/, `${file} uses a literal radius — use the rounded-* role scale`);
    // Placeholders are one role, not a per-field opacity guess. Four
    // fields had drifted to three different values before this landed.
    assert.doesNotMatch(source, /placeholder:text-(?!placeholder\b)/, `${file} styles a placeholder off-role — use placeholder:text-placeholder`);
  }
});

test('explicit-dark and system-dark token blocks stay identical', () => {
  // globals.css maintains the dark palette twice: once for the explicit
  // data-theme='dark' choice and once for system-following mode. They are
  // hand-synced duplicates (see the comment above the blocks) — this guards
  // against a token landing in one and silently missing from the other.
  const globals = read('web-src/src/styles/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = (block: RegExp): string[] => {
    const body = globals.match(block)?.[1];
    assert.ok(body, `dark theme block not found: ${block}`);
    return body.split(';').map((decl) => decl.trim()).filter(Boolean);
  };
  const explicitDark = declarations(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/);
  const systemDark = declarations(
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\),\s*:root\[data-theme='system'\]\s*\{([^}]*)\}/,
  );
  assert.deepEqual(systemDark, explicitDark);
});

test('shadcn generation is configured for Base UI and renderer aliases', () => {
  const config = JSON.parse(read('components.json')) as Record<string, unknown>;
  assert.equal(config.style, 'base-nova');
  assert.equal(config.rsc, false);
  assert.equal((config.tailwind as { css?: string }).css, 'web-src/src/styles.css');
  assert.equal((config.aliases as { ui?: string }).ui, '@/common/components/ui');
});

test('motion is budgeted and reduced-motion is honoured at the stylesheet level', () => {
  // The per-component motion contracts (the drag veil's reduced-motion
  // config, the dialog's enter/exit) are asserted by rendering, in
  // `shared-overlays.test.ts`. What lives only in CSS is the global budget.
  const globals = read('web-src/src/styles/globals.css');
  assert.match(globals, /transition-property: opacity, color, background-color/);
  assert.match(globals, /animation-duration: 0\.01ms !important/);
});

test('the Electron chrome contract is stamped once, by preload', () => {
  // A main-process file: no renderer, nothing to mount, so its text is the
  // artefact — the same reason the stylesheet reads above stay.
  const preload = read('electron/preload.cjs');
  assert.match(preload, /platform-\$\{process\.platform\}/);
});

test('shell geometry and reading-surface fixes stay pinned', () => {
  const appShell = read('web-src/src/app/app-shell.css');
  // Cursor-style chrome: no titlebar strip — the traffic lights float
  // over the sidebar's top drag zone and the tab strip's empty
  // background doubles as the other macOS drag surface. This composition
  // lives in the app shell, not any one feature's CSS. (The sidebar's
  // matching drag-zone ELEMENT is asserted by rendering the sidebar — see
  // `@/app/__tests__/app-shell-semantics.test.ts`.)
  assert.doesNotMatch(appShell, /app-chrome/);
  assert.match(appShell, /platform-darwin \.sidebar-drag-zone/);
  assert.match(appShell, /platform-darwin \.tab-strip/);
  // Drag surfaces never overlap controls: the sidebar drag zone stops at
  // the titlebar controls (per-element no-drag carve-outs proved
  // intermittently stale on windowed macOS — geometry, not carving).
  assert.match(appShell, /\.sidebar-drag-zone \{[^}]*width: var\(--titlebar-controls-left\)/s);
  // The left cluster ellipsizes at the sidebar column edge instead of
  // bleeding onto the tab strip…
  assert.match(appShell, /\.titlebar-controls \{[^}]*max-width: calc\(var\(--sidebar-width\) - var\(--titlebar-controls-left\) - 8px\)/s);
  // …and the collapsed-sidebar budget is ONE token shared by the cluster
  // cap and both tab-row reserves, so the floating controls never overlap
  // a tab.
  assert.match(appShell, /--titlebar-controls-collapsed-width:/);
  assert.match(appShell, /\.app\.sidebar-collapsed \.tab-strip \{[^}]*var\(--titlebar-controls-collapsed-width\)/s);
  assert.match(appShell, /\.app\.sidebar-collapsed \.titlebar-controls \{[^}]*max-width: var\(--titlebar-controls-collapsed-width\)/s);
  assert.match(appShell, /\.app\.sidebar-collapsed\.chat-primary \.chat-tab-row \{[^}]*var\(--titlebar-controls-collapsed-width\)/s);

  const chat = read('web-src/src/features/agent-panel/agent-panel.css');
  // Entering message edit must not collapse the bubble (the textarea has
  // no intrinsic width): the head takes the full bubble width instead.
  assert.match(chat, /\.agent-turn-head:has\(\.agent-turn-edit\) \{[^}]*width: min\(85%, 620px\)/s);
  // No focus ring on the edit textarea ON PURPOSE (composer idiom): text
  // fields always match :focus-visible, so a halo would flash on every
  // edit open. The mode change is the affordance.
  assert.doesNotMatch(chat, /\.agent-turn-edit textarea:focus-visible/);

  const documentsCss = read('web-src/src/features/documents/documents.css');
  // Reading gutters follow the PANE, not the window.
  assert.match(documentsCss, /\.crepe-shell \{[^}]*container-type: inline-size/s);
  assert.match(documentsCss, /clamp\(20px, 6cqi, 48px\)/);
  // THREE-class selector on purpose: Crepe's packaged stylesheet ships
  // `.milkdown .ProseMirror { padding: 60px 120px }` in a LATER-loaded
  // chunk — equal specificity would hand the gutters back to the package.
  assert.match(documentsCss, /\.crepe-shell \.milkdown \.ProseMirror \{/);
  // Editable gutters seat the block handle (48px); under pane pressure
  // the ADD tile yields so the drag tile fits instead of clipping.
  assert.match(documentsCss, /\.crepe-shell:not\(\.crepe-readonly\) \.milkdown \.ProseMirror \{[^}]*padding-inline: 48px/s);
  assert.match(documentsCss, /\.crepe-shell:not\(\.crepe-readonly\) \.milkdown-block-handle \.operation-item:first-child \{[^}]*display: none/s);
  // Crepe names the handle `milkdown-block-handle`; a `crepe-`-prefixed
  // selector silently matches nothing.
  assert.match(documentsCss, /\.crepe-readonly \.milkdown-block-handle \{ display: none; \}/);
  assert.doesNotMatch(documentsCss, /crepe-block-handle/);
});

/* The PDF viewer's load keying, Find registration lifetime, and
 * single-scroll-owner protocol used to be asserted here through six regexes
 * over `PdfPreview.tsx`. The viewer's split gave each of them a hook with an
 * interface to drive, so they now run in
 * `@/features/documents/__tests__/pdf-viewer.test.ts` — no source text left
 * in this file outside stylesheets and the repo-wide literal scans. */
