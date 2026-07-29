/**
 * Which tabs may be brought back online after "Stop all CLI instances".
 *
 * DELETE /api/instances iterates the relay's OWN registry: it records a user
 * stop only for the managers the relay currently holds. That is a different set
 * from the tabs that were live client-side. Restart the relay while the app is
 * open and every PtyManager - and the whole stoppedByUserAt map - is gone,
 * while the tabs sit in RECONNECTING, which counts as live. Reconnecting all of
 * them then re-sends set-instance for ids the relay has no stop record for, and
 * each one arms a deferred start. The dialog promised that nothing would
 * restart; it started everything.
 *
 * So a tab may come back only if the relay actually stopped it. Those ids, and
 * only those, carry a stop record, so their reconnect declines to auto-start
 * and the Start button the dialog points at is reachable. A tab left out stays
 * offline until the user selects it - explicit intent, and the state they asked
 * for in the first place.
 *
 * A missing or malformed `removed` is treated as "nothing was stopped": the
 * safe direction of a wrong answer here is an offline tab, never a CLI the user
 * asked to have stopped.
 *
 * @param {string[]} wasLive - instance ids whose tab was live before the stop
 * @param {string[]} removed - instance ids the relay reports it stopped
 * @returns {string[]} the subset of wasLive that is safe to reconnect
 */
export function instancesToReconnectAfterStopAll(wasLive, removed) {
  if (!Array.isArray(wasLive) || !Array.isArray(removed)) return [];
  const stopped = new Set(removed);
  return wasLive.filter((id) => stopped.has(id));
}
