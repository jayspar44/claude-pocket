import { InstanceConnection, CONNECTION_STATES } from './InstanceConnection';

export const HEARTBEAT_INTERVAL = 25000;
export const IDLE_DISCONNECT_MS = 3600000;   // 1 hour
export const DEFAULT_MAX_INSTANCES = 10;

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
  }

  disconnect(instanceId, reason = 'user') {
    this.connections.get(instanceId)?.disconnect(reason);
  }

  disconnectAll(reason = 'user') {
    this.connections.forEach((conn) => conn.disconnect(reason));
  }

  send(instanceId, message) {
    return this.connections.get(instanceId)?.send(message) ?? false;
  }

  connectedCount() {
    let n = 0;
    this.connections.forEach((c) => {
      if (c.state === CONNECTION_STATES.CONNECTED) n += 1;
    });
    return n;
  }

  remove(instanceId) {
    const conn = this.connections.get(instanceId);
    if (!conn) return;
    conn.destroy();
    this.connections.delete(instanceId);
  }

  destroyAll() {
    this.connections.forEach((c) => c.destroy());
    this.connections.clear();
    this.stopHeartbeat();
  }

  startHeartbeat() {
    if (this._heartbeat !== null) return;
    this._heartbeat = this.setInterval_(() => this.tick(), this.heartbeatMs);
  }

  stopHeartbeat() {
    if (this._heartbeat === null) return;
    this.clearInterval_(this._heartbeat);
    this._heartbeat = null;
  }

  tick() {
    this.connections.forEach((conn) => conn.ping());
    this._sweepIdle();
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
