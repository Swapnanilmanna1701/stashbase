import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { scanE2eFiles, scanE2eSource } from './check-e2e-focus.mjs';

const checkerPath = fileURLToPath(new URL('./check-e2e-focus.mjs', import.meta.url));

test('reports a focused Playwright test with its source location', () => {
  const violations = scanE2eSource("test.only('critical path', async () => {});\n", 'e2e/smoke/example.spec.ts');

  assert.deepEqual(violations, [{
    file: 'e2e/smoke/example.spec.ts',
    line: 1,
    column: 1,
    expression: 'test.only',
    policy: 'focused tests are forbidden',
  }]);
});

test('reports focused suites and every raw skip or fixme annotation', () => {
  const source = [
    "test.describe.only('focused suite', () => {});",
    "test.skip(true, 'temporarily disabled');",
    "test.describe.skip('disabled suite', () => {});",
    "test.fixme('not implemented', () => {});",
    "it.skip('disabled alias', () => {});",
    "describe.only('focused alias suite', () => {});",
  ].join('\n');

  assert.deepEqual(
    scanE2eSource(source, 'e2e/journeys/example.spec.ts').map(({ expression, policy }) => ({ expression, policy })),
    [
      { expression: 'test.describe.only', policy: 'focused tests are forbidden' },
      { expression: 'test.skip', policy: 'skipped and fixme tests are forbidden' },
      { expression: 'test.describe.skip', policy: 'skipped and fixme tests are forbidden' },
      { expression: 'test.fixme', policy: 'skipped and fixme tests are forbidden' },
      { expression: 'it.skip', policy: 'skipped and fixme tests are forbidden' },
      { expression: 'describe.only', policy: 'focused tests are forbidden' },
    ],
  );
});

test('ignores forbidden-looking text in comments, strings, and unrelated APIs', () => {
  const source = [
    "// test.only('commented out', () => {});",
    "/* test.skip('also commented out', () => {}); */",
    "const example = \"test.fixme('documentation example', () => {})\";",
    "const template = `describe.only('template example', () => {})`;",
    "queue.skip('an unrelated domain method');",
    "test('ordinary test', async () => {});",
    "test.describe('ordinary suite', () => {});",
  ].join('\n');

  assert.deepEqual(scanE2eSource(source, 'e2e/support/example.ts'), []);
});

test('reports computed access to forbidden test modifiers', () => {
  const source = [
    "test['only']('focused', () => {});",
    "test.describe[\"skip\"]('disabled', () => {});",
    "it[`fixme`]('disabled alias', () => {});",
  ].join('\n');

  assert.deepEqual(
    scanE2eSource(source, 'e2e/smoke/computed.spec.ts').map((violation) => violation.expression),
    ['test.only', 'test.describe.skip', 'it.fixme'],
  );
});

test('recursively scans E2E code files and ignores non-code artifacts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-e2e-focus-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'journeys'), { recursive: true });
  fs.writeFileSync(path.join(root, 'journeys', 'clean.spec.ts'), "test('clean', () => {});\n");
  fs.writeFileSync(path.join(root, 'journeys', 'disabled.spec.ts'), "test.fixme('disabled', () => {});\n");
  fs.writeFileSync(path.join(root, 'journeys', 'example.txt'), "test.only('not code', () => {});\n");
  fs.writeFileSync(path.join(root, 'result.json'), '{"example":"test.skip"}\n');

  assert.deepEqual(scanE2eFiles(root, { cwd: root }), [{
    file: 'journeys/disabled.spec.ts',
    line: 1,
    column: 1,
    expression: 'test.fixme',
    policy: 'skipped and fixme tests are forbidden',
  }]);
});

test('CLI fails with actionable locations when forbidden modifiers exist', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-e2e-focus-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'focused.spec.ts'), "test.only('focused', () => {});\n");
  fs.writeFileSync(path.join(root, 'disabled.spec.ts'), "test.skip('disabled', () => {});\n");

  const result = spawnSync(process.execPath, [checkerPath, root], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /disabled\.spec\.ts:1:1.*test\.skip.*skipped and fixme tests are forbidden/);
  assert.match(result.stderr, /focused\.spec\.ts:1:1.*test\.only.*focused tests are forbidden/);
  assert.match(result.stderr, /found 2 forbidden test modifiers/);
});

test('CLI succeeds when E2E code contains no forbidden modifiers', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-e2e-focus-cli-clean-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'clean.spec.ts'), "test('clean', () => {});\n");

  const result = spawnSync(process.execPath, [checkerPath, root], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /no focused, skipped, or fixme tests found/);
  assert.equal(result.stderr, '');
});
