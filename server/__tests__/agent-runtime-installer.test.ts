import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';
import { agentCliSearchDirs, resolveAgentCli, resolveAgentCliWithLoginShell } from '../agent-cli.ts';
import {
  AgentBootstrapCoordinator,
  agentIsAuthenticated,
  agentPowerShellInstallerScript,
  CLAUDE_PS1_BOOTSTRAP,
  CODEX_PS1_BOOTSTRAP,
  installClaude,
  installCodex,
  loginToAgent,
  resolveClaudeInstallerShell,
  resolveCodexInstallerShell,
  verifyAgentExecutable,
  windowsUserPathRepairScript,
  type AgentBootstrapDependencies,
} from '../agent-runtime-installer.ts';
import {
  consumeAgentSetupFailure,
  consumeAgentTurnFailure,
  getAgentRuntimeDebugState,
  initialAgentDiscoveryPolicy,
  managedAgentExecutable,
  managedAgentRuntimeRoot,
  managedCodexBinDir,
  managedCodexInstallerHome,
  managedCodexReleasesDir,
  setAgentRuntimeDebugState,
  simulatedTurnFailureScript,
  type AgentTurnFailureSimulation,
} from '../agent-runtime-paths.ts';

function fakeDependencies(overrides: Partial<AgentBootstrapDependencies> = {}) {
  let installed = false;
  let authenticated = true;
  let configured = 0;
  const dependencies: AgentBootstrapDependencies = {
    resolveExecutable: () => installed ? '/managed/codex' : null,
    installRuntime: async (_id, update) => {
      update({ progress: 0.5, message: 'Downloading… 50%' });
      await Promise.resolve();
      installed = true;
    },
    isAuthenticated: () => authenticated,
    login: async () => { authenticated = true; },
    configureMcp: () => { configured += 1; },
    consumeFailure: () => false,
    ...overrides,
  };
  return {
    dependencies,
    configured: () => configured,
  };
}

test('missing runtime moves through install and MCP configuration to ready', async () => {
  const fake = fakeDependencies();
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  assert.equal(coordinator.begin('codex').phase, 'installing');
  const settled = await coordinator.wait('codex');

  assert.equal(settled.phase, 'ready');
  assert.equal(settled.progress, 1);
  assert.equal(fake.configured(), 1);
});

test('existing runtime skips download but still ensures MCP configuration', () => {
  let installs = 0;
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: () => '/system/claude',
    installRuntime: async () => { installs += 1; },
    configureMcp: () => { configured += 1; },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  assert.equal(coordinator.begin('claude').phase, 'ready');
  assert.equal(installs, 0);
  assert.equal(configured, 1);
});

test('installed Codex stops at a distinct authentication failure before MCP configuration', () => {
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: () => '/managed/codex',
    isAuthenticated: () => false,
    configureMcp: () => { configured += 1; },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  const status = coordinator.begin('codex');

  assert.equal(status.phase, 'failed');
  assert.equal(status.failure?.stage, 'authentication');
  assert.equal(status.failure?.code, 'authentication-required');
  assert.equal(status.failure?.manualRecovery, undefined);
  assert.match(status.failure?.message ?? '', /installed.*not signed in/i);
  assert.equal(configured, 0);
});

