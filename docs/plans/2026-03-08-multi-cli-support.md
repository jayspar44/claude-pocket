# Multi-CLI Support (Claude + Gemini) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow each instance to run either Claude CLI or Gemini CLI, with a default CLI setting.

**Architecture:** Add `cliType` field (`'claude' | 'gemini'`) to instances on both relay and app. The relay spawns the corresponding command based on `cliType`. Remove all option detection code (broken, CLI-specific). The StatusBar header label switches between "Claude" and "Gemini" based on the active instance's `cliType`.

**Tech Stack:** React 19, Node.js, node-pty, WebSocket

---

### Task 1: Add `geminiCommand` to relay config

**Files:**
- Modify: `relay/src/config.js:94-96`
- Modify: `relay/.env.example`
- Modify: `relay/.env`
- Modify: `relay/.env.production`

**Step 1: Add geminiCommand to config**

In `relay/src/config.js`, after line 95 (`claudeCommand`), add:

```javascript
geminiCommand: process.env.GEMINI_COMMAND || 'gemini',
```

**Step 2: Add GEMINI_COMMAND to env files**

In `relay/.env.example`, `relay/.env`, and `relay/.env.production`, add:

```
GEMINI_COMMAND=gemini
```

**Step 3: Commit**

```bash
git add relay/src/config.js relay/.env.example relay/.env relay/.env.production
git commit -m "feat: add geminiCommand config for multi-CLI support"
```

---

### Task 2: Make PtyManager accept and use `cliType`

**Files:**
- Modify: `relay/src/pty-manager.js`

**Step 1: Add `cliType` to constructor**

In `relay/src/pty-manager.js`, modify the constructor (line 36) to accept and store `cliType`:

```javascript
constructor(instanceId = 'default', cliType = 'claude') {
```

Add after `this.instanceId = instanceId;` (line 37):

```javascript
this.cliType = cliType;
```

**Step 2: Use `cliType` to select command in `start()`**

In `relay/src/pty-manager.js`, replace line 107:

```javascript
const proc = pty.spawn(config.claudeCommand, [], {
```

with:

```javascript
const command = this.cliType === 'gemini' ? config.geminiCommand : config.claudeCommand;
const proc = pty.spawn(command, [], {
```

**Step 3: Update log messages to be CLI-agnostic**

Replace all `'Claude Code'` string references in log messages with a dynamic label. In `pty-manager.js`, add a helper after the constructor:

```javascript
get cliLabel() {
  return this.cliType === 'gemini' ? 'Gemini CLI' : 'Claude Code';
}
```

Then replace these log message strings:
- Line 104: `'Starting Claude Code process'` → `` `Starting ${this.cliLabel} process` ``
- Line 156: `'Claude Code process stopped intentionally'` → `` `${this.cliLabel} process stopped intentionally` ``
- Line 158: `'Claude Code process exited normally'` → `` `${this.cliLabel} process exited normally` ``
- Line 164: `'Claude Code process crashed'` → `` `${this.cliLabel} process crashed` ``
- Line 189: `'Claude Code process started'` → `` `${this.cliLabel} process started` ``
- Line 209: `'Claude Code crashed repeatedly. Use restart button to try again.'` → `` `${this.cliLabel} crashed repeatedly. Use restart button to try again.` ``
- Line 227: `'Auto-restarting Claude Code process'` → `` `Auto-restarting ${this.cliLabel} process` ``
- Line 240: `'Stopping Claude Code process'` → `` `Stopping ${this.cliLabel} process` ``

**Step 4: Add `cliType` to `getStatus()`**

In `getStatus()` (line 573), add `cliType` to the returned object:

```javascript
getStatus() {
  return {
    instanceId: this.instanceId,
    cliType: this.cliType,
    running: this.isRunning,
    // ... rest unchanged
  };
}
```

**Step 5: Commit**

