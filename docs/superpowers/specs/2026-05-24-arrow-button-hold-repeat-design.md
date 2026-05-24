# Arrow Button Hold-Repeat — Design

**Date:** 2026-05-24
**Status:** Approved, ready for implementation plan

## Goal

When the user presses and holds one of the four on-screen arrow buttons in `QuickActions` (Up / Down / Left / Right), the action repeats like a physical keyboard's auto-repeat — so scrolling through command history or moving the terminal cursor over distance no longer requires repeated taps.

## Non-goals

- Auto-repeat for the other QuickActions buttons (Tab / Shift-Tab / Esc / Enter / Ctrl-C / commands / files / camera / refresh). Those are discrete actions; holding them would be surprising.
- Modifying physical/soft keyboard arrow handling. The OS already provides key-repeat for those.
- Configurable per-user timing. Sensible defaults only.

## Timing

| Phase | Duration |
|---|---|
| Initial fire (on press) | t=0 |
| Delay before repeat starts | 500 ms |
| Repeat interval | 100 ms (10 Hz) |

Quick taps fire exactly once (release before t=500ms ⇒ no repeat phase). Matches typical "gentler" mobile key-repeat tuning so users are less likely to overshoot on touch screens.

## Architecture

### New file: `app/src/hooks/useHoldRepeat.js`

A small React hook returning pointer-event props that, when spread onto a button, implement keyboard-style auto-repeat.

**Signature:** `useHoldRepeat(fn, { delay = 500, interval = 100 } = {}) → { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel }`

**Behavior:**
- `onPointerDown` fires `fn()` immediately, then after `delay` ms starts firing `fn()` every `interval` ms.
- `onPointerUp` / `onPointerLeave` / `onPointerCancel` all stop the repeat.
- Stores `fn` in a ref so the latest closure is always called (avoids re-binding handlers when parent state changes).
- Cleans up timers on unmount.

### Modified: `app/src/components/input/QuickActions.jsx`

- Extract the existing arrow button JSX into a small inner `ArrowButton` component (so each instance can call `useHoldRepeat` without violating the rules of hooks).
- `ArrowButton` calls `useHoldRepeat(() => onAction(action.id), { delay: 500, interval: 100 })` and spreads the returned handlers onto its `<button>`.
- Remove `onClick` from the arrow buttons — the hook handles the immediate fire via `onPointerDown`.
- The four nav buttons (Tab/Shift-Tab/Esc/Enter), Ctrl modifier, Ctrl+C, commands/files/camera, and Refresh all keep their existing `onClick` handlers unchanged.

## Edge cases

| Scenario | Behavior |
|---|---|
| Quick tap (release before t=500ms) | One fire — same as today's click |
| Hold and release after t=500ms | First fire on press + N repeats during hold |
| Finger drags off button mid-hold | Repeat stops (pointerleave) |
| System cancels the gesture (e.g. iOS swipe-from-edge) | Repeat stops (pointercancel) |
| Multiple arrow buttons pressed at once | Each manages its own timer state independently — both repeat in parallel |
| Component unmounts while held | Timers cleared in the hook's useEffect cleanup |
| Disabled button | Pointer handlers fire but `onAction` is the parent's responsibility; `disabled` on the `<button>` itself blocks pointer events at the platform level |

## Testing

The app has no unit-test framework wired up, so verification is manual:

1. Open the DEV app, attach a Claude or agy instance.
2. Tap an arrow button briefly — confirm a single cursor move (no regression).
3. Press and hold an arrow button for ~2 s — confirm cursor walks smoothly at ~10 Hz, starting after a brief delay.
4. Press, then slide finger off the button — confirm repeat stops cleanly.
5. Hold two arrows simultaneously (e.g. up + right) — confirm both repeat in parallel.
6. Disconnect from relay (so `disabled=true`) and confirm the arrow buttons are inert.

## Out of scope / Future

- Visual feedback during hold (e.g. button state change after the delay expires). Not asked for; defer.
- Acceleration (repeat rate gets faster the longer you hold). Defer.
- Haptic feedback on each repeat tick. Defer; could be annoying.
