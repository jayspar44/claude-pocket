const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

// Get list of available slash commands
router.get('/', async (req, res) => {
  try {
    const commandsDir = path.join(config.workingDir, '.claude', 'commands');

    try {
      await fs.access(commandsDir);
    } catch {
      // Directory doesn't exist
      return res.json({ commands: [] });
    }

    const files = await fs.readdir(commandsDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    const commands = await Promise.all(
      mdFiles.map(async (file) => {
        const name = file.replace('.md', '');
        const filePath = path.join(commandsDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // Extract first line as description (if it starts with #)
          const lines = content.split('\n');
          let description = '';
          for (const line of lines) {
            if (line.startsWith('# ')) {
              description = line.slice(2).trim();
              break;
            }
            if (line.trim() && !line.startsWith('#')) {
              description = line.trim().slice(0, 100);
              break;
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

    res.json({ commands });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list commands');
    res.status(500).json({ error: 'Failed to list commands' });
  }
});

// Get content of a specific command file
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const filePath = path.join(config.workingDir, '.claude', 'commands', `${name}.md`);

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
