// Pinch to grab a zoomed-in page and drag it around. Pure logic with no
// browser APIs, so it can be tested in Node.
//
// Touch the tips of your thumb and index finger together to grab the page,
// move your hand to drag it, and open your fingers to let go.
//
// update({ t, landmarks }) takes MediaPipe's 21 hand landmarks (or null) and
// returns { state, x, y, dx, dy }:
//   state: 'none' (no hand), 'open' (hand seen, not pinching) or 'grab'
//   x, y:  the pinch point in 0..1, mirrored like the camera preview
//   dx, dy: how far to move the page since the last frame, else 0
//
// Keeping it steady
// -----------------
// The page follows the palm, not the fingertips. Fingertips move on their
// own as you pinch and let go, and following them made the page slide away
// just as you finished a drag. The palm only moves when your hand does.
// On top of that:
//   - as soon as the fingers start to part, the page holds still, so the
//     let-go itself never moves it;
//   - tiny movements (tracking jitter, a hand that isn't perfectly still)
//     are ignored, so a held page doesn't wobble;
//   - letting go stops the page where it is. No momentum.

export const PINCH_DEFAULTS = {
  closeRatio: 0.28,  // fingertips this close (in palm lengths) is a pinch ...
  holdRatio: 0.34,   // ... past this they're parting: the page stops moving ...
  openRatio: 0.45,   // ... and past this it's let go
  holdFrames: 2,     // frames the pinch must be held before it grabs
  smoothing: 0.4,    // weight of the newest position
  deadband: 0.004,   // movement smaller than this (share of the frame) is ignored
  gapMs: 250,        // a hand missing this long lets go
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Thumb-to-index gap as a share of the palm's length, so it doesn't depend
// on how far you sit from the camera.
export function pinchRatio(landmarks) {
  if (!landmarks || landmarks.length < 21) return Infinity;
  const palm = dist(landmarks[0], landmarks[9]) || 1e-6;
  return dist(landmarks[4], landmarks[8]) / palm;
}

export class PinchGrab {
  constructor(options = {}) {
    this.opts = { ...PINCH_DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.grabbing = false;
    this.closeFrames = 0;
    this.pos = null;       // smoothed palm { x, y }
    this.anchor = null;    // palm position the page was last moved to match
    this.dot = null;       // smoothed pinch point, for the on-screen ring
    this.lastSeen = -Infinity;
  }

  release() {
    this.grabbing = false;
    this.closeFrames = 0;
    this.anchor = null;
  }

  update({ t, landmarks }) {
    const o = this.opts;
    const none = (state) => ({ state, x: this.dot?.x ?? 0, y: this.dot?.y ?? 0, dx: 0, dy: 0 });
    if (!landmarks || landmarks.length < 21) {
      if (t - this.lastSeen > o.gapMs) {
        if (this.grabbing) this.release();
        this.pos = null;
        this.dot = null;
      }
      return none(this.grabbing ? 'grab' : 'none');
    }
    this.lastSeen = t;

    const a = o.smoothing;
    const ease = (prev, next) => (prev ? { x: a * next.x + (1 - a) * prev.x, y: a * next.y + (1 - a) * prev.y } : next);
    // Palm: wrist and the bases of the index and little fingers, mirrored.
    const palm = {
      x: 1 - (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3,
      y: (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3,
    };
    this.pos = ease(this.pos, palm);
    this.dot = ease(this.dot, { x: 1 - (landmarks[4].x + landmarks[8].x) / 2, y: (landmarks[4].y + landmarks[8].y) / 2 });

    const ratio = pinchRatio(landmarks);
    if (this.grabbing) {
      if (ratio > o.openRatio) {
        this.release();
        return none('open');
      }
    } else if (ratio < o.closeRatio) {
      this.closeFrames += 1;
      if (this.closeFrames < o.holdFrames) return none('open');
      // The grab starts here: no jump from where the hand was.
      this.grabbing = true;
      this.anchor = { ...this.pos };
      return none('grab');
    } else {
      this.closeFrames = 0;
      return none('open');
    }

    // Fingers parting: hold still, and keep the anchor with the hand so
    // nothing jumps if they close again.
    if (ratio > o.holdRatio) {
      this.anchor = { ...this.pos };
      return none('grab');
    }
    const dx = this.pos.x - this.anchor.x;
    const dy = this.pos.y - this.anchor.y;
    if (Math.hypot(dx, dy) < o.deadband) return none('grab');
    this.anchor = { ...this.pos };
    return { state: 'grab', x: this.dot.x, y: this.dot.y, dx, dy };
  }
}
