import assert from 'node:assert/strict';
import test from 'node:test';
import { splitLeadingYamlFrontmatter } from '@/features/documents/milkdown/frontmatter.ts';

test('valid leading YAML is retained verbatim outside the visual document', () => {
  const source = '---\r\ntitle: Release notes\r\n---\r\n# Visible title';
  assert.deepEqual(splitLeadingYamlFrontmatter(source), {
    source: '---\r\ntitle: Release notes\r\n---\r\n',
    body: '# Visible title',
  });
});

test('invalid or unterminated YAML remains ordinary Markdown content', () => {
  for (const source of ['---\ntitle: [broken\n---\n# Title', '---\ntitle: Unclosed\n# Title']) {
    assert.deepEqual(splitLeadingYamlFrontmatter(source), { source: '', body: source });
  }
});
