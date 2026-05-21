const fs = require('fs');

async function loadYamlFile(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8');
  return {
    name: 'load yaml file',
    passed: true,
    code: 0,
    stdout: content,
    stderr: '',
  };
}

module.exports = {
  loadYamlFile,
};
