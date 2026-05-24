const claudeBuiltins = require('../builtins/claude.json');
const antigravityBuiltins = require('../builtins/antigravity.json');

const TABLES = {
  claude: claudeBuiltins,
  antigravity: antigravityBuiltins,
};

function getBuiltinCommands(cliType) {
  const table = TABLES[cliType];
  if (!table) return [];
  return table.map((row) => ({
    name: row.name,
    namespace: null,
    source: 'builtin',
    sourceLabel: null,
    description: row.description || '',
    argumentHint: row.argumentHint ?? null,
    isSkill: row.isSkill === true,
  }));
}

module.exports = { getBuiltinCommands };