```bash
git add relay/src/pty-manager.js
git commit -m "feat: PtyManager accepts cliType to spawn claude or gemini"
```

---

### Task 3: Remove option detection from PtyManager

**Files:**
- Modify: `relay/src/pty-manager.js`
- Modify: `relay/src/config.js`

**Step 1: Remove option detection state from constructor**

In the constructor, remove these lines (58-65):

```javascript
// Option detection state
this.lastDetectedOptions = null;
this.lastOptionsSetTime = 0;
// Idle state tracking for option detection
this.isIdle = false;
this.lastOutputTime = 0;
this.idleTimer = null;
this.optionExpiryTimer = null;
```

Keep `this.lastUserInputTime` and `this.processingStartTime` (needed for long task detection).

**Step 2: Simplify `stop()` method**

Remove the idle/expiry timer cleanup from `stop()` (lines 254-261):

```javascript
// Clear idle and expiry timers
if (this.idleTimer) {
  clearTimeout(this.idleTimer);
  this.idleTimer = null;
}
if (this.optionExpiryTimer) {
  clearTimeout(this.optionExpiryTimer);
  this.optionExpiryTimer = null;
}
```

**Step 3: Simplify `write()` method**

In `write()`, remove the option clearing code (lines 274-278):

```javascript
// Clear detected options when user sends input
if (this.lastDetectedOptions) {
  this.clearDetectedOptions();
}
```

**Step 4: Simplify `queueOutput()` method**

In `queueOutput()`, remove idle tracking (lines 353-357):

```javascript
this.lastOutputTime = Date.now();
this.isIdle = false;

// Schedule idle detection (will run option detection when idle)
this.scheduleIdleDetection();
```

**Step 5: Remove `scheduleIdleDetection()`, `checkIdleState()`, simplify for long task only**

Remove `scheduleIdleDetection()` method entirely (lines 375-387).

Replace `checkIdleState()` (lines 389-431) with a simpler idle check that only handles long task detection and status broadcast:

```javascript
checkIdleState() {
  // Check for long task completion
  if (this.processingStartTime) {
    const processingDuration = Date.now() - this.processingStartTime;
    if (processingDuration >= config.longTask.thresholdMs) {
      logger.info({ duration: processingDuration }, 'Long task completed - broadcasting task-complete');
      this.broadcast({
        type: 'task-complete',
        duration: processingDuration,
      });
    }
    this.processingStartTime = null;
  }

  // Broadcast updated status (refreshes git branch after commands complete)
  this.broadcast({ type: 'pty-status', ...this.getStatus() });
}
```

Add idle detection back to `queueOutput()` using a simple timer (no option detection):

```javascript
queueOutput(data) {
  this.batchQueue += data;

  // Schedule idle check for long task detection
  if (this.idleTimer) {
    clearTimeout(this.idleTimer);
  }
  this.idleTimer = setTimeout(() => {
    this.idleTimer = null;
    this.checkIdleState();
  }, 800); // Simple idle threshold

  // If no timer running, start one
  if (!this.batchTimer) {
    this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_DELAY_MS);
  }
}
```

Re-add `this.idleTimer = null;` to constructor (needed for long task idle detection).

**Step 6: Remove all option detection methods**

Remove these methods entirely:
- `scheduleOptionExpiry()` (lines 433-447)
- `detectNumberedOptions()` (lines 449-555)
- `clearDetectedOptions()` (lines 557-571)

**Step 7: Remove `optionDetection` config from config.js**

In `relay/src/config.js`, remove the entire `optionDetection` block (lines 28-69).

**Step 8: Commit**

```bash
git add relay/src/pty-manager.js relay/src/config.js
git commit -m "refactor: remove option detection from relay (broken, CLI-specific)"
```

---

### Task 4: Pass `cliType` through PtyRegistry

**Files:**
- Modify: `relay/src/pty-registry.js`

**Step 1: Accept `cliType` in `get()` method**

Modify the `get()` method signature (line 28):

