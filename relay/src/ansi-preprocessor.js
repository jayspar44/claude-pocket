/**
 * Preprocesses ANSI escape sequences for simplified HTML rendering.
 * Strips cursor positioning, handles screen clears, preserves colors.
 *
 * This creates a "clean" append-only stream that ansi_up can handle
 * with native browser scrolling.
 */
class AnsiPreprocessor {
  constructor() {
    this.pendingClear = false;
  }

  /**
   * Process raw PTY output and return simplified output.
   * @param {string} data - Raw PTY output
   * @returns {{ text: string, clear: boolean }}
   */
  process(data) {
    let result = '';
    let shouldClear = false;
    let i = 0;

    while (i < data.length) {
      const char = data[i];

      if (char === '\x1b') {
        if (data[i + 1] === '[') {
          // CSI sequence: \x1b[...X
          let j = i + 2;
          // Find the end of the sequence (a letter)
          while (j < data.length && !/[A-Za-z]/.test(data[j])) {
            j++;
          }
          if (j < data.length) {
            const command = data[j];
            const sequence = data.slice(i, j + 1);

            if (command === 'J') {
              // Clear screen - signal clear instead of inline
              const param = sequence.match(/\[(\??\d*)J/)?.[1] || '0';
              if (param === '2' || param === '3') {
                shouldClear = true;
                result = ''; // Clear any accumulated text before clear command
              }
            } else if (command === 'H') {
              // Cursor home - ignore, content will follow
            } else if (command === 'm') {
              // SGR (color) - keep it
              result += sequence;
            }
            // Skip all other CSI sequences (cursor movement A/B/C/D, etc.)

            i = j + 1;
            continue;
          }
        } else if (data[i + 1] === ']') {
          // OSC sequence: \x1b]...BEL or \x1b]...\x1b\\
          let j = i + 2;
          while (j < data.length) {
            if (data[j] === '\x07') { // BEL
              j++;
              break;
            }
            if (data[j] === '\x1b' && data[j + 1] === '\\') {
              j += 2;
              break;
            }
            j++;
          }
          i = j;
          continue;
        } else if (data[i + 1] === '(' || data[i + 1] === ')') {
          // Character set designation - skip 3 chars total
          i += 3;
          continue;
        }
        // Unknown escape, skip just the ESC
        i++;
        continue;
      } else if (char === '\r') {
        // Preserve carriage return - client handles line overwriting
        result += '\r';
      } else if (char === '\n') {
        result += '\n';
      } else if (char >= ' ' || char === '\t') {
        // Printable character or tab - keep it
        result += char;
      }
      // Skip other control characters

      i++;
    }

    return { text: result, clear: shouldClear };
  }
}

module.exports = AnsiPreprocessor;
