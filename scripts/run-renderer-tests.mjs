#!/usr/bin/env node

/**
 * Runs the renderer suite with tsx pointed at `web-src/tsconfig.json`.
 *
 * The tsconfig travels as an environment variable because that is how tsx
 * reads it, and `VAR=value command` is POSIX shell syntax. cmd.exe does not
 * parse it, so spelling the script that way fails on Windows before Node
 * starts — with `'TSX_TSCONFIG_PATH' is not recognized`, which reads like a
 * missing program rather than a quoting problem. Setting it here keeps one
 * spelling every platform runs, without adding a cross-env dependency.
 *
 * The alias lives in web-src's own tsconfig rather than the root one on
 * purpose, so pointing tsx at it is not optional: without it every `@/…`
 * specifier in a renderer test fails to resolve.
 *
 * Test paths come from the caller so the suite's glob stays in
 * `package.json`, where `scripts/check-test-inventory.mjs` reads it to prove
 * every test file is wired to a command.
 */

import { spawn } from 'node:child_process';

const testPaths = process.argv.slice(2);
if (testPaths.length === 0) {
  console.error('usage: run-renderer-tests.mjs <test-path-or-glob>…');
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ['--import', 'tsx', '--import', './scripts/register-vite-stubs.mjs', '--test', ...testPaths],
  {
    stdio: 'inherit',
    env: { ...process.env, TSX_TSCONFIG_PATH: 'web-src/tsconfig.json' },
  },
);

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

// Mirror the child's outcome: a signal has to be re-raised rather than
// reported as an exit code, or a Ctrl-C looks like a clean run to CI.
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
