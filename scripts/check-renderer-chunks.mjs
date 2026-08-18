import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repoRoot, 'web', 'dist-app');
const manifestPath = path.join(outputRoot, '.vite', 'manifest.json');
/* Guardrail against a heavy module slipping into the always-loaded shell,
 * not a freeze on shell features. Raised 400 → 416 KiB when the activity
 * rail became the titlebar controls + a sidebar Settings row; 416 → 418
 * when the active-folder header gained the folder-switcher trigger and
 * its menu-item builder (the menu body itself stays in the lazy
 * ManagedMenu chunk). Both are eager chrome by definition. 418 → 424 for
 * save-conflict resolution and desktop updates: the resolver surface, the
 * update banner, and the General settings panel are all lazy, but the parts
 * that decide WHETHER to show them are not — the conflict actions live in
 * the document action set, and the clipboard-capture handoff lives in the
 * shell's own hook. Raise it only for shell UI that must load with the
 * window — anything a user can open on demand belongs in a dynamic entry
 * above. */
const initialJsBudgetBytes = 424 * 1024;
const expectedEntries = [
  'src/features/agent-panel/components/ChatPane.tsx',
  'src/features/agent-panel/components/AgentMathMarkdown.tsx',
  'src/features/documents/components/CrepeDocument.tsx',
  'src/features/documents/components/JsonDocument.tsx',
  'src/features/documents/components/json/JsonTreeView.tsx',
  'src/features/documents/components/PdfViewerPane.tsx',
  'src/features/documents/components/DocxPreview.tsx',
  'src/features/documents/components/AudioPreview.tsx',
  'src/features/search/components/ManagedLibrarySearch.tsx',
  'src/features/search/components/ManagedQuickOpen.tsx',
  'src/app/components/ContextMenu.tsx',
  'src/common/components/DocumentOutline.tsx',
  'src/common/components/SemanticIndexingNotice.tsx',
  'src/features/preparation/components/UnsupportedFilesCallout.tsx',
  'src/features/preparation/components/EmbeddingSetupCallout.tsx',
  'src/features/account/components/SidebarAccountRow.tsx',
  'src/features/settings/components/embedder/RequireApiKeyModal.tsx',
];

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function chunkSize(entryKey) {
  const entry = manifest[entryKey];
  if (!entry?.file) throw new Error(`renderer manifest entry is missing: ${entryKey}`);
  const chunkPath = path.join(outputRoot, entry.file);
  const stat = fs.statSync(chunkPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`renderer chunk is missing or empty: ${entry.file}`);
  }
  return stat.size;
}

for (const source of expectedEntries) {
  const entry = manifest[source];
  if (!entry?.isDynamicEntry) {
    throw new Error(`renderer build is missing dynamic entry: ${source}`);
  }
  chunkSize(source);
}

const initialEntries = new Set();
function collectStaticImports(entryKey) {
  if (initialEntries.has(entryKey)) return;
  initialEntries.add(entryKey);
  const entry = manifest[entryKey];
  if (!entry) throw new Error(`renderer manifest import is missing: ${entryKey}`);
  for (const imported of entry.imports ?? []) collectStaticImports(imported);
}

const rendererEntry = Object.entries(manifest).find(([, entry]) => entry?.isEntry)?.[0];
if (!rendererEntry) throw new Error('renderer manifest is missing its entry chunk');
collectStaticImports(rendererEntry);
const initialJsBytes = [...initialEntries].reduce((total, entryKey) => total + chunkSize(entryKey), 0);
if (initialJsBytes > initialJsBudgetBytes) {
  throw new Error(
    `renderer initial JS is ${initialJsBytes} bytes, exceeding the ${initialJsBudgetBytes}-byte budget`,
  );
}

console.log(
  `[renderer-chunks] verified ${expectedEntries.length} dynamic entries; `
    + `initial static JS ${initialJsBytes}/${initialJsBudgetBytes} bytes`,
);
