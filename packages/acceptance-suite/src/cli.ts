#!/usr/bin/env node
import { runAcceptanceSuite } from './runner.js';

const baseUrl = process.env.BASE_URL || process.argv[2] || 'http://localhost:3000';
const verbose = process.env.VERBOSE === 'true' || process.argv.includes('--verbose');

console.log(`[schemaflow-acceptance] Target: ${baseUrl}`);

runAcceptanceSuite({ baseUrl, verbose })
  .then((report) => {
    console.log('\n--- Acceptance Test Suite Summary ---');
    console.log(`Target Base URL: ${report.baseUrl}`);
    console.log(`Duration:        ${report.durationMs}ms`);
    console.log(`Total Steps:     ${report.total}`);
    console.log(`Passed:          ${report.passedCount}`);
    console.log(`Failed:          ${report.failedCount}`);
    console.log('-------------------------------------\n');

    for (const step of report.steps) {
      const mark = step.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`${mark} [${step.durationMs}ms] ${step.name}`);
      if (step.error) {
        console.error(`       Error: ${step.error}`);
      }
    }

    if (!report.passed) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('[schemaflow-acceptance] Fatal error during test execution:', err);
    process.exit(1);
  });
