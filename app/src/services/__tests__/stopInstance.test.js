import { describe, it, expect } from 'vitest';
import { shouldReconnectAfterStopInstance } from '../stopInstance';

describe('shouldReconnectAfterStopInstance', () => {
  // The regression: the relay answered 404, so it held no manager for this id -
  // nothing was stopped and, because remove() records only when it removed
  // something, no stop was recorded either. Reconnecting re-sends set-instance
  // for an id with neither, which arms a deferred start and spawns the CLI the
  // user tapped Stop to be rid of.
  it('does not reconnect when the relay had no such instance', () => {
    expect(shouldReconnectAfterStopInstance(true, 404)).toBe(false);
  });

  // The ordinary success path: the stop is recorded, so the reconnect's
  // set-instance declines to auto-start, and the tab needs to be online for the
  // Start control to render at all.
  it('reconnects a live tab after a successful stop', () => {
    expect(shouldReconnectAfterStopInstance(true, 200)).toBe(true);
  });

  // Relay state unknown and the CLI most likely still running: set-instance
  // will find the existing manager and start nothing, and leaving the tab
  // offline would strand it behind a sticky 'user' disconnect.
  it('reconnects a live tab when the failure leaves the relay state unknown', () => {
    expect(shouldReconnectAfterStopInstance(true, undefined)).toBe(true);
    expect(shouldReconnectAfterStopInstance(true, 500)).toBe(true);
    expect(shouldReconnectAfterStopInstance(true, 503)).toBe(true);
  });

  // The Stop button renders for every SERVER instance, including ones with no
  // tab of their own or a tab that was already offline. Connecting one of those
  // would open a socket the user never had - and that socket's set-instance is
  // itself a spawn trigger.
  it('never reconnects a tab that was not live', () => {
    expect(shouldReconnectAfterStopInstance(false, 200)).toBe(false);
    expect(shouldReconnectAfterStopInstance(false, 404)).toBe(false);
    expect(shouldReconnectAfterStopInstance(false, undefined)).toBe(false);
  });
});
