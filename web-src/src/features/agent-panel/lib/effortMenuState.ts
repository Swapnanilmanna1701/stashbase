import type { EffortLevel } from '@/features/agent-panel/lib/types';

export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

const EFFORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max',
};

/** Locked like the model/scope menus — a transcript or an active turn pins
 * the choice — with one exception: a restored Claude session stays
 * adjustable while idle, because changing effort reconnects resuming the
 * same native session with its history intact. */
export function effortMenuLocked(hasTranscript: boolean, turnActive: boolean, restoredSession: boolean): boolean {
  return turnActive || (hasTranscript && !restoredSession);
}

export function effortOptions(supported?: readonly string[]): EffortLevel[] {
  return supported?.length ? [...supported] : [...EFFORT_LEVELS];
}

export function effortLabel(effort: EffortLevel): string {
  return EFFORT_LABELS[effort]
    ?? effort
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
