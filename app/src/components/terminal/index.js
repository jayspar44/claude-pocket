// xterm.js renderer with canvas rendering (best performance)
export { default as TerminalView } from './TerminalView';

// HTML-based renderer (has duplicate/state issues)
export { default as HtmlTerminalView } from './TerminalOutput';
