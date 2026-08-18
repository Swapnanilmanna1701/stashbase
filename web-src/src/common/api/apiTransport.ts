/**
 * Shared renderer HTTP transport, error normalization, path encoding, and
 * per-window request identity.
 */
import { electronBridge } from '@/common/lib/electronBridge';

/** Extract a printable message from any thrown value. ApiError wins
 *  first because its `.message` already includes the HTTP context. Use
 *  in `catch (err: unknown)` blocks so the renderer doesn't have to
 *  fall back to `any`. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const JSON_HEADERS = { 'content-type': 'application/json' };
const WINDOW_ID_KEY = 'stashbase.windowId';

export function getWindowId(): string {
  try {
    const assigned = electronBridge()?.windowId;
    let id = window.sessionStorage.getItem(WINDOW_ID_KEY);
    if (typeof assigned === 'string' && assigned.trim()) {
      id = assigned.trim().slice(0, 128);
      window.sessionStorage.setItem(WINDOW_ID_KEY, id);
    } else if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(WINDOW_ID_KEY, id);
    }
    return id;
  } catch {
    return 'web';
  }
}

export function requestHeaders(extra?: HeadersInit): HeadersInit {
  return { ...extra, 'x-stashbase-window-id': getWindowId() };
}

/** GET wrapper. Throws `ApiError` for non-2xx; returns parsed JSON. */
export async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: requestHeaders() });
  return parseJsonOrThrow<T>(r);
}

export async function send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: requestHeaders() };
  if (body !== undefined) {
    init.headers = requestHeaders(JSON_HEADERS);
    init.body = JSON.stringify(body);
  }
  const r = await fetch(path, init);
  return parseJsonOrThrow<T>(r);
}

function isNetworkFetchError(err: unknown): boolean {
  return err instanceof TypeError && /fetch/i.test(err.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWithNetworkRetry<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
): Promise<T> {
  const delays = [250, 750];
  for (let attempt = 0; ; attempt++) {
    try {
      return await send<T>(method, path, body);
    } catch (err: unknown) {
      if (!isNetworkFetchError(err) || attempt >= delays.length) {
        if (isNetworkFetchError(err)) {
          throw new ApiError('Could not reach the local StashBase server. Please try again.', 0, 'NETWORK_ERROR');
        }
        throw err;
      }
      await sleep(delays[attempt]);
    }
  }
}

export async function head(path: string): Promise<{ version?: string }> {
  const r = await fetch(path, { method: 'HEAD', headers: requestHeaders() });
  if (!r.ok) {
    const msg = r.status === 404 ? 'not found'
      : r.status === 415 ? 'unsupported format'
        : `HTTP ${r.status}`;
    throw new ApiError(msg, r.status);
  }
  const version = r.headers.get('x-stashbase-file-version');
  return version ? { version } : {};
}

export async function parseJsonOrThrow<T>(r: Response): Promise<T> {
  // Most error routes return `{ error: '…' }` so we surface that
  // message; raw status fallback covers the rest.
  let payload: unknown;
  try { payload = await r.json(); } catch { payload = null; }
  if (!r.ok) {
    const msg = (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as any).error === 'string')
      ? (payload as any).error as string
      : `HTTP ${r.status}`;
    const code = payload && typeof payload === 'object' && typeof (payload as any).code === 'string'
      ? (payload as any).code as string
      : undefined;
    throw new ApiError(msg, r.status, code);
  }
  // 2xx bodies pass through untouched even when they carry an `error`
  // field: routes like /api/audio/transcript model failure as state
  // (`{status:'failed', error}`) and the caller owns that branch.
  return payload as T;
}

/** Encode each path segment but keep the `/` separators — what the
 *  server's `/api/files/*` and `/asset/*` routes expect. */
export function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}
