#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const FOCUSED_MEMBERS = new Set(['only']);
const DISABLED_MEMBERS = new Set(['skip', 'fixme']);
const CODE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;

export function scanE2eSource(source, file = '<source>') {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const chain = testApiMemberChain(node.expression);
      const member = chain?.at(-1);
      if (member && (FOCUSED_MEMBERS.has(member) || DISABLED_MEMBERS.has(member))) {
        const start = node.expression.getStart(sourceFile);
        const location = sourceFile.getLineAndCharacterOfPosition(start);
        violations.push({
          file,
          line: location.line + 1,
          column: location.character + 1,
          expression: chain.join('.'),
          policy: FOCUSED_MEMBERS.has(member)
            ? 'focused tests are forbidden'
            : 'skipped and fixme tests are forbidden',
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function scanE2eFiles(root, { cwd = process.cwd() } = {}) {
  const files = collectCodeFiles(path.resolve(root));
  return files.flatMap((file) => {
    const displayPath = path.relative(cwd, file).split(path.sep).join('/');
    return scanE2eSource(fs.readFileSync(file, 'utf8'), displayPath);
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

function testApiMemberChain(expression) {
  const members = [];
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      members.unshift(current.name.text);
    } else {
      const argument = current.argumentExpression;
      if (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)) return null;
      members.unshift(argument.text);
    }
    current = current.expression;
  }
  if (!ts.isIdentifier(current) || !['test', 'it', 'describe'].includes(current.text)) return null;
  return [current.text, ...members];
}

function main() {
  const root = process.argv[2] ?? path.join(process.cwd(), 'e2e');
  const violations = scanE2eFiles(root);
  if (violations.length === 0) {
    console.log('[e2e-focus] no focused, skipped, or fixme tests found');
    return;
  }

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.column} `
        + `${violation.expression} — ${violation.policy}`,
    );
  }
  console.error(`[e2e-focus] found ${violations.length} forbidden test modifiers`);
  process.exitCode = 1;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`[e2e-focus] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
