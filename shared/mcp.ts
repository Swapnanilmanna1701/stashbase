/**
 * The MCP access surface as Settings reports it.
 *
 * `token` is nullable rather than absent when unavailable: the panel shows a
 * disabled field either way, and a missing key would be indistinguishable
 * from a token the caller forgot to read. `dockerAccess` is the user's
 * opt-in and `dockerActive` is whether the listener actually came up — they
 * disagree while the listener is starting, and during a failure the reason
 * is in `dockerError`.
 */
export interface McpHttpStatus {
  loopbackUrl: string;
  dockerUrl: string;
  dockerPort: number;
  token: string | null;
  dockerAccess: boolean;
  dockerActive: boolean;
  dockerError?: string;
  settingsError?: string;
}
