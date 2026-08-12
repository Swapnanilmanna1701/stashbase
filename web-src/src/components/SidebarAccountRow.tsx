import { BugIcon, DiscordIcon, SettingsIcon, UserIcon } from '../icons';
import { DISCORD_INVITE_URL, openExternalUrl } from '../lib/externalLink';
import { openSettings } from './SettingsModal';
import { Button } from './ui/button';

/**
 * Bottom chrome row of the sidebar (Cursor's account/settings strip
 * position): WHO you are on the left, the app's small utility cluster on
 * the right.
 *
 * **Anonymous is a finished state, not a missing one.** Browsing, editing,
 * preview, and exact text search are local computations and must never be
 * gated behind a remote login, so the app has a working identity before
 * anyone signs in and says so plainly. The identity is static until there is
 * a real account action to offer: an inert AI Index/source menu only repeats
 * the setup callout and Settings, and makes this finished state look broken.
 *
 * The row never carries a standing sign-in badge or index-readiness marker.
 * `EmbeddingSetupCallout` and Settings already own those paths; repeating
 * them here would put two adjacent prompts in the sidebar's quietest chrome.
 *
 * Settings anchors the row's far-right edge. It loses its text label in the
 * trade, which is the real cost of putting identity on the sidebar's one
 * bottom line — the gear in the bottom-right corner is the near-universal
 * Settings position (Cursor, VS Code, Slack, Linear), it keeps its tooltip,
 * and the command palette still answers "Open Settings". Discord and Report
 * Bug remain adjacent immediately before it as the help/feedback group.
 */
export function SidebarAccountRow() {
  return (
    /* Taller than a list row on purpose. This is the sidebar's floor, and
     * the New Chat block caps its top with 8px above / 12px below the same
     * 28px control — a bottom strip clamped to 4px/6px made the panel look
     * like it ran out of room rather than ended. The two caps now breathe
     * within 2px of each other. */
    <div className="flex flex-none items-center gap-1 border-t border-border px-1.5 pt-2 pb-2.5">
      <div className="flex min-h-7 min-w-0 flex-1 items-center gap-2 px-2 text-left text-base text-muted-foreground">
        {/* A real avatar chip, not a resized glyph: the circle is the mark
          * and the person is its CONTENT, which is why the inner glyph runs
          * under the standalone utility cluster — it has to fit inside the
          * identity container. It also has to survive contact with an
          * account: signed in, the same circle carries a monogram, and only
          * a container can do that.
          *
          * The circle OVERFLOWS its layout slot, 22px drawn from a 16px box.
          * At 16px it was the faintest mark in a row of 16px glyphs — the
          * row's own subject reading as its smallest element — but growing
          * the slot would push the label off the dock's shared gutter. So
          * the box stays 16px for layout and the circle bleeds 3px each
          * side into padding that is already empty. 22px is the ceiling
          * that gutter allows: past it the circle closes on the label and
          * the row tightens again, so a larger avatar means giving up the
          * alignment with Library above, not finding more room.
          *
          * Round, alone in a sidebar of rounded-md rows and rounded-xl
          * boxes. The shape is the whole signal — it says "identity" before
          * the label is read, so the row is never mistaken for one more
          * navigable item in the stack above it. */}
        <span className="relative inline-flex size-4 flex-none items-center justify-center">
          <span className="absolute inset-[-3px] rounded-full bg-muted" aria-hidden="true" />
          <UserIcon className="relative size-3.5" />
        </span>
        {/* Lands on the dock's shared 38px label gutter, same as Library,
          * the section headers, and New Chat.
          *
          * `text-placeholder`, a step below the section labels above it, and
          * the existing third text role rather than a new one: this slot
          * holds no user-specific value yet, which is the same thing an
          * empty field's hint says. At secondary weight "Anonymous" reads
          * as a filled-in account name, the exact confusion that role
          * exists to prevent. It also buys the signed-in state its
          * indicator for free — a real name renders at
          * `text-muted-foreground`, so the ink steps up on its own with no
          * dot, badge, or colour spent. */}
        <span className="min-w-0 truncate text-placeholder">Anonymous</span>
      </div>
      {/* Community, Report Bug, Settings — one utility cluster on the row's
        * right end. These sparse, persistent actions use the next optical
        * step above dense section-header controls: 28px targets with 16px
        * glyphs, large enough to read without making the row loose. */}
      {/* Community — the app's only in-product route to a human, so it stays
        * in persistent chrome rather than behind the account menu. */}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Join the StashBase Discord"
        title="Join the StashBase Discord"
        className="flex-none text-muted-foreground"
        onClick={() => { openExternalUrl(DISCORD_INVITE_URL); }}
      >
        <DiscordIcon className="size-4" />
      </Button>
      {/* Report Bug — PLACEHOLDER: disabled and dimmed until the report flow
        * exists; only then does it get a click handler and hover states. */}
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label="Report a bug (coming soon)"
        title="Report a bug (coming soon)"
        className="flex-none text-muted-foreground"
      >
        <BugIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Settings"
        title="Settings"
        className="flex-none text-muted-foreground"
        onClick={() => { openSettings(); }}
      >
        <SettingsIcon className="size-4" />
      </Button>
    </div>
  );
}
