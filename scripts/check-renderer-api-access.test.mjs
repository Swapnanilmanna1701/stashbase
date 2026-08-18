import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isComponentFile, scanComponentFiles, scanComponentSource } from './check-renderer-api-access.mjs';

const checkerPath = fileURLToPath(new URL('./check-renderer-api-access.mjs', import.meta.url));

test('reports a component importing the API client, with its source location', () => {
  const source = "import { api } from '@/common/api/api';\nexport function Panel() { return api.listFiles(); }\n";

  assert.deepEqual(scanComponentSource(source, 'web-src/src/features/settings/components/Panel.tsx'), [{
    file: 'web-src/src/features/settings/components/Panel.tsx',
    line: 1,
    column: 10,
    binding: 'api',
  }]);
});

test('reports the client however it is spelled, and only the client', () => {
  const source = [
    "import { errorMessage, api, versionedAssetUrl } from '@/common/api/api';",
    "import { api as client } from '@/common/api/api';",
  ].join('\n');

  assert.deepEqual(
    scanComponentSource(source, 'web-src/src/app/components/Menu.tsx').map(({ line, binding }) => ({ line, binding })),
    [{ line: 1, binding: 'api' }, { line: 2, binding: 'client' }],
  );
});

test('leaves the pure helpers, the contract types, and type-only imports alone', () => {
  const source = [
    "import { errorMessage, ApiError, versionedAssetUrl, assetBaseUrl } from '@/common/api/api';",
    "import type { api } from '@/common/api/api';",
    "import { type EmbedderState } from '@/common/api/apiTypes';",
    "import { api } from '@/common/api/apiTransport';",
  ].join('\n');

  assert.deepEqual(scanComponentSource(source, 'web-src/src/features/documents/components/Preview.tsx'), []);
});

test('classifies component files by directory, exempting hooks, lib, and tests', () => {
  assert.equal(isComponentFile('web-src/src/features/settings/components/EmbeddingPanel.tsx'), true);
  assert.equal(isComponentFile('web-src/src/features/settings/components/embedder/KeyModal.tsx'), true);
  assert.equal(isComponentFile('web-src/src/common/components/Toasts.tsx'), true);
  assert.equal(isComponentFile('web-src/src/app/App.tsx'), true);

  assert.equal(isComponentFile('web-src/src/features/settings/hooks/useMcpAccess.ts'), false);
  assert.equal(isComponentFile('web-src/src/features/workspace/lib/addFolderMenu.tsx'), false);
  assert.equal(isComponentFile('web-src/src/store/contexts/AppContext.tsx'), false);
  assert.equal(isComponentFile('web-src/src/common/api/api.ts'), false);
  assert.equal(
    isComponentFile('web-src/src/features/workspace/__tests__/components/tree.test.ts'),
    false,
  );
});

test('scans a tree and passes the renderer source as it stands', () => {
  const root = fileURLToPath(new URL('../web-src/src', import.meta.url));
  assert.deepEqual(scanComponentFiles(root, { cwd: fileURLToPath(new URL('..', import.meta.url)) }), []);
});

test('exits non-zero and names the offending file when run as a script', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-access-'));
  try {
    const components = path.join(dir, 'components');
    fs.mkdirSync(components);
    fs.writeFileSync(path.join(components, 'Panel.tsx'), "import { api } from '@/common/api/api';\n");
    fs.writeFileSync(path.join(dir, 'useThing.ts'), "import { api } from '@/common/api/api';\n");

    const result = spawnSync(process.execPath, [checkerPath, dir], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /components\/Panel\.tsx:1:10/);
    assert.doesNotMatch(result.stderr, /useThing\.ts/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
