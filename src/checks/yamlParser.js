const yaml = require('js-yaml');

function parseYamlDocuments(text) {
  const documents = [];
  const errors = [];

  try {
    yaml.loadAll(text, (doc) => {
      if (doc && typeof doc === 'object') {
        documents.push(doc);
      }
    });
  } catch (error) {
    errors.push({
      message: error.message,
      mark: error.mark
        ? {
            line: error.mark.line + 1,
            column: error.mark.column + 1,
          }
        : null,
    });
  }

  return {
    documents,
    errors,
  };
}

module.exports = {
  parseYamlDocuments,
};
