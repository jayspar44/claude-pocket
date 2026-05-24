const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMarkdown, parseToml } = require('../src/commands/parsers');

test('parseMarkdown extracts description from YAML frontmatter', () => {
  const md = `---
description: Reviews the current branch
---

# Some heading
Body content`;
  assert.deepEqual(parseMarkdown(md), { description: 'Reviews the current branch', argumentHint: null });
});

test('parseMarkdown extracts argument-hint from frontmatter', () => {
  const md = `---
description: Fix an issue
argument-hint: <issue-number>
---
body`;
  assert.deepEqual(parseMarkdown(md), { description: 'Fix an issue', argumentHint: '<issue-number>' });
});

test('parseMarkdown also accepts argumentHint (camelCase)', () => {
  const md = `---
description: foo
argumentHint: [opt]
---`;
  assert.equal(parseMarkdown(md).argumentHint, '[opt]');
});

test('parseMarkdown falls back to first # heading when no description', () => {
  const md = `# Heading text\n\nbody`;
  assert.equal(parseMarkdown(md).description, 'Heading text');
});

test('parseMarkdown returns empty description for empty content', () => {
  assert.deepEqual(parseMarkdown(''), { description: '', argumentHint: null });
});

test('parseMarkdown handles malformed frontmatter without crashing', () => {
  const md = `---\nthis is not yaml\n`;
  const out = parseMarkdown(md);
  assert.equal(typeof out.description, 'string');
});

test('parseToml extracts description and argument-hint', () => {
  const toml = `description = "Run the test suite"
argument-hint = "[--watch]"
prompt = """
multi
line
"""`;
  assert.deepEqual(parseToml(toml), { description: 'Run the test suite', argumentHint: '[--watch]' });
});

test('parseToml handles single quotes and missing argumentHint', () => {
  const toml = `description = 'hello world'\nprompt = "ignored"`;
  assert.deepEqual(parseToml(toml), { description: 'hello world', argumentHint: null });
});

test('parseToml returns empty description when key missing', () => {
  assert.deepEqual(parseToml('prompt = "x"'), { description: '', argumentHint: null });
});
