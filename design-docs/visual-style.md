# Visual Style

StashBase is a workbench people stay in for hours while their own files remain
the subject. The visual language is therefore **a quiet, professional
workspace**: structured like a code workbench, reading like a focused writing
app. The UI is the frame, never the picture. Beautification work should deepen
this identity, not replace it.

This document is the design-intent contract for UI styling. The semantic theme
tokens in the renderer stylesheet are the implementation API; component styles
consume those roles and never restate literals.

## Stance

- **Content-first.** User files, search results, and agent conversation carry
  the visual weight. Chrome stays low-contrast, low-saturation, and dense.
- **Calm over impressive.** No gradients, glassmorphism, large radii, heavy
  drop shadows, or decorative illustration. Nothing in the chrome should
  compete with a document for attention.
- **Durable over fashionable.** The style should still look right after a year
  of daily use. Prefer refinement of the existing signature to trend adoption.

## Signature

Two elements make StashBase recognizably itself; strengthen them, never dilute
them:

- **Cyan + amber color pair.** Cyan is the working accent — interactive
  emphasis, focus, progress, info — but NOT selection surfaces: selected
  rows/pills use a quiet neutral one step past hover, because accent
  washes at row width read loud. Amber is the counterpoint, used sparingly
  where the brand shows — search-hit marks, the occasional brand moment.
  The pairing was drawn from the old `.html`/`.md` file icons; those icons
  are muted now, but the hues stayed because they read as a tool rather
  than as the generic AI-product purple. Sparingly is a hard
  budget: at most one amber moment per screen, and never on repeated
  elements (an icon that appears once per row multiplies into a loud
  surface). A screen that already reads cyan + amber + neutral is full —
  this is a tool, and two hues is its ceiling.
- **Three-voice typography.** System sans (with CJK fallbacks) for chrome and
  controls; serif for long-form reading content — editor titles and agent
  prose; monospace for paths, code, and data. Chrome informs, serif invites
  reading, mono signals precision. Apply the voices by role, not by surface
  fashion. Each voice is a single token (`--font-sans` / `--font-serif` /
  `--font-mono`, wired into the Tailwind `font-*` utilities); a surface that
  hand-writes its own stack is drift, not a fourth voice.
- **One icon set.** Every glyph comes from Phosphor in `currentColor`. A peer
  cluster shares one optical size; sparse corner utilities may sit one step
  above dense list actions, but sizes never mix inside the same group. Weight
  is chosen by picking a different asset (`regular`
  for chrome, `fill` where a solid silhouette carries meaning), never by
  restyling one — mixing sets or hand-drawing a "close enough" glyph shows
  up as inconsistent corner radii and stroke terminals long before anyone
  can name what is wrong. The only exception is product brand marks (Claude,
  Codex, the StashBase cube), which have no equivalent in any icon set and
  keep their own colour — a logo is not a category, and each appears at most
  once on screen.
- File-type glyphs are **not** an exception. They use a solid silhouette
  with the format's letterform knocked out, in the same muted chrome colour
  as every other glyph. A hue per file type is the repeated-element case the
  colour budget exists to prevent: it makes the sidebar the loudest surface
  in the app while the user's own document sits beside it in black on white.
  Shape carries the format; colour is not spent on it.

## Type scale

The chrome type scale is dense on purpose, so its steps carry roles rather
than a size-for-every-integer sprawl. "What size is normal text" has exactly
one answer — **body is 13 (`text-base`)**, and the `<body>` default matches it.

- **11 (`text-xs`)** — meta and fine print: timestamps, paths, secondary
  captions, section eyebrow labels.
- **12 (`text-sm`)** — reserved for genuinely dense repeating rows (compact
  list/table cells, chips), NOT a second body size. 12 and 13 differ by 1px;
  using both as general body reads as sloppiness, so 12 stays out of prose.
- **13 (`text-base`)** — the body: paragraphs, control and menu-item labels,
  dialog content. The default.
- **14 (`text-lg`)** exists in the ladder but carries no chrome text role:
  it is reserved for optical glyph sizing (a `+` / `−` / `×` control glyph)
  and never for labels or titles. 13 and 14 differ by 1px, so mixing them as
  text reads as sloppiness for the same reason 12 and 13 do — a dialog or
  card title stays at body 13 and lets weight carry it, and only a display
  step (16 and up) goes larger.
- **16 (`text-xl`)** — section and block titles.
- Larger steps (20/24/30) are display-only — warmth-budget brand moments.

