import { InstanceConnection, isLiveConnectionState } from './InstanceConnection';

export const HEARTBEAT_INTERVAL = 25000;
export const IDLE_DISCONNECT_MS = 3600000;   // 1 hour

/**
 * Owns the per-instance connections and ONE shared heartbeat.
 *
 * The heartbeat is shared deliberately. Ten connections each running their own
 * 25s timer wake the mobile radio about 24 times a minute at unsynchronised
 * moments and never let it sleep; that, not the socket count, is the real cost
 * of holding connections open. One tick pings them all together.
 */
export class ConnectionManager {
  constructor({
    connectionFactory = (opts) => new InstanceConnection(opts),
    isViewIdle = () => false,
    idleMs = IDLE_DISCONNECT_MS,
    heartbeatMs = HEARTBEAT_INTERVAL,
    setInterval_ = (fn, ms) => setInterval(fn, ms),
    clearInterval_ = (id) => clearInterval(id),
  } = {}) {
    this.connectionFactory = connectionFactory;
    this.isViewIdle = isViewIdle;
    this.idleMs = idleMs;
    this.heartbeatMs = heartbeatMs;
    this.setInterval_ = setInterval_;
    this.clearInterval_ = clearInterval_;
    this.connections = new Map();
    this._heartbeat = null;
  }

  ensure(instanceId, url) {
    let conn = this.connections.get(instanceId);
    if (!conn) {
      conn = this.connectionFactory({ instanceId, url });
      this.connections.set(instanceId, conn);
    }
    return conn;
  }

  get(instanceId) {
    return this.connections.get(instanceId);
  }

  connect(instanceId, url) {
    this.ensure(instanceId, url).connect();
    this._syncHeartbeat();
  }

  // The page has come back to the foreground.
  //
  // Every connection the app has opened gets its own decision, not just the
  // active one. Two tabs backgrounded through a network outage both drain their
  // ladders; reviving only the active tab leaves the other silent - no output and
  // no task-complete notification - until the user happens to tap it. Carries no
  // user intent, so a session the user stopped stays stopped.
  //
  // Per-connection handling lives in InstanceConnection.resume(), which does not
  // trust readyState: a socket killed while the page was frozen usually never
  // delivers a close event, so asking it whether it is alive is how a resume
  // ends up stalling for the length of a connect timeout.
  resumeAll() {
    this.connections.forEach((conn) => conn.resume());
    this._syncHeartbeat();
  }

  disconnect(instanceId, reason = 'user') {
    this.connections.get(instanceId)?.disconnect(reason);
    this._syncHeartbeat();
  }

  disconnectAll(reason = 'user') {
    this.connections.forEach((conn) => conn.disconnect(reason));
    this._syncHeartbeat();
  }

  send(instanceId, message) {
    return this.connections.get(instanceId)?.send(message) ?? false;
  }

  // The ONLY liveness predicate. A CONNECTED-only count used to sit beside this
  // one and picking the narrower of the two is how a connection came to be killed
  // during its own backoff; one predicate means there is nothing to pick.
  // CONNECTING and RECONNECTING count as live: anything that keeps the process
  // alive for the sake of the sockets - the Android foreground service, the
  // heartbeat - must be held until this is false, or a connection can be cut off
  // mid-backoff and never come back.
  hasLiveConnections() {
    for (const conn of this.connections.values()) {
      if (isLiveConnectionState(conn.state)) return true;
    }
    return false;
  }

  remove(instanceId) {
    const conn = this.connections.get(instanceId);
    if (!conn) return;
    conn.destroy();
    this.connections.delete(instanceId);
    this._syncHeartbeat();
  }

  destroyAll() {
    this.connections.forEach((c) => c.destroy());
    this.connections.clear();
    this.stopHeartbeat();
  }

  // Idempotent: exactly one interval exists at a time, however many connections
  // there are and however often this is called.
  startHeartbeat() {
    if (this._heartbeat !== null) return;
    this._heartbeat = this.setInterval_(() => this.tick(), this.heartbeatMs);
  }

  stopHeartbeat() {
    if (this._heartbeat === null) return;
    this.clearInterval_(this._heartbeat);
    this._heartbeat = null;
  }

  // Armed on the first live connection and released as soon as none is left.
  // Holding it open while everything is disconnected wakes the radio every 25s to
  // iterate an idle map, which is exactly the cost the shared heartbeat exists to
  // avoid. Called after anything that can change what is live.
  _syncHeartbeat() {
    if (this.hasLiveConnections()) this.startHeartbeat();
    else this.stopHeartbeat();
  }

  tick() {
    this.connections.forEach((conn) => conn.ping());
    this._sweepIdle();
    // A connection that died on its own - network loss, or a drained reconnect
    // ladder - never calls back into the manager, so the tick is where its death
    // releases the timer. Worst case that costs one extra wake-up.
    this._syncHeartbeat();
  }

  // Evaluated by timestamp comparison on the tick, never by a long setTimeout.
  // A one-hour timer in a backgrounded WebView may not fire at all; a missed
  // check here only delays the disconnect, which is harmless.
  _sweepIdle() {
    this.connections.forEach((conn, instanceId) => {
      if (!conn.isIdleSince(this.idleMs)) return;
      if (!this.isViewIdle(instanceId)) return;
      conn.disconnect('idle');
    });
  }
}
