export const CONNECTION_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  DESTROYED: 'destroyed',
});

const S = CONNECTION_STATES;

// A connection that still owns a socket or is actively trying to get one back.
// Callers use it for two decisions: "leave this one alone" and "something is
// still live". CONNECTING and RECONNECTING count - a connection in backoff has
// every intention of coming back.
export const isLiveConnectionState = (state) => (
  state === S.CONNECTING || state === S.CONNECTED || state === S.RECONNECTING
);

// Reasons that represent the client's own decision to stop. Only fresh user
// consent may undo one - see shouldConnect.
//
// 'refused' is deliberately absent. A relay that cannot satisfy set-instance
// (its cap is reached and nothing is evictable) is not the client deciding to
// stop, and the condition clears the moment the user frees an instance - which
// the tab has no way of hearing about. Leaving it non-sticky means the next
// foreground or tab selection opens exactly ONE fresh socket and finds out.
export const STICKY_DISCONNECT_REASONS = Object.freeze(['user', 'idle']);

/**
 * The one rule every (re)connect trigger asks before calling connect().
 *
 * Triggers differ on a single axis: whether the trigger is fresh user consent
 * (`userIntent: true` - selecting a tab, the reconnect button) or merely the app
 * noticing something (`userIntent: false` - a foreground, a mount, the active
 * tab changing because another was deleted).
 *
 * - No connection object yet, or one that is IDLE: open it.
 * - CONNECTING or CONNECTED with a socket still alive: leave it alone. A socket
 *   the OS closed without ever delivering a close event leaves the state saying
 *   CONNECTED while nothing can be sent - routine on Android, where the WebView
 *   is frozen while backgrounded - so isSocketGone() has the last word.
 *   DESTROYED can never be reopened.
 * - RECONNECTING is deliberately reconnectable. connect() cancels the pending
 *   retry and starts a fresh ladder, so a resume mid-backoff comes back at once
 *   instead of waiting out a 16s rung.
 * - DISCONNECTED for a sticky reason stays down unless there is user intent.
 *   Without that gate every app foreground resurrects the session the user just
 *   stopped; the reason is then written but never read, and "disconnect sticks"
 *   rests on the absence of triggers instead of on a rule.
 * - DISCONNECTED for any other reason ('dropped', or null after a socketFactory
 *   throw) is an involuntary loss, so it reconnects on its own.
 */
export const shouldConnect = (conn, { userIntent = false } = {}) => {
  if (!conn) return true;
  if (conn.state === S.DESTROYED) return false;
  if ((conn.state === S.CONNECTING || conn.state === S.CONNECTED) && !conn.isSocketGone()) {
    return false;
  }
  if (!userIntent && STICKY_DISCONNECT_REASONS.includes(conn.disconnectReason)) {
    return false;
  }
  return true;
};

// WebSocket.CLOSING / CLOSED as numbers: this module is unit-tested in a node
// environment that has no global WebSocket.
const WS_CLOSING = 2;
const WS_CLOSED = 3;

export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
export const MAX_RECONNECT_ATTEMPTS = 5;
export const CONNECTION_TIMEOUT = 10000;
export const HEARTBEAT_TIMEOUT = 5000;

/**
 * How long a resume probe waits for a pong before declaring the socket dead.
 *
 * Much shorter than HEARTBEAT_TIMEOUT because the situation is different: the
 * heartbeat is a background health check on a connection with no reason to be
 * suspect, while a resume follows a period where the socket was frozen and may
 * have been killed without a close event ever being delivered. The user is
 * looking at the screen waiting for it, so the cost of waiting is visible and
 * the cost of being wrong is one extra reconnect.
 */
export const RESUME_PROBE_TIMEOUT = 2000;

