const os = require('os');

function collectWarnings(results) {
  return results
    .flatMap((result) => {
      const text = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const warningLines = text
        .split(/\r?\n/)
        .filter((line) => /warning:/i.test(line) || /WARN|WARNING/.test(line));
      return warningLines.map((line) => ({ step: result.name, message: line.trim() }));
    })
    .filter(Boolean);
}

function buildReports({ reportContext, results, renderedKinds, documents, validationAlerts = [] }) {
  const passedChecks = results.filter((result) => result.passed).map((result) => result.name);
  const failedChecks = results.filter((result) => !result.passed).map((result) => result.name);
  const warnings = collectWarnings(results);
  const validationWarnings = validationAlerts.filter((alert) => alert.severity === 'warning');
  const validationErrors = validationAlerts.filter((alert) => alert.severity === 'error');

  const json = {
    chartPath: reportContext.chartPath,
    target: reportContext.target,
    mode: reportContext.mode || 'helm',
    valuesFiles: reportContext.valuesFiles,
    timestamp: reportContext.timestamp,
    checks: results.map((result) => ({
      name: result.name,
      passed: result.passed,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    })),
    summary: {
      passedChecks,
      failedChecks,
      warnings,
      validationWarnings: validationWarnings.length,
      validationErrors: validationErrors.length,
      validationAlerts,
      renderedResourceKinds: renderedKinds,
      documentCount: documents.length,
    },
  };

  const markdownLines = [];
  markdownLines.push('# Helm Chart Tester Report');
  markdownLines.push('');
  markdownLines.push('- Chart: `' + reportContext.chartPath + '`');
  markdownLines.push(`- Mode: **${reportContext.mode || 'helm'}**`);
  markdownLines.push(`- Target: **${reportContext.target}**`);
  markdownLines.push(
    '- Values files: ' +
      (reportContext.valuesFiles.length > 0
        ? reportContext.valuesFiles.map((file) => '`' + file + '`').join(', ')
        : 'None')
  );
  markdownLines.push(`- Generated: ${reportContext.timestamp}`);
  markdownLines.push('');
  markdownLines.push('## Summary');
  markdownLines.push('');
  markdownLines.push(`- Passed checks: ${passedChecks.length}`);
  markdownLines.push(`- Failed checks: ${failedChecks.length}`);
  markdownLines.push(`- Warnings: ${warnings.length}`);
  markdownLines.push(`- Validation warnings: ${validationWarnings.length}`);
  markdownLines.push(`- Validation errors: ${validationErrors.length}`);
  markdownLines.push(`- Rendered resource kinds: ${renderedKinds.length > 0 ? renderedKinds.join(', ') : 'None'}`);
  markdownLines.push(`- Document count: ${documents.length}`);
  markdownLines.push('');

  if (validationAlerts.length > 0) {
    markdownLines.push('## Validation Alerts');
    markdownLines.push('');
    validationAlerts.forEach((alert) => {
      markdownLines.push(`- [${alert.severity.toUpperCase()}] **${alert.rule}** on ${alert.resource.kind}/${alert.resource.name}: ${alert.message}`);
    });
    markdownLines.push('');
  }

  if (failedChecks.length > 0) {
    markdownLines.push('## Failed Checks');
    markdownLines.push('');
    failedChecks.forEach((name) => markdownLines.push(`- ${name}`));
    markdownLines.push('');
  }

  if (warnings.length > 0) {
    markdownLines.push('## Warnings');
    markdownLines.push('');
    warnings.forEach((warning) => {
      markdownLines.push(`- **${warning.step}**: ${warning.message}`);
    });
    markdownLines.push('');
  }

  markdownLines.push('## Check Details');
  markdownLines.push('');
  results.forEach((result) => {
    markdownLines.push(`### ${result.name}`);
    markdownLines.push('');
    markdownLines.push(`- Passed: ${result.passed}`);
    markdownLines.push(`- Exit code: ${result.code}`);
    markdownLines.push('');
    markdownLines.push('#### Stdout');
    markdownLines.push('');
    markdownLines.push('```');
    markdownLines.push(result.stdout || '(no stdout)');
    markdownLines.push('```');
    markdownLines.push('');
    markdownLines.push('#### Stderr');
    markdownLines.push('');
    markdownLines.push('```');
    markdownLines.push(result.stderr || '(no stderr)');
    markdownLines.push('```');
    markdownLines.push('');
  });

  markdownLines.push('## Rendered Resource Kinds');
  markdownLines.push('');
  markdownLines.push(renderedKinds.length > 0 ? renderedKinds.map((kind) => `- ${kind}`).join(os.EOL) : 'No resource kinds parsed');
  markdownLines.push('');

  return {
    json,
    markdown: markdownLines.join(os.EOL),
    failedChecks,
    validationErrors,
    validationWarnings,
  };
}

module.exports = {
  buildReports,
};
