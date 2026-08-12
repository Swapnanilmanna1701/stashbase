'use strict';

const fs = require('node:fs');

class CiSummaryReporter {
  constructor() {
    this.startedAt = 0;
    this.testCount = 0;
  }

  onBegin(_config, suite) {
    this.startedAt = Date.now();
    this.testCount = suite.allTests().length;
  }

  onEnd(result) {
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (!summary) return;
    const label = process.env.STASHBASE_E2E_SUMMARY_LABEL || 'Playwright';
    const durationMs = typeof result.duration === 'number'
      ? result.duration
      : Math.max(0, Date.now() - this.startedAt);
    const seconds = (durationMs / 1000).toFixed(1);
    fs.appendFileSync(
      summary,
      `- **${label}:** ${this.testCount} tests, ${seconds}s, ${result.status}\n`,
      'utf8',
    );
  }
}

module.exports = CiSummaryReporter;
