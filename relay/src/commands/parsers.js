function parseMarkdown(content) {
  if (!content) return { description: '', argumentHint: null };

  let description = '';
  let argumentHint = null;

  // YAML frontmatter (--- ... ---)
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) {
      const fm = content.slice(3, end);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      if (descMatch) description = descMatch[1].trim();
      const hintMatch = fm.match(/^(?:argument-hint|argumentHint):\s*(.+)$/m);
      if (hintMatch) argumentHint = hintMatch[1].trim();
    }
  }

  // Fallback: first # heading
  if (!description) {
    for (const line of content.split('\n')) {
      if (line.startsWith('# ')) {
        description = line.slice(2).trim();
        break;
      }
    }
  }

  return { description, argumentHint };
}

function parseToml(content) {
  if (!content) return { description: '', argumentHint: null };

  const extract = (key) => {
    // Match: key = "value"  or  key = 'value'  (single-line only)
    const re = new RegExp(`^${key}\\s*=\\s*(?:"([^"\\n]*)"|'([^'\\n]*)')\\s*$`, 'm');
    const m = content.match(re);
    return m ? (m[1] ?? m[2]) : null;
  };

  return {
    description: extract('description') || '',
    argumentHint: extract('argument-hint') || extract('argumentHint') || null,
  };
}

module.exports = { parseMarkdown, parseToml };
