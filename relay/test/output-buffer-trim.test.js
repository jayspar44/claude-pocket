const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');
const config = require('../src/config');

// appendToBuffer used to hoist the line count out of its own trim loop:
//
//     const lineCount = this.outputBuffer.join('').split('\n').length;
//     while (lineCount > config.buffer.maxLines && this.outputBuffer.length > 1) {
//
// lineCount is loop-invariant, so the first append that crossed maxLines
// shifted until only one chunk was left. The buffer did not trim to the cap,
// it emptied - and every later append that re-crossed the cap emptied it
// again. Replayed scrollback became whatever had arrived since the last
// collapse, which is why history cut off mid-message.
//
// A manager with no currentWorkingDir has no persist path, so scheduleSave()
// is a no-op and these tests touch no disk.
const newManager = (id) => new PtyManager(id, 'claude');
const countNewlines = (s) => (s.match(/\n/g) || []).length;

test('crossing maxLines trims to the cap instead of emptying the buffer', () => {
  const pm = newManager('buffer-trim-lines');
  const total = config.buffer.maxLines + 1500;

  for (let i = 1; i <= total; i++) pm.appendToBuffer(`line ${i}\n`);

  // The defect left exactly one chunk here.
  assert.ok(
    pm.outputBuffer.length > config.buffer.maxLines * 0.9,
    `expected the buffer to stay near the cap, got ${pm.outputBuffer.length} chunks`,
  );
  assert.ok(pm.outputBufferLines <= config.buffer.maxLines, 'cap must still be honoured');

  const joined = pm.outputBuffer.join('');
  assert.ok(joined.endsWith(`line ${total}\n`), 'newest output is retained');
  assert.ok(!joined.includes('line 1\n'), 'oldest output is evicted');
});

test('the tracked counters stay exact across many trims', () => {
  const pm = newManager('buffer-trim-counters');

  // Mix multi-line chunks with the newline-free redraw bursts a TUI emits, so
  // the counters are exercised on chunks that do and do not move the line count.
  for (let i = 0; i < 4000; i++) {
    pm.appendToBuffer(i % 3 === 0 ? 'a\nb\nc\n' : '\x1b[2Kredraw');
  }

  const joined = pm.outputBuffer.join('');
  assert.equal(pm.outputBufferLines, countNewlines(joined), 'line counter drifted');
  assert.equal(pm.outputBufferSize, joined.length, 'size counter drifted');
  assert.equal(pm.getStatus().bufferLines, pm.outputBufferLines);
  assert.equal(pm.getStatus().bufferSize, pm.outputBufferSize);
});

test('the size cap still trims when the output carries no newlines', () => {
  const original = config.buffer.maxSize;
  config.buffer.maxSize = 50_000;
  try {
    const pm = newManager('buffer-trim-size');
    for (let i = 0; i < 500; i++) pm.appendToBuffer('x'.repeat(500));

    assert.ok(pm.outputBufferSize <= config.buffer.maxSize, 'size cap must bind');
    assert.equal(pm.outputBufferSize, pm.outputBuffer.join('').length);
    assert.equal(pm.outputBufferLines, 0);
  } finally {
    config.buffer.maxSize = original;
  }
});

test('a single chunk larger than the cap is kept rather than dropped', () => {
  const pm = newManager('buffer-trim-single');
  pm.appendToBuffer('z\n'.repeat(config.buffer.maxLines * 2));

  assert.equal(pm.outputBuffer.length, 1, 'the last chunk is never shifted away');
  assert.notEqual(pm.getBufferedOutput(), '', 'output must survive');
});

test('clearBuffer resets every counter', () => {
  const pm = newManager('buffer-trim-clear');
  pm.appendToBuffer('a\nb\n');
  pm.clearBuffer();

  assert.equal(pm.outputBuffer.length, 0);
  assert.equal(pm.outputBufferSize, 0);
  assert.equal(pm.outputBufferLines, 0);
});
