import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureDetector, swipeDistance, swipeSpeed, palmCentre } from '../js/gestures.js';

const FRAME = 33; // about 30 frames a second, like a webcam

// Plays a hand path through the detector and returns the actions it fires.
// Each move is { to, ms } (eased like a real hand), or { hold: ms } to stay
// still, or { gone: ms } for the hand dropping out of view. Optional y / toY
// and gesture apply per move.
function play(det, moves, start = { x: 0.5, y: 0.5 }) {
  const out = [];
  let t = 0, x = start.x, y = start.y;
  const feed = (hand, gesture = 'Open_Palm') => {
    const r = det.update({ t, hand, gesture, score: 0.9 });
    if (r) out.push(r);
    t += FRAME;
  };
  feed({ x, y });
  for (const m of moves) {
    if (m.hold !== undefined) {
      for (let e = 0; e < m.hold; e += FRAME) feed({ x, y }, m.gesture);
    } else if (m.gone !== undefined) {
      for (let e = 0; e < m.gone; e += FRAME) feed(null);
    } else {
      const x0 = x, y0 = y, y1 = m.toY ?? y;
      const n = Math.max(1, Math.round(m.ms / FRAME));
      for (let i = 1; i <= n; i++) {
        const f = (1 - Math.cos(Math.PI * i / n)) / 2; // ease in and out
        x = x0 + (m.to - x0) * f;
        y = y0 + (y1 - y0) * f;
        feed(m.dropAt === i ? null : { x, y }, m.gesture);
      }
    }
  }
  return out;
}

test('a right-to-left swipe turns to the next page once', () => {
  assert.deepEqual(play(new GestureDetector(), [{ to: 0.2, ms: 300 }], { x: 0.75, y: 0.5 }), ['next']);
});

test('a left-to-right swipe turns to the previous page once', () => {
  assert.deepEqual(play(new GestureDetector(), [{ to: 0.8, ms: 300 }], { x: 0.25, y: 0.5 }), ['prev']);
});

test('swiping and bringing the hand back turns only one page', () => {
  const det = new GestureDetector();
  assert.deepEqual(play(det, [
    { to: 0.2, ms: 300 },   // swipe
    { hold: 100 },
    { to: 0.75, ms: 350 },  // bring the hand back at a natural pace
  ], { x: 0.75, y: 0.5 }), ['next']);
});

test('a fast return right after the swipe is still ignored', () => {
  const det = new GestureDetector();
  assert.deepEqual(play(det, [
    { to: 0.2, ms: 250 },
    { to: 0.75, ms: 250 },
  ], { x: 0.75, y: 0.5 }), ['next']);
});

test('a slow wind-up before the swipe does not turn back a page', () => {
  const det = new GestureDetector();
  assert.deepEqual(play(det, [
    { to: 0.8, ms: 700 },   // move the hand into position
    { hold: 66 },
    { to: 0.25, ms: 300 },  // the swipe
  ], { x: 0.5, y: 0.5 }), ['next']);
});

test('the wind-up does not block the swipe that follows it', () => {
  const det = new GestureDetector();
  assert.deepEqual(play(det, [
    { to: 0.8, ms: 600 },
    { to: 0.2, ms: 300 },   // no pause between them
  ], { x: 0.5, y: 0.5 }), ['next']);
});

test('two swipes in a row turn two pages', () => {
  const det = new GestureDetector();
  assert.deepEqual(play(det, [
    { to: 0.2, ms: 300 },
    { to: 0.75, ms: 500 },  // return
    { hold: 300 },
    { to: 0.2, ms: 300 },   // second swipe
    { to: 0.75, ms: 500 },
  ], { x: 0.75, y: 0.5 }), ['next', 'next']);
});

test('a short glitch in tracking mid-swipe does not lose the swipe', () => {
  const det = new GestureDetector();
  assert.deepEqual(play(det, [{ to: 0.2, ms: 330, dropAt: 4 }], { x: 0.75, y: 0.5 }), ['next']);
});

test('a small or slow drift does not turn the page', () => {
  assert.deepEqual(play(new GestureDetector(), [{ to: 0.4, ms: 200 }], { x: 0.5, y: 0.5 }), []);
  assert.deepEqual(play(new GestureDetector(), [{ to: 0.2, ms: 2500 }], { x: 0.8, y: 0.5 }), []);
});

test('mostly vertical movement does not turn the page', () => {
  assert.deepEqual(play(new GestureDetector(), [{ to: 0.45, toY: 0.95, ms: 300 }], { x: 0.75, y: 0.05 }), []);
});

