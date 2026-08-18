/**
 * The Agent panel's own lazy-load boundary. The generic retry, reset, and
 * `Managed…` wrapper mechanics live in `@/common/__tests__/lazy-load.test.ts`;
 * this file asserts only what `ChatPane` does with them — one independently
 * resettable boundary per chat session.
 */
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import test from 'node:test';
import { ChatSessionBoundary, chatStatusClass } from '@/features/agent-panel/components/ChatPane';
import { LazyLoadBoundary } from '@/common/components/ErrorBoundary';

test('each chat session gets an independently resettable error boundary', () => {
  const child = createElement('span', null, 'session');
  const element = ChatSessionBoundary({
    tabId: 'chat-1',
    active: true,
    children: child,
  }) as ReactElement<{
    children: unknown;
    className: string;
    resetKey: string;
  }>;

  assert.equal(element.type, LazyLoadBoundary);
  assert.equal(element.props.className, chatStatusClass);
  assert.equal(element.props.resetKey, 'chat-1:active');
  assert.equal(element.props.children, child);
});
