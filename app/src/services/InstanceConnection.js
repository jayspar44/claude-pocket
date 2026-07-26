export const CONNECTION_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  DESTROYED: 'destroyed',
});

const S = CONNECTION_STATES;

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
  }) {
    this.instanceId = instanceId;
    this.url = url;
    this.getHandshakePayload = getHandshakePayload;
    this.socketFactory = socketFactory;
    this.clock = clock;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;

    this.state = S.IDLE;
    this.disconnectReason = null;
    this.error = null;
    this.ws = null;
    this.lastActivityAt = clock();
    this.ptyProcessing = false;
  }

  _setState(state, { disconnectReason = null, error = null } = {}) {
    this.state = state;
    this.disconnectReason = disconnectReason;
    this.error = error;
    this.onStateChange(this.instanceId, { state, disconnectReason, error });
  }

  connect() {
    if (this.state === S.DESTROYED) return;
    if (this.state === S.CONNECTING || this.state === S.CONNECTED) return;

    this._setState(S.CONNECTING);

    let ws;
    try {
      ws = this.socketFactory(this.url);
    } catch (err) {
      this._setState(S.DISCONNECTED, { error: err.message });
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      ws.send(JSON.stringify({
        type: 'set-instance',
        instanceId: this.instanceId,
        ...this.getHandshakePayload(),
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
      if (this.ws !== ws) return;
    };
  }

  _handleMessage(message) {
    // The handshake completes on pty-status, not on socket open. A socket that
    // opens but never completes set-instance is not connected.
    if (message.type === 'pty-status' && this.state === S.CONNECTING) {
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
}