test('higher sensitivity accepts a smaller, slower swipe', () => {
  assert.ok(swipeDistance(10) < swipeDistance(1));
  assert.ok(swipeSpeed(10) < swipeSpeed(1));
  const small = [{ to: 0.42, ms: 300 }];
  assert.deepEqual(play(new GestureDetector({ sensitivity: 1 }), small, { x: 0.58, y: 0.5 }), []);
  assert.deepEqual(play(new GestureDetector({ sensitivity: 10 }), small, { x: 0.58, y: 0.5 }), ['next']);
});

test('swap direction reverses next and previous', () => {
  const det = new GestureDetector({ swapDirection: true });
  assert.deepEqual(play(det, [{ to: 0.2, ms: 300 }], { x: 0.75, y: 0.5 }), ['prev']);
});

test('a held fist pauses once, and a quick fist does not', () => {
  const det = new GestureDetector();
  const fist = (t) => det.update({ t, hand: { x: 0.5, y: 0.5 }, gesture: 'Closed_Fist', score: 0.9 });
  assert.equal(fist(0), null);
  assert.equal(fist(300), null);
  det.update({ t: 400, hand: { x: 0.5, y: 0.5 }, gesture: 'Open_Palm', score: 0.9 });
  assert.equal(fist(500), null);
  assert.equal(fist(1000), null);
  assert.equal(fist(1300), 'pause');
});

test('a moving fist never counts as a swipe', () => {
  assert.deepEqual(play(new GestureDetector(), [{ to: 0.2, ms: 300, gesture: 'Closed_Fist' }], { x: 0.75, y: 0.5 }), []);
});

test('palm centre is mirrored to match the preview', () => {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.4 }));
  const c = palmCentre(lm);
  assert.ok(Math.abs(c.x - 0.8) < 1e-9);
  assert.ok(Math.abs(c.y - 0.4) < 1e-9);
  assert.equal(palmCentre(null), null);
});

// Vertical moves: { to } is x, so keep x and move y with toY.
const vmove = (toY, ms, x = 0.5) => ({ to: x, toY, ms });

test('holding still, then swiping down, folds once', () => {
  assert.deepEqual(play(new GestureDetector(), [{ hold: 400 }, vmove(0.7, 300), { hold: 200 }], { x: 0.5, y: 0.3 }), ['down']);
});

test('holding still, then swiping up, opens once', () => {
  assert.deepEqual(play(new GestureDetector(), [{ hold: 400 }, vmove(0.3, 300), { hold: 200 }], { x: 0.5, y: 0.7 }), ['up']);
});

test('raising a hand into view is not a swipe up', () => {
  assert.deepEqual(play(new GestureDetector(), [vmove(0.3, 350), { hold: 300 }], { x: 0.5, y: 0.95 }), []);
});

test('lowering a hand out of view is not a swipe down', () => {
  assert.deepEqual(play(new GestureDetector(), [{ hold: 400 }, vmove(0.98, 300), { gone: 600 }], { x: 0.5, y: 0.4 }), []);
});

test('bringing the hand back up after a swipe down does not open again', () => {
  assert.deepEqual(play(new GestureDetector(), [
    { hold: 400 }, vmove(0.7, 300), { hold: 100 }, vmove(0.3, 350), { hold: 200 },
  ], { x: 0.5, y: 0.3 }), ['down']);
});

test('a sideways swipe never counts as up or down', () => {
  assert.deepEqual(play(new GestureDetector(), [{ hold: 400 }, { to: 0.2, toY: 0.6, ms: 300 }, { hold: 200 }], { x: 0.75, y: 0.45 }), ['next']);
});

test('a slow drift down does not fold', () => {
  assert.deepEqual(play(new GestureDetector(), [{ hold: 400 }, vmove(0.7, 2000), { hold: 200 }], { x: 0.5, y: 0.3 }), []);
});

// Real hand tracking jitters by a few thousandths of the frame every frame.
// Up and down used to fail under that; these replay the same swipes with
// jitter added.
function jittery(det, amount = 0.006) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  return {
    update: (f) => det.update(f.hand ? { ...f, hand: { x: f.hand.x + rnd() * amount, y: f.hand.y + rnd() * amount } } : f),
  };
}

test('with tracking jitter, holding still then swiping down folds', () => {
  assert.deepEqual(play(jittery(new GestureDetector()), [{ hold: 400 }, vmove(0.7, 300), { hold: 300 }], { x: 0.5, y: 0.35 }), ['down']);
});

test('with tracking jitter, holding still then swiping up opens', () => {
  assert.deepEqual(play(jittery(new GestureDetector()), [{ hold: 400 }, vmove(0.35, 300), { hold: 300 }], { x: 0.5, y: 0.7 }), ['up']);
});

test('with tracking jitter, a hand held still does nothing', () => {
  assert.deepEqual(play(jittery(new GestureDetector()), [{ hold: 5000 }], { x: 0.5, y: 0.5 }), []);
});
