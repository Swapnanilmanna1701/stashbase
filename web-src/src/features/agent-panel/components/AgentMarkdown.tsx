import React, { Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { prepareAgentMathMarkdown } from '@/features/agent-panel/lib/agentMath';
import { agentMarkdownComponents, type AgentMarkdownProps } from '@/features/agent-panel/components/agentMarkdownPolicy';

const LazyAgentMathMarkdown = lazyWithRetry(() =>
  import('@/features/agent-panel/components/AgentMathMarkdown').then((module) => ({ default: module.AgentMathMarkdown })));

function PlainAgentMarkdown({ markdown, onOpenArtifact }: AgentMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={agentMarkdownComponents(onOpenArtifact)}
    >
      {markdown}
    </ReactMarkdown>
  );
}

export function AgentMarkdown({ markdown, onOpenArtifact }: AgentMarkdownProps) {
  const prepared = prepareAgentMathMarkdown(markdown);
  if (!prepared.hasMath) {
    return <PlainAgentMarkdown markdown={prepared.markdown} onOpenArtifact={onOpenArtifact} />;
  }
  return (
    <Suspense fallback={<PlainAgentMarkdown markdown={prepared.markdown} onOpenArtifact={onOpenArtifact} />}>
      <LazyAgentMathMarkdown markdown={prepared.markdown} onOpenArtifact={onOpenArtifact} />
    </Suspense>
  );
}

export { localAssistantLinkPath, isHttpUrl } from '@/features/agent-panel/components/agentMarkdownPolicy';