/**
 * A connect younger than this when the page resumes is left alone.
 *
 * Without it, two visibilitychange events in quick succession (or a resume that
 * lands moments after a legitimate connect started) would tear down an in-flight
 * socket and reopen it every time, so a connect might never get the ~100-300ms
 * it needs to finish. Anything older than this has been pending across the
 * background and is the stalled case worth replacing.
 */
export const RESUME_STALE_CONNECT_MS = 1000;

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
    // No default: a connection whose handshake payload is missing throws inside
    // onopen, never sends set-instance, and burns the whole reconnect ladder
    // before settling on disconnected ~41s later. Fail here instead, where the
    // caller that forgot it is still on the stack.
    if (typeof getHandshakePayload !== 'function') {
      throw new TypeError('InstanceConnection requires a getHandshakePayload function');
    }

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
    // When the current socket was opened, read only by resume() and only while
    // CONNECTING. 0 means no connect has ever started, which is not a state
    // resume() reads this in.
    this._openedAt = 0;
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

  // An externally requested connect: tab select, app resume, an explicit user
  // action. Fresh intent starts a NEW ladder, because the previous ladder's
  // attempts say nothing about whether this one can succeed - without the reset,
  // a resume from background after the ladder drained gets a single attempt and
  // then gives up permanently.
  connect() {
    if (this.state === S.DESTROYED) return;
    if (this.state === S.CONNECTING || this.state === S.CONNECTED) {
      if (!this.isSocketGone()) return;
      // The state says connected but the socket is not: it was closed without a
      // close event ever reaching us. Clear the corpse out first so the fresh
      // open is not racing a socket that may still deliver one.
      this._clearAllTimers();
      this._teardownSocket();
    }
    this.attempts = 0;
    this._open();
  }

  // Whether this connection's socket can still carry traffic. Only meaningful
  // while the state claims CONNECTING or CONNECTED; in every other state there
  // is no socket, and the state itself already says so.
  isSocketGone() {
    if (!this.ws) return true;
    return this.ws.readyState === WS_CLOSING || this.ws.readyState === WS_CLOSED;
  }

  // The ladder's own retry. Deliberately does NOT touch attempts: that is what
  // bounds a deterministic handshake failure. Resetting the counter on every
  // open is what made such a failure retry forever.
  _open() {
    if (this.state === S.DESTROYED) return;
    this._clearReconnectTimer();
    this.disconnectReason = null;

    this._setState(S.CONNECTING);
    this._openedAt = this.clock();

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

    // No onerror handler on purpose. The browser always follows a socket error
    // with a close, so onclose is where the drop is handled; an onerror that only
    // stashed a string would be overwritten by that close, and nothing renders
    // this connection's `error` anyway - the UI shows ptyError. Adding one back
    // means plumbing the message through _drop, not assigning it here.
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
    // The relay's refusal of set-instance: its cap is reached and nothing is
    // evictable, so no PTY manager was bound to that socket and no pty-status
    // will ever follow. Handled ahead of the handshake check below, and only
    // while CONNECTING - mid-session the state is CONNECTED and an ordinary
    // pty-error (a CLI that failed to spawn) must leave the connection alone.
    if (message.type === 'pty-error' && message.handshakeFailed && this.state === S.CONNECTING) {
      this._refuse(message.message || 'The relay refused this instance');
    }
    // The handshake completes on the relay's answer to set-instance, not on
    // socket open: a socket that opens but never completes set-instance is not
    // connected. That answer is a pty-status and nothing else. A pty-error is
    // NOT one: on the refusal path the relay binds no manager and never clears
    // skipUntilReplay, so treating it as a completed handshake parks the tab in
    // CONNECTED over a socket that can never carry PTY output - and CONNECTED
    // is the one state from which nothing reconnects (shouldConnect leaves it
    // alone, StatusBar hides Reconnect). _refuse above is what ends that
    // attempt instead.
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

  // timeoutMs is the pong deadline. The default is the background health check;
  // resume() passes a much shorter one - see RESUME_PROBE_TIMEOUT.
  ping(timeoutMs = HEARTBEAT_TIMEOUT) {
    if (this.state !== S.CONNECTED) return;
    // A ping that cannot be sent is evidence the socket is gone. Returning here
    // arms no pong timer, so nothing else would ever notice: shouldConnect
    // leaves CONNECTED alone and the heartbeat keeps ticking over a dead socket.
    if (!this.send({ type: 'ping' })) {
      this._drop('Ping failed');
      return;
    }
    this._clearPongTimer();
    this._pongTimer = this.setTimer(() => {
      this._pongTimer = null;
      this._drop('Heartbeat timeout');
    }, timeoutMs);
  }

  /**
   * The page has just come back to the foreground.
   *
   * This exists because readyState lies exactly when it matters. A socket
   * killed while the page was frozen often never delivers a close event, so it
   * still reports OPEN or CONNECTING - which means isSocketGone() is false,
   * shouldConnect() says "leave it alone", and nothing touches the connection.
   * Observed cost of relying on the ordinary machinery to notice: the relay saw
   * no attempt at all for 11 seconds after a resume, because the only thing
   * that could rescue a stalled CONNECTING socket was its 10s connect timeout.
   * The user sees "Reconnecting" doing nothing and taps the tab to force it.
   *
   * So resume() does not ask the socket whether it is alive; it uses what the
   * lifecycle event already tells us, per state:
   *
   * - CONNECTED: probe. The socket may well be fine, and recycling every
   *   healthy connection on every glance at another browser tab would cost a
   *   reconnect and a full replay each time. A ping with a 2s deadline settles
   *   it without disturbing a live one.
   * - CONNECTING: a connect that has been pending across a background is not
   *   going to complete - it is the stalled case above. Replace it outright
   *   rather than waiting out the connect timeout. Fresh connects are exempt
   *   (RESUME_STALE_CONNECT_MS) so repeated resumes cannot starve one.
   * - anything else: defer to shouldConnect, which cancels a pending ladder
   *   rung and reopens at once, and still leaves a user-stopped session alone.
   */
  resume() {
    if (this.state === S.DESTROYED) return;

    if (this.state === S.CONNECTED) {
      this.ping(RESUME_PROBE_TIMEOUT);
      return;
    }

    if (this.state === S.CONNECTING) {
      if (this.clock() - this._openedAt < RESUME_STALE_CONNECT_MS) return;
      this._clearAllTimers();
      this._teardownSocket();
      this.attempts = 0;
      this._open();
      return;
    }

    if (shouldConnect(this)) this.connect();
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

  /**
   * A set-instance the relay answered but could not satisfy.
   *
   * Not _drop: the ladder exists for losses a retry might fix, and this one is
   * deterministic until the user frees an instance on the relay. Five 10s
   * connect timeouts and a 1/2/4/8/16s ladder would spend a minute rediscovering
   * an answer already in hand, with a blank terminal throughout.
   *
   * Not CONNECTED either, which is the trap this replaces: that state tells
   * shouldConnect to leave the connection alone, hides StatusBar's Reconnect
   * button and enables the composer, all over a socket the relay bound nothing
   * to - every way back closed at once.
   *
   * DISCONNECTED is what keeps the tab recoverable. It is terminal only until
   * the user acts: the Reconnect button calls connect() directly, selecting the
   * tab connects with intent, and because 'refused' is not sticky an app
   * foreground sweeps it up too. Each of those opens exactly one socket and
   * either succeeds or is refused again - there is no timer here, so nothing
   * repeats on its own.
   *
   * The reason itself reaches the UI through the pty-error frame that carried
   * it: _handleMessage still forwards that to onMessage, which is what puts
   * "Maximum instances (3) reached" on screen.
   */
  _refuse(error) {
    this._clearAllTimers();
    this._teardownSocket();
    this._setState(S.DISCONNECTED, { disconnectReason: 'refused', error });
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
      this._open();
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
