import React from 'react';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { agentMarkdownComponents, type AgentMarkdownProps } from '@/features/agent-panel/components/agentMarkdownPolicy';

/** Heavy KaTeX parsing and fonts load only after a reply actually contains
 * math. The plain GFM path stays in the normal Chat chunk. */
export function AgentMathMarkdownCore({ markdown, onOpenArtifact }: AgentMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={[[rehypeKatex, {
        errorColor: 'var(--status-danger)',
        throwOnError: false,
        trust: false,
      }]]}
      components={agentMarkdownComponents(onOpenArtifact)}
    >
      {markdown}
    </ReactMarkdown>
  );
}
