const fs = require('fs');
const path = require('path');

function isYamlFilename(filename) {
  return filename.endsWith('.yaml') || filename.endsWith('.yml');
}

async function gatherYamlFiles(filePath) {
  const stats = await fs.promises.stat(filePath);
  if (stats.isFile()) {
    return [filePath];
  }

  if (!stats.isDirectory()) {
    throw new Error(`Path is not a file or directory: ${filePath}`);
  }

  const files = [];
  const entries = await fs.promises.readdir(filePath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(filePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await gatherYamlFiles(entryPath)));
    } else if (entry.isFile() && isYamlFilename(entry.name)) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function loadYamlFile(filePath) {
  const yamlFiles = await gatherYamlFiles(filePath);
  if (yamlFiles.length === 0) {
    throw new Error(`No YAML files found at path: ${filePath}`);
  }

  const contents = await Promise.all(
    yamlFiles.map(async (yamlFile) => {
      const text = await fs.promises.readFile(yamlFile, 'utf8');
      return `# source: ${yamlFile}\n${text.trim()}\n`;
    })
  );

  return {
    name: yamlFiles.length > 1 ? `load yaml files (${yamlFiles.length})` : 'load yaml file',
    passed: true,
    code: 0,
    stdout: contents.join('\n---\n'),
    stderr: '',
  };
}

module.exports = {
  loadYamlFile,
};
