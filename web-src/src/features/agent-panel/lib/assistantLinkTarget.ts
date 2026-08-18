/** Resolve a local link from assistant prose into a workspace action.
 *
 * The agent links both files ("see [notes](diary/2026.md)") and folders
 * ("已创建 test2 项目:[打开项目](/abs/test2)"). Relative targets resolve
 * against the SESSION's folder (the agent's cwd), not the window's browse
 * location — a library-scoped chat has no window folder at all. Folder
 * targets become a sidebar switch (registering the folder if the server
 * accepts the path); file targets select the file, switching the window
 * folder first when the file lives in a different member folder.
 */

export type AssistantLinkAction =
  | { kind: 'open-folder'; path: string }
  | { kind: 'select-file'; folder: string; rel: string }
  | null;

function normalize(path: string): string {
  return path.replace(/\/+$/, '');
}

/** Extensions the workspace can open as documents; anything else that is
 * not under a member folder is treated as a folder-open attempt (the
 * server rejects non-directories with a toast, so a miss stays visible). */
const FILE_EXT = /\.[a-z\d]{1,8}$/i;

export function resolveAssistantLink(rawPath: string, context: {
  /** The session's bound folder (agent cwd), if folder-scoped. */
  scopeFolder: string | null;
  /** The window's current browse folder, if any. */
  windowFolder: string | null;
  /** Absolute roots of every library member folder. */
  members: readonly string[];
}): AssistantLinkAction {
  const { scopeFolder, windowFolder, members } = context;
  const base = scopeFolder ?? windowFolder;
  const abs = rawPath.startsWith('/')
    ? normalize(rawPath)
    : base ? normalize(`${base}/${rawPath}`) : null;
  if (!abs) return null;

  const exactMember = members.find((m) => normalize(m) === abs);
  if (exactMember) return { kind: 'open-folder', path: exactMember };

  const owner = members.find((m) => abs.startsWith(`${normalize(m)}/`));
  if (owner) {
    const rel = abs.slice(normalize(owner).length + 1);
    if (FILE_EXT.test(rel)) return { kind: 'select-file', folder: owner, rel };
    // Extensionless path inside a member: a nested folder the agent wants
    // the user to look at (nesting is allowed for library membership).
    return { kind: 'open-folder', path: abs };
  }

  // Outside every member: only folder-shaped targets make sense — this is
  // the "agent created a new project" case. Files outside the library have
  // no workspace surface.
  if (!FILE_EXT.test(abs)) return { kind: 'open-folder', path: abs };
  return null;
}
