const path = require('path');
const { Command } = require('commander');
const { runChartTestCommand } = require('./runner');

function parseArgs(argv) {
  const program = new Command();
  program
    .name('chart-test')
    .description('Validate Helm charts locally without a Kubernetes cluster')
    .argument('<chart-path>', 'Path to Helm chart or YAML file')
    .option('-f, --values <files...>', 'Additional values files', [])
    .option('--target <target>', 'Target platform: kubernetes or openshift', 'kubernetes')
    .option('-o, --output <dir>', 'Output reports directory', 'reports')
    .option('--yaml-file', 'Treat input as pre-rendered YAML file (skip Helm commands)', false)
    .allowExcessArguments(false);

  program.parse(argv, { from: 'user' });
  return program;
}

async function runChartTest(cwd, argv) {
  const program = parseArgs(argv);
  const chartPath = path.resolve(cwd, program.args[0]);
  const valuesFiles = (program.opts().values || []).map((file) => path.resolve(cwd, file));
  const target = program.opts().target.toLowerCase();
  const outputDir = path.resolve(cwd, program.opts().output);
  const yamlFile = program.opts().yamlFile || false;

  if (!['kubernetes', 'openshift'].includes(target)) {
    throw new Error('Invalid target. Use kubernetes or openshift.');
  }

  await runChartTestCommand({ chartPath, valuesFiles, target, outputDir, yamlFile });
}

module.exports = {
  runChartTest,
};
