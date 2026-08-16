import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { mount } from '../routes/mcp-http.ts';
import { createDockerMcpApp, createMcpHttpService } from '../mcp-http-service.ts';
import type { McpHttpSettingsStore } from '../mcp-http-settings.ts';
import { createLibraryOperations } from '../library-operations/index.ts';

const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  },
};

const listRequest = {
  jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
};

const callRequest = {
  jsonrpc: '2.0', id: 3, method: 'tools/call',
  params: { name: 'library_info', arguments: {} },
};

test('HTTP transport enforces the live Settings token and preserves the shared tool surface', async () => {
  let token = 'a'.repeat(64);
  let searchInput: Record<string, unknown> | undefined;
  let stdioSearchBody: Record<string, unknown> | undefined;
  let createProjectInput: Record<string, unknown> | undefined;
  let stdioCreateProjectBody: Record<string, unknown> | undefined;
  let stdioCreateProjectAttribution: string | undefined;
  const app = express();
  app.use(express.json());
  app.get('/api/library/info', (_req, res) => {
    res.json({ folder_home: '/tmp', folders: [] });
  });
  app.post('/api/library/search', (req, res) => {
    stdioSearchBody = req.body as Record<string, unknown>;
    res.json({ hits: [] });
  });
  app.post('/api/library/create-project', (req, res) => {
    stdioCreateProjectBody = req.body as Record<string, unknown>;
    stdioCreateProjectAttribution = req.header('x-stashbase-agent-session-id') ?? undefined;
    res.json({ path: '/tmp/Project', name: 'Project', registered: true, rebound: true, note: 'ok' });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  mount(app, {
    webBase: base,
    getToken: () => token,
    operations: createLibraryOperations({
      getLibraryInfo: () => ({ folder_home: '/tmp', folders: [] }),
      normalizeSearchScope: (_folder, pathPrefix) => ({
        folderRoot: '/tmp',
        pathPrefix: typeof pathPrefix === 'string' ? pathPrefix : undefined,
      }),
      retrieval: { search: async (input) => {
        searchInput = input as unknown as Record<string, unknown>;
        return {
          evidence: [],
          availability: { state: 'ready' as const },
          truncated: false,
        };
      } },
      createProject: async (input) => {
        createProjectInput = input as unknown as Record<string, unknown>;
        return { path: '/tmp/Project', name: 'Project', registered: true, rebound: false, note: 'ok' };
      },
    }),
  });

  try {
    const unauthorized = await post(base, initRequest);
    assert.equal(unauthorized.status, 401);

    const initialized = await post(base, initRequest, token);
    assert.equal(initialized.status, 200);
    assert.equal(initialized.body.result.serverInfo.name, 'stashbase');

    const listed = await post(base, listRequest, token);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.result.tools.length, 10);
    const searchTool = listed.body.result.tools.find((tool: any) => tool.name === 'search_library');
    assert.deepEqual(
      searchTool.inputSchema.properties.types.items.enum,
      ['notes', 'data', 'pdf', 'image', 'docx', 'spreadsheets', 'audio'],
    );
    assert.deepEqual(searchTool.inputSchema.properties.mode.enum, ['semantic', 'keyword']);
    const createProjectTool = listed.body.result.tools.find((tool: any) => tool.name === 'create_project');
    assert.deepEqual(createProjectTool.inputSchema.required, ['name']);

    const called = await post(base, callRequest, token);
    assert.equal(called.status, 200);

    const searched = await post(base, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'search_library',
        arguments: {
          query: 'ExactMatch',
          mode: 'keyword',
          path_prefix: '/tmp/notes',
          types: ['pdf', 'docx'],
          case_strict: true,
          whole_word: true,
          top_k: 3,
        },
      },
    }, token);
    assert.equal(searched.status, 200);
    assert.deepEqual(searchInput, {
      mode: 'keyword',
      query: 'ExactMatch',
      topK: 3,
      folderRoot: '/tmp',
      pathPrefix: '/tmp/notes',
      types: ['pdf', 'docx'],
      caseStrict: true,
      wholeWord: true,
    });
    const searchPayload = JSON.parse(searched.body.result.content[0].text);
    assert.equal(searchPayload.mode, 'keyword');
    assert.equal(searchPayload.top_k, 3);
    assert.deepEqual(searchPayload.types, ['pdf', 'docx']);

    const invalidSearch = await post(base, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'search_library',
        arguments: { query: 'paper', types: ['spreadsheet'] },
      },
    }, token);
    assert.equal(invalidSearch.status, 200);
    assert.equal(invalidSearch.body.result.isError, true);
    assert.match(invalidSearch.body.result.content[0].text, /unknown search type/i);

    const invalidMode = await post(base, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'search_library',
        arguments: { query: 'paper', mode: 'typo' },
      },
    }, token);
    assert.equal(invalidMode.status, 200);
    assert.equal(invalidMode.body.result.isError, true);
    assert.match(invalidMode.body.result.content[0].text, /unknown search mode/i);

    // create_project reaches the operations seam with the model-controlled
    // arguments only — the HTTP MCP transport has no session attribution, so
    // no `agentSessionId` may appear (external callers never rebind a chat).
    const created = await post(base, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'create_project',
        arguments: { name: 'Project', location: '/tmp' },
      },
    }, token);
    assert.equal(created.status, 200);
    assert.equal(JSON.parse(created.body.result.content[0].text).registered, true);
    assert.deepEqual(createProjectInput, { name: 'Project', location: '/tmp' });
    assert.equal('agentSessionId' in (createProjectInput ?? {}), false);

    const stdio = await runStdio(address.port);
    assert.equal(stdio.initialized.result.serverInfo.name, 'stashbase');
    assert.deepEqual(stdio.listed.result.tools, listed.body.result.tools);
    assert.deepEqual(stdio.called.result, called.body.result);
    assert.deepEqual(stdioSearchBody, {
      query: 'diagram',
      top_k: 4,
      path_prefix: '/tmp/images',
      types: ['image'],
      mode: 'keyword',
      case_strict: true,
      whole_word: true,
    });
    const stdioPayload = JSON.parse(stdio.searched.result.content[0].text);
    assert.equal(stdioPayload.mode, 'keyword');
    assert.equal(stdioPayload.top_k, 4);
    assert.deepEqual(stdioPayload.types, ['image']);
    // The stdio host forwards its spawn-time session identity as the
    // attribution header — this is how a built-in panel session's
    // create_project call finds the live session to rebind.
    assert.equal(JSON.parse(stdio.createdProject.result.content[0].text).rebound, true);
    assert.deepEqual(stdioCreateProjectBody, { name: 'StdioProject' });
    assert.equal(stdioCreateProjectAttribution, 'session-attr-42');

    token = 'b'.repeat(64);
    assert.equal((await post(base, initRequest, 'a'.repeat(64))).status, 401);
    assert.equal((await post(base, initRequest, token)).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Docker-facing app exposes only the MCP transport', async () => {
  const app = createDockerMcpApp({
    webBase: 'http://127.0.0.1:9',
    getToken: () => 'a'.repeat(64),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const health = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(health.status, 404);
    const mcp = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: 'POST' });
    assert.equal(mcp.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('production Docker listener binds host interfaces and reports its actual port', async () => {
  const token = 'a'.repeat(64);
  let current = { token, dockerAccess: true, dockerPort: 8091 };
  const settings: McpHttpSettingsStore = {
    ensure: () => ({ ...current }),
    current: () => ({ ...current }),
    rotateToken: () => ({ ...current }),
    setDockerAccess: (enabled) => (current = { ...current, dockerAccess: enabled }),
    setDockerPort: (dockerPort) => (current = { ...current, dockerPort }),
  };
  const service = createMcpHttpService({ webPort: 9, dockerPort: 0, settings });
  try {
    await service.start();
    const status = service.status();
    assert.equal(status.dockerActive, true);
    assert.ok(status.dockerPort > 0);
    const response = await fetch(`http://127.0.0.1:${status.dockerPort}/mcp`, { method: 'POST' });
    assert.equal(response.status, 401);
  } finally {
    await service.close();
  }
});

async function post(base: string, body: unknown, token?: string): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function waitForJsonLines(read: () => string, count: number): Promise<any[]> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const lines = read().trim().split('\n').filter(Boolean);
    if (lines.length >= count) return lines.slice(0, count).map((line) => JSON.parse(line));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${count} JSON lines: ${read()}`);
}

async function runStdio(port: number): Promise<{
  initialized: any;
  listed: any;
  called: any;
  searched: any;
  createdProject: any;
}> {
  const { spawn } = await import('node:child_process');
  const entry = fileURLToPath(new URL('../../mcp/server.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', entry, '--port', String(port)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // A built-in panel session spawns the MCP host with its attribution id;
    // the host must forward it as the request header, never as a tool arg.
    env: { ...process.env, STASHBASE_AGENT_SESSION_ID: 'session-attr-42' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdin.write(`${JSON.stringify(initRequest)}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify(listRequest)}\n`);
  child.stdin.write(`${JSON.stringify(callRequest)}\n`);
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'search_library',
      arguments: {
        query: 'diagram',
        mode: 'keyword',
        path_prefix: '/tmp/images',
        types: ['image'],
        case_strict: true,
        whole_word: true,
        top_k: 4,
      },
    },
  })}\n`);
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'create_project',
      arguments: { name: 'StdioProject' },
    },
  })}\n`);

  try {
    const lines = await waitForJsonLines(() => stdout, 5);
    return {
      initialized: lines[0],
      listed: lines[1],
      called: lines[2],
      searched: lines[3],
      createdProject: lines[4],
    };
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message : String(err)}\nstderr: ${stderr}`);
  } finally {
    child.kill();
  }
}
