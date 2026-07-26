export const CONNECTION_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  DESTROYED: 'destroyed',
});

const S = CONNECTION_STATES;

export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
export const MAX_RECONNECT_ATTEMPTS = 5;
export const CONNECTION_TIMEOUT = 10000;
export const HEARTBEAT_TIMEOUT = 5000;

/**
 * Owns exactly one WebSocket for one instance, plus every timer belonging to it.
 *
 * The object IS the reference to its socket. Nothing keys off a map entry that
 * could be deleted while the socket is still open, and handlers are bound to
 * this instance - so a socket from a previous connection cannot reach a live
 * handler. That is what makes a leaked socket structurally impossible, rather
 * than something to be detected after the fact.
 */
export class InstanceConnection {
  constructor({
    instanceId,
    url,
    getHandshakePayload,
    socketFactory = (u) => new WebSocket(u),
    clock = () => Date.now(),
    onStateChange = () => {},
    onMessage = () => {},
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
  }) {
    this.instanceId = instanceId;
    this.url = url;
    this.getHandshakePayload = getHandshakePayload;
    this.socketFactory = socketFactory;
    this.clock = clock;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;

    this.state = S.IDLE;
    this.disconnectReason = null;
    this.error = null;
    this.ws = null;
    this.lastActivityAt = clock();
    this.ptyProcessing = false;
    this.attempts = 0;
    this._connectTimer = null;
    this._reconnectTimer = null;
    this._pongTimer = null;
  }

  _setState(state, { disconnectReason = null, error = null } = {}) {
    this.state = state;
    this.disconnectReason = disconnectReason;
    this.error = error;
    this.onStateChange(this.instanceId, { state, disconnectReason, error });
  }

  // The client's own decision to stop. 'user' = explicit action; 'idle' = the
  // idle sweep. Neither reconnects on its own; selecting the tab does.
  disconnect(reason = 'user') {
    if (this.state === S.DESTROYED) return;
    this._clearAllTimers();
    this._teardownSocket();
    this._setState(S.DISCONNECTED, { disconnectReason: reason });
  }

  connect() {
    if (this.state === S.DESTROYED) return;
    if (this.state === S.CONNECTING || this.state === S.CONNECTED) return;
    this._clearReconnectTimer();
    this.disconnectReason = null;

    this._setState(S.CONNECTING);

    let ws;
    try {
      ws = this.socketFactory(this.url);
    } catch (err) {
      this._setState(S.DISCONNECTED, { error: err.message });
      return;
    }
    this.ws = ws;

    // Covers open AND handshake: a socket that opens but never completes
    // set-instance must not sit in connecting forever.
    this._connectTimer = this.setTimer(() => {
      if (this.ws !== ws) return;
      this._drop('Connection timeout');
    }, CONNECTION_TIMEOUT);

    ws.onopen = () => {
      if (this.ws !== ws) return;
      ws.send(JSON.stringify({
        ...this.getHandshakePayload(),
        type: 'set-instance',
        instanceId: this.instanceId,
      }));
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this._handleMessage(message);
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
    };

    ws.onclose = () => {
      // A close event can arrive long after this socket was superseded, which is
      // routine on mobile. Only the current socket may change state.
      if (this.ws !== ws) return;
      this._drop();
    };
  }

  _handleMessage(message) {
    if (message.type === 'pong') {
      this._clearPongTimer();
      return;
    }
    // The handshake completes on pty-status, not on socket open. A socket that
    // opens but never completes set-instance is not connected.
    if (message.type === 'pty-status' && this.state === S.CONNECTING) {
      this._clearConnectTimer();
      this.attempts = 0;   // reset on handshake, never on open
      this._setState(S.CONNECTED);
    }
    if (message.type === 'output' || message.type === 'replay') {
      this.lastActivityAt = this.clock();
    }
    if (message.type === 'pty-status') {
      this.ptyProcessing = Boolean(message.processingStartTime);
    }
    this.onMessage(this.instanceId, message);
  }

  send(message) {
    if (this.state !== S.CONNECTED || !this.ws) return false;
    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  ping() {
    if (this.state !== S.CONNECTED) return;
    if (!this.send({ type: 'ping' })) return;
    this._clearPongTimer();
    this._pongTimer = this.setTimer(() => {
      this._pongTimer = null;
      this._drop('Heartbeat timeout');
    }, HEARTBEAT_TIMEOUT);
  }

  // Pure over what this connection itself observes. The two view-related idle
  // conditions are React state and belong to the caller, which ANDs them in.
  isIdleSince(thresholdMs) {
    if (this.state !== S.CONNECTED) return false;
    if (this.ptyProcessing) return false;
    return this.clock() - this.lastActivityAt >= thresholdMs;
  }

  destroy() {
    if (this.state === S.DESTROYED) return;
    this._clearAllTimers();
    this._teardownSocket();
    this.state = S.DESTROYED;
    this.disconnectReason = null;
  }

  _clearConnectTimer() {
    if (this._connectTimer !== null) {
      this.clearTimer(this._connectTimer);
      this._connectTimer = null;
    }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer !== null) {
      this.clearTimer(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _clearPongTimer() {
    if (this._pongTimer !== null) {
      this.clearTimer(this._pongTimer);
      this._pongTimer = null;
    }
  }

  _clearAllTimers() {
    this._clearConnectTimer();
    this._clearReconnectTimer();
    this._clearPongTimer();
  }

  // Involuntary loss of the socket: network, relay restart, heartbeat timeout,
  // connect timeout, or a clean close the relay initiated. All reconnect.
  _drop(error = null) {
    this._clearAllTimers();
    this._teardownSocket();

    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) {
      this._setState(S.DISCONNECTED, {
        disconnectReason: 'dropped',
        error: 'Connection failed after multiple attempts',
      });
      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(this.attempts, RECONNECT_DELAYS.length - 1)];
    this.attempts += 1;
    this._setState(S.RECONNECTING, { disconnectReason: 'dropped', error });
    this._reconnectTimer = this.setTimer(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _teardownSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try {
      ws.close(1000, 'Replaced');
    } catch {
      // Already closed.
    }
  }
}
