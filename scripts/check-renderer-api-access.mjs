#!/usr/bin/env node

/**
 * Components render; hooks talk to the server.
 *
 * A component that calls `api` directly owns a request lifecycle it cannot
 * express: the cancel on unmount, the guard against a reply landing after
 * the user moved on, the shared consequence every writer of the same field
 * owes the rest of the app. Those live in a hook, where a second caller can
 * reuse them and a test can drive them without rendering.
 *
 * The check is a script rather than an oxlint rule because the ban has to
 * apply to component directories only — hooks and lib modules under the
 * same feature are exactly where `api` belongs — and oxlint's `overrides`
 * REPLACE a rule's options rather than merging them. A second block scoped
 * to `**\/components\/**` would silently drop each feature's sibling-import
 * patterns, so expressing this in `.oxlintrc.json` would mean duplicating
 * all seven feature boundary regexes into a second set that must stay in
 * sync with the first.
 *
 * Only the `api` client binding is restricted. `errorMessage`, `ApiError`,
 * the asset-URL builders, and every contract type stay importable: they are
 * pure helpers, and a component formatting a failure is not a component
 * performing a request.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const CLIENT_MODULE = '@/common/api/api';
const CLIENT_BINDING = 'api';
const CODE_FILE_PATTERN = /\.[cm]?[jt]sx?$/i;

/** A component file: anything under a `components/` directory, plus the
 *  composition root's own top-level modules. */
export function isComponentFile(relativePath) {
  if (relativePath.includes('/__tests__/')) return false;
  if (relativePath.includes('/components/')) return true;
  return /^web-src\/src\/app\/[^/]+\.tsx$/.test(relativePath);
}

export function scanComponentSource(source, file = '<source>') {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier) || specifier.text !== CLIENT_MODULE) continue;
    // `import type { … }` pulls no runtime value and cannot call anything.
    if (statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (imported !== CLIENT_BINDING || element.isTypeOnly) continue;
      const location = sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile));
      violations.push({
        file,
        line: location.line + 1,
        column: location.character + 1,
        binding: element.name.text,
      });
    }
  }

  return violations;
}

export function scanComponentFiles(root, { cwd = process.cwd() } = {}) {
  return collectCodeFiles(path.resolve(root)).flatMap((file) => {
    const displayPath = path.relative(cwd, file).split(path.sep).join('/');
    if (!isComponentFile(displayPath)) return [];
    return scanComponentSource(fs.readFileSync(file, 'utf8'), displayPath);
  });
}

function collectCodeFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectCodeFiles(entryPath));
    else if (entry.isFile() && CODE_FILE_PATTERN.test(entry.name)) files.push(entryPath);
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function main() {
  const root = process.argv[2] ?? path.join(process.cwd(), 'web-src/src');
  const violations = scanComponentFiles(root);
  if (violations.length === 0) {
    console.log('[renderer-api-access] no component calls the API client directly');
    return;
  }

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.column} imports '${violation.binding}' `
        + `from '${CLIENT_MODULE}' — a component may not call the API client. Move the request `
        + 'into a hook in this feature\'s hooks/ directory and call that hook instead.',
    );
  }
  console.error(`[renderer-api-access] found ${violations.length} direct API client imports in components`);
  process.exitCode = 1;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`[renderer-api-access] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
