import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandWatch, frameStats } from '../js/handwatch.js';

const FRAME = 33;

// Feeds frames for `ms` and returns the last warning.
function run(watch, ms, frame, start = 0) {
  let last = null;
  for (let t = start; t < start + ms; t += FRAME) last = watch.update({ t, ...frame });
  return last;
}

test('a well-lit, still room with no hand gives no warning', () => {
  assert.equal(run(new HandWatch(), 5000, { hand: null, light: 0.4, motion: 0.005 }), null);
});

test('a dark picture warns after a moment, and clears once it is bright again', () => {
  const w = new HandWatch();
  assert.equal(run(w, 1000, { hand: null, light: 0.05 }), null);
  assert.equal(run(w, 1000, { hand: null, light: 0.05 }, 1000), 'dark');
  assert.equal(run(w, 300, { hand: null, light: 0.13 }, 2000), 'dark'); // not bright enough yet
  assert.equal(run(w, 300, { hand: null, light: 0.3 }, 2300), null);
});

test('a dim picture where the hand is still found gives no warning', () => {
  const w = new HandWatch();
  assert.equal(run(w, 3000, { hand: { x: 0.5, y: 0.5 }, light: 0.06 }), null);
});

test('movement with no hand found warns that the hand can\'t be seen', () => {
  const w = new HandWatch();
  assert.equal(run(w, 400, { hand: null, light: 0.4, motion: 0.08 }), null);
  assert.equal(run(w, 600, { hand: null, light: 0.4, motion: 0.08 }, 400), 'lost');
  // Stays up briefly after the movement stops, then clears.
  assert.equal(run(w, 1000, { hand: null, light: 0.4, motion: 0 }, 1000), 'lost');
  assert.equal(run(w, 3000, { hand: null, light: 0.4, motion: 0 }, 2000), null);
});

test('finding the hand clears a warning straight away', () => {
  const w = new HandWatch();
  run(w, 1500, { hand: null, light: 0.4, motion: 0.08 });
  assert.equal(w.update({ t: 1600, hand: { x: 0.5, y: 0.5 }, light: 0.4, motion: 0.08 }), null);
});

test('a hand that slips out of the side without turning the page warns', () => {
  const w = new HandWatch();
  run(w, 300, { hand: { x: 0.95, y: 0.5 }, light: 0.4 });
  assert.equal(w.update({ t: 400, hand: null, light: 0.4 }), 'edge');
  assert.equal(run(w, 3000, { hand: null, light: 0.4 }, 433), null);
});

test('a hand leaving the side after a page turn, or through the bottom, is fine', () => {
  const w = new HandWatch();
  run(w, 300, { hand: { x: 0.05, y: 0.5 }, light: 0.4 });
  w.turned(250);
  assert.equal(w.update({ t: 400, hand: null, light: 0.4 }), null);

  const low = new HandWatch();
  run(low, 300, { hand: { x: 0.5, y: 0.97 }, light: 0.4 });
  assert.equal(low.update({ t: 400, hand: null, light: 0.4 }), null);
});

test('frameStats measures brightness and change between frames', () => {
  const grey = (v) => new Uint8ClampedArray(16).fill(v).map((x, i) => (i % 4 === 3 ? 255 : x));
  const a = frameStats(grey(51), null);
  assert.ok(Math.abs(a.light - 0.2) < 0.001);
  assert.equal(a.motion, 0);
  const b = frameStats(grey(102), a.luma);
  assert.ok(Math.abs(b.motion - 0.2) < 0.001);
});
