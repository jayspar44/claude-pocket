const express = require('express');
const fs = require('node:fs').promises;
const path = require('node:path');
const logger = require('../logger');
const ptyRegistry = require('../pty-registry');
const { discoverCommands } = require('../commands/discovery');

const router = express.Router();

function getInstance(instanceId) {
  if (instanceId) {
    if (!ptyRegistry.has(instanceId)) return null;
    return ptyRegistry.get(instanceId);
  }
  return ptyRegistry.getDefault();
}

function isValidCommandName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

router.get('/', async (req, res) => {
  const startTime = Date.now();
  const instanceId = req.query.instanceId;
  const instance = getInstance(instanceId);

  if (!instance || !instance.currentWorkingDir) {
    logger.info({ instanceId, elapsed: Date.now() - startTime }, 'No working directory; returning empty command list');
    return res.json({ commands: [] });
  }

  const cliType = instance.cliType || 'claude';
  const cwd = instance.currentWorkingDir;
  logger.info({ instanceId, cliType, cwd }, 'Discovering commands');

  try {
    const commands = await discoverCommands({ cwd, cliType });
    logger.info({
      instanceId, cliType, total: commands.length,
      elapsed: Date.now() - startTime,
    }, 'Returning commands');
    res.json({ commands });
  } catch (err) {
    logger.error({ err: err.message }, 'Discovery failed');
    res.status(500).json({ error: 'Failed to list commands' });
  }
});

// (Existing per-command read endpoint preserved for now — used by future arg expansion)
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    if (!isValidCommandName(name)) return res.status(400).json({ error: 'Invalid command name' });
    const instanceId = req.query.instanceId;
    const instance = getInstance(instanceId);
    if (!instance || !instance.currentWorkingDir) {
      return res.status(404).json({ error: 'Instance not found or not initialized' });
    }
    const filePath = path.join(instance.currentWorkingDir, '.claude', 'commands', `${name}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ name, content });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Command not found' });
    logger.error({ err: err.message }, 'Failed to read command');
    res.status(500).json({ error: 'Failed to read command' });
  }
});

module.exports = router;
