import { useState, type RefObject } from 'react';
import type { AgentSkill, ServerEvent } from '@/features/agent-panel/lib/types';

/** The session's advertised skill list. It arrives on its own protocol
 *  event and only ever feeds the composer's skill picker, so it is the one
 *  part of event routing that carries no session-lifecycle consequence:
 *  `useAgentSession`'s switch hands `case 'skills'` straight to
 *  `handleSkillsEvent` and keeps nothing about skills itself. */
export function useAgentSkills({
  phase,
  wsRef,
}: {
  phase: 'connecting' | 'live' | 'closed';
  wsRef: RefObject<WebSocket | null>;
}) {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [skillState, setSkillState] = useState<'available' | 'empty' | 'failed'>('empty');

  function handleSkillsEvent(ev: Extract<ServerEvent, { t: 'skills' }>) {
    setSkills(ev.skills);
    setSkillState(ev.state);
  }

  function refreshSkills() {
    if (phase !== 'live') return;
    wsRef.current?.send(JSON.stringify({ t: 'refresh-skills' }));
  }

  return { skills, skillState, refreshSkills, handleSkillsEvent };
}
