import React from 'react';
import { useApp } from '../store/AppContext';
import { buttonVariants } from './ui/button';
import { StatusMessage } from './ui/status';

/** Plain <button> + the shared outline-button recipe: the node test loader
 *  compiles this module graph with the classic JSX transform, under which
 *  the ui/button component module (no explicit React import) cannot load. */
const noticeButtonClass = buttonVariants({ variant: 'outline', size: 'xs' });

export function SemanticIndexingNotice() {
  const { state, actions } = useApp();
  const workload = state.semanticIndexing;
  if (!workload || !['awaiting-decision', 'paused', 'partial-paused'].includes(workload.state)) return null;
  const awaiting = workload.state === 'awaiting-decision';
  const count = workload.sourceCount ?? state.pendingSemanticNames.size;
  return <SemanticIndexingNoticeView
    awaiting={awaiting}
    count={count}
    estimatedBytes={workload.estimatedBytes}
    failureMessage={state.indexWarning?.message}
    onStart={() => { void actions.decideSemanticIndexing('start'); }}
    onDefer={() => { void actions.decideSemanticIndexing('defer'); }}
  />;
}

export function SemanticIndexingNoticeView({
  awaiting,
  count,
  estimatedBytes,
  failureMessage,
  onStart,
  onDefer,
}: {
  awaiting: boolean;
  count: number;
  estimatedBytes?: number;
  failureMessage?: string;
  onStart: () => void;
  onDefer: () => void;
}) {
  const size = estimatedBytes
    ? ` · about ${(estimatedBytes / (1024 * 1024)).toFixed(estimatedBytes >= 10 * 1024 * 1024 ? 0 : 1)} MiB`
    : '';
  return (
    <StatusMessage tone="warning" className="mx-3 mb-2 flex items-start justify-between gap-2.5 px-2.25 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="font-semibold">{awaiting ? 'Large AI Index workload' : 'AI Index paused'}</div>
        <div className="leading-snug opacity-90">
          About {count.toLocaleString()} file{count === 1 ? '' : 's'} waiting{size}. Building AI Index may take a while and use provider quota. Exact text search remains available.
        </div>
        {failureMessage && (
          <div className="leading-snug opacity-90" role="alert">
            Search also needs attention: {failureMessage}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" className={noticeButtonClass} onClick={onStart}>
          {awaiting ? 'Build AI Index' : 'Resume AI Index'}
        </button>
        {awaiting && <button type="button" className={noticeButtonClass} onClick={onDefer}>Not now</button>}
      </div>
    </StatusMessage>
  );
}
