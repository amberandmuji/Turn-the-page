import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PinchGrab, pinchRatio } from '../js/pinch.js';

// A hand with the palm 0.2 tall, centred at (cx, cy) in camera space, and the
// thumb and index tips `gap` apart (as a share of the palm length).
function hand(cx, cy, gap) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  lm[0] = { x: cx, y: cy + 0.1 };
  lm[9] = { x: cx, y: cy - 0.1 };
  lm[4] = { x: cx - (gap * 0.2) / 2, y: cy - 0.12 };
  lm[8] = { x: cx + (gap * 0.2) / 2, y: cy - 0.12 };
  return lm;
}

test('pinchRatio measures the fingertip gap in palm lengths', () => {
  assert.ok(Math.abs(pinchRatio(hand(0.5, 0.5, 0.6)) - 0.6) < 1e-9);
});

test('an open hand never grabs', () => {
  const p = new PinchGrab();
  for (let t = 0; t < 1000; t += 33) assert.equal(p.update({ t, landmarks: hand(0.5, 0.5, 0.8) }).state, 'open');
});

test('a held pinch grabs without a jump, then drags with the hand', () => {
  const p = new PinchGrab();
  p.update({ t: 0, landmarks: hand(0.5, 0.5, 0.1) });
  const grab = p.update({ t: 33, landmarks: hand(0.5, 0.5, 0.1) });
  assert.equal(grab.state, 'grab');
  assert.equal(grab.dx, 0);
  let total = 0;
  // The camera sees the hand move left, which is right on the mirrored screen.
  for (let i = 1; i <= 10; i++) total += p.update({ t: 33 + i * 33, landmarks: hand(0.5 - i * 0.01, 0.5, 0.1) }).dx;
  assert.ok(total > 0.05, `dragged ${total}`);
});

test('opening the fingers lets go and keeps the flick speed', () => {
  const p = new PinchGrab();
  let t = 0;
  for (let i = 0; i < 6; i++, t += 33) p.update({ t, landmarks: hand(0.5 - i * 0.02, 0.5, 0.1) });
  assert.equal(p.update({ t, landmarks: hand(0.4, 0.5, 0.7) }).state, 'open');
  assert.ok(p.velocity.x > 0.2, `velocity ${p.velocity.x}`);
});

test('a half-open pinch stays grabbed (no flicker)', () => {
  const p = new PinchGrab();
  p.update({ t: 0, landmarks: hand(0.5, 0.5, 0.1) });
  p.update({ t: 33, landmarks: hand(0.5, 0.5, 0.1) });
  assert.equal(p.update({ t: 66, landmarks: hand(0.5, 0.5, 0.38) }).state, 'grab');
});

test('losing the hand for a moment keeps hold, for longer lets go', () => {
  const p = new PinchGrab();
  p.update({ t: 0, landmarks: hand(0.5, 0.5, 0.1) });
  p.update({ t: 33, landmarks: hand(0.5, 0.5, 0.1) });
  assert.equal(p.update({ t: 100, landmarks: null }).state, 'grab');
  assert.equal(p.update({ t: 400, landmarks: null }).state, 'none');
});
