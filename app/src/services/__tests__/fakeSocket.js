// Minimal stand-in for a browser WebSocket. Tests drive it directly, so every
// transition - including ones impossible to trigger reliably in a browser, like
// a close arriving after the connection was superseded - is reachable.
export const READY = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

export class FakeSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = READY.CONNECTING;
    this.sent = [];
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    FakeSocket.instances.push(this);
  }

  static reset() {
    FakeSocket.instances = [];
  }

  static get last() {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }

  send(data) {
    if (this.readyState !== READY.OPEN) throw new Error('send on non-open socket');
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000, reason = '') {
    if (this.readyState === READY.CLOSED) return;
    this.readyState = READY.CLOSED;
    this.onclose?.({ code, reason, wasClean: true });
  }

  // --- test drivers ---
  fireOpen() {
    this.readyState = READY.OPEN;
    this.onopen?.();
  }

  fireMessage(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  fireError() {
    this.onerror?.({});
  }

  // An abrupt drop: no clean handshake, which is what a terminate() looks like.
  fireAbruptClose(code = 1006) {
    this.readyState = READY.CLOSED;
    this.onclose?.({ code, reason: '', wasClean: false });
  }

  get lastSent() {
    return this.sent[this.sent.length - 1];
  }
}
