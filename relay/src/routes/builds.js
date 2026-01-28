const express = require('express');
const fs = require('fs').promises;
const { createReadStream } = require('fs');
const path = require('path');
const logger = require('../logger');

const router = express.Router();

// Auto-detect environment from project folder name
const PROJECT_DIR = path.basename(path.resolve(__dirname, '../../..'));
const IS_DEV_INSTANCE = PROJECT_DIR.endsWith('-dev');
const ENVIRONMENT_LABEL = IS_DEV_INSTANCE ? 'DEV' : 'PROD';

// Base output directory for all builds (configurable via env var)
const BUILDS_BASE = process.env.BUILDS_BASE || path.resolve(__dirname, '../../../../claude-pocket-aabs');

// PROD relay serves prod builds, DEV relay serves dev builds
const BUILDS_DIR = process.env.BUILDS_DIR || path.join(BUILDS_BASE, IS_DEV_INSTANCE ? 'dev' : 'prod');

// Ensure builds directory exists
async function ensureBuildsDir() {
  try {
    await fs.mkdir(BUILDS_DIR, { recursive: true });
  } catch {
    // Ignore if already exists
  }
}

// Cache for builds list (5 second TTL)
let buildsCache = null;
let buildsCacheTime = 0;
const BUILDS_CACHE_TTL = 5000;

// Get builds list (shared logic) with caching
async function getBuilds() {
  const now = Date.now();
  if (buildsCache && (now - buildsCacheTime) < BUILDS_CACHE_TTL) {
    return buildsCache;
  }

  await ensureBuildsDir();
  const entries = await fs.readdir(BUILDS_DIR, { withFileTypes: true });

  const builds = await Promise.all(
    entries
      .filter(entry => entry.isFile() && (entry.name.endsWith('.aab') || entry.name.endsWith('.apk')))
      .map(async (entry) => {
        const fullPath = path.join(BUILDS_DIR, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          size: stats.size,
          sizeFormatted: formatSize(stats.size),
          modified: stats.mtime,
          type: entry.name.endsWith('.aab') ? 'aab' : 'apk',
          downloadUrl: `/api/builds/${encodeURIComponent(entry.name)}`,
        };
      })
  );

  // Sort by modified date, newest first
  builds.sort((a, b) => new Date(b.modified) - new Date(a.modified));

  // Update cache
  buildsCache = builds;
  buildsCacheTime = now;

  return builds;
}

// Invalidate cache (called when builds are deleted)
function invalidateBuildsCache() {
  buildsCache = null;
  buildsCacheTime = 0;
}

// List all builds (JSON API)
router.get('/', async (req, res) => {
  // If browser requests HTML, redirect to the HTML page
  if (req.accepts('html') && !req.accepts('json')) {
    return res.redirect('/builds');
  }

  try {
    const builds = await getBuilds();
    res.json({
      buildsDir: BUILDS_DIR,
      count: builds.length,
      builds,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list builds');
    res.status(500).json({ error: 'Failed to list builds' });
  }
});

// HTML page for builds
router.get('/page', async (req, res) => {
  try {
    const builds = await getBuilds();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Pocket Builds (${ENVIRONMENT_LABEL})</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 600px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #fff;
    }
    .subtitle {
      color: #888;
      font-size: 14px;
    }
    .refresh-btn {
      background: #333;
      color: #888;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .refresh-btn:hover { background: #444; color: #fff; }
    .build-list { display: flex; flex-direction: column; gap: 12px; }
    .build-card {
      background: #252542;
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .build-info { flex: 1; }
    .build-name {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      word-break: break-all;
      margin-bottom: 8px;
    }
    .build-meta {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: #888;
    }
    .build-type {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .build-type.aab { background: #4CAF50; color: #fff; }
    .build-type.apk { background: #2196F3; color: #fff; }
    .download-btn {
      display: block;
      background: #6C63FF;
      color: #fff;
      text-decoration: none;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      text-align: center;
      transition: background 0.2s;
    }
    .download-btn:hover { background: #5a52d5; }
    .download-btn:active { background: #4a42c5; }
    .empty {
      text-align: center;
      padding: 40px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Claude Pocket Builds (${ENVIRONMENT_LABEL})</h1>
        <p class="subtitle">${builds.length} build${builds.length !== 1 ? 's' : ''} available</p>
      </div>
      <button class="refresh-btn" onclick="location.reload()">Refresh</button>
    </div>

    <div class="build-list">
      ${builds.length === 0 ? '<div class="empty">No builds yet.<br>Run <code>npm run aab:prod</code> to create one.</div>' : ''}
      ${builds.map(build => `
        <div class="build-card">
          <div class="build-info">
            <div class="build-name">${build.name}</div>
            <div class="build-meta">
              <span class="build-type ${build.type}">${build.type}</span>
              <span>${build.sizeFormatted}</span>
              <span>${new Date(build.modified).toLocaleDateString()}</span>
            </div>
          </div>
          <a href="${build.downloadUrl}" class="download-btn">Download</a>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;
    res.type('html').send(html);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to render builds page');
    res.status(500).send('Failed to load builds');
  }
});

// Download a specific build
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Only allow .aab and .apk files
    if (!filename.endsWith('.aab') && !filename.endsWith('.apk')) {
      return res.status(400).json({ error: 'Only .aab and .apk files can be downloaded' });
    }

    const fullPath = path.join(BUILDS_DIR, filename);

    // Check file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Build not found' });
    }

    const stats = await fs.stat(fullPath);

    // Set headers for download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size);

    // Stream the file
    const stream = createReadStream(fullPath);
    stream.pipe(res);

    stream.on('error', (error) => {
      logger.error({ error: error.message, filename }, 'Error streaming build file');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download build' });
      }
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to download build');
    res.status(500).json({ error: 'Failed to download build' });
  }
});

// Delete a build
router.delete('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const fullPath = path.join(BUILDS_DIR, filename);

    // Check file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Build not found' });
    }

    await fs.unlink(fullPath);
    invalidateBuildsCache();
    logger.info({ filename }, 'Build deleted');

    res.json({ success: true, deleted: filename });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to delete build');
    res.status(500).json({ error: 'Failed to delete build' });
  }
});

// Helper: format file size
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = router;
