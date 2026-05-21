const { spawn } = require('child_process');
const path = require('path');

function captureStream(child) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function runHelmCommand(args, options = {}) {
  const command = 'helm';
  const child = spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    shell: true,
  });

  return captureStream(child);
}

async function helmDependencyBuild(chartPath) {
  const { code, stdout, stderr } = await runHelmCommand(['dependency', 'build', path.resolve(chartPath)]);
  return {
    name: 'helm dependency build',
    passed: code === 0,
    code,
    stdout,
    stderr,
  };
}

async function helmLint(chartPath, valuesFiles = []) {
  const args = ['lint', path.resolve(chartPath)];
  valuesFiles.forEach((valueFile) => {
    args.push('-f', path.resolve(valueFile));
  });
  const { code, stdout, stderr } = await runHelmCommand(args);
  return {
    name: 'helm lint',
    passed: code === 0,
    code,
    stdout,
    stderr,
  };
}

async function helmTemplate(chartPath, valuesFiles = [], target = 'kubernetes') {
  const args = ['template', path.resolve(chartPath)];
  valuesFiles.forEach((valueFile) => {
    args.push('-f', path.resolve(valueFile));
  });

  if (target === 'openshift') {
    args.push('--kube-version', '1.26.0');
  }

  const { code, stdout, stderr } = await runHelmCommand(args);
  return {
    name: 'helm template',
    passed: code === 0,
    code,
    stdout,
    stderr,
  };
}

module.exports = {
  helmDependencyBuild,
  helmLint,
  helmTemplate,
};