Control weight can compensate for size: a `font-medium` button label may sit a
step below an adjacent input's body size without reading as a mismatch — the
weight, not the pixel count, carries the parity. Reading content (Markdown
view, editor, agent prose) follows its own reading sizes, not this scale.

## Color

- Surfaces are neutral and low-chroma in both themes. Hue lives almost
  entirely in the accent pair and the status colors.
- Status colors (info/success/warning/danger) are semantic tokens, reserved
  for state — never decoration.
- Light and dark are equal citizens. Every color decision is made as a role
  (surface, text, stroke, accent) with a value per theme; a change that only
  looks right in one theme is not done.
- Text ranks in three steps: primary for content, secondary for meta, and
  placeholder — lighter than secondary — for a slot holding no value yet. The
  third step is not a nicety: at the secondary weight an empty field reads as
  a filled one, which is the one thing a placeholder must never do. It is not
  an input-only role — any standing string that stands in for a value nobody
  has supplied takes it, such as the signed-out account name in the sidebar.
  Doing so earns a state signal for free: the real value arrives at secondary
  weight, so the ink steps up on its own and no dot, badge, or colour is
  spent saying the slot is now filled. Three steps is the whole ladder; a
  string that feels like it wants a fourth is asking for the wrong fix.
- A role is a color, never an opacity. Fading a role down per surface
  (`muted-foreground/55` here, 65% there) is how one role quietly becomes
  four, each unfixable without hunting every call site; if a use needs a
  different weight, it needs a named role.

## Surfaces and Depth

- Three surface levels — sunken (panels, tab strip), base (content), and
  raised (cards, popovers) — establish hierarchy through background shifts.
- Documents are paper, chat is workbench canvas: document panes own the
  base surface — the app's only pure content white — while the Agent chat
  sits on its own canvas role, a cool near-white between paper and the
  sunken chrome, identical in both of its layouts (chat-primary and
  docked), floating its cards (user turns, composer, code blocks). All
  three neighbours — chrome, canvas, paper — stay mutually perceptible.
  A layout change resizes a pane; it never recolors one — surface roles
  must not depend on layout, or switching reads as a mode jump.
- The PDF viewer is the one document pane that inverts this: its pages are
  physical sheets, so the canvas behind them is sunken and the paper is the
  only white in it. It fits a page to the full pane width, so that canvas
  shows where it means something — between sheets, and around a page the
  user has zoomed away from — and never as a decorative margin. Chrome above
  such a pane stays on the base surface and separates with a stroke: tint it
  and a fitted page turns the band into a third colour wedged between two
  whites.
- Separation comes from 1px subtle strokes and surface changes, not shadows.
- Shadow is reserved for transient overlays (menus, dialogs, toasts) — the
  one elevation treatment — so floating things read as floating and nothing
  else does. One standing exception: the empty-chat hero composer carries a
  minimal raised shadow (the `raised` shadow role) so the anchor of an
  otherwise bare pane has presence; docked composers stay flat.
- A standing shadow is a hairline of contact, never a pool. On a surface
  that already has a border, any falloff broad enough to be noticed is
  broad enough to read as grime under the card rather than as height — the
  failure looks like dirt, not like depth. Height is not the effect being
  bought here; getting off the ground is.
- Section titles live OUTSIDE their cards: hierarchy comes from type weight
  and spacing, never from a tinted header band inside the card.
- List interaction states are neutral: a light cool-gray hover that persists
  while a row anchors an open menu. No colored row bands — accent washes at
  row width read dirty at any strength, so hue stays on button-level
  elements. The single exception is drag feedback: a drop target wears an
  accent tint and edge, because it must be unmistakable and it exists only
  while a drag is in flight. It is the accent, not the amber — one drag
  gesture speaks one colour, and amber never signals state.

## Density and Shape

- Compact workbench density: small control heights and tight gaps. Density
  is what makes the app feel like a tool rather than a landing page; do not
  relax it for visual trends. Corners are the one axis that is generous —
  spacing stays tight underneath them.
- Corners are **continuous**, not merely rounded: a squircle, so curvature
  eases into the straight edge instead of meeting it at a visible seam.
  This is the larger half of the shape language — a large circular radius
  reads as a web card, while a squircle at the same radius reads as native
  desktop chrome.
