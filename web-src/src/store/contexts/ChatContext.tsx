/**
 * Chat slice: the right-side Agent Panel's tab bookkeeping. Membership is
 * `ChatSlice` in `state.ts`. Kept independent of `WorkspaceContext` so
 * opening or typing in a chat tab never re-renders the
 * sidebar/file-tree/tab-strip, and vice versa.
 *
 * The slice is published verbatim — the chat sub-reducer already returns a
 * new object only for actions this slice owns, which is exactly the identity
 * a context value needs.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { ChatSlice, State } from '@/store/state/state';

export type ChatState = ChatSlice;

export const ChatContext = createContext<ChatState | null>(null);

export function ChatProvider({ state, children }: { state: State; children: ReactNode }) {
  return <ChatContext.Provider value={state.chat}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
