import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JSON_TREE_LIMITS, addJsonChild, analyzeJsonSource, deleteJsonPath, renameJsonProperty,
  matchingJsonTreeNodes, reorderJsonArrayItem, replaceJsonNode,
} from '@/features/documents/lib/json/sourceModel';

test('strict tree analysis rejects malformed, empty, comments, trailing commas, and duplicate keys truthfully', () => {
  for (const [source, reason] of [
    ['', 'empty'], ['{"a":', 'invalid'], ['// no\n{"a":1}', 'invalid'], ['{"a":1,}', 'invalid'], ['{"a":1,"a":2}', 'duplicate-keys'],
  ] as const) {
    const result = analyzeJsonSource(source);
    assert.equal(result.available, false, source);
    if (!result.available) { assert.equal(result.reason, reason); assert.match(result.message, /Source mode/u); }
  }
});

test('tree analysis retains source lexemes and reports paths without numeric coercion', () => {
  const source = '\uFEFF{\r\n  "large": 900719925474099312345,\r\n  "exponent": 1.2300e+42,\r\n  "escaped": "\\u0061\\/b"\r\n}\r\n';
  const result = analyzeJsonSource(source);
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.equal(result.root.children[0].raw, '900719925474099312345');
  assert.equal(result.root.children[1].raw, '1.2300e+42');
  assert.equal(result.root.children[2].raw, '"\\u0061\\/b"');
});

test('tree search shares case-sensitive and whole-word matching semantics', () => {
  const analysis = analyzeJsonSource('{"Alpha":"alpha_beta","other":"alpha"}');
  assert.equal(analysis.available, true);
  if (!analysis.available) return;
  assert.deepEqual(matchingJsonTreeNodes(analysis.root, 'Alpha', { caseSensitive: true, wholeWord: true }).map((node) => node.path), [['Alpha']]);
  assert.deepEqual(matchingJsonTreeNodes(analysis.root, 'alpha', { caseSensitive: true, wholeWord: true }).map((node) => node.path), [['other']]);
  assert.deepEqual(matchingJsonTreeNodes(analysis.root, 'alpha', { caseSensitive: false, wholeWord: false }).map((node) => node.path), [['Alpha'], ['other']]);
  assert.deepEqual(matchingJsonTreeNodes(analysis.root, ' alpha ', { caseSensitive: false, wholeWord: false }), [], 'search preserves significant query whitespace');
});

test('scalar, subtree, rename, add, delete, and reorder edits patch only their safe source range', () => {
  const original = '\uFEFF{\r\n  "untouched" : "\\u0061\\/b",\r\n  "large": 900719925474099312345,\r\n  "nested": { "value": true },\r\n  "items": [1, 2, 3]\r\n}\r\n';
  const analysis = analyzeJsonSource(original);
  assert.equal(analysis.available, true);
  if (!analysis.available) return;
  const value = analysis.root.children[2].children[0];
  let source = replaceJsonNode(original, value, 'false');
  assert.equal(source.replace('false', 'true'), original);
  source = renameJsonProperty(source, ['nested', 'value'], 'enabled');
  assert.match(source, /"nested": \{ "enabled": false \}/u);
  source = addJsonChild(source, ['nested'], '900719925474099399999', 'precise');
  assert.match(source, /"precise": 900719925474099399999/u);
  source = addJsonChild(source, ['items'], '{"raw":1.00e+2}');
  assert.match(source, /\[1, 2, 3, \{"raw":1.00e\+2\}\]/u);
  source = reorderJsonArrayItem(source, ['items'], 0, 2);
  assert.match(source, /\[2, 3, 1, \{"raw":1.00e\+2\}\]/u);
  source = deleteJsonPath(source, ['nested', 'enabled']);
  assert.doesNotMatch(source, /enabled/u);
  assert.ok(source.startsWith('\uFEFF'));
  assert.ok(source.endsWith('\r\n'));
  assert.ok(source.includes('"untouched" : "\\u0061\\/b"'));
  assert.match(source, /900719925474099312345/u);
  assert.equal(analyzeJsonSource(source).available, true);
});

test('first child replaces multiline empty-container whitespace without adding a blank line', () => {
  const cases: Array<[string, string, string | undefined, string]> = [
    ['{\n}', '1', 'a', '{\n  "a": 1\n}'],
    ['[\n]', '1', undefined, '[\n  1\n]'],
    ['{\n  }', '1', 'a', '{\n    "a": 1\n  }'],
    ['[\n  ]', '1', undefined, '[\n    1\n  ]'],
    ['{\r\n}', '1', 'a', '{\r\n  "a": 1\r\n}'],
  ];
  for (const [source, value, key, expected] of cases) {
    assert.equal(addJsonChild(source, [], value, key), expected, source);
  }
});

test('raw subtree replacement validates before changing source', () => {
  const source = '{"node":{"a":1},"keep" : 2}';
  const analysis = analyzeJsonSource(source);
  assert.equal(analysis.available, true);
  if (!analysis.available) return;
  assert.throws(() => replaceJsonNode(source, analysis.root.children[0], '{"bad":}', true), /not valid strict JSON/u);
  assert.equal(replaceJsonNode(source, analysis.root.children[0], '{\n  "fresh": 3\n}', true), '{"node":{\n  "fresh": 3\n},"keep" : 2}');
});

test('tree mode enforces measured byte, node, and depth bounds', () => {
  const bytes = analyzeJsonSource(`"${'x'.repeat(JSON_TREE_LIMITS.bytes)}"`);
  assert.equal(bytes.available, false);
  if (!bytes.available) assert.equal(bytes.reason, 'over-limit');
  const deep = `${'['.repeat(JSON_TREE_LIMITS.depth + 1)}0${']'.repeat(JSON_TREE_LIMITS.depth + 1)}`;
  const depth = analyzeJsonSource(deep);
  assert.equal(depth.available, false);
  if (!depth.available) assert.equal(depth.reason, 'over-limit');
});
