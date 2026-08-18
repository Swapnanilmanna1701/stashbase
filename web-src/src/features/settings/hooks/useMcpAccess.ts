import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type McpHttpStatus } from '@/common/api/api';
import { useAppActions } from '@/store/contexts/AppContext';

export type McpCopyTarget = 'stdio' | 'loopback' | 'token' | 'docker';

export interface McpAccessStatus {
  kind: 'ok' | 'error';
  text: string;
}

export interface McpAccessController {
  /** The stdio configuration block, pretty-printed for the copy field. */
  config: string;
  http: McpHttpStatus | null;
  status: McpAccessStatus | null;
  loadError: string | null;
  httpBusy: boolean;
  copied: McpCopyTarget | null;
  dockerPortInput: string;
  setDockerPortInput: (value: string) => void;
  reload: () => Promise<void>;
  copyText: (value: string, target: McpCopyTarget) => Promise<void>;
  rotateToken: () => Promise<void>;
  setDockerAccess: (enabled: boolean) => Promise<void>;
  saveDockerPort: () => Promise<void>;
}

/**
 * MCP access state for the Settings panel: the stdio config, the HTTP
 * listener status, and the three mutations that change it.
 *
 * The panel is a long-lived surface over a server that also changes
 * underneath it, so two orderings matter and both live here. `loadSeq`
 * makes every read and every mutation-applied snapshot a numbered claim on
 * `http`, so a status response that left before a rotation cannot land
 * after it and resurrect the old bearer token into a field the user is
 * about to copy. And the Docker listener starts moments after the loopback
 * server, so an opted-in listener that has not reached active or error yet
 * is re-read on a timer until it settles.
 *
 * Clipboard copying lives here too, not because it touches the server, but
 * because a failed copy reports through the same status line the mutations
 * write, and two owners of one line disagree.
 */
export function useMcpAccess(): McpAccessController {
  const { actions } = useAppActions();
  const mountedRef = useRef(true);
  const copyResetTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<McpAccessStatus | null>(null);
  const [config, setConfig] = useState<string>('');
  const [copied, setCopied] = useState<McpCopyTarget | null>(null);
  const [http, setHttp] = useState<McpHttpStatus | null>(null);
  const [httpBusy, setHttpBusy] = useState(false);
  const [dockerPortInput, setDockerPortInput] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  useEffect(() => () => {
    mountedRef.current = false;
    if (copyResetTimerRef.current != null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
  }, []);

  const loadStatus = useCallback(async (opts: { silent?: boolean } = {}) => {
    const seq = ++loadSeqRef.current;
    try {
      const res = await api.mcpStatus();
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setLoadError(null);
      setConfig(JSON.stringify(res.config ?? {}, null, 2));
      setHttp(res.http);
      setDockerPortInput(String(res.http.dockerPort));
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      const text = err instanceof Error ? err.message : String(err);
      // Always record the failure: a silently swallowed initial load left
      // the panel stuck on "Loading server connection…" with no error and
      // no retry. Silent callers just skip the shared status line.
      setLoadError(text);
      if (!opts.silent) setStatus({ kind: 'error', text });
    }
  }, []);

  /** Apply a mutation response's `http` snapshot as the newest truth. */
  const applyHttp = useCallback((next: McpHttpStatus) => {
    loadSeqRef.current++;
    setLoadError(null);
    setHttp(next);
    setDockerPortInput(String(next.dockerPort));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadStatus({ silent: true });
  }, [loadStatus]);

  useEffect(() => {
    if (!http?.dockerAccess || http.dockerActive || http.dockerError || http.settingsError) return;
    const timer = window.setInterval(() => void loadStatus({ silent: true }), 750);
    return () => window.clearInterval(timer);
  }, [http?.dockerAccess, http?.dockerActive, http?.dockerError, http?.settingsError, loadStatus]);

  const reload = useCallback(() => loadStatus(), [loadStatus]);

  const copyText = useCallback(async (value: string, target: McpCopyTarget) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // navigator.clipboard can reject in an unfocused / restricted
      // Electron webview — fall back to the legacy execCommand path.
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    if (ok) {
      if (!mountedRef.current) return;
      setCopied(target);
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null;
        if (mountedRef.current) setCopied(null);
      }, 1500);
    } else {
      if (!mountedRef.current) return;
      setStatus({ kind: 'error', text: 'Couldn’t copy — select the text and copy manually.' });
    }
  }, []);

  const rotateToken = useCallback(async () => {
    const confirmed = await actions.confirm(
      'Rotate the MCP bearer token? URL-based clients using the current token will stop working.',
      { title: 'Rotate MCP token?', confirmLabel: 'Rotate', destructive: true },
    );
    if (!confirmed) return;
    setHttpBusy(true);
    setStatus(null);
    try {
      const result = await api.rotateMcpHttpToken();
      if (!mountedRef.current) return;
      applyHttp(result.http);
      setStatus({ kind: 'ok', text: 'MCP bearer token rotated. Update every URL-based client.' });
    } catch (err: unknown) {
      if (mountedRef.current) setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      if (mountedRef.current) setHttpBusy(false);
    }
  }, [actions, applyHttp]);

  const setDockerAccess = useCallback(async (enabled: boolean) => {
    setHttpBusy(true);
    setStatus(null);
    try {
      const result = await api.setMcpDockerAccess(enabled);
      if (!mountedRef.current) return;
      applyHttp(result.http);
      setStatus({
        kind: 'ok',
        text: enabled ? 'Docker MCP access enabled.' : 'Docker MCP access disabled.',
      });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      void loadStatus({ silent: true });
    } finally {
      if (mountedRef.current) setHttpBusy(false);
    }
  }, [applyHttp, loadStatus]);

  const saveDockerPort = useCallback(async () => {
    const port = Number(dockerPortInput);
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
      setStatus({ kind: 'error', text: 'Docker MCP port must be an integer from 1024 to 65535.' });
      return;
    }
    setHttpBusy(true);
    setStatus(null);
    try {
      const result = await api.setMcpDockerPort(port);
      if (!mountedRef.current) return;
      applyHttp(result.http);
      setStatus({ kind: 'ok', text: `Docker MCP port changed to ${result.http.dockerPort}.` });
    } catch (err: unknown) {
      if (mountedRef.current) setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      if (mountedRef.current) setHttpBusy(false);
    }
  }, [applyHttp, dockerPortInput]);

  return {
    config,
    http,
    status,
    loadError,
    httpBusy,
    copied,
    dockerPortInput,
    setDockerPortInput,
    reload,
    copyText,
    rotateToken,
    setDockerAccess,
    saveDockerPort,
  };
}
