import assert from 'node:assert/strict';
import test from 'node:test';
import { agentConnectionUrl } from '@/features/agent-panel/lib/connectionUrl.ts';
import { applyModelEvent, modelMenuLabel, modelMenuLocked, modelMenuVisible } from '@/features/agent-panel/lib/modelState.ts';

const base = { protocol: 'http:', host: 'localhost:3000', endpoint: '/ws/agent', windowId: 'window-1', effort: 'high', access: 'default', agent: 'codex' };

test('a fresh Agent session forwards its selected native model', () => {
  const url = new URL(agentConnectionUrl({ ...base, model: 'native-model' }));
  assert.equal(url.searchParams.get('model'), 'native-model');
  assert.equal(url.searchParams.get('resume'), null);
});

test('a fresh Agent session leaves effort unset until the user chooses it', () => {
  const defaultUrl = new URL(agentConnectionUrl({ ...base, effort: undefined }));
  assert.equal(defaultUrl.searchParams.get('effort'), null);

  const selectedUrl = new URL(agentConnectionUrl({ ...base, effort: 'low' }));
  assert.equal(selectedUrl.searchParams.get('effort'), 'low');

  const nativeUrl = new URL(agentConnectionUrl({ ...base, effort: 'ultra' }));
  assert.equal(nativeUrl.searchParams.get('effort'), 'ultra');
});

test('a resumed Agent session never forwards a stale tab model', () => {
  const url = new URL(agentConnectionUrl({ ...base, model: 'old-tab-model', resume: 'historic-session' }));
  assert.equal(url.searchParams.get('model'), null);
  assert.equal(url.searchParams.get('resume'), 'historic-session');
});

test('an explicit session folder rides the connection URL; absent means window folder', () => {
  const explicit = new URL(agentConnectionUrl({ ...base, folder: '/Users/me/Projects/Notes' }));
  assert.equal(explicit.searchParams.get('folder'), '/Users/me/Projects/Notes');

  const implicit = new URL(agentConnectionUrl({ ...base }));
  assert.equal(implicit.searchParams.get('folder'), null);
});

test('a resumed Agent session still carries its own explicit folder', () => {
  const url = new URL(agentConnectionUrl({ ...base, resume: 'historic-session', folder: '/Users/me/Other' }));
  assert.equal(url.searchParams.get('resume'), 'historic-session');
  assert.equal(url.searchParams.get('folder'), '/Users/me/Other');
});

test('a resumed Agent session omits inherited unknown effort', () => {
  const url = new URL(agentConnectionUrl({ ...base, effort: undefined, resume: 'historic-session' }));
  assert.equal(url.searchParams.get('effort'), null);
  assert.equal(url.searchParams.get('resume'), 'historic-session');
});

test('model control visibility, locking label, active identity, and fallback state are deterministic', () => {
  const models = [{ id: 'native-model', label: 'Native model' }];
  assert.equal(modelMenuVisible(true, models), true);
  assert.equal(modelMenuVisible(false, models), false);
  assert.equal(modelMenuVisible(true, []), false);
  assert.equal(modelMenuLocked(false, false), false);
  assert.equal(modelMenuLocked(true, false), true);
  assert.equal(modelMenuLocked(false, true), true);
  assert.equal(modelMenuLabel(models, undefined, undefined, true), 'Session model');

  const active = applyModelEvent({ models: [], selectedModel: undefined, activeModel: undefined, notice: null, resumedSession: true }, { models, activeModel: 'native-model' });
  assert.equal(active.selectedModel, undefined);
  assert.equal(active.activeModel, 'native-model');
  assert.equal(active.notice, null);
  assert.equal(modelMenuLabel(active.models, active.selectedModel, active.activeModel, active.resumedSession), 'Native model');

  const fallbackModels = [...models, { id: 'runtime-default', label: 'Runtime default' }];
  const fallback = applyModelEvent(active, {
    models: fallbackModels,
    activeModel: 'runtime-default',
    fallback: 'That model could not be selected; using the runtime default.',
  });
  assert.equal(fallback.selectedModel, undefined);
  assert.equal(fallback.activeModel, 'runtime-default');
  assert.match(fallback.notice ?? '', /runtime default/);

  const defaultActive = applyModelEvent(fallback, { models, activeModel: 'native-model' });
  assert.equal(defaultActive.selectedModel, undefined, 'runtime telemetry must not pin Default on reconnect');
  assert.equal(defaultActive.activeModel, 'native-model');
  assert.match(defaultActive.notice ?? '', /runtime default/, 'active-model telemetry must not hide fallback recovery');
});
