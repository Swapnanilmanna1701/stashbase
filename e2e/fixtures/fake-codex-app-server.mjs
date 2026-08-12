#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline';
import { fakeAgentNetworkPolicy } from './deny-network.mjs';

const logFile = process.env.STASHBASE_FAKE_CODEX_LOG;
let turnSequence = 0;
let nextServerRequestId = 10_000;
let historyCwd = process.cwd();
const pendingApprovals = new Map();

record({
  event: 'launch',
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  windowId: process.env.STASHBASE_WINDOW_ID ?? null,
  agentSessionId: process.env.STASHBASE_AGENT_SESSION_ID ?? null,
  networkDenied: fakeAgentNetworkPolicy.denied,
});

const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  record({ event: 'receive', message });
  if (typeof message.method === 'string' && 'id' in message) {
    handleRequest(message);
    return;
  }
  if ('id' in message && ('result' in message || 'error' in message)) {
    handleResponse(message);
  }
});

function handleRequest(request) {
  const params = objectValue(request.params);
  switch (request.method) {
    case 'initialize':
      respond(request.id, {});
      break;
    case 'model/list':
      respond(request.id, {
        data: [{
          id: 'fake-codex-model',
          displayName: 'Fake Codex Model',
          isDefault: true,
          supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
        }],
      });
      break;
    case 'skills/list': {
      const cwds = Array.isArray(params.cwds) ? params.cwds : [];
      respond(request.id, { data: cwds.map((cwd) => ({ cwd, skills: [] })) });
      break;
    }
    case 'thread/start':
      record({ event: 'thread-start', params });
      respond(request.id, { thread: { id: 'fake-thread-1', model: 'fake-codex-model' } });
      break;
    case 'thread/resume':
      respond(request.id, { thread: { id: String(params.threadId || 'fake-thread-1'), model: 'fake-codex-model' } });
      break;
    case 'thread/name/set':
      record({ event: 'thread-name', params });
      respond(request.id, {});
      break;
    case 'thread/list':
      if (typeof params.cwd === 'string' && params.cwd) historyCwd = params.cwd;
      respond(request.id, {
        data: [{
          id: 'fake-history-thread',
          name: 'Fixture history session',
          preview: 'Fixture history session',
          cwd: historyCwd,
          updatedAt: 1_786_444_800,
        }],
        nextCursor: null,
      });
      break;
    case 'thread/read':
      respond(request.id, {
        thread: {
          id: String(params.threadId || 'fake-history-thread'),
          name: 'Fixture history session',
          cwd: historyCwd,
          turns: [{
            id: 'fake-history-turn',
            items: [
              { type: 'userMessage', content: [{ type: 'text', text: 'History fixture question' }] },
              { type: 'agentMessage', text: 'History fixture answer' },
            ],
          }],
        },
      });
      break;
    case 'thread/delete':
      record({ event: 'thread-delete', params });
      respond(request.id, {});
      break;
    case 'turn/start':
      startTurn(request.id, params);
      break;
    case 'turn/interrupt':
      record({ event: 'interrupt', params });
      respond(request.id, {});
      notify('turn/completed', {
        threadId: String(params.threadId || 'fake-thread-1'),
        turn: { id: String(params.turnId || 'fake-turn-2'), items: [], status: 'interrupted' },
      });
      break;
    default:
      reject(request.id, `Fake Codex does not implement ${request.method}.`, -32601);
      break;
  }
}

function startTurn(requestId, params) {
  const turnId = `fake-turn-${++turnSequence}`;
  const prompt = Array.isArray(params.input)
    ? params.input.find((item) => item?.type === 'text')?.text ?? ''
    : '';
  record({ event: 'turn-start', turnId, prompt, params });
  respond(requestId, { turn: { id: turnId } });
  notify('turn/started', { threadId: String(params.threadId || 'fake-thread-1'), turn: { id: turnId, status: 'inProgress' } });

  if (/stop/i.test(prompt)) return;
  if (/terminal error/i.test(prompt)) {
    record({ event: 'terminal-error', turnId, prompt });
    notify('error', {
      threadId: String(params.threadId || 'fake-thread-1'),
      turnId,
      willRetry: false,
      message: 'Deterministic fake Agent failure.',
    });
    return;
  }

  const itemId = `fake-command-${turnSequence}`;
  notify('item/started', {
    threadId: String(params.threadId || 'fake-thread-1'),
    turnId,
    item: {
      type: 'commandExecution',
      id: itemId,
      command: 'printf fake-codex-approved',
      cwd: process.cwd(),
      status: 'inProgress',
      commandActions: [{ type: 'read', path: 'Welcome.md' }],
    },
  });
  const approvalId = nextServerRequestId++;
  pendingApprovals.set(approvalId, { turnId, itemId, threadId: String(params.threadId || 'fake-thread-1') });
  send({
    id: approvalId,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: String(params.threadId || 'fake-thread-1'),
      turnId,
      itemId,
      command: 'printf fake-codex-approved',
      cwd: process.cwd(),
      reason: 'Confirm the deterministic E2E command',
    },
  });
}

function handleResponse(response) {
  const pending = pendingApprovals.get(response.id);
  if (!pending) return;
  pendingApprovals.delete(response.id);
  const decision = response.result?.decision ?? 'error';
  record({ event: 'approval-response', decision, response });
  const accepted = decision === 'accept' || decision === 'acceptForSession';
  notify('item/completed', {
    threadId: pending.threadId,
    turnId: pending.turnId,
    item: {
      type: 'commandExecution',
      id: pending.itemId,
      command: 'printf fake-codex-approved',
      cwd: process.cwd(),
      status: accepted ? 'completed' : 'failed',
      aggregatedOutput: accepted ? 'fake-codex-approved' : 'permission declined',
      exitCode: accepted ? 0 : 1,
      commandActions: [{ type: 'read', path: 'Welcome.md' }],
    },
  });
  if (accepted) {
    notify('item/agentMessage/delta', {
      threadId: pending.threadId,
      turnId: pending.turnId,
      itemId: `fake-message-${turnSequence}`,
      delta: 'Deterministic approval completed.',
    });
  }
  notify('turn/completed', {
    threadId: pending.threadId,
    turn: {
      id: pending.turnId,
      items: [],
      status: accepted ? 'completed' : 'failed',
      ...(accepted ? {} : { error: { message: 'Permission was declined.' } }),
    },
  });
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function respond(id, result) {
  send({ id, result });
}

function reject(id, message, code) {
  send({ id, error: { code, message } });
}

function notify(method, params) {
  send({ method, params });
}

function send(message) {
  record({ event: 'send', message });
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function record(entry) {
  if (!logFile) return;
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
}
