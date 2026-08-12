/**
 * The AI Index setup choice: how to power indexing.
 *
 * This is a two-option question, so it reads as two objects, not eight. Each
 * option is ONE card with its explanation stacked inside it (title over a
 * muted subtitle), left-aligned to a single edge — so the eye reads
 * header → card → card → exit → disclosure, instead of hopping between a
 * button and a caption line beneath it.
 *
 * Wording is layered: "AI Index" is the capability, the subtitles say how
 * each option provides it, and "embeddings" appears only in the bottom
 * disclosure line (and the key form) — implementation detail, never headline.
 *   • Sign in to StashBase — hosted, free monthly indexing; the low-friction
 *     default. The recommended card carries a soft brand TINT and the same
 *     neutral border as its sibling: tint plus a brand-toned border read as
 *     "already selected" rather than "recommended", which is the one thing
 *     this screen must not say — nothing is chosen until the user clicks.
 *     Inert until the account system ships: drawn as the finished card, not
 *     faded out, with one quiet "Coming soon" mark in its top-right corner.
 *     A disabled card that says nothing reads as a broken button; the mark
 *     is the smallest thing that turns "it did not work" into "not yet".
 *   • Use your own API key — OpenAI or OpenRouter, for advanced users;
 *     choosing it reveals the key field in place (the parent owns that swap).
 *
 * `onSkip`, when present (first-run gate only), renders the deliberate exit to
 * basic mode: a low-emphasis "Skip for now" text button. NOT an
 * underlined link at rest — a standing underline is browser furniture and
 * pulled the whole card stack toward web-page register; the underline appears
 * on hover, where it says "clickable" without the styling cost. It sits far
 * enough below the cards to read as the third choice and far enough above the
 * hairline not to look like the footer's heading. It stays ONE line: a
 * reassurance note under it ("You can enable it later in Settings") was
 * logically true but gave the screen's lightest element a subtitle, making a
 * third borderless card out of the exit. Settings renders this component
 * without `onSkip`.
 *
 * Every layer here holds to one line of its own — title, subtitle, each
 * card's title and its four-word detail, skip, disclosure. The dialog asks
 * one question; anything that has to be read rather than scanned belongs in
 * Settings, not in the way of the answer. The cards are padded for two
 * short lines, not for the paragraphs they used to hold: type left, box
 * unchanged is what makes a trimmed card look hollow.
 *
 * Corners: these are BOXES, so they take `--radius-container` (the
 * `rounded-xl` step) like the composer, the inputs, and the dialog around
 * them — not the smaller `--radius-ui` used by rows and menu items INSIDE
 * a box. Two boxes seen together are expected to wear the same corner.
 */

export function EmbeddingAuthChoice({ onUseOwnKey, onSignIn, signInDisabled = true, onSkip }: {
  onUseOwnKey: () => void;
  onSignIn?: () => void;
  /** Sign-in ships behind the account system; until then the hero is
   *  present but inert, so the primary path is visible from the first
   *  release and does not appear out of nowhere later. */
  signInDisabled?: boolean;
  /** When provided (first-run gate only), renders the quiet exit to basic
   *  mode. Omitted in Settings, where continuing without indexing is moot. */
  onSkip?: () => void;
}) {
  return (
    <div className="mt-1">
      <div className="grid gap-2.5">
        {/* Recommended — sign in. Brand-tinted card; title over its own subtitle. */}
        <button
          type="button"
          disabled={signInDisabled}
          onClick={onSignIn}
          className="relative grid gap-0.5 rounded-xl border border-border bg-[color-mix(in_oklch,var(--accent),transparent_92%)] px-4 py-1.5 text-left transition-colors enabled:cursor-pointer enabled:hover:border-[var(--stroke-strong)] enabled:hover:bg-[color-mix(in_oklch,var(--accent),transparent_86%)] disabled:cursor-default"
        >
          <span className="text-base font-semibold leading-snug text-foreground">Sign in to StashBase</span>
          <span className="text-xs leading-snug text-muted-foreground">Free monthly AI Index usage</span>
          {signInDisabled && (
            /* Corner mark, not a chip: a filled badge would compete with
             * the card's own title for the eye that is choosing. Sits on
             * the title's line so the card keeps its two-line shape. */
            <span className="absolute top-2 right-4 text-2xs leading-none text-muted-foreground">Coming soon</span>
          )}
        </button>

        {/* Secondary — bring your own key. Outlined card, same shape. */}
        <button
          type="button"
          onClick={onUseOwnKey}
          className="grid cursor-pointer gap-0.5 rounded-xl border border-border bg-background px-4 py-1.5 text-left transition-colors hover:border-[var(--stroke-strong)] hover:bg-muted/40"
        >
          <span className="text-base font-semibold leading-snug text-foreground">Use your own API key</span>
          <span className="text-xs leading-snug text-muted-foreground">OpenAI or OpenRouter</span>
        </button>
      </div>

      {onSkip && (
        /* Right-aligned, where a dialog's tertiary action lives. Dropping
         * the standing underline cost this its only "I am a control"
         * signal, and left-aligned under the cards it read as one more
         * line of body copy; going smaller and fainter would only have
         * made it a caption. Position restores the role, so the type can
         * stay quiet. 20px below the cards — far enough not to read as a
         * footnote on the second card, close enough to stay tied to the
         * choices it is an alternative to. */
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            onClick={onSkip}
          >
            Skip AI Index for now
          </button>
        </div>
      )}

      {/* 28px above the hairline (12px without the skip): closer to the
        * rule than to the choice above it would make the skip read as the
        * footer's heading. Below the rule, 8px — the line belongs to its
        * divider, so the footer reads as one thin band rather than a
        * fourth block. The privacy line is a full muted: it names what
        * leaves the machine, which people do read. */}
      <p className={
        'm-0 border-t border-border pt-2 text-2xs leading-relaxed text-muted-foreground '
        + (onSkip ? 'mt-7' : 'mt-3')
      }>
        Files stay local. Only text is sent for embeddings.
      </p>
    </div>
  );
}
