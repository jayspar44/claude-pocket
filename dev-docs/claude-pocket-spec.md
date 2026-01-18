# Claude Pocket - Mobile Claude Code Client

## Project Overview

Build a mobile-native client for Claude Code CLI that runs on a remote Mac Mini. The goal is to provide a better mobile experience than SSH/Termius while preserving full Claude Code CLI functionality including skills, slash commands, permissions, and tool approvals.

### Why This Exists
- Termius + Mosh works but lacks: autocorrect, push notifications, file uploads, native feel
- Claude Code UI exists but is desktop-first and tries to do too much (Cursor, Codex support)
- We want a focused, mobile-first experience for Claude Code only

### Core Principles
1. **Claude Code runs unchanged** - All skills, CLAUDE.md, config stay on Mac Mini
2. **Thin client** - Mobile app is just a better window into Claude Code
3. **Mobile-first** - Designed for phone, works on tablet/web too
4. **Native feel** - Autocorrect, notifications, gestures, haptics

---

## Tech Stack

### Mobile App
- **React 18** + **Vite** (fast dev, matches existing projects)
- **Capacitor** (iOS/Android/Web from one codebase)
- **Tailwind CSS** (utility-first, responsive)
- **xterm.js** (terminal rendering with ANSI support)
- **Firebase Cloud Messaging** (push notifications)

### Relay Server (runs on Mac Mini)
- **Node.js** + **Express** (HTTP for API endpoints)
- **ws** (WebSocket for streaming)
- **node-pty** (spawn and manage Claude Code process)
- **chokidar** (file watching for uploads)

### Networking
- **Tailscale** (secure access to Mac Mini from anywhere)
- Server listens on localhost, accessed via Tailscale IP

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP (Capacitor)                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Terminal View (xterm.js)                           │    │
│  │  - Renders Claude Code output                       │    │
│  │  - ANSI colors, scrollback                          │    │
│  │  - Read-only (display only)                         │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Status Bar                                         │    │
│  │  - Connection status (🟢/🔴)                        │    │
│  │  - Context usage (45%)                              │    │
│  │  - Session cost ($0.12)                             │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Input Bar                                          │    │
│  │  - Native text input (autocorrect enabled)          │    │
│  │  - Send button                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Quick Actions                                      │    │
│  │  [/] [↑] [Ctrl+C] [Tab] [Esc] [📷] [📁]            │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Modals/Sheets                                      │    │
│  │  - Slash Command Palette                            │    │
│  │  - File Browser                                     │    │
│  │  - Image Picker                                     │    │
│  │  - Settings                                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + REST API
                              │ (via Tailscale)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 RELAY SERVER (Mac Mini)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Claude Manager                                     │    │
│  │  - Spawns Claude Code via node-pty                  │    │
│  │  - Manages single instance                          │    │
│  │  - Working dir: ~/Documents/projects/sammy          │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  WebSocket Server                                   │    │
│  │  - Streams stdout to clients                        │    │
│  │  - Receives input from clients                      │    │
│  │  - Buffers last 500 lines for reconnect             │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  REST API                                           │    │
│  │  - GET /api/commands - list slash commands          │    │
│  │  - GET /api/files - browse project files            │    │
│  │  - POST /api/upload - upload image/file             │    │
│  │  - GET /api/status - connection status              │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Notification Service                               │    │
│  │  - Detects: task complete, permission, question     │    │
│  │  - Sends push via FCM                               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE CLI                          │
│  - Runs unchanged                                           │
│  - Skills in ~/.claude/commands/ work                       │
│  - CLAUDE.md files work                                     │
│  - All permissions, tools, etc. work                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
claude-pocket/
├── app/                              # Capacitor React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── TerminalView.jsx      # xterm.js terminal display
│   │   │   ├── StatusBar.jsx         # Connection, context, cost
│   │   │   ├── InputBar.jsx          # Text input + send button
│   │   │   ├── QuickActions.jsx      # Action buttons row
│   │   │   ├── CommandPalette.jsx    # Slash command selector
│   │   │   ├── FileBrowser.jsx       # Browse project files
│   │   │   ├── ImagePicker.jsx       # Select/capture image
│   │   │   └── Settings.jsx          # App settings
│   │   ├── hooks/
│   │   │   ├── useRelay.js           # WebSocket connection + state
│   │   │   ├── useCommands.js        # Load slash commands
│   │   │   ├── useFiles.js           # File browser API
│   │   │   └── useNotifications.js   # FCM setup
│   │   ├── services/
│   │   │   ├── api.js                # REST API client
│   │   │   └── storage.js            # Local storage (history, settings)
│   │   ├── App.jsx                   # Main app component
│   │   ├── main.jsx                  # Entry point
│   │   └── index.css                 # Tailwind imports
│   ├── public/
│   │   └── index.html
│   ├── capacitor.config.ts
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
│
├── relay/                            # Runs on Mac Mini
│   ├── index.js                      # Main entry, starts servers
│   ├── claude.js                     # PTY spawn and management
│   ├── websocket.js                  # WebSocket server
│   ├── api.js                        # REST API routes
│   ├── notifications.js              # FCM push notifications
│   ├── commands.js                   # Read slash commands
│   ├── files.js                      # File browser logic
│   ├── config.js                     # Configuration
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## Detailed Component Specs

