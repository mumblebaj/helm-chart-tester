#!/usr/bin/env node
/**
 * Quick test script for helm-chart-tester.
 *
 * Tests YAML file mode with various fixtures to demonstrate validation capabilities.
 * Usage: node test/run-fixtures.js
 */

const path = require('path');
const { execFileSync } = require('child_process');

const fixtures = [
  {
    name: 'Valid Kubernetes deployment',
    file: 'test-fixtures/valid-deployment.yaml',
    target: 'kubernetes',
    expectedResult: 'pass',
  },
  {
    name: 'Valid deployment on OpenShift target',
    file: 'test-fixtures/valid-deployment.yaml',
    target: 'openshift',
    expectedResult: 'pass',
  },
  {
    name: 'Invalid deployment with security errors',
    file: 'test-fixtures/invalid-deployment.yaml',
    target: 'kubernetes',
    expectedResult: 'fail',
  },
  {
    name: 'Invalid deployment fails OpenShift checks',
    file: 'test-fixtures/invalid-deployment.yaml',
    target: 'openshift',
    expectedResult: 'fail',
  },
  {
    name: 'Deprecated apiVersion and Ingress on OpenShift',
    file: 'test-fixtures/deprecated-and-ingress.yaml',
    target: 'openshift',
    expectedResult: 'fail',
  },
  {
    name: 'Deprecated apiVersion on Kubernetes',
    file: 'test-fixtures/deprecated-and-ingress.yaml',
    target: 'kubernetes',
    expectedResult: 'pass',
  },
];

console.log('Running helm-chart-tester YAML file mode tests...\n');

let passCount = 0;

fixtures.forEach((fixture) => {
  const args = ['bin/chart-test', fixture.file, '--yaml-file', '--target', fixture.target];

  try {
    execFileSync(process.execPath, args, { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
    if (fixture.expectedResult === 'pass') {
      console.log(`[PASS] ${fixture.name}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${fixture.name} (expected command to fail)`);
    }
  } catch (error) {
    if (fixture.expectedResult === 'fail') {
      console.log(`[PASS] ${fixture.name} (failed as expected)`);
      passCount++;
    } else {
      console.error(`[FAIL] ${fixture.name}`);
      console.error(`  Error: ${error.message}`);
    }
  }
});

console.log(`\n${passCount}/${fixtures.length} tests passed`);
process.exit(passCount === fixtures.length ? 0 : 1);
