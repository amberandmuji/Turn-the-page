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
//   dx, dy: how far it moved since the last frame while grabbing, else 0
// Velocity for a flick is in .velocity ({ x, y } per second) after a release.

export const PINCH_DEFAULTS = {
  closeRatio: 0.28,  // fingertips this close (in palm lengths) is a pinch ...
  openRatio: 0.45,   // ... and they must open past this to let go
  holdFrames: 2,     // frames the pinch must be held before it grabs
  smoothing: 0.55,   // weight of the newest position
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
    this.pos = null;       // smoothed { t, x, y }
    this.lastSeen = -Infinity;
    this.samples = [];     // recent { t, x, y } while grabbing, for the flick
    this.velocity = { x: 0, y: 0 };
  }

  release(t) {
    this.grabbing = false;
    this.closeFrames = 0;
    const recent = this.samples.filter((s) => t - s.t <= 120);
    if (recent.length >= 2) {
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = Math.max(1, b.t - a.t) / 1000;
      this.velocity = { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    } else {
      this.velocity = { x: 0, y: 0 };
    }
    this.samples = [];
  }

  update({ t, landmarks }) {
    const o = this.opts;
    if (!landmarks || landmarks.length < 21) {
      if (t - this.lastSeen > o.gapMs) {
        if (this.grabbing) this.release(this.lastSeen);
        this.pos = null;
      }
      return { state: this.grabbing ? 'grab' : 'none', x: this.pos?.x ?? 0, y: this.pos?.y ?? 0, dx: 0, dy: 0 };
    }
    this.lastSeen = t;

    const raw = {
      x: 1 - (landmarks[4].x + landmarks[8].x) / 2,
      y: (landmarks[4].y + landmarks[8].y) / 2,
    };
    const a = o.smoothing;
    const prev = this.pos;
    const pos = prev
      ? { t, x: a * raw.x + (1 - a) * prev.x, y: a * raw.y + (1 - a) * prev.y }
      : { t, ...raw };
    this.pos = pos;

    const ratio = pinchRatio(landmarks);
    if (this.grabbing) {
      if (ratio > o.openRatio) this.release(t);
    } else if (ratio < o.closeRatio) {
      this.closeFrames += 1;
      if (this.closeFrames >= o.holdFrames) {
        this.grabbing = true;
        this.velocity = { x: 0, y: 0 };
        this.samples = [{ t, x: pos.x, y: pos.y }];
        // The grab starts here: no jump from where the fingers were.
        return { state: 'grab', x: pos.x, y: pos.y, dx: 0, dy: 0 };
      }
    } else {
      this.closeFrames = 0;
    }

    if (!this.grabbing) return { state: 'open', x: pos.x, y: pos.y, dx: 0, dy: 0 };
    this.samples.push({ t, x: pos.x, y: pos.y });
    if (this.samples.length > 12) this.samples.shift();
    return { state: 'grab', x: pos.x, y: pos.y, dx: prev ? pos.x - prev.x : 0, dy: prev ? pos.y - prev.y : 0 };
  }
}
