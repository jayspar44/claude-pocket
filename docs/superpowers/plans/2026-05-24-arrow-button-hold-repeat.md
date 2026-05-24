# Arrow Button Hold-Repeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user presses and holds one of the four on-screen arrow buttons in `QuickActions` (Up/Down/Left/Right), fire the corresponding action repeatedly like a keyboard's auto-repeat.

**Architecture:** New `useHoldRepeat` React hook exposes pointer-event handlers (down/up/leave/cancel) that fire the supplied callback immediately on press, then after a 500 ms delay start repeating every 100 ms until release. `QuickActions.jsx` extracts each arrow into a small inner `ArrowButton` component that calls the hook, spreads its handlers onto the `<button>`, and replaces the existing `onClick`. The 4 nav buttons (Tab/Shift-Tab/Esc/Enter) and other action buttons remain unchanged.

**Tech Stack:** React 19 + Vite 7. No new dependencies. App has no unit-test framework wired up, so verification is `npm run lint --prefix app` + manual UI smoke.

**Spec:** `docs/superpowers/specs/2026-05-24-arrow-button-hold-repeat-design.md`

---

## File Structure

### New
- `app/src/hooks/useHoldRepeat.js` — the reusable pointer-event hook (~30 lines)

### Modified
- `app/src/components/input/QuickActions.jsx` — extract `ArrowButton` inner component, wire the hook into the four arrow buttons. The nav buttons / action buttons / Ctrl modifier / Ctrl+C / Refresh JSX is untouched.

### Unchanged
- `app/src/pages/Terminal.jsx` — `handleQuickAction` already handles `arrow-up/down/left/right`; the hook fires the same payload it already receives.

---

## Task 1: Add the `useHoldRepeat` hook

**Files:**
- Create: `app/src/hooks/useHoldRepeat.js`

- [ ] **Step 1: Create the hook file**

Write `app/src/hooks/useHoldRepeat.js` with the following content:

```javascript
import { useCallback, useEffect, useRef } from 'react';

// Returns pointer-event props that, when spread onto a button, fire `fn`
// immediately on press, then after `delay` ms start firing every `interval` ms
// until release/leave/cancel. Cleans up on unmount.
//
// Mirrors OS-level key-repeat behavior:
//   t=0                  — fire (the initial action, same as a plain click)
//   t=delay              — fire (start of repeat)
//   t=delay+N*interval   — fire
export function useHoldRepeat(fn, { delay = 500, interval = 100 } = {}) {
  // Keep latest closure in a ref so handlers stay stable across renders
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const delayTimer = useRef(null);
  const repeatTimer = useRef(null);

  const stop = useCallback(() => {
    if (delayTimer.current) {
      clearTimeout(delayTimer.current);
      delayTimer.current = null;
    }
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop(); // defensive: cancel any leftover timers from a stuck pointer
    fnRef.current(); // immediate first fire (matches keyboard press)
    delayTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => fnRef.current(), interval);
    }, delay);
  }, [stop, delay, interval]);

  // Clean up timers when the consumer component unmounts
  useEffect(() => stop, [stop]);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,    // finger drags off the button -> stop repeating
    onPointerCancel: stop,   // system gesture cancels -> stop repeating
  };
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint --prefix app`
Expected: 0 errors. Pre-existing warnings in other files (about 8) are unrelated and fine.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useHoldRepeat.js
git commit -m "feat(app): add useHoldRepeat hook for keyboard-style auto-repeat"
```

---

## Task 2: Wire the hook into QuickActions arrow buttons

**Files:**
- Modify: `app/src/components/input/QuickActions.jsx`

- [ ] **Step 1: Read the current file to confirm the structure**

Run: `cat app/src/components/input/QuickActions.jsx`

You should see (around lines 11-16) the `arrowActions` array and (around lines 48-58) a `{arrowActions.map(...)}` block rendering four `<button>` elements with `onClick={() => onAction(action.id)}`. We're going to extract those four into a small inner component that owns its own hook call.

- [ ] **Step 2: Add the import**

At the top of `app/src/components/input/QuickActions.jsx`, add:

```jsx
import { useHoldRepeat } from '../../hooks/useHoldRepeat';
```

The existing `lucide-react` and any other imports stay as-is.

- [ ] **Step 3: Add the `ArrowButton` inner component**

Just **above** the `function QuickActions(...)` declaration (and below all the existing const arrays like `navActions`, `arrowActions`, `actionButtons`), add:

```jsx
function ArrowButton({ action, disabled, onAction }) {
  const holdProps = useHoldRepeat(
    () => onAction(action.id),
    { delay: 500, interval: 100 },
  );
  return (
    <button
      {...holdProps}
      disabled={disabled}
      className={`flex items-center justify-center p-2 text-white rounded ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      aria-label={action.id.replace('arrow-', '') + ' arrow'}
    >
      <action.icon className="w-4.5 h-4.5" />
    </button>
  );
}
```

This is a verbatim move of the existing arrow-button JSX (the `<button>` inside the `arrowActions.map`), with `onClick` replaced by the spread `{...holdProps}`. The `key` belongs on the list element (the consumer), so it's omitted here.

- [ ] **Step 4: Replace the existing arrow-buttons map**

Find this block (around lines 48-58 in the current file):

```jsx
        {/* Arrow keys */}
        {arrowActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            disabled={disabled}
            className={`flex items-center justify-center p-2 text-white rounded ${action.color} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            aria-label={action.id.replace('arrow-', '') + ' arrow'}
          >
            <action.icon className="w-4.5 h-4.5" />
          </button>
        ))}