```javascript
get(instanceId, workingDir, cliType) {
```

Pass `cliType` when creating a new PtyManager (line 58):

```javascript
const instance = new PtyManager(id, cliType);
```

**Step 2: Commit**

```bash
git add relay/src/pty-registry.js
git commit -m "feat: PtyRegistry passes cliType to PtyManager"
```

---

### Task 5: Handle `cliType` in WebSocket handler and REST API

**Files:**
- Modify: `relay/src/websocket-handler.js`
- Modify: `relay/src/index.js`

**Step 1: Pass `cliType` from `set-instance` message**

In `websocket-handler.js`, in the `set-instance` case (line 140), extract `cliType`:

```javascript
case 'set-instance': {
  const newInstanceId = message.instanceId || DEFAULT_INSTANCE_ID;
  const workingDir = message.workingDir;
  const cliType = message.cliType || 'claude';
  const clientCols = message.cols || config.pty.cols;
  const clientRows = message.rows || config.pty.rows;
```

Store `cliType` on the ws object for later use:

```javascript
ws.instanceId = newInstanceId;
ws.cliType = cliType;
```

Update the `ptyRegistry.get()` call in `setupPtyListener` (line 42) to not pass cliType (it only gets existing or creates without starting). Instead, ensure cliType is passed when the PTY is created. The key change is in `set-instance` — when calling `ptyRegistry.get()`:

Replace:
```javascript
const ptyManager = ctx.setupPtyListener(newInstanceId);
```
with:
```javascript
const ptyManager = ctx.setupPtyListener(newInstanceId, cliType);
```

And update `setupPtyListener` (line 36):

```javascript
const setupPtyListener = (instanceId, cliType) => {
  if (ptyListener && ws.currentPtyManager) {
    ws.currentPtyManager.removeListener(ptyListener);
  }

  const ptyManager = ptyRegistry.get(instanceId, undefined, cliType);
```

**Step 2: Remove `options-detected` broadcast handling**

The relay no longer sends `options-detected` messages (removed in Task 3), so no changes needed in websocket-handler.js for this.

**Step 3: Update error messages to be CLI-agnostic**

In `websocket-handler.js`, line 176:

Replace:
```javascript
logger.warn({ clientId: ws.clientId, instanceId: newInstanceId }, 'Cannot start Claude: no working directory configured');
```
with:
```javascript
logger.warn({ clientId: ws.clientId, instanceId: newInstanceId }, 'Cannot start CLI: no working directory configured');
```

**Step 4: Update REST API to accept `cliType`**

In `relay/src/index.js`, update `POST /api/instances` (line 91):

```javascript
app.post('/api/instances', (req, res) => {
  try {
    const { instanceId, workingDir, autoStart = false, cliType = 'claude' } = req.body;
    // ...
    const ptyManager = ptyRegistry.get(instanceId, workingDir, cliType);
```

Update `POST /api/pty/start` (line 211):

```javascript
const { workingDir, instanceId = DEFAULT_INSTANCE_ID, cliType = 'claude' } = req.body;
const ptyManager = ptyRegistry.get(instanceId, workingDir, cliType);
```

Update `POST /api/pty/restart` (line 191):

```javascript
const { workingDir, instanceId = DEFAULT_INSTANCE_ID, cliType } = req.body || {};
const ptyManager = ptyRegistry.get(instanceId);
// cliType is already set on the PtyManager from creation, no need to change it on restart
```

**Step 5: Update CLI-agnostic log/text in index.js**

Line 266:
```javascript
logger.info('PTY auto-start disabled - use /api/pty/start or set-instance WebSocket message to launch CLI');
```

**Step 6: Commit**

```bash
git add relay/src/websocket-handler.js relay/src/index.js
git commit -m "feat: pass cliType through WebSocket and REST API"
```

---

### Task 6: Add `cliType` to app instance model and Settings