### 1. Terminal View (`TerminalView.jsx`)

**Purpose:** Display Claude Code output with proper formatting

**Implementation:**
- Use xterm.js with `@xterm/xterm` and `@xterm/addon-fit`
- Configure for read-only display (we handle input separately)
- Enable ANSI color support
- Set reasonable scrollback (1000 lines)
- Auto-scroll to bottom on new output
- Allow manual scroll to review history

```jsx
// Key configuration
const terminal = new Terminal({
  cursorBlink: false,
  disableStdin: true,  // Read-only
  scrollback: 1000,
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, monospace',
  theme: {
    background: '#1a1a1a',
    foreground: '#ffffff',
  }
});
```

**Receives:** Output stream from WebSocket
**Behavior:** 
- Writes incoming data to terminal
- Auto-scrolls unless user has scrolled up
- Tap to select/copy text (native selection)

---

### 2. Status Bar (`StatusBar.jsx`)

**Purpose:** Show connection status and session info

**Layout:**
```
┌─────────────────────────────────────────┐
│ 🟢 Connected  │  45% context  │  $0.12  │
└─────────────────────────────────────────┘
```

**Data sources:**
- Connection status from WebSocket state
- Context % parsed from Claude output (look for context indicators)
- Cost parsed from `/cost` command output or status line

**Behavior:**
- Tap context % → suggests /compact if > 70%
- Tap cost → runs /cost command
- Red dot when disconnected, shows "Reconnecting..."

---

### 3. Input Bar (`InputBar.jsx`)

**Purpose:** Native text input for sending commands to Claude

**Layout:**
```
┌───────────────────────────────────────────────┐
│ ┌───────────────────────────────────┐  ┌───┐ │
│ │ Message Claude...                 │  │ ⏎ │ │
│ └───────────────────────────────────┘  └───┘ │
└───────────────────────────────────────────────┘
```

**Key behaviors:**
- Native `<input>` or `<textarea>` (NOT terminal input)
- Autocorrect/autocomplete enabled
- Multi-line support (shift+enter or auto-expand)
- Send on Enter (or tap send button)
- Clear after sending
- Disable while disconnected

**Props:**
- `onSend(text)` - callback when user sends
- `disabled` - disable when disconnected
- `placeholder` - "Message Claude..."

---

### 4. Quick Actions (`QuickActions.jsx`)

**Purpose:** Common actions as tap targets

**Layout:**
```
┌───────────────────────────────────────────────────────────┐
│  [/]  [↑]  [Ctrl+C]  [Tab]  [Esc]  [📷]  [📁]            │
└───────────────────────────────────────────────────────────┘
```

**Actions:**

| Button | Action | Description |
|--------|--------|-------------|
| `/` | Open CommandPalette | Slash command selector |
| `↑` | Previous command | Cycle through command history |
| `Ctrl+C` | Send interrupt | Send SIGINT to Claude |
| `Tab` | Send tab | For autocomplete in Claude |
| `Esc` | Send escape | Cancel current operation |
| `📷` | Open ImagePicker | Upload image to Claude |
| `📁` | Open FileBrowser | Browse project files |

**Implementation:**
- Horizontal scroll if needed on small screens
- Haptic feedback on tap
- Visual press state

---

### 5. Command Palette (`CommandPalette.jsx`)

**Purpose:** Browse and select slash commands

