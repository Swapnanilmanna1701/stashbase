/** Pure text and predicate helpers for one Agent session: tab naming,
 * folder-relative path safety, the post-tool refresh rule, and the
 * clipboard fallback. Kept free of React so `useAgentSession` and its
 * sub-hooks share one definition and these rules stay covered without a
 * browser harness. */

import { flattenFileMentions } from '@/features/agent-panel/lib/mentionText';

/** Runtimes title sessions from the first message's RAW text, so a chat
 * opened with an @-mention would name its tab a bare relative path.
 * Flatten mentions to file names and collapse whitespace before the tab
 * ever sees it. */
export function tabTitleFromSession(raw: string): string {
  const flat = flattenFileMentions(raw).replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? flat.slice(0, 60).trimEnd() + '…' : flat;
}

/** A chat tab still wearing its auto-generated placeholder name, so we
 *  know it's safe to overwrite with the session's derived title. */
export function isDefaultChatTitle(t: string): boolean {
  return /^New Chat( \d+)?$/.test(t.trim());
}

export function isSafeFolderRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function shouldRefreshAfterTool(name: string | undefined): boolean {
  if (!name) return false;
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) return true;
  return name.startsWith('mcp__') && /(write|delete|rename|update|set_|create|move)/i.test(name);
}

/** Clipboard access can be unavailable in an unfocused Electron webview. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  } catch {
    return false;
  }
}