**Files:**
- Modify: `app/src/contexts/InstanceContext.jsx`
- Modify: `app/src/pages/Settings.jsx`

**Step 1: Add `cliType` to instance model**

In `InstanceContext.jsx`, update `createInstance` (line 62) to accept `cliType`:

```javascript
const createInstance = (name, relayUrl, workingDir, color, useDefaultId = false, customId = null, cliType = null) => ({
  id: customId || (useDefaultId ? DEFAULT_INSTANCE_ID : generateId()),
  name,
  relayUrl,
  workingDir: workingDir || '',
  color: color || INSTANCE_COLORS[0],
  cliType: cliType || storage.get('default-cli') || 'claude',
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
});
```

**Step 2: Remove option detection state**

In `createInstanceState()` (line 73), remove:

```javascript
detectedOptions: [],
needsInput: false,    // True when options-detected received
```

Keep `taskComplete` (still used for long task detection).

**Step 3: Remove `options-detected` message handling**

In the `ws.onmessage` handler, remove the entire `else if (message.type === 'options-detected')` block (lines 375-400).

**Step 4: Send `cliType` in `set-instance` message**

In `ws.onopen` (line 294), add `cliType` to the `set-instance` message:

```javascript
ws.send(JSON.stringify({
  type: 'set-instance',
  instanceId: instance.id,
  workingDir: instance.workingDir || null,
  cliType: instance.cliType || 'claude',
  cols: dims.cols,
  rows: dims.rows,
}));
```

**Step 5: Update `addInstance` to accept `cliType`**

In `addInstance` (line 498), add `cliType` parameter:

```javascript
const addInstance = useCallback((name, relayUrl, workingDir, color, customId = null, cliType = null) => {
```

Pass it through to `createInstance`:

```javascript
const newInstance = createInstance(
  name, relayUrl, workingDir,
  color || INSTANCE_COLORS[colorIndex],
  false, customId, cliType
);
```

**Step 6: Remove `detectedOptions`, `needsInput`, `clearDetectedOptions` from context value**

In the `value` useMemo (line 746), remove:
- `detectedOptions: activeInstanceState.detectedOptions,`
- `needsInput: activeInstanceState.needsInput,`
- `clearDetectedOptions,`

Also remove the `clearDetectedOptions` callback (lines 701-707).

Keep `taskComplete` in the context value.

**Step 7: Add Default CLI setting to Settings page**

In `app/src/pages/Settings.jsx`, add a "Default CLI" dropdown in the Terminal section (after the Font Size block, around line 388):

```jsx
{/* Default CLI */}
<div className="space-y-2">
  <label className="text-sm text-gray-400">Default CLI for New Instances</label>
  <div className="flex gap-2">
    {['claude', 'gemini'].map((cli) => {
      const isSelected = (storage.get('default-cli') || 'claude') === cli;
      return (
        <button
          key={cli}
          onClick={() => {
            storage.set('default-cli', cli);
            // Force re-render
            setFontSizeInput(prev => prev);
          }}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSelected
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {cli === 'claude' ? 'Claude' : 'Gemini'}
        </button>
      );
    })}
  </div>
  <p className="text-xs text-gray-500">
    CLI tool used when creating new instances
  </p>
</div>
```

Actually, to make re-render work properly, use a local state for default CLI:

```javascript
const [defaultCli, setDefaultCli] = useState(() => storage.get('default-cli') || 'claude');
```

And the save handler:

```javascript
const handleDefaultCliChange = useCallback((cli) => {
  setDefaultCli(cli);
  storage.set('default-cli', cli);
}, []);
```

Then in JSX use `defaultCli` instead of reading from storage.

**Step 8: Commit**

```bash
git add app/src/contexts/InstanceContext.jsx app/src/pages/Settings.jsx
git commit -m "feat: add cliType to instance model and default CLI setting"
```

---

### Task 7: Add `cliType` picker to InstanceManager

**Files:**
- Modify: `app/src/components/instance/InstanceManager.jsx`

