const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

// Ensure path is within working directory (security)
function isPathSafe(requestedPath) {
  const resolved = path.resolve(config.workingDir, requestedPath);
  return resolved.startsWith(config.workingDir);
}

// List files in a directory
router.get('/', async (req, res) => {
  try {
    const requestedPath = req.query.path || '';

    if (!isPathSafe(requestedPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fullPath = path.resolve(config.workingDir, requestedPath);

    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const items = await Promise.all(
      entries
        .filter(entry => !entry.name.startsWith('.')) // Hide dotfiles by default
        .map(async (entry) => {
          const entryPath = path.join(fullPath, entry.name);
          try {
            const entryStat = await fs.stat(entryPath);
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: entry.isFile() ? entryStat.size : null,
              modified: entryStat.mtime,
            };
          } catch {
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: null,
              modified: null,
            };
          }
        })
    );

    // Sort: directories first, then files, alphabetically
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: requestedPath,
      fullPath,
      items,
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Path not found' });
    }
    logger.error({ error: error.message }, 'Failed to list files');
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Upload file (for images)
router.post('/upload', express.raw({ type: ['image/*'], limit: '10mb' }), async (req, res) => {
  try {
    const filename = req.query.filename || `upload-${Date.now()}.png`;
    const destPath = req.query.path || '';

    if (!isPathSafe(destPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fullPath = path.resolve(config.workingDir, destPath, filename);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(fullPath, req.body);

    // Return relative path from working directory
    const relativePath = path.relative(config.workingDir, fullPath);

    res.json({
      success: true,
      path: relativePath,
      fullPath,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to upload file');
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get working directory info
router.get('/info', (req, res) => {
  res.json({
    workingDir: config.workingDir,
    separator: path.sep,
  });
});

module.exports = router;