- Corners are assigned by **role, not by size**. Every box — the composer,
  transcript cards, code blocks, text fields, cards, panels, menus,
  popovers, dialogs — takes the same corner regardless of how big it is.
  Smaller corners exist only for things that are not boxes: items that live
  inside a box (rows, menu items, buttons) and runs of text inside a line
  (code spans, mentions, search marks). Introducing a literal radius is the
  same violation as introducing a literal colour.
- Grading boxes by size is the specific mistake this replaced. A code block
  rounder than the card holding it, a card squarer than the field below it —
  each looks defensible in isolation and reads as carelessness on screen,
  because a person seeing two boxes together expects one corner, not a
  ranking. Size hierarchy is carried by scale, weight, and surface; never
  by corner.
- Short boxes clamp the container radius to half their height and come out
  capsule-ended. That is the intended result, not a fallback: it is what
  makes a search field and the composer read as one object family at two
  sizes. A field is still a box, so it never drops to an item corner to
  avoid this.
- The send button is the counterweight: a true circle, the terminal action,
  deliberately not a smaller echo of the box around it.
- True circles and capsules (the send button, the transcript's
  jump-to-latest pill, status dots, the account avatar) opt out of the
  squircle, because at those radii a squircle is a bulged superellipse
  rather than the shape being drawn. Buttons that are not circular never
  render as pills.
- A circle around a glyph or a letter means **a person**, and nothing else
  claims that shape. It is the whole reason the sidebar's account row is
  not read as one more navigable item in the stack of rows above it, so
  spending the circle on a non-identity chip would cost more than it buys.
  The chip is a container with content, not an enlarged icon: the glyph
  inside runs below the standalone utility cluster because it must fit
  within that identity container. The circle is drawn larger than the
  16px layout slot it occupies, bleeding symmetrically into padding that is
  already empty — at slot size it was the faintest mark in a row of full-size
  glyphs, and widening the slot instead would push the label off the shared
  gutter. That gutter caps the circle a few pixels past the slot: a larger
  avatar than that is a decision to give up the alignment, not a way to find
  more room.
- List hover and selection render as an inset rounded pill — a row surface
  on the UI radius, inset from the panel edges — never a full-bleed band or
  an accent edge bar.
- Nested corners are derived, not guessed: an inner surface sits one step
  tighter than the padding-inset parent it lives in (the segmented-control
  thumb inside its track), so the two curves stay concentric when the ramp
  changes.

## Composition

- Content columns have a stated maximum width (the chat transcript and the
  empty-state column are the reference cases); text never runs a wide pane
  edge to edge.
- Every empty state names one deliberate anchor. The hero element — usually
  the composer — carries visible weight, and leftover space below it is
  closed by a single bottom-anchored muted suggestion line. Whitespace must
  read as intended, never as missing content; the hero may carry one
  short title naming its promise, but wordmarks or taglines never do
  this work.
- Hero groups sit on the pane's optical center; a block that drifts low
  reads as unfinished.
- Siblings share one grid line: elements stacked in a hero column align
  to the same content edge; the bottom-anchored suggestion line centers
  on the pane's axis instead.

## Motion

- Motion is feedback, not spectacle: fast (roughly 100–200ms), one standard
  easing, applied to hover, selection, and pane transitions.
- Focus and hover feedback never moves layout; large surfaces never animate
  position under reduced motion.

## Warmth Budget

Empty states — such as the sidebar's zero-folder library block — are the only
places the brand is allowed a little warmth: the app mark, the single amber
moment, a touch more spacing. The serif voice stays in content surfaces (editor titles, agent
prose); chrome, including brand chrome, speaks sans so one screen never mixes
personalities. Everywhere else the chrome stays neutral so the user's content
provides the character.

## Constraints Every Styling Change Must Survive

- Light and dark themes, including system-following mode.
- All UI-scale steps and reading-text sizes.
- Reduced-motion preference.
- The frameless macOS window (traffic-light inset, drag regions) alongside
  plain browser and non-macOS chrome.
- A visible, non-layout-shifting focus ring on every interactive element —
  one treatment app-wide: a translucent halo hugging the control, never an
  opaque line detached from it.

## Contribution Guidance

- New styles consume semantic tokens; introducing a literal color, radius,
  font stack, or duration into a component is a defect unless it defines a new
  role.
- When adding a component, match the density, stroke, and voice rules above
  before customizing anything.
- Propose changes to this language (a new role, a revised palette) as a
  change to this document plus the token layer in the same change — not as a
  one-off component style.