**Step 1: Add `cliType` to form data**

Update the `formData` state (line 51) to include `cliType`:

```javascript
const [formData, setFormData] = useState({
  name: '',
  workingDir: '',
  color: instanceColors[0],
  cliType: storage.get('default-cli') || 'claude',
});
```

Update all places that initialize `formData`:
- `handleAddClick` (line 93): add `cliType: storage.get('default-cli') || 'claude'`
- `handleEditClick` (line 102): add `cliType: instance.cliType || 'claude'`
- `resetForm` (line 83): add `cliType: storage.get('default-cli') || 'claude'`
- `useEffect` for `editInstanceId` (line 58): add `cliType: instance.cliType || 'claude'`

**Step 2: Pass `cliType` on save**

In `handleSave` (line 123), pass `cliType` when adding:

```javascript
const newInstance = addInstance(
  formData.name.trim(),
  getDefaultRelayUrl(),
  workingDir,
  formData.color,
  null,
  formData.cliType
);
```

When editing, include `cliType`:

```javascript
updateInstance(editingId, {
  name: formData.name.trim(),
  workingDir,
  color: formData.color,
  cliType: formData.cliType,
});
```

**Step 3: Add CLI type picker to the form**

After the Color picker section (around line 427), add a CLI type picker:

```jsx
{/* CLI Type */}
<div className="space-y-2">
  <label className="text-sm text-gray-400">CLI</label>
  <div className="flex gap-2">
    {['claude', 'gemini'].map((cli) => (
      <button
        key={cli}
        onClick={() => setFormData(prev => ({ ...prev, cliType: cli }))}
        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          formData.cliType === cli
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        {cli === 'claude' ? 'Claude' : 'Gemini'}
      </button>
    ))}
  </div>
</div>
```

**Step 4: Show CLI type in instance list**

In the instance list item (line 275), add the CLI label after the instance name:

```jsx
<p className="text-white font-medium truncate">
  {instance.name}
  <span className="text-xs text-gray-400 font-normal ml-1.5">
    {(instance.cliType || 'claude') === 'gemini' ? 'Gemini' : 'Claude'}
  </span>
</p>
```

**Step 5: Send `cliType` in `handleStartPty`**

In `handleStartPty` (line 173), include `cliType` in the `set-instance` message:

```javascript
const sent = sendToInstance(instance.id, {
  type: 'set-instance',
  instanceId: instance.id,
  workingDir: instance.workingDir,
  cliType: instance.cliType || 'claude',
  cols: dims.cols,
  rows: dims.rows,
});
```

**Step 6: Commit**

```bash
git add app/src/components/instance/InstanceManager.jsx
git commit -m "feat: add CLI type picker to instance manager"
```

---

### Task 8: Update StatusBar to show CLI type dynamically

**Files:**
- Modify: `app/src/components/StatusBar.jsx`

**Step 1: Accept `cliType` prop**

Update the function signature (line 43):

```javascript
function StatusBar({ connectionState, ptyStatus, workingDir, ptyError, onReconnect, onAddInstance, taskComplete, instanceCount, cliType }) {
```

**Step 2: Use `cliType` for PTY label**

Replace the `ptyConfig` object (lines 38-41):

```javascript
const ptyConfig = {
  running: { color: 'bg-green-500', icon: Terminal },
  stopped: { color: 'bg-gray-500', icon: TerminalSquare, label: 'Stopped' },
};
```

And update the label logic (line 95):

```javascript
<span className="text-xs text-gray-400 leading-4">
  {isPtyRunning ? (cliType === 'gemini' ? 'Gemini' : 'Claude') : 'Stopped'}
</span>
```

**Step 3: Remove `needsInput` prop**

Remove `needsInput` from the function signature. Remove the bell indicator in the context row (lines 141-144):

```jsx
{instanceCount <= 1 && needsInput && (
  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 animate-pulse shrink-0">
    <Bell className="w-3 h-3 text-white" />
  </span>
)}
```

