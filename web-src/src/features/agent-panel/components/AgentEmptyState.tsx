/**
 * Empty-chat hero pieces. While a chat has no turns, AgentView centers the
 * composer in the panel: a title (plus a connecting status when
 * applicable) sits above it and a single rotating, clickable usage
 * suggestion sits toward the pane's bottom edge below it.
 * Pressing the suggestion only prefills the composer draft with that
 * suggestion's full prompt — sending always stays an explicit user action.
 * Copy follows the chat's scope: a folder-bound chat talks about "this
 * folder", a library chat talks about the whole library.
 */
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { ArrowInsertIcon } from '@/common/components/icons';
import { spinnerClass } from '@/features/agent-panel/lib/panelStyles';

interface Suggestion {
  /** The action-first rotating line the user reads. */
  label: string;
  /** The full prompt a press drops into the composer draft. Prompts that
   *  need an object end with ": " or a trailing space — the caret lands
   *  where the user completes them. */
  prompt: string;
}

/* Every entry must carry a useful prompt to prefill. Labels stay short and
 * action-first; prompts expand them into the source-aware journeys StashBase
 * supports. Templates that need user input end at the insertion point. */
const FOLDER_SUGGESTIONS: Suggestion[] = [
  {
    label: 'Turn requirements into a checklist',
    prompt: 'Review the requirements in this folder and create a checklist of constraints, acceptance criteria, and open questions. Cite the source files.',
  },
  {
    label: 'Find related specs and decisions',
    prompt: 'Find the specifications, meeting notes, and prior decisions related to: ',
  },
  {
    label: 'Compare technical options',
    prompt: 'Compare these technical options using evidence from this folder. Show the trade-offs, risks, and recommendation: ',
  },
  {
    label: 'Build a design Canvas',
    prompt: 'Create a Markdown Canvas with the goal, confirmed decisions, alternatives, trade-offs, and open questions.',
  },
  {
    label: 'Check delivery against requirements',
    prompt: 'Compare the current work with the original requirements. Mark each item satisfied, missing, or unclear, with evidence.',
  },
  {
    label: 'Compare papers and methods',
    prompt: 'Compare the papers or methods in this folder. Summarize their evidence, limitations, and disagreements.',
  },
  {
    label: 'Create a source-linked reading note',
    prompt: 'Create a reading note with the main claims, evidence, limitations, open questions, and source references about: ',
  },
  {
    label: 'Build a research plan',
    prompt: 'Turn the material in this folder into a research plan with a question, approach, experiments, milestones, and risks.',
  },
  {
    label: 'Summarize progress and blockers',
    prompt: 'Summarize recent progress from this folder. Separate completed work, findings, blockers, and next steps.',
  },
  {
    label: 'Outline a presentation',
    prompt: 'Turn the settled work in this folder into a presentation outline with an audience, core message, slide order, and supporting evidence.',
  },
];

const LIBRARY_SUGGESTIONS: Suggestion[] = [
  {
    label: 'Find something I vaguely remember',
    prompt: 'Use meaning, not just exact wording, to search my library and show the most relevant sources about: ',
  },
  {
    label: 'Explain why an earlier decision was made',
    prompt: 'Find where my library explains this decision. Summarize the reasoning, alternatives, and source files: ',
  },
  {
    label: 'Gather context across projects',
    prompt: 'Gather the most relevant context across my library, group it by project or folder, and cite the sources about: ',
  },
  {
    label: 'Compare approaches across my archive',
    prompt: 'Compare how different projects or documents in my library approached this topic. Highlight recurring trade-offs and lessons: ',
  },
  {
    label: 'Find papers comparing two methods',
    prompt: 'Find papers or notes comparing these methods, then summarize the evidence and disagreements: ',
  },
  {
    label: 'Map what’s in my library',
    prompt: 'Survey my library and summarize what each folder contains, its main themes, and likely relationships.',
  },
  {
    label: 'Find recurring themes and open questions',
    prompt: 'Find recurring themes, decisions, and unresolved questions across my library, with representative sources.',
  },
  {
    label: 'Trace a decision across projects',
    prompt: 'Trace how this idea or decision evolved across projects and documents: ',
  },
  {
    label: 'Build a briefing from my sources',
    prompt: 'Build a concise briefing from my library. Separate established facts, prior decisions, conflicting evidence, and open questions about: ',
  },
  {
    label: 'Start a project from existing sources',
    prompt: 'Create a new project seeded with a Markdown Canvas and references to the most relevant sources in my library about: ',
  },
];