test('Codex browser login uses the discovered executable and resumes MCP preparation', async () => {
  let authenticated = false;
  let configured = 0;
  let loginExecutable = '';
  let completeLogin!: () => void;
  const fake = fakeDependencies({
    resolveExecutable: () => '/managed/codex',
    isAuthenticated: () => authenticated,
    login: async (_id, executable) => {
      loginExecutable = executable;
      await new Promise<void>((resolve) => { completeLogin = resolve; });
      authenticated = true;
    },
    configureMcp: () => { configured += 1; },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);
  assert.equal(coordinator.begin('codex').failure?.stage, 'authentication');

  assert.equal(coordinator.login('codex').phase, 'authenticating');
  assert.equal(loginExecutable, '/managed/codex');
  completeLogin();
  const settled = await coordinator.wait('codex');

  assert.equal(settled.phase, 'ready');
  assert.equal(configured, 1);
});

test('Codex authentication commands use the selected executable', { skip: process.platform === 'win32' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-codex-auth-test-'));
  const executable = path.join(root, 'codex');
  fs.writeFileSync(executable, [
    '#!/bin/sh',
    'if [ "$1 $2" = "login status" ]; then echo "Not logged in" >&2; exit 1; fi',
    'if [ "$1" = "login" ]; then exit 0; fi',
    'exit 9',
    '',
  ].join('\n'));
  fs.chmodSync(executable, 0o755);
  try {
    assert.equal(agentIsAuthenticated('codex', executable), false);
    await loginToAgent('codex', executable, new AbortController().signal);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('startup connects MCP for discovered runtimes without installing missing ones', () => {
  let installed = true;
  let installs = 0;
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: () => installed ? '/system/codex' : null,
    installRuntime: async () => { installs += 1; },
    configureMcp: () => { configured += 1; },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  assert.equal(coordinator.connectIfInstalled('codex').phase, 'ready');
  installed = false;
  assert.equal(coordinator.connectIfInstalled('claude').phase, 'idle');
  assert.equal(installs, 0);
  assert.equal(configured, 1);
});

test('recheck recovers a failed setup from an externally installed runtime without downloading', async () => {
  let externallyInstalled = false;
  let installs = 0;
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: () => externallyInstalled ? '/system/codex' : null,
    installRuntime: async () => {
      installs += 1;
      throw new Error('download failed');
    },
    configureMcp: () => { configured += 1; },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  assert.equal(coordinator.begin('codex').phase, 'installing');
  assert.equal((await coordinator.wait('codex')).phase, 'failed');
  externallyInstalled = true;

  const checked = coordinator.connectIfInstalled('codex', { probeLoginShell: true });

  assert.equal(checked.phase, 'ready');
  assert.equal(installs, 1);
  assert.equal(configured, 1);
});

test('startup MCP repair does not consume the next explicit setup failure', () => {
  let nextFailure: 'mcp' | null = 'mcp';
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: () => '/system/codex',
    configureMcp: () => { configured += 1; },
    consumeFailure: (stage) => {
      if (nextFailure !== stage) return false;
      nextFailure = null;
      return true;
    },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  assert.equal(coordinator.connectIfInstalled('codex').phase, 'ready');
  assert.equal(configured, 1);
  assert.equal(nextFailure, 'mcp');
  assert.equal(coordinator.begin('codex').failure?.stage, 'mcp');
  assert.equal(nextFailure, null);
  assert.equal(configured, 1);
});

test('an injected installation failure is classified and consumed before retry', async () => {
  let nextFailure: 'installation' | 'mcp' | null = 'installation';
  const fake = fakeDependencies({
    consumeFailure: (stage) => {
      if (nextFailure !== stage) return false;
      nextFailure = null;
      return true;
    },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);
  const settled = coordinator.begin('codex');
  assert.equal(settled.phase, 'failed');
  assert.equal(settled.failure?.stage, 'installation');
  assert.equal(settled.failure?.code, 'simulated');
  assert.equal(settled.failure?.manualRecovery, undefined);
  assert.match(settled.failure?.message ?? '', /Simulated Agent installation failure/);

  assert.equal(coordinator.begin('codex').phase, 'installing');
  assert.equal((await coordinator.wait('codex')).phase, 'ready');
});

test('an injected MCP failure retries only MCP when the runtime exists', () => {
  let nextFailure: 'installation' | 'mcp' | null = 'mcp';
  let installs = 0;
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: () => '/system/codex',
    installRuntime: async () => { installs += 1; },
    configureMcp: () => { configured += 1; },
    consumeFailure: (stage) => {
      if (nextFailure !== stage) return false;
      nextFailure = null;
      return true;
    },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  const failed = coordinator.begin('codex');
  assert.equal(failed.failure?.stage, 'mcp');
  assert.equal(failed.failure?.code, 'simulated');
  assert.equal(failed.failure?.manualRecovery, undefined);
  assert.equal(installs, 0);
  assert.equal(configured, 0);

  assert.equal(coordinator.begin('codex').phase, 'ready');
  assert.equal(installs, 0);
  assert.equal(configured, 1);
});

test('an injected signed-out simulation stops Codex at the sign-in gate once', () => {
  let nextFailure: 'authentication' | null = 'authentication';
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: () => '/system/codex',
    configureMcp: () => { configured += 1; },
    consumeFailure: (stage) => {
      if (nextFailure !== stage) return false;
      nextFailure = null;
      return true;
    },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  const failed = coordinator.begin('codex');
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.failure?.stage, 'authentication');
  assert.equal(failed.failure?.code, 'authentication-required');
  assert.match(failed.failure?.message ?? '', /Simulated signed-out/);
  assert.equal(configured, 0);

  assert.equal(coordinator.begin('codex').phase, 'ready');
  assert.equal(configured, 1);
});

test('the signed-out simulation never arms Claude and is not consumed by login verification', async () => {
  let consumed = 0;
  const claude = fakeDependencies({
    resolveExecutable: () => '/system/claude',
    consumeFailure: (stage) => {
      if (stage !== 'authentication') return false;
      consumed += 1;
      return true;
    },
  });
  assert.equal(new AgentBootstrapCoordinator(claude.dependencies).begin('claude').phase, 'ready');
  assert.equal(consumed, 0);

  // A completed Codex login verifies for real instead of consuming the gate
  // simulation, so signing in cannot appear to fail because of a stale toggle.
  const codex = fakeDependencies({
    resolveExecutable: () => '/system/codex',
    consumeFailure: (stage) => {
      if (stage !== 'authentication') return false;
      consumed += 1;
      return true;
    },
  });
  const coordinator = new AgentBootstrapCoordinator(codex.dependencies);
  assert.equal(coordinator.login('codex').phase, 'authenticating');
  assert.equal((await coordinator.wait('codex')).phase, 'ready');
  assert.equal(consumed, 0);
});

test('real installation and MCP errors advertise only their relevant manual recovery', async () => {
  const installFailure = new AgentBootstrapCoordinator(fakeDependencies({
    installRuntime: async () => { throw new Error('download unavailable'); },
  }).dependencies);
  assert.equal(installFailure.begin('codex').phase, 'installing');
  const failedInstall = await installFailure.wait('codex');
  assert.equal(failedInstall.failure?.stage, 'installation');
  assert.equal(failedInstall.failure?.manualRecovery, 'install-command');

  const mcpFailure = new AgentBootstrapCoordinator(fakeDependencies({
    resolveExecutable: () => '/system/codex',
    configureMcp: () => { throw new Error('config is read-only'); },
  }).dependencies);
  const failedMcp = mcpFailure.begin('codex');
  assert.equal(failedMcp.failure?.stage, 'mcp');
  assert.equal(failedMcp.failure?.manualRecovery, 'mcp-settings');
});

test('Claude installer shell is bash on POSIX and shares the Codex PowerShell selection', () => {
  const posix = resolveClaudeInstallerShell('darwin', {}, () => false);
  assert.deepEqual(posix, { command: '/bin/bash', args: [], kind: 'posix' });
  const windows = resolveClaudeInstallerShell('win32', { SystemRoot: 'C:\\Windows' }, () => false);
  assert.equal(windows.kind, 'windows-powershell');
});

test('Claude install runs the official installer and verifies the discovered executable', async () => {
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-claude-official-test-'));
  process.env.STASHBASE_LOCAL_DATA_ROOT = root;
  const installed = path.join(root, 'local-bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  const fixture = process.platform === 'win32'
    ? [
      '$null = [System.IO.Directory]::CreateDirectory((Split-Path -Parent ' + `'${installed.replaceAll("'", "''")}'))`,
      `Set-Content -LiteralPath '${installed.replaceAll("'", "''")}' -Value 'installed Claude'`,
      'Write-Output "Setting up Claude Code..."',
      '',
    ].join('\n')
    : `#!/bin/bash
set -eu
[[ -z "\${ELECTRON_RUN_AS_NODE:-}" ]]
mkdir -p "${path.dirname(installed)}"
: > "${installed}"
chmod +x "${installed}"
echo "Setting up Claude Code..."
`;
  mock.method(globalThis, 'fetch', async () => new Response(fixture));
  let verified = false;
  const updates: string[] = [];
  try {
    await installClaude((update) => {
      if (update.message) updates.push(update.message);
    }, new AbortController().signal, {
      resolveInstalledExecutable: () => (fs.existsSync(installed) ? installed : null),
      verifyExecutable: (executable, label) => {
        verified = true;
        assert.equal(executable, installed);
        assert.equal(label, 'Claude Code');
      },
    });
    assert.equal(verified, true);
    assert.ok(updates.some((message) => /Setting up Claude Code/.test(message)));
    assert.equal(updates.at(-1), 'Claude Code installed.');
  } finally {
    mock.restoreAll();
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Claude install reports a missing executable without a fabricated ENOENT', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('#!/bin/bash\ntrue\n'));
  let verified = false;
  try {
    await assert.rejects(
      installClaude(() => {}, new AbortController().signal, {
        runInstallerScript: async () => {},
        resolveInstalledExecutable: () => null,
        verifyExecutable: () => { verified = true; },
      }),
      (error) => {
        assert.match(String(error), /exited successfully but no 'claude' executable.*standard install locations/i);
        assert.doesNotMatch(String(error), /ENOENT/);
        return true;
      },
    );
    assert.equal(verified, false);
  } finally {
    mock.restoreAll();
  }
});

test('the Windows user-Path repair is additive, raw-form-preserving, and setx-free', () => {
  const script = windowsUserPathRepairScript();
  // Reads the raw value so %VAR% entries elsewhere in Path are never expanded
  // in place, and writes back as REG_EXPAND_SZ.
  assert.ok(script.includes("'DoNotExpandEnvironmentNames'"));
  assert.ok(script.includes('-Type ExpandString'));
  // Appends the raw entry only when no existing entry expands to the same
  // directory; never rewrites or removes entries, never truncates via setx.
  assert.ok(script.includes("$entry = '%USERPROFILE%\\.local\\bin'"));
  assert.ok(script.includes('if (-not $has)'));
  assert.ok(script.includes("$raw.TrimEnd(';') + ';' + $entry"));
  assert.doesNotMatch(script, /setx/i);
  // Broadcasts WM_SETTINGCHANGE so shells opened from Explorer see it.
  assert.ok(script.includes('SendMessageTimeout'));
  assert.ok(script.includes('"Environment"'));
});

test('Claude verifier failures surface as the installation failure', async () => {
  const verifierFailure = new Error('Claude verifier timed out after 20 seconds.');
  mock.method(globalThis, 'fetch', async () => new Response('#!/bin/bash\ntrue\n'));
  try {
    await assert.rejects(
      installClaude(() => {}, new AbortController().signal, {
        runInstallerScript: async () => {},
        resolveInstalledExecutable: () => '/fake/claude',
        verifyExecutable: () => { throw verifierFailure; },
      }),
      (error) => {
        assert.equal(error, verifierFailure);
        return true;
      },
    );
  } finally {
    mock.restoreAll();
  }
});

test('Agent executable verification reports the native exit code and stderr', {
  skip: process.platform === 'win32',
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-agent-verifier-test-'));
  const executable = path.join(root, 'agent');
  fs.writeFileSync(executable, '#!/bin/sh\nprintf "blocked by policy\\n" >&2\nexit 23\n');
  fs.chmodSync(executable, 0o755);
  try {
    assert.throws(
      () => verifyAgentExecutable(executable, 'Claude Code'),
      /Claude Code.*exited with code 23.*blocked by policy/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Agent executable verification identifies a timeout', {
  skip: process.platform === 'win32',
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-agent-verifier-timeout-test-'));
  const executable = path.join(root, 'agent');
  fs.writeFileSync(executable, '#!/bin/sh\nwhile :; do :; done\n');
  fs.chmodSync(executable, 0o755);
  try {
    assert.throws(
      () => verifyAgentExecutable(executable, 'Claude Code', process.env, 25),
      /Claude Code.*timed out after 25ms/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows Codex installation prefers PowerShell 7 from PATH', () => {
  const pwsh = 'C:\\Tools\\PowerShell\\pwsh.exe';
  const shell = resolveCodexInstallerShell(
    'win32',
    { Path: 'C:\\Windows\\System32;C:\\Tools\\PowerShell' },
    (candidate) => candidate === pwsh,
  );

  assert.equal(shell.command, pwsh);
  assert.equal(shell.kind, 'powershell-7');
});

test('Windows Codex installation finds standard PowerShell 7 when the app PATH is stale', () => {
  const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const shell = resolveCodexInstallerShell(
    'win32',
    { ProgramFiles: 'C:\\Program Files', Path: 'C:\\Windows\\System32' },
    (candidate) => candidate === pwsh,
  );

  assert.equal(shell.command, pwsh);
  assert.equal(shell.kind, 'powershell-7');
});

test('Windows Agent discovery includes the official Codex standalone bin when PATH is stale', () => {
  const localAppData = 'C:\\Users\\bingwu\\AppData\\Local';
  const dirs = agentCliSearchDirs(
    'win32',
    { LOCALAPPDATA: localAppData, APPDATA: 'C:\\Users\\bingwu\\AppData\\Roaming' },
    'C:\\Users\\bingwu',
  );

  assert.ok(dirs.includes(path.win32.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin')));
});

test('Windows Codex installation falls back to Windows PowerShell only when pwsh is unavailable', () => {
  const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  const shell = resolveCodexInstallerShell(
    'win32',
    { SystemRoot: 'C:\\Windows', Path: 'C:\\Windows\\System32' },
    (candidate) => candidate === powershell,
  );

  assert.equal(shell.command, powershell);
  assert.equal(shell.kind, 'windows-powershell');
});

test('PowerShell bootstrap strips redirecting environment and never pins install paths', () => {
  const officialScript = '[CmdletBinding()]\nparam(\n  [string]$Release\n)\nWrite-Host "official installer"\n';
  const installer = agentPowerShellInstallerScript(officialScript, CODEX_PS1_BOOTSTRAP);

  assert.ok(installer.startsWith('[CmdletBinding()]\nparam(\n  [string]$Release\n)\n'));
  // The official installer owns its layout: stale pinning from older
  // StashBase versions is REMOVED, never assigned.
  assert.ok(installer.includes('Remove-Item Env:\\CODEX_INSTALL_DIR'));
  assert.ok(installer.includes('Remove-Item Env:\\CODEX_HOME'));
  assert.doesNotMatch(installer, /\$env:CODEX_INSTALL_DIR\s*=/);
  assert.doesNotMatch(installer, /\$env:CODEX_HOME\s*=/);
  assert.ok(installer.includes('$env:CODEX_NON_INTERACTIVE = "true"'));
  assert.ok(installer.indexOf('Remove-Item Env:\\CODEX_HOME') < installer.indexOf('Write-Host "official installer"'));

  const claudeInstaller = agentPowerShellInstallerScript('Write-Host "claude"', CLAUDE_PS1_BOOTSTRAP);
  assert.ok(claudeInstaller.includes('Remove-Item Env:\\ELECTRON_RUN_AS_NODE'));
  assert.ok(claudeInstaller.indexOf('$ErrorActionPreference') < claudeInstaller.indexOf('Write-Host "claude"'));
});

test('PowerShell bootstrap never lands ahead of a bare param block', () => {
  // The real head of Claude's official install.ps1: a bare multi-line param
  // block with nested parentheses and no [CmdletBinding()]. `param` must stay
  // the first statement or PowerShell reports it as an unknown command.
  const officialScript = [
    'param(',
    '    [Parameter(Position=0)]',
    "    [ValidatePattern('^(stable|latest)$')]",
    '    [string]$Target = "latest"',
    ')',
    '',
    'Set-StrictMode -Version Latest',
    '',
  ].join('\r\n');
  const installer = agentPowerShellInstallerScript(officialScript, CLAUDE_PS1_BOOTSTRAP);

  assert.ok(installer.startsWith('param('));
  const bootstrapAt = installer.indexOf('Remove-Item Env:\\ELECTRON_RUN_AS_NODE');
  assert.ok(bootstrapAt > installer.indexOf('[string]$Target'));
  assert.ok(bootstrapAt < installer.indexOf('Set-StrictMode'));
  // The nested parenthesis inside [Parameter(Position=0)] must not be
  // mistaken for the block's closing parenthesis.
  assert.ok(installer.indexOf(')\r\n') > installer.indexOf('$Target'));
});

test('Windows PowerShell architecture failures explain the PowerShell 7 recovery', async () => {
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-codex-shell-test-'));
  process.env.STASHBASE_LOCAL_DATA_ROOT = root;
  mock.method(globalThis, 'fetch', async () => new Response('# installer'));
  try {
    await assert.rejects(
      installCodex(() => {}, new AbortController().signal, {
        resolveInstallerShell: () => ({
          command: 'powershell.exe',
          args: [],
          kind: 'windows-powershell',
        }),
        runInstallerScript: async () => {
          throw new Error("The property 'OSArchitecture' cannot be found on this object.");
        },
      }),
      /PowerShell 7.*pwsh\.exe.*retry/i,
    );
  } finally {
    mock.restoreAll();
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PowerShell Codex installer failures do not fall through to executable ENOENT', async () => {
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-codex-powershell-error-test-'));
  const fakePowerShell = path.join(root, 'fake-powershell.cjs');
  process.env.STASHBASE_LOCAL_DATA_ROOT = root;
  fs.writeFileSync(fakePowerShell, `
const fs = require('node:fs');
const scriptPath = process.argv[2];
if (scriptPath && scriptPath.endsWith('.ps1')) {
  const script = fs.readFileSync(scriptPath, 'utf8');
  process.stderr.write('Codex package download blocked by proxy.');
  process.exitCode = script.includes('# official installer') ? 23 : 24;
} else {
  process.stdin.resume();
  process.stdin.on('end', () => {
    process.stderr.write('Codex package download blocked by proxy.');
    process.exitCode = 0;
  });
}
`);
  mock.method(globalThis, 'fetch', async () => new Response('# official installer'));
  try {
    await assert.rejects(
      installCodex(() => {}, new AbortController().signal, {
        resolveInstallerShell: () => ({
          command: process.execPath,
          args: [fakePowerShell],
          kind: 'powershell-7',
        }),
        verifyExecutable: (executable) => {
          throw new Error(`spawnSync ${executable} ENOENT`);
        },
      }),
      (error) => {
        assert.match(String(error), /Codex package download blocked by proxy/);
        assert.doesNotMatch(String(error), /ENOENT/);
        return true;
      },
    );
    assert.equal(
      fs.readdirSync(managedAgentRuntimeRoot('codex')).some((entry) => entry.startsWith('.installer-script.')),
      false,
    );
  } finally {
    mock.restoreAll();
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex install runs the official script unpinned and verifies the discovered executable', async () => {
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  const previousInstallDir = process.env.CODEX_INSTALL_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-codex-install-test-'));
  process.env.STASHBASE_LOCAL_DATA_ROOT = root;
  // A stale pin inherited from an older StashBase version must not redirect
  // the official installer.
  process.env.CODEX_INSTALL_DIR = path.join(root, 'stale-private-bin');
  const installed = path.join(root, 'local-bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  const installer = process.platform === 'win32'
    ? [
      'Write-Output "stashbase fixture installer started"',
      'if ($env:CODEX_INSTALL_DIR) { throw "bootstrap leaked CODEX_INSTALL_DIR" }',
      'if ($env:CODEX_HOME) { throw "bootstrap leaked CODEX_HOME" }',
      '$null = [System.IO.Directory]::CreateDirectory((Split-Path -Parent ' + `'${installed.replaceAll("'", "''")}'))`,
      `Set-Content -LiteralPath '${installed.replaceAll("'", "''")}' -Value 'installed Codex'`,
      '',
    ].join('\n')
    : `#!/bin/sh
set -eu
[ -z "\${CODEX_INSTALL_DIR:-}" ]
[ -z "\${CODEX_HOME:-}" ]
[ "\${CODEX_NON_INTERACTIVE:-}" = "true" ]
mkdir -p "${path.dirname(installed)}"
: > "${installed}"
chmod +x "${installed}"
`;
  mock.method(globalThis, 'fetch', async () => new Response(installer));
  let verified = false;
  let selectedShell: ReturnType<typeof resolveCodexInstallerShell> | undefined;
  const updates: string[] = [];
  try {
    try {
      await installCodex((update) => {
        if (update.message) updates.push(update.message);
      }, new AbortController().signal, {
        resolveInstallerShell: () => {
          selectedShell = resolveCodexInstallerShell();
          return selectedShell;
        },
        resolveInstalledExecutable: () => (fs.existsSync(installed) ? installed : null),
        verifyExecutable: (executable, label) => {
          verified = true;
          assert.equal(executable, installed);
          assert.equal(label, 'Codex');
        },
      });
    } catch (error) {
      const entries = fs.readdirSync(root, { recursive: true }).map(String).sort().join(', ');
      throw new Error(
        `${String(error)} Test entries: ${entries || '(empty)'}. `
        + `Selected shell: ${JSON.stringify(selectedShell)}. Updates: ${JSON.stringify(updates)}`,
        { cause: error },
      );
    }
    assert.equal(verified, true);
    assert.equal(fs.existsSync(path.join(root, 'stale-private-bin')), false);
    if (process.platform === 'win32') assert.equal(selectedShell?.kind, 'powershell-7');
  } finally {
    mock.restoreAll();
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    if (previousInstallDir === undefined) delete process.env.CODEX_INSTALL_DIR;
    else process.env.CODEX_INSTALL_DIR = previousInstallDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex installation reports missing output without a fabricated ENOENT check', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('# official installer'));
  let verified = false;
  try {
    await assert.rejects(
      installCodex(() => {}, new AbortController().signal, {
        runInstallerScript: async () => {},
        resolveInstalledExecutable: () => null,
        verifyExecutable: () => { verified = true; },
      }),
      (error) => {
        assert.match(String(error), /exited successfully but no 'codex' executable.*standard install locations/i);
        assert.doesNotMatch(String(error), /ENOENT/);
        return true;
      },
    );
    assert.equal(verified, false);
  } finally {
    mock.restoreAll();
  }
});

test('legacy managed discovery still accepts the official current and release layouts', async (context) => {
  const target = process.platform === 'win32'
    ? process.arch === 'arm64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc'
    : process.platform === 'darwin'
      ? process.arch === 'arm64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin'
      : process.platform === 'linux'
        ? process.arch === 'arm64' ? 'x86_64-unknown-linux-gnu' : 'aarch64-unknown-linux-gnu'
        : null;
  if (!target || !['arm64', 'x64'].includes(process.arch)) {
    context.skip('Codex does not publish a managed runtime for this test platform.');
    return;
  }
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-codex-legacy-layout-test-'));
  process.env.STASHBASE_LOCAL_DATA_ROOT = root;
  const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const write = (executable: string) => {
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, 'installed Codex');
    if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);
  };
  try {
    // Installs performed by older StashBase versions live under the private
    // AppData root; they stay discovered (and uninstallable) even though new
    // installs land in the official user-level locations.
    const currentExecutable = path.join(
      managedCodexInstallerHome(), 'packages', 'standalone', 'current', 'bin', binaryName,
    );
    write(currentExecutable);
    assert.equal(managedAgentExecutable('codex'), currentExecutable);
    fs.rmSync(path.dirname(path.dirname(currentExecutable)), { recursive: true, force: true });

    const releaseExecutable = path.join(managedCodexReleasesDir(), `0.147.0-${target}`, 'bin', binaryName);
    write(releaseExecutable);
    assert.equal(managedAgentExecutable('codex'), releaseExecutable);
  } finally {
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('development fixtures can isolate discovery from developer-installed Agents', () => {
  assert.equal(initialAgentDiscoveryPolicy({}), 'auto');
  assert.equal(initialAgentDiscoveryPolicy({ STASHBASE_AGENT_DISCOVERY_POLICY: 'managed-only' }), 'auto');
  assert.equal(initialAgentDiscoveryPolicy({
    STASHBASE_DEV_RUNTIME: '1',
    STASHBASE_AGENT_DISCOVERY_POLICY: 'managed-only',
  }), 'managed-only');
  assert.equal(initialAgentDiscoveryPolicy({
    STASHBASE_DEV_VITE: '1',
    STASHBASE_AGENT_DISCOVERY_POLICY: 'system-only',
  }), 'system-only');
  assert.equal(initialAgentDiscoveryPolicy({
    STASHBASE_AGENT_DEBUG: '1',
    STASHBASE_AGENT_DISCOVERY_POLICY: 'managed-only',
  }), 'managed-only');
  assert.equal(initialAgentDiscoveryPolicy({
    STASHBASE_AGENT_DEBUG: '1',
    STASHBASE_AGENT_DISCOVERY_POLICY: 'invalid',
  }), 'auto');
});

test('development failure injection is mutually exclusive and one-shot', () => {
  const previousDebug = process.env.STASHBASE_AGENT_DEBUG;
  process.env.STASHBASE_AGENT_DEBUG = '1';
  try {
    setAgentRuntimeDebugState({ nextFailure: 'mcp' });
    assert.equal(getAgentRuntimeDebugState().nextFailure, 'mcp');
    assert.equal(consumeAgentSetupFailure('installation'), false);
    assert.equal(getAgentRuntimeDebugState().nextFailure, 'mcp');
    assert.equal(consumeAgentSetupFailure('mcp'), true);
    assert.equal(getAgentRuntimeDebugState().nextFailure, 'none');
    assert.equal(consumeAgentSetupFailure('mcp'), false);
  } finally {
    setAgentRuntimeDebugState({ nextFailure: 'none' });
    if (previousDebug === undefined) delete process.env.STASHBASE_AGENT_DEBUG;
    else process.env.STASHBASE_AGENT_DEBUG = previousDebug;
  }
});

test('development turn failure injection is one-shot and independent of setup injection', () => {
  const previousDebug = process.env.STASHBASE_AGENT_DEBUG;
  process.env.STASHBASE_AGENT_DEBUG = '1';
  try {
    setAgentRuntimeDebugState({ nextFailure: 'mcp', nextTurnFailure: 'rate-limit' });
    assert.equal(getAgentRuntimeDebugState().nextTurnFailure, 'rate-limit');
    assert.equal(consumeAgentTurnFailure(), 'rate-limit');
    assert.equal(consumeAgentTurnFailure(), null);
    assert.equal(getAgentRuntimeDebugState().nextTurnFailure, 'none');
    // The setup simulation is a separate one-shot value.
    assert.equal(getAgentRuntimeDebugState().nextFailure, 'mcp');
    assert.throws(
      () => setAgentRuntimeDebugState({ nextTurnFailure: 'invalid' as AgentTurnFailureSimulation }),
      /Invalid Agent turn failure simulation/,
    );
  } finally {
    setAgentRuntimeDebugState({ nextFailure: 'none', nextTurnFailure: 'none' });
    if (previousDebug === undefined) delete process.env.STASHBASE_AGENT_DEBUG;
    else process.env.STASHBASE_AGENT_DEBUG = previousDebug;
  }
});

test('every turn failure script is bounded prose and only crash is session-fatal', () => {
  const kinds = ['rate-limit', 'quota', 'auth-expired', 'network', 'crash'] as const;
  for (const kind of kinds) {
    const script = simulatedTurnFailureScript(kind);
    assert.match(script.message, /^Simulated failure: /);
    assert.equal(script.fatal, kind === 'crash');
  }
});

test('managed-only discovery ignores the global Agent without uninstalling it', () => {
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  const previousDebug = process.env.STASHBASE_AGENT_DEBUG;
  const previousCodexBin = process.env.STASHBASE_CODEX_BIN;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-agent-runtime-test-'));
  const systemExecutable = path.join(root, process.platform === 'win32' ? 'system-codex.exe' : 'system-codex');
  process.env.STASHBASE_LOCAL_DATA_ROOT = root;
  process.env.STASHBASE_AGENT_DEBUG = '1';
  process.env.STASHBASE_CODEX_BIN = systemExecutable;
  try {
    const executable = path.join(managedCodexBinDir(), process.platform === 'win32' ? 'codex.exe' : 'codex');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, process.platform === 'win32' ? '' : '#!/bin/sh\nexit 0\n');
    fs.writeFileSync(systemExecutable, process.platform === 'win32' ? '' : '#!/bin/sh\nexit 0\n');
    if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);
    if (process.platform !== 'win32') fs.chmodSync(systemExecutable, 0o755);

    setAgentRuntimeDebugState({ discoveryPolicy: 'auto' });
    assert.equal(resolveAgentCli({ name: 'codex', envNames: ['STASHBASE_CODEX_BIN'], logLabel: 'Codex' }), systemExecutable);
    setAgentRuntimeDebugState({ discoveryPolicy: 'managed-only' });
    assert.equal(resolveAgentCli({ name: 'codex', envNames: ['STASHBASE_CODEX_BIN'], logLabel: 'Codex' }), executable);
  } finally {
    setAgentRuntimeDebugState({ discoveryPolicy: 'auto', nextFailure: 'none' });
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    if (previousDebug === undefined) delete process.env.STASHBASE_AGENT_DEBUG;
    else process.env.STASHBASE_AGENT_DEBUG = previousDebug;
    if (previousCodexBin === undefined) delete process.env.STASHBASE_CODEX_BIN;
    else process.env.STASHBASE_CODEX_BIN = previousCodexBin;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit readiness finds a version-manager Agent through the login shell', { skip: process.platform === 'win32' }, () => {
  const previousShell = process.env.SHELL;
  const previousFakeBin = process.env.STASHBASE_TEST_SHELL_AGENT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-agent-shell-test-'));
  const shell = path.join(root, 'fake-shell');
  const executable = path.join(root, 'version-manager-agent');
  fs.writeFileSync(shell, '#!/bin/sh\nprintf "%s\\n" "$STASHBASE_TEST_SHELL_AGENT"\n');
  fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(shell, 0o755);
  fs.chmodSync(executable, 0o755);
  process.env.SHELL = shell;
  process.env.STASHBASE_TEST_SHELL_AGENT = executable;
  try {
    assert.equal(
      resolveAgentCliWithLoginShell({ name: `stashbase-test-agent-${process.pid}`, envNames: [], logLabel: 'Test Agent' }),
      executable,
    );
  } finally {
    if (previousShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = previousShell;
    if (previousFakeBin === undefined) delete process.env.STASHBASE_TEST_SHELL_AGENT;
    else process.env.STASHBASE_TEST_SHELL_AGENT = previousFakeBin;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the deferred startup pass probes the login shell; the boot pass never does', () => {
  const probes: Array<{ probeLoginShell?: boolean } | undefined> = [];
  let configured = 0;
  const fake = fakeDependencies({
    resolveExecutable: (_id, options) => {
      probes.push(options);
      // Only a login shell can resolve this runtime (nvm/homebrew paths).
      return options?.probeLoginShell ? '/login-shell/codex' : null;
    },
    configureMcp: () => { configured += 1; },
  });
  const coordinator = new AgentBootstrapCoordinator(fake.dependencies);

  // Synchronous boot pass: no probe, runtime invisible, no connect — boot
  // must stay quick and never spawn a shell.
  assert.equal(coordinator.connectIfInstalled('codex').phase, 'idle');
  assert.deepEqual(probes.at(-1), undefined);
  assert.equal(configured, 0);

  // Deferred pass: probes the login shell, finds the runtime, connects —
  // no waiting for the first New Chat.
  assert.equal(coordinator.connectIfInstalled('codex', { probeLoginShell: true }).phase, 'ready');
  assert.deepEqual(probes.at(-1), { probeLoginShell: true });
  assert.equal(configured, 1);
});
