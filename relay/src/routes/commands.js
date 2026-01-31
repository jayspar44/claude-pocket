const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');
const ptyRegistry = require('../pty-registry');

const router = express.Router();

// Get the working directory for the specified instance (or default)
function getWorkingDir(instanceId) {
  if (instanceId) {
    // Use has() to check existence without auto-creating
    if (!ptyRegistry.has(instanceId)) {
      return null;
    }
    const instance = ptyRegistry.get(instanceId);
    return instance?.currentWorkingDir;
  }
  // Fallback to default instance for backward compatibility
  const defaultInstance = ptyRegistry.getDefault();
  return defaultInstance?.currentWorkingDir;
}

// Validate command name to prevent path traversal
function isValidCommandName(name) {
  // Only allow alphanumeric, dash, underscore
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

// Get list of available slash commands
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const instanceId = req.query.instanceId;
  const workingDir = getWorkingDir(instanceId);
  logger.info({ workingDir, instanceId }, 'Fetching project commands...');

  // Return empty list if no working directory (instance not found or not initialized)
  if (!workingDir) {
    logger.info({ instanceId, elapsed: Date.now() - startTime }, 'No working directory, returning empty list');
    return res.json({ commands: [] });
  }

  try {
    const commandsDir = path.join(workingDir, '.claude', 'commands');
    logger.debug({ commandsDir }, 'Looking for commands in directory');

    try {
      await fs.access(commandsDir);
    } catch {
      // Directory doesn't exist
      logger.info({ elapsed: Date.now() - startTime }, 'Commands directory not found, returning empty list');
      return res.json({ commands: [] });
    }

    const files = await fs.readdir(commandsDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    logger.debug({ fileCount: mdFiles.length, files: mdFiles }, 'Found command files');

    const commands = await Promise.all(
      mdFiles.map(async (file) => {
        const name = file.replace('.md', '');
        const filePath = path.join(commandsDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          let description = '';

          // Check for YAML front matter (starts with ---)
          if (content.startsWith('---')) {
            const endIndex = content.indexOf('---', 3);
            if (endIndex !== -1) {
              const frontMatter = content.slice(3, endIndex);
              // Parse description field from YAML
              const match = frontMatter.match(/^description:\s*(.+)$/m);
              if (match) {
                description = match[1].trim();
              }
            }
          }

          // Fallback: extract from first # heading
          if (!description) {
            const lines = content.split('\n');
            for (const line of lines) {
              if (line.startsWith('# ')) {
                description = line.slice(2).trim();
                break;
              }
            }
          }

          return {
            name,
            description,
            file,
          };
        } catch (error) {
          logger.error({ error: error.message, file }, 'Failed to read command file');
          return {
            name,
            description: '',
            file,
          };
        }
      })
    );

    logger.info({
      commandCount: commands.length,
      commands: commands.map(c => c.name),
      elapsed: Date.now() - startTime
    }, 'Returning project commands');
    res.json({ commands });
  } catch (error) {
    logger.error({ error: error.message, elapsed: Date.now() - startTime }, 'Failed to list commands');
    res.status(500).json({ error: 'Failed to list commands' });
  }
});

// Get content of a specific command file
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    // Validate command name to prevent path traversal
    if (!isValidCommandName(name)) {
      return res.status(400).json({ error: 'Invalid command name' });
    }

    const instanceId = req.query.instanceId;
    const workingDir = getWorkingDir(instanceId);

    if (!workingDir) {
      return res.status(404).json({ error: 'Instance not found or not initialized' });
    }

    const filePath = path.join(workingDir, '.claude', 'commands', `${name}.md`);

    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ name, content });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Command not found' });
    }
    logger.error({ error: error.message }, 'Failed to read command');
    res.status(500).json({ error: 'Failed to read command' });
  }
});

module.exports = router;
