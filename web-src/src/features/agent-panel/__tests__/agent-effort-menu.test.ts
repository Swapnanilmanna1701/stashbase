import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effortLabel,
  effortOptions,
} from '@/features/agent-panel/lib/effortMenuState';

test('native effort identifiers retain their advertised order and labels', () => {
  const native = ['ultra', 'minimal', 'provider_native-level'];
  assert.deepEqual(effortOptions(native), native);
  assert.equal(effortLabel('ultra'), 'Ultra');
  assert.equal(effortLabel('provider_native-level'), 'Provider Native Level');
});
