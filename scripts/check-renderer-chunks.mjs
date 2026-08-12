import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repoRoot, 'web', 'dist-app');
const manifestPath = path.join(outputRoot, '.vite', 'manifest.json');
/* Guardrail against a heavy module slipping into the always-loaded shell,
 * not a freeze on shell features. Raised 400 → 416 KiB when the activity
 * rail became the titlebar controls + a sidebar Settings row: that work is
 * eager chrome by definition. Raised 416 → 417 KiB for the always-on bug
 * report launcher that preserves native-menu and crash-recovery entry; the
 * controller and review surface remain dynamic entries below. Raise it only
 * for shell UI that must load with the window —
 * anything a user can open on demand belongs in a dynamic entry above. */
const initialJsBudgetBytes = 417 * 1024;
const expectedEntries = [
  'src/components/ChatPane.tsx',
  'src/components/CrepeDocument.tsx',
  'src/components/PdfPreview.tsx',
  'src/components/DocxPreview.tsx',
  'src/components/AudioPreview.tsx',
  'src/components/LibrarySearchDialog.tsx',
  'src/components/QuickOpenDialog.tsx',
  'src/components/ContextMenu.tsx',
  'src/components/DocumentOutline.tsx',
  'src/components/SemanticIndexingNotice.tsx',
  'src/components/UnsupportedFilesCallout.tsx',
  'src/components/EmbeddingSetupCallout.tsx',
  'src/components/embedder/RequireApiKeyModal.tsx',
  'src/components/ReportBugSurface.tsx',
  'src/components/ReportBugDialog.tsx',
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
