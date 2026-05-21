const fs = require('fs');
const path = require('path');
const { helmDependencyBuild, helmLint, helmTemplate } = require('./checks/helmCommands');
const { loadYamlFile } = require('./checks/yamlLoader');
const { parseYamlDocuments } = require('./checks/yamlParser');
const { buildReports } = require('./checks/reportGenerator');
const { validateRenderedDocuments } = require('./checks/openshiftCompatibility');

async function ensureDirectory(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function runChartTestCommand({ chartPath, valuesFiles, target, outputDir, yamlFile = false }) {
  const normalizedChartPath = path.resolve(chartPath);
  const reportContext = {
    chartPath: normalizedChartPath,
    target,
    valuesFiles: valuesFiles.map((file) => path.resolve(file)),
    timestamp: new Date().toISOString(),
    mode: yamlFile ? 'yaml-file' : 'helm',
  };

  const results = [];

  if (yamlFile) {
    results.push(await loadYamlFile(normalizedChartPath));
  } else {
    results.push(await helmDependencyBuild(normalizedChartPath));
    results.push(await helmLint(normalizedChartPath, valuesFiles));
    results.push(await helmTemplate(normalizedChartPath, valuesFiles, target));
  }

  const templateResult = results[results.length - 1];
  const renderedYaml = templateResult.stdout || '';
  const parseResult = parseYamlDocuments(renderedYaml);
  const documents = parseResult.documents;

  results.push({
    name: 'parse rendered yaml',
    passed: parseResult.errors.length === 0,
    code: parseResult.errors.length === 0 ? 0 : 1,
    stdout: parseResult.errors.length === 0 ? `Parsed ${documents.length} YAML document(s).` : '',
    stderr: parseResult.errors
      .map((error) => {
        const location = error.mark ? ` at line ${error.mark.line}, column ${error.mark.column}` : '';
        return `${error.message}${location}`;
      })
      .join('\n'),
  });

  const renderedKinds = [...new Set(documents.map((doc) => doc?.kind).filter(Boolean))];
  const validationAlerts = validateRenderedDocuments(documents, target);

  const summary = buildReports({ reportContext, results, renderedKinds, documents, validationAlerts });

  await ensureDirectory(outputDir);
  const reportId = Date.now();
  const markdownPath = path.join(outputDir, `chart-test-report-${reportId}.md`);
  const jsonPath = path.join(outputDir, `chart-test-report-${reportId}.json`);

  await Promise.all([
    fs.promises.writeFile(markdownPath, summary.markdown, 'utf8'),
    fs.promises.writeFile(jsonPath, JSON.stringify(summary.json, null, 2), 'utf8'),
  ]);

  console.log(`Report generated:
  - ${markdownPath}
  - ${jsonPath}`);
  if (summary.failedChecks.length > 0 || summary.validationErrors.length > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  runChartTestCommand,
};
