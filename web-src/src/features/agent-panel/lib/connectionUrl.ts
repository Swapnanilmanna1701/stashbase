/** Build the shared-agent connection URL without leaking a prior tab model
 * into a resumed native session. Kept pure so resume semantics stay covered
 * without a browser/WebSocket harness. */
export function agentConnectionUrl({
  protocol,
  host,
  endpoint,
  windowId,
  effort,
  access,
  agent,
  model,
  resume,
  folder,
  scope,
}: {
  protocol: string;
  host: string;
  endpoint: string;
  windowId: string;
  effort?: string;
  access: string;
  agent: string;
  model?: string;
  resume?: string | null;
  /** Explicit session folder (absolute member-root path). Mutually
   * exclusive with `scope`. Absent with no `scope` → the server binds the
   * window's current folder when one exists, else the library. */
  folder?: string;
  /** Explicit library-wide session scope (`scope=library`). */
  scope?: 'library';
}): string {
  const query = new URLSearchParams({ windowId, access, agent });
  if (effort) query.set('effort', effort);
  if (!resume && model) query.set('model', model);
  if (resume) query.set('resume', resume);
  if (folder) query.set('folder', folder);
  else if (scope) query.set('scope', scope);
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${endpoint}?${query}`;
}
