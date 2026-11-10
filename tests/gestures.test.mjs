import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureDetector, swipeDistance, palmCentre } from '../js/gestures.js';

// Feeds a hand moving from x0 to x1 over durationMs, one frame every 33 ms.
function sweep(det, { from, to, startT = 0, durationMs = 250, y0 = 0.5, y1 = 0.5, gesture = 'Open_Palm' }) {
  const out = [];
  const steps = Math.max(1, Math.round(durationMs / 33));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const r = det.update({
      t: startT + f * durationMs,
      hand: { x: from + (to - from) * f, y: y0 + (y1 - y0) * f },
      gesture,
      score: 0.9,
    });
    if (r) out.push(r);
  }
  return out;
}

test('right-to-left swipe turns to the next page', () => {
  assert.deepEqual(sweep(new GestureDetector(), { from: 0.75, to: 0.3 }), ['next']);
});

test('left-to-right swipe turns to the previous page', () => {
  assert.deepEqual(sweep(new GestureDetector(), { from: 0.3, to: 0.75 }), ['prev']);
});

test('a small or slow drift does not turn the page', () => {
  assert.deepEqual(sweep(new GestureDetector(), { from: 0.5, to: 0.4 }), []);
  assert.deepEqual(sweep(new GestureDetector(), { from: 0.8, to: 0.2, durationMs: 3000 }), []);
});

test('mostly vertical movement does not turn the page', () => {
  const det = new GestureDetector();
  assert.deepEqual(sweep(det, { from: 0.7, to: 0.4, y0: 0.1, y1: 0.9 }), []);
});

test('one swipe turns exactly one page, and the cooldown blocks the return stroke', () => {
  const det = new GestureDetector();
  const first = sweep(det, { from: 0.8, to: 0.2 });
  const back = sweep(det, { from: 0.2, to: 0.8, startT: 300 });
  assert.deepEqual(first, ['next']);
  assert.deepEqual(back, []);
  const later = sweep(det, { from: 0.8, to: 0.2, startT: 2000 });
  assert.deepEqual(later, ['next']);
});

test('higher sensitivity accepts a smaller swipe', () => {
  assert.ok(swipeDistance(10) < swipeDistance(1));
  assert.deepEqual(sweep(new GestureDetector({ sensitivity: 1 }), { from: 0.6, to: 0.4 }), []);
  assert.deepEqual(sweep(new GestureDetector({ sensitivity: 10 }), { from: 0.6, to: 0.4 }), ['next']);
});

test('a held fist pauses once, and a quick fist does not', () => {
  const det = new GestureDetector();
  const fist = (t) => det.update({ t, hand: { x: 0.5, y: 0.5 }, gesture: 'Closed_Fist', score: 0.9 });
  assert.equal(fist(0), null);
  assert.equal(fist(300), null);
  // Hand opens before the hold time: no pause, and the timer restarts.
  det.update({ t: 400, hand: { x: 0.5, y: 0.5 }, gesture: 'Open_Palm', score: 0.9 });
  assert.equal(fist(500), null);
  assert.equal(fist(1000), null);
  assert.equal(fist(1300), 'pause');
});

test('a moving fist never counts as a swipe', () => {
  const det = new GestureDetector();
  assert.deepEqual(sweep(det, { from: 0.8, to: 0.2, gesture: 'Closed_Fist', durationMs: 200 }), []);
});

test('losing the hand clears the swipe in progress', () => {
  const det = new GestureDetector();
  det.update({ t: 0, hand: { x: 0.8, y: 0.5 }, gesture: 'None', score: 0 });
  det.update({ t: 100, hand: null, gesture: 'None', score: 0 });
  assert.equal(det.update({ t: 200, hand: { x: 0.2, y: 0.5 }, gesture: 'None', score: 0 }), null);
});

test('palm centre is mirrored to match the preview', () => {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.4 }));
  const c = palmCentre(lm);
  assert.ok(Math.abs(c.x - 0.8) < 1e-9);
  assert.ok(Math.abs(c.y - 0.4) < 1e-9);
  assert.equal(palmCentre(null), null);
});