**Layout (bottom sheet):**
```
┌─────────────────────────────────────────┐
│ ──────────────────────                  │  ← Drag handle
│ 🔍 Search commands...                   │
├─────────────────────────────────────────┤
│ BUILT-IN                                │
│ ┌─────────────────────────────────────┐ │
│ │ /compact                            │ │
│ │ Compact conversation context        │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ /clear                              │ │
│ │ Clear the terminal screen           │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ /cost                               │ │
│ │ Show token usage and cost           │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ PROJECT COMMANDS                        │
│ ┌─────────────────────────────────────┐ │
│ │ /pr                                 │ │
│ │ Create a pull request               │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ /deploy                             │ │
│ │ Deploy to dev environment           │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Data sources:**
- Built-in commands (hardcoded list)
- Global commands from `~/.claude/commands/*.md`
- Project commands from `{workingDir}/.claude/commands/*.md`

**API:** `GET /api/commands` returns:
```json
{
  "builtin": [
    { "name": "compact", "description": "Compact conversation context" },
    { "name": "clear", "description": "Clear the terminal screen" }
  ],
  "global": [
    { "name": "pr", "description": "Create a pull request" }
  ],
  "project": [
    { "name": "deploy", "description": "Deploy to dev environment" }
  ]
}
```

**Behavior:**
- Search filters all sections
- Tap command → inserts `/{command}` into input, closes sheet
- Parse description from first line of .md file

---

### 6. File Browser (`FileBrowser.jsx`)

**Purpose:** Browse project files, select for reference or upload

**Layout (bottom sheet):**
```
┌─────────────────────────────────────────┐
│ ──────────────────────                  │
│ 📁 ~/Documents/projects/sammy           │
├─────────────────────────────────────────┤
│ 📁 ..                                   │
│ 📁 src/                                 │
│ 📁 node_modules/                        │
│ 📄 package.json                         │
│ 📄 README.md                            │
│ 📄 CLAUDE.md                            │
└─────────────────────────────────────────┘
```

**API:** `GET /api/files?path=/` returns:
```json
{
  "path": "/",
  "entries": [
    { "name": "src", "type": "directory" },
    { "name": "package.json", "type": "file", "size": 1234 }
  ]
}
```

**Behavior:**
- Tap directory → navigate into it
- Tap file → options: "Insert path" or "View contents"
- Insert path → adds file path to input (for referencing in prompts)
- Long press → more options

---

### 7. Image Picker (`ImagePicker.jsx`)

**Purpose:** Upload images to Claude for analysis

**Options:**
1. Take photo (camera)
2. Choose from gallery
3. Paste from clipboard (if available)

**Flow:**
1. User selects/captures image
2. Image uploaded to relay server: `POST /api/upload`
3. Server saves to temp location in project
4. Server returns path
5. Path inserted into input or automatically sent with context

**API:** `POST /api/upload`
- Body: multipart/form-data with image
- Returns: `{ "path": "/tmp/uploads/image-123.png" }`

**Behavior:**
- Show upload progress
- Preview before sending
- Option to add caption/prompt with image

---

### 8. Settings (`Settings.jsx`)

**Purpose:** Configure app behavior

**Options:**
- **Server URL:** Tailscale IP/hostname of Mac Mini
- **Notifications:** Enable/disable push notifications
- **Notification triggers:** Which events trigger notifications
- **Theme:** Light/dark/system
- **Font size:** Terminal font size

**Storage:** Use Capacitor Preferences or localStorage

---

## Relay Server Specs

### Main Entry (`index.js`)

```javascript
import express from 'express';
import { createServer } from 'http';
import { setupWebSocket } from './websocket.js';
import { setupAPI } from './api.js';
import config from './config.js';

const app = express();
const server = createServer(app);

// REST API
setupAPI(app);

// WebSocket
setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`Relay server running on port ${config.port}`);
  console.log(`Working directory: ${config.workingDirectory}`);
});
```

### Configuration (`config.js`)

```javascript
export default {
  port: process.env.PORT || 3001,
  workingDirectory: process.env.CLAUDE_CWD || 
    `${process.env.HOME}/Documents/projects/sammy`,
  bufferSize: 500,  // Lines to buffer for reconnect replay
  uploadDir: `${process.env.HOME}/Documents/projects/sammy/.claude-uploads`,
  fcm: {
    serverKey: process.env.FCM_SERVER_KEY,
    deviceToken: process.env.FCM_DEVICE_TOKEN,
  },
  notifications: {
    onComplete: true,      // When Claude finishes and awaits input
    onPermission: true,    // When Claude asks for permission
    onQuestion: true,      // When Claude asks a question
    onError: true,         // When an error occurs
  }
};
```

### Claude Manager (`claude.js`)

```javascript
import { spawn } from 'node-pty';
import config from './config.js';

let pty = null;
let outputBuffer = [];

export function startClaude() {
  pty = spawn('claude', [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: config.workingDirectory,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
    }
  });

  pty.onData((data) => {
    // Add to buffer
    outputBuffer.push({ data, timestamp: Date.now() });
    if (outputBuffer.length > config.bufferSize) {
      outputBuffer.shift();
    }
    
    // Broadcast to clients (handled by websocket.js)
    broadcastOutput(data);
    
    // Check for notification triggers
    checkNotificationTriggers(data);
  });

  pty.onExit(({ exitCode }) => {
    console.log(`Claude exited with code ${exitCode}`);
    // Optionally restart
  });

  return pty;
}

export function sendInput(data) {
  if (pty) {
    pty.write(data);
  }
}

export function sendInterrupt() {
  if (pty) {
    pty.write('\x03');  // Ctrl+C
  }
}

export function getBuffer() {
  return outputBuffer;
}

export function resize(cols, rows) {
  if (pty) {
    pty.resize(cols, rows);
  }
}
```

### WebSocket Server (`websocket.js`)

```javascript
import { WebSocketServer } from 'ws';
import { getBuffer, sendInput, sendInterrupt, resize } from './claude.js';

let wss = null;
const clients = new Set();

export function setupWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    // Send buffer replay
    const buffer = getBuffer();
    ws.send(JSON.stringify({ 
      type: 'replay', 
      data: buffer.map(b => b.data).join('') 
    }));

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message);
        handleMessage(ws, msg);
      } catch (e) {
        console.error('Invalid message:', e);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      clients.delete(ws);
    });
  });
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'input':
      sendInput(msg.data);
      break;
    case 'interrupt':
      sendInterrupt();
      break;
    case 'resize':
      resize(msg.cols, msg.rows);
      break;
  }
}

export function broadcastOutput(data) {
  const message = JSON.stringify({ type: 'output', data });
  clients.forEach((client) => {
    if (client.readyState === 1) {  // OPEN
      client.send(message);
    }
  });
}
```

### REST API (`api.js`)

```javascript
import express from 'express';
import multer from 'multer';
import { getCommands } from './commands.js';
import { listFiles, getFile } from './files.js';
import config from './config.js';

const upload = multer({ dest: config.uploadDir });

export function setupAPI(app) {
  app.use(express.json());

  // Get slash commands
  app.get('/api/commands', async (req, res) => {
    const commands = await getCommands();
    res.json(commands);
  });

  // List files
  app.get('/api/files', async (req, res) => {
    const path = req.query.path || '/';
    const files = await listFiles(path);
    res.json(files);
  });

  // Get file contents
  app.get('/api/file', async (req, res) => {
    const path = req.query.path;
    const content = await getFile(path);
    res.json(content);
  });

  // Upload file/image
  app.post('/api/upload', upload.single('file'), (req, res) => {
    const file = req.file;
    // Move to project directory or keep in uploads
    res.json({ 
      path: file.path,
      filename: file.originalname 
    });
  });

  // Server status
  app.get('/api/status', (req, res) => {
    res.json({
      connected: true,
      workingDirectory: config.workingDirectory,
    });
  });
}
```

### Commands Reader (`commands.js`)

```javascript
import fs from 'fs/promises';
import path from 'path';
import config from './config.js';

const BUILTIN_COMMANDS = [
  { name: 'compact', description: 'Compact conversation context' },
  { name: 'clear', description: 'Clear the terminal screen' },
  { name: 'cost', description: 'Show token usage and cost' },
  { name: 'help', description: 'Show available commands' },
  { name: 'model', description: 'Switch AI model' },
  { name: 'permissions', description: 'Manage tool permissions' },
  { name: 'config', description: 'View configuration' },
];

export async function getCommands() {
  const globalDir = path.join(process.env.HOME, '.claude', 'commands');
  const projectDir = path.join(config.workingDirectory, '.claude', 'commands');

  const [globalCommands, projectCommands] = await Promise.all([
    readCommandsFromDir(globalDir),
    readCommandsFromDir(projectDir),
  ]);

  return {
    builtin: BUILTIN_COMMANDS,
    global: globalCommands,
    project: projectCommands,
  };
}

async function readCommandsFromDir(dir) {
  try {
    const files = await fs.readdir(dir);
    const commands = await Promise.all(
      files
        .filter(f => f.endsWith('.md'))
        .map(async (f) => {
          const content = await fs.readFile(path.join(dir, f), 'utf-8');
          const name = f.replace('.md', '');
          const description = extractDescription(content);
          return { name, description };
        })
    );
    return commands;
  } catch (e) {
    return [];
  }
}

function extractDescription(content) {
  // Get first non-empty, non-heading line
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed.slice(0, 100);
    }
  }
  return '';
}
```

### Notification Service (`notifications.js`)

```javascript
import config from './config.js';

// Notification trigger patterns
const TRIGGERS = {
  complete: /[>❯]\s*$|\? for shortcuts/,
  permission: /Allow|approve|permission|Claude wants to/i,
  question: /\?\s*$/,
  error: /error|failed|exception/i,
};

let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5000;  // 5 seconds

export function checkNotificationTriggers(output) {
  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
    return;
  }

  if (config.notifications.onComplete && TRIGGERS.complete.test(output)) {
    sendNotification('✅ Claude ready', 'Waiting for your input');
    lastNotificationTime = now;
  } else if (config.notifications.onPermission && TRIGGERS.permission.test(output)) {
    sendNotification('🔧 Permission needed', 'Claude is asking for approval');
    lastNotificationTime = now;
  } else if (config.notifications.onQuestion && TRIGGERS.question.test(output)) {
    sendNotification('❓ Question', 'Claude is asking a question');
    lastNotificationTime = now;
  } else if (config.notifications.onError && TRIGGERS.error.test(output)) {
    sendNotification('❌ Error', 'Something went wrong');
    lastNotificationTime = now;
  }
}

async function sendNotification(title, body) {
  if (!config.fcm.serverKey || !config.fcm.deviceToken) {
    console.log(`[Notification] ${title}: ${body}`);
    return;
  }

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${config.fcm.serverKey}`,
      },
      body: JSON.stringify({
        to: config.fcm.deviceToken,
        notification: { title, body },
        data: { title, body },
      }),
    });
    console.log('[Notification] Sent:', title);
  } catch (e) {
    console.error('[Notification] Failed:', e);
  }
}
```

---

## Implementation Order

### Phase 1: Core Connection (Day 1)
1. Set up relay server with node-pty
2. WebSocket streaming works
3. Basic React app with xterm.js
4. Can see Claude output, send input

### Phase 2: Input & Actions (Day 1-2)
5. Native input bar with autocorrect
6. Quick action buttons (Ctrl+C, Tab, Esc)
7. Command history (↑ button)

### Phase 3: Commands & Files (Day 2)
8. Slash command palette
9. Read commands from .claude/commands/
10. File browser
11. Image upload

### Phase 4: Notifications (Day 2-3)
12. FCM setup in Capacitor app
13. Notification triggers in relay
14. Test end-to-end

### Phase 5: Polish (Day 3)
15. Status bar (connection, context, cost)
16. Reconnect with buffer replay
17. Settings screen
18. Capacitor build and test on device

---

## Testing Checklist

- [ ] Can connect to relay server
- [ ] See Claude output with colors
- [ ] Send text input (with autocorrect)
- [ ] Ctrl+C interrupts Claude
- [ ] Slash command palette shows commands
- [ ] Can select and insert command
- [ ] File browser shows project files
- [ ] Can upload image
- [ ] Push notification on task complete
- [ ] Push notification on permission request
- [ ] Reconnect after disconnect
- [ ] Buffer replay on reconnect
- [ ] Works on iOS
- [ ] Works on Android
- [ ] Works in web browser

---

## Future Enhancements (Not MVP)

- Session persistence (resume after app close)
- Multiple projects/working directories
- Session history browser
- Multi-device support (phone + tablet)
- Voice input
- Haptic feedback
- Widget for quick commands
- Apple Watch notifications
- Syntax highlighting in input for code
- Diff viewer for file changes
- Git status indicator
