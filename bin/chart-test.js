#!/usr/bin/env node
const path = require('path');
const { runChartTest } = require('../src/index');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: chart-test <chart-path> [options]');
  process.exit(1);
}

runChartTest(process.cwd(), args).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