```

Replace it with:

```jsx
        {/* Arrow keys (auto-repeat on hold) */}
        {arrowActions.map((action) => (
          <ArrowButton
            key={action.id}
            action={action}
            disabled={disabled}
            onAction={onAction}
          />
        ))}
```

Nothing else in the file changes. The four nav buttons above (Tab / Shift-Tab / Esc / Enter), the separator, the Ctrl modifier, the Ctrl+C button, the action buttons (commands/files/camera), and the Refresh button all keep their existing `onClick` handlers.

- [ ] **Step 5: Lint**

Run: `npm run lint --prefix app`
Expected: 0 errors. Same pre-existing warnings as before.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/input/QuickActions.jsx
git commit -m "feat(app): arrow buttons auto-repeat on hold"
```

---

## Task 3: Manual verification

This step has no commit — it's a smoke test against the deployed dev instance (or `npm run dev:local` if you'd rather verify before redeploying).

- [ ] **Step 1: Start the app**

Either:
- Use the already-running DEV deployment at `http://minibox.rattlesnake-mimosa.ts.net:4502` (after deploying), or
- Run locally: `npm run dev:local` and open `http://localhost:4500`

- [ ] **Step 2: Verify quick tap (regression check)**

Attach an instance, focus the terminal. Briefly tap the right-arrow button once. Expect: cursor moves exactly one position. (Confirms we didn't break single-fire behavior.)

- [ ] **Step 3: Verify hold-to-repeat**

Press and hold the right-arrow button for ~2 seconds. Expect:
- One immediate cursor move on press
- ~500 ms pause
- Then steady ~10 Hz cursor walks until release
- Release stops cleanly (no extra moves)

- [ ] **Step 4: Verify pointer-leave dismissal**

Press an arrow, then while still holding, slide your finger off the button. Expect: repeat stops as soon as the finger leaves the button bounds.

- [ ] **Step 5: Verify simultaneous arrows**

Hold up-arrow with one finger and right-arrow with another. Expect: both repeat in parallel (terminal cursor moves diagonally in history if applicable, or both ANSI sequences interleave in raw mode).

- [ ] **Step 6: Verify disabled state**

Disconnect the relay (Settings → stop all instances, or kill PM2 relay). The arrow buttons should grey out (`disabled` prop) and not respond to hold or tap.

If any step fails, capture the failure and either patch in this branch or report as a follow-up.

---

## Self-Review

**Spec coverage:**
- ✅ Hook timing matches spec (500 ms delay, 100 ms interval) — Task 1.
- ✅ Pointer events: down/up/leave/cancel all wired — Task 1.
- ✅ Latest-closure handling via ref — Task 1.
- ✅ Unmount cleanup via useEffect — Task 1.
- ✅ `QuickActions` extracted inner component pattern (not array-map hooks) — Task 2.
- ✅ Other QuickActions buttons untouched — Task 2.
- ✅ Manual verification matrix from spec — Task 3.
- ✅ No new dependencies — confirmed (only `react` imports added).

**Placeholder scan:** clean.

**Type consistency:** `useHoldRepeat(fn, opts) → { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel }` is the only contract; matches between Task 1 (definition) and Task 2 (use). `ArrowButton` takes `{ action, disabled, onAction }` — props match the call site in the `arrowActions.map`.

---

## Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch with checkpoints.

**Which approach?**
