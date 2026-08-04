/**
 * Whether a single instance's tab may be brought back online after a Stop.
 *
 * Stopping from Settings disconnects the tab first (reason 'user', which is
 * sticky, so nothing else will ever reconnect it) and then calls DELETE
 * /api/instances/:id. Afterwards the tab has to be reconnected by hand, because
 * the Start control only renders while the tab is connected - so "was it live
 * before?" is a necessary condition, but on its own it is not sufficient.
 *
 * A 404 means the relay held no manager for that id: nothing was stopped, and -
 * this is the part that bites - no stop was recorded either, because
 * remove({userInitiated:true}) records only when it actually removed something.
 * Reconnecting there re-sends set-instance for an id the relay has no manager
 * and no stop record for, which arms a deferred start and spawns the very CLI
 * the user tapped Stop to be rid of. It is the Stop All defect at single-tab
 * scale, and it is reachable the same way: restart the relay while the app is
 * open and every tab sits in RECONNECTING (live) over an empty registry.
 *
 * Any other failure - a timeout, an offline network, a 5xx - leaves the relay's
 * state unknown and the CLI most likely still running. Reconnecting is right
 * there: set-instance finds the existing manager and starts nothing, and the
 * tab is not stranded offline by a sticky 'user' disconnect it can never
 * recover from. So the 404 is the only case that must not reconnect, and the
 * safe direction of a wrong answer stays the same as everywhere else in this
 * flow - an offline tab, never an unasked-for CLI.
 *
 * @param {boolean} wasLive - whether the tab was live before the disconnect
 * @param {number|undefined} status - HTTP status of the delete, if there was one
 * @returns {boolean} whether to reconnect the tab
 */
export function shouldReconnectAfterStopInstance(wasLive, status) {
  if (!wasLive) return false;
  return status !== 404;
}