/* Slow cadence and a long crossfade keep the rotation ambient — the
 * suggestion should never pull the eye away from the composer. */
const HINT_ROTATE_MS = 6000;
const HINT_FADE_MS = 700;

/** The single rotating usage suggestion for the empty chat, anchored
 * toward the pane's bottom edge below the hero composer. Rotates
 * on a quiet timer with a continuous upward motion: the outgoing line
 * drifts up as it fades and the incoming one rises from below
 * (`chat-hint-rise` in agent-panel.css). The global reduced-motion policy zeroes
 * the keyframe and drops `translate` from transition-property, so the swap
 * degrades to a plain crossfade there. Hover or focus pauses the rotation:
 * a moving press target would swap under the pointer, and a focused
 * button's accessible name must hold still. */
export function EmptyChatSuggestion({ onPrefill, libraryScoped }: {
  onPrefill: (text: string) => void;
  libraryScoped?: boolean;
}) {
  const suggestions = libraryScoped ? LIBRARY_SUGGESTIONS : FOLDER_SUGGESTIONS;
  const count = suggestions.length;
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  useEffect(() => {
    if (paused) {
      // A pause can land mid-swap (pointer arrives during the fade-out);
      // restoring `leaving` brings the current label back to rest.
      setLeaving(false);
      return undefined;
    }
    let swap: number | undefined;
    const cycle = window.setInterval(() => {
      setLeaving(true);
      swap = window.setTimeout(() => {
        setIndex((i) => (i + 1) % count);
        setLeaving(false);
      }, HINT_FADE_MS);
    }, HINT_ROTATE_MS);
    return () => {
      window.clearInterval(cycle);
      window.clearTimeout(swap);
    };
  }, [count, paused]);
  const current = suggestions[index % count];
  return (
    /* Bottom-anchored by AgentView (mt-auto); the pb lifts the line off
     * the pane's bottom edge so it reads placed, not stranded. Centered:
     * far below the hero column, it aligns to the pane's axis, not the
     * composer's content edge. */
    <div className="flex justify-center pt-6 pb-12">
      <Button
        className="cursor-pointer border-0 bg-transparent p-0 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        onHoverChange={setHovered}
        onFocusChange={setFocused}
        onPress={() => onPrefill(current.prompt)}
      >
        <span
          // Remounting per suggestion restarts the rise-in keyframe.
          key={index}
          className="inline-flex items-center gap-1.5 transition-[opacity,translate] ease-in-out"
          style={{
            opacity: leaving ? 0 : 1,
            translate: leaving ? '0 -8px' : '0 0',
            transitionDuration: `${HINT_FADE_MS}ms`,
            animation: `chat-hint-rise ${HINT_FADE_MS}ms ease-in-out`,
          }}
        >
          {current.label}
          {/* ↖ marks the line as pressable — it inserts above, it does
            * not send (that is ArrowUpIcon's job on the send button). */}
          <ArrowInsertIcon className="size-3 shrink-0" aria-hidden="true" />
        </span>
      </Button>
    </div>
  );
}

/** Title + status slot above the centered composer. The title names the
 * space's promise; runtime identity still lives in the tab icon and the
 * composer's "Message <Agent>…" placeholder, and the scope pill carries
 * the scope — no wordmark or agent branding here. While a session
 * connects, a spinner row shows between the title and the composer. */
export function EmptyChatGreeting({ agentShortName, connecting }: {
  agentShortName: string;
  connecting: boolean;
}) {
  return (
    <>
      <h2 className="m-0 pb-6 text-center text-2xl font-semibold text-foreground">
        Your knowledge is here.
      </h2>
      {connecting && (
        <p className="m-0 flex items-center justify-center gap-2 pb-4 text-sm text-muted-foreground" role="status">
          <span className={spinnerClass} aria-hidden="true" />
          Connecting to {agentShortName}…
        </p>
      )}
    </>
  );
}
