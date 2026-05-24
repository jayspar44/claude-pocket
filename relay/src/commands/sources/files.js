const fs = require('node:fs').promises;
const path = require('node:path');
const { parseMarkdown, parseToml } = require('../parsers');
const logger = require('../../logger');

async function readDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

// Walk a directory recursively, returning a flat list of { absPath, namespaceSegments, baseName }
async function walkFiles(rootDir, ext, segments = []) {
  const entries = await readDirSafe(rootDir);
  if (!entries) return [];
  const out = [];
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(full, ext, [...segments, entry.name]);
      out.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      const baseName = entry.name.slice(0, -ext.length);
      out.push({ absPath: full, namespaceSegments: segments, baseName });
    }
  }
  return out;
}

// Walk a skills root: each subdirectory with SKILL.md is one command
async function walkSkillDir(rootDir) {
  const entries = await readDirSafe(rootDir);
  if (!entries) return [];
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(rootDir, entry.name, 'SKILL.md');
    try {
      await fs.access(skillPath);
      out.push({ absPath: skillPath, namespaceSegments: [], baseName: entry.name });
    } catch {
      // No SKILL.md in this directory — skip
    }
  }
  return out;
}

function buildCommand({ absPath, namespaceSegments, baseName }, { source, sourceLabel, isSkill }, parsed) {
  const namespace = namespaceSegments.length ? namespaceSegments.join(':') : null;
  const name = namespace ? `${namespace}:${baseName}` : baseName;
  return {
    name,
    namespace,
    source,
    sourceLabel: sourceLabel || null,
    description: parsed.description || '',
    argumentHint: parsed.argumentHint || null,
    isSkill: isSkill === true,
  };
}

async function discoverFileCommands({ roots }) {
  const results = [];
  for (const root of roots) {
    const { dir, ext, skillDir, source, sourceLabel } = root;
    try {
      const fileEntries = skillDir
        ? await walkSkillDir(dir)
        : await walkFiles(dir, ext);
      for (const fe of fileEntries) {
        let content;
        try {
          content = await fs.readFile(fe.absPath, 'utf-8');
        } catch (err) {
          logger.warn({ err: err.message, absPath: fe.absPath }, 'Failed to read command file');
          continue;
        }
        const parsed = skillDir || fe.absPath.endsWith('.md')
          ? parseMarkdown(content)
          : parseToml(content);
        results.push(buildCommand(fe, { source, sourceLabel, isSkill: !!skillDir }, parsed));
      }
    } catch (err) {
      logger.warn({ err: err.message, dir }, 'Failed to walk command directory');
    }
  }
  return results;
}

module.exports = { discoverFileCommands };
