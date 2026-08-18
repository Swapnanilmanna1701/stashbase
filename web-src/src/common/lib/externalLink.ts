/**
 * Opening a link outside the app.
 *
 * The renderer must never navigate itself to an external URL — that would
 * replace the app with a web page and there is no way back. Under Electron
 * the preload bridge hands the URL to the OS browser; in a plain browser
 * (dev, or the web build) a noopener window is the equivalent. Callers get
 * one function and do not have to know which host they are running in.
 */

import links from '@shared/links.json';
import { electronBridge } from '@/common/lib/electronBridge';

/** The community server, linked from the sidebar's bottom row and the
 *  Help menu. Both sides read the same `shared/links.json`, so the main
 *  process and the renderer cannot drift to different invites. */
export const DISCORD_INVITE_URL = links.discord;

/** Setup examples for external MCP clients (Claude Desktop, Cursor, …),
 *  linked from Settings → MCP. */
export const MCP_SETUP_EXAMPLES_URL = `${links.repository}/blob/main/docs/mcp-configuration.md`;

export function openExternalUrl(url: string): void {
  const bridge = electronBridge();
  if (bridge?.openExternal) {
    void bridge.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
