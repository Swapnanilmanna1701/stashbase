'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const CiSummaryReporter = require('./ci-summary-reporter.cjs');

test('CI summary reporter writes Playwright count, duration, and outcome', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-e2e-summary-'));
  const summary = path.join(root, 'summary.md');
  const previous = {
    file: process.env.GITHUB_STEP_SUMMARY,
    label: process.env.STASHBASE_E2E_SUMMARY_LABEL,
  };
  try {
    process.env.GITHUB_STEP_SUMMARY = summary;
    process.env.STASHBASE_E2E_SUMMARY_LABEL = 'Functional journeys';
    const reporter = new CiSummaryReporter();
    reporter.onBegin({}, { allTests: () => [{}, {}, {}] });
    reporter.onEnd({ duration: 12_345, status: 'passed' });
    assert.equal(
      fs.readFileSync(summary, 'utf8'),
      '- **Functional journeys:** 3 tests, 12.3s, passed\n',
    );
  } finally {
    if (previous.file === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous.file;
    if (previous.label === undefined) delete process.env.STASHBASE_E2E_SUMMARY_LABEL;
    else process.env.STASHBASE_E2E_SUMMARY_LABEL = previous.label;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