Remove `Bell` from the import if no longer used.

**Step 4: Commit**

```bash
git add app/src/components/StatusBar.jsx
git commit -m "feat: StatusBar shows Claude or Gemini based on active instance"
```

---

### Task 9: Remove option detection from Terminal page and QuickActions

**Files:**
- Modify: `app/src/pages/Terminal.jsx`
- Modify: `app/src/components/input/QuickActions.jsx`
- Modify: `app/src/components/instance/InstanceTabBar.jsx`

**Step 1: Clean up Terminal.jsx**

Remove from the `useRelay()` destructuring (line 21):
- `detectedOptions`
- `clearDetectedOptions`
- `needsInput`

Add `activeInstance` to the destructuring if not already there (it's already there).

Remove the `option-` handling from `handleQuickAction` (lines 140-144).

Remove `detectedOptions` and `onDismissOptions` props from `QuickActions` (line 230-231).

Remove `needsInput` from `StatusBar` props. Add `cliType={activeInstance?.cliType || 'claude'}` to StatusBar props (line 190).

**Step 2: Clean up QuickActions.jsx**

Remove `detectedOptions` and `onDismissOptions` from the component props (line 25).

Remove the entire "Row 0: Detected option buttons" section (lines 28-54).

Remove `X` from the lucide-react import.

**Step 3: Clean up InstanceTabBar.jsx**

Remove the `needsInput` indicator logic and rendering (lines 32, 65-69).

Remove `Bell` from the lucide-react import.

Update `isProcessing` (line 34) to remove `!state.needsInput`:

```javascript
const isProcessing = state.processingStartTime && !state.taskComplete;
```

**Step 4: Commit**

```bash
git add app/src/pages/Terminal.jsx app/src/components/input/QuickActions.jsx app/src/components/instance/InstanceTabBar.jsx
git commit -m "refactor: remove option detection UI from app"
```

---

### Task 10: Clean up remaining references

**Files:**
- Modify: `app/src/contexts/RelayContext.jsx` (if it re-exports option detection)
- Modify: `app/src/hooks/useRelay.js` or wherever `useRelay` is defined
- Modify: `relay/src/index.js` (CLI-agnostic naming)

**Step 1: Search for remaining references**

Search for `detectedOptions`, `needsInput`, `clearDetectedOptions`, `options-detected` across the codebase and remove any remaining references.

Search for `'Claude Code'` in the relay codebase and update to use `cliLabel` or generic text where appropriate.

**Step 2: Update relay API to include `cliType` in relay-api.js**

In `app/src/api/relay-api.js`, update `startPty` and `create` to accept `cliType`:

```javascript
startPty: (workingDir, instanceId, cliType) => relayApi.post('/api/pty/start', { workingDir, instanceId, cliType }),

create: (instanceId, workingDir, autoStart = false, cliType = 'claude') =>
  relayApi.post('/api/instances', { instanceId, workingDir, autoStart, cliType }),
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: clean up remaining option detection and Claude-specific references"
```

---

### Task 11: Test end-to-end

**Step 1: Start dev environment**

```bash
npm run dev:local
```

**Step 2: Manual testing checklist**

- [ ] Create a new instance with CLI type "Claude" — verify it starts `claude`
- [ ] Create a new instance with CLI type "Gemini" — verify it starts `gemini`
- [ ] Verify StatusBar shows "Claude" or "Gemini" based on active instance
- [ ] Verify switching instances updates the StatusBar label
- [ ] Verify the default CLI setting in Settings persists and applies to new instances
- [ ] Verify editing an instance's CLI type works
- [ ] Verify option detection buttons no longer appear
- [ ] Verify long task detection still works (task-complete notifications)
- [ ] Verify PTY restart uses the correct CLI command

**Step 3: Run lint**

```bash
npm run lint
```

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint and testing issues"
```
