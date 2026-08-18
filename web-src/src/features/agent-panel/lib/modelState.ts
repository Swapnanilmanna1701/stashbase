import type { AgentModel } from '@/features/agent-panel/lib/types';

export interface ModelControlState {
  models: AgentModel[];
  /** User intent for the next new native session. Never overwrite this with
   * runtime telemetry: Default must continue to mean no explicit override. */
  selectedModel?: string;
  /** Model the runtime says this live session is actually using. */
  activeModel?: string;
  notice: string | null;
  resumedSession: boolean;
}

export function applyModelEvent(state: ModelControlState, event: {
  models: AgentModel[];
  activeModel?: string;
  fallback?: string;
}): ModelControlState {
  if (event.fallback) {
    return {
      ...state,
      models: event.models,
      selectedModel: undefined,
      notice: event.fallback,
      ...(event.activeModel ? { activeModel: event.activeModel } : {}),
    };
  }
  return {
    ...state,
    models: event.models,
    // Keep a fallback explanation visible even when the runtime follows with
    // its Default model in an init event.
    ...(event.activeModel ? { activeModel: event.activeModel } : {}),
  };
}

export function modelMenuVisible(runtimeSupportsModels: boolean, models: AgentModel[]): boolean {
  return runtimeSupportsModels && models.length > 0;
}

export function modelMenuLocked(hasTranscript: boolean, turnActive: boolean): boolean {
  return hasTranscript || turnActive;
}

export function modelMenuLabel(
  models: AgentModel[],
  selectedModel: string | undefined,
  activeModel: string | undefined,
  resumedSession: boolean,
): string {
  // Explicit intent wins over telemetry: once the user picks a model for
  // the next session, the pill must show that pick even while the runtime
  // still reports the session's (or catalog's) default identity.
  const identity = selectedModel ?? activeModel;
  return models.find((entry) => entry.id === identity)?.label ?? (resumedSession ? 'Session model' : 'Default');
}
