/**
 * Settings → MCP panel. A read-only access surface for any MCP-compatible
 * client: the standard stdio config to copy, URL access (token-gated
 * Streamable HTTP), and the Docker opt-in. StashBase never writes an
 * external client's configuration here — the built-in Chat agents are
 * wired automatically by Agent readiness (Settings → Agents).
 */
import { useState } from 'react';
import { useMcpAccess } from '@/features/settings/hooks/useMcpAccess';
import { CopyIcon, CheckIcon } from '@/common/components/icons';
import { MCP_SETUP_EXAMPLES_URL, openExternalUrl } from '@/common/lib/externalLink';
import { Button } from '@/common/components/ui/button';
import { Input } from '@/common/components/ui/input';
import { StatusMessage } from '@/common/components/ui/status';

export function McpAccessPanel() {
  const {
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
  } = useMcpAccess();
  const [showToken, setShowToken] = useState(false);

  return (
    <div>
      <div className="mb-1 text-base font-semibold">MCP access</div>
      <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
        The built-in Chat agents connect automatically during Agent setup. Use
        this page for manual recovery or to give external MCP clients access to
        your StashBase library.
      </div>

      <div className="mt-4 mb-1 text-base font-semibold">Local command</div>
      <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
        Paste this configuration into an external client’s MCP settings, then
        restart that client.{' '}
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline underline-offset-2 hover:no-underline"
          onClick={() => openExternalUrl(MCP_SETUP_EXAMPLES_URL)}
        >
          See setup examples
        </button>
        {' '}for Claude Desktop, Codex CLI, Claude Code, and other clients.
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          MCP JSON configuration
          <CopyButton
            copied={copied === 'stdio'}
            onCopy={() => void copyText(config, 'stdio')}
            label="configuration"
          />
        </div>
        <pre className="m-0 max-h-80 overflow-auto p-3 font-mono text-xs whitespace-pre text-foreground">{config}</pre>
      </div>
      {status && (
        <StatusMessage tone={status.kind === 'error' ? 'error' : 'success'} className="mt-2.5 wrap-anywhere">
          {status.text}
        </StatusMessage>
      )}

      <div className="mt-4.5 border-t border-border pt-4.5">
        <div className="mb-1 text-base font-semibold">Server connection</div>
        <div className="mb-2.5 text-sm leading-normal text-muted-foreground">
          For server-side MCP clients that cannot launch the local command. Browser pages are not supported.
        </div>
        {http ? (
          <>
            {http.settingsError && (
              <div className="text-sm text-destructive">
                Server connection settings are unavailable: {http.settingsError}
              </div>
            )}
            <McpHttpField
              label="Local URL"
              value={http.loopbackUrl}
              copied={copied === 'loopback'}
              onCopy={() => void copyText(http.loopbackUrl, 'loopback')}
            />
            <div className="mt-2.5 flex flex-col gap-1">
              <label htmlFor="mcp-http-token" className="text-xs font-semibold text-muted-foreground">Bearer token</label>
              <div className="flex min-w-0 items-center gap-1.5">
                <Input
                  id="mcp-http-token"
                  className="h-8 flex-1 font-mono text-sm"
                  type={showToken ? 'text' : 'password'}
                  readOnly
                  spellCheck={false}
                  value={http.token ?? ''}
                  placeholder={http.settingsError ? 'Unavailable' : undefined}
                />
                <Button variant="outline" disabled={!http.token} onClick={() => setShowToken((shown) => !shown)}>
                  {showToken ? 'Hide' : 'Show'}
                </Button>
                <CopyButton
                  copied={copied === 'token'}
                  disabled={!http.token}
                  onCopy={() => http.token && void copyText(http.token, 'token')}
                  label="token"
                />
              </div>
            </div>
            <div className="mt-3">
              <Button variant="outline" disabled={httpBusy || !http.token} onClick={() => void rotateToken()}>
                Rotate token…
              </Button>
            </div>

            <div className="mt-4.5 border-t border-border pt-4.5">
              <div className="mb-1 text-base font-semibold">Advanced</div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={http.dockerAccess}
                  disabled={httpBusy || !!http.settingsError}
                  onChange={(event) => void setDockerAccess(event.target.checked)}
                />
                <span>Enable Docker access</span>
              </label>
              <div className="mt-2.5 flex flex-col gap-1">
                <label htmlFor="mcp-http-docker-port" className="text-xs font-semibold text-muted-foreground">Docker port</label>
                <div className="flex min-w-0 items-center gap-1.5">
                  <Input
                    id="mcp-http-docker-port"
                    className="h-8 flex-1 font-mono text-sm"
                    type="number"
                    min={1024}
                    max={65535}
                    step={1}
                    value={dockerPortInput}
                    disabled={httpBusy || http.dockerAccess || !!http.settingsError}
                    onChange={(event) => setDockerPortInput(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={httpBusy || http.dockerAccess || !!http.settingsError || dockerPortInput === String(http.dockerPort)}
                    onClick={() => void saveDockerPort()}
                  >
                    Save port
                  </Button>
                </div>
              </div>
              <div className="mt-3.5 text-sm leading-normal text-muted-foreground">
                Disabled by default. Enabling opens a separate token-gated MCP-only port on host interfaces; no other StashBase API is exposed. Disable access before changing the port. Docker Desktop or the host firewall must allow that port.
              </div>
              {http.dockerAccess && (
                <>
                  <McpHttpField
                    label="Docker URL"
                    value={http.dockerUrl}
                    copied={copied === 'docker'}
                    onCopy={() => void copyText(http.dockerUrl, 'docker')}
                  />
                  <div className={http.dockerActive ? 'text-sm text-status-success' : 'text-sm text-destructive'}>
                    {http.dockerActive
                      ? 'Docker listener is active.'
                      : `Docker listener is not active${http.dockerError ? `: ${http.dockerError}` : '.'}`}
                  </div>
                  <div className="mt-3.5 text-sm leading-normal text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_code]:whitespace-nowrap [&_code]:text-accent">
                    Native Linux Docker Engine also needs <code>--add-host=host.docker.internal:host-gateway</code> or the equivalent Compose <code>extra_hosts</code> entry.
                  </div>
                </>
              )}
            </div>
          </>
        ) : loadError ? (
          <div className="py-3">
            <StatusMessage tone="error" className="wrap-anywhere">
              Couldn’t load MCP access settings: {loadError}
            </StatusMessage>
            <Button variant="outline" className="mt-2.5" onClick={() => void reload()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="py-3 text-base text-muted-foreground">Loading server connection…</div>
        )}
      </div>
    </div>
  );
}

function McpHttpField(props: { label: string; value: string; copied: boolean; onCopy(): void }) {
  const id = `mcp-http-${props.label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="mt-2.5 flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">{props.label}</label>
      <div className="flex min-w-0 items-center gap-1.5">
        <Input id={id} className="h-8 flex-1 font-mono text-sm" type="text" readOnly spellCheck={false} value={props.value} />
        <CopyButton copied={props.copied} onCopy={props.onCopy} label={props.label} />
      </div>
    </div>
  );
}

/** Icon-only copy button (clipboard ↔ accent check — palette is
 * cyan/amber/red, no green). Sized to match the h-8 Input/Button rows. */
function CopyButton(props: { copied: boolean; disabled?: boolean; onCopy(): void; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={
        'flex-none '
        + (props.copied
          ? 'border-accent/40 bg-accent/10 text-accent hover:border-accent/40 hover:bg-accent/10 hover:text-accent'
          : 'text-muted-foreground hover:border-accent hover:text-accent')
      }
      disabled={props.disabled}
      onClick={props.onCopy}
      title={props.copied ? 'Copied' : `Copy ${props.label}`}
      aria-label={props.copied ? 'Copied' : `Copy ${props.label}`}
    >
      {props.copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}
