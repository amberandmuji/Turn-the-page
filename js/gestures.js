// Turns a stream of hand-tracking frames into reader actions.
// Pure logic with no browser APIs, so it can be tested in Node.
//
// Each frame passed to update():
//   { t: ms timestamp, hand: { x, y } | null, gesture: string, score: number }
// where x and y are the palm centre in 0..1, already mirrored so that x grows
// to the right of the screen as the reader sees it in the preview.
//
// update() returns one of 'next', 'prev', 'pause' or null.

export const DEFAULTS = {
  sensitivity: 5,       // 1 (needs a big, fast swipe) .. 10 (a small flick is enough)
  windowMs: 400,        // how far back we look when measuring a swipe
  cooldownMs: 900,      // ignore swipes for this long after a page turn
  fistHoldMs: 800,      // a fist must be held this long to pause
  fistMinScore: 0.6,    // how sure the recogniser must be that it sees a fist
  maxSlope: 0.7,        // vertical movement allowed per unit of horizontal movement
};

// Sensitivity 1..10 maps to the share of the frame width a swipe must cover.
export function swipeDistance(sensitivity) {
  const s = Math.min(10, Math.max(1, Number(sensitivity) || DEFAULTS.sensitivity));
  return 0.40 - (s - 1) * (0.28 / 9); // 1 -> 0.40, 10 -> 0.12
}

export class GestureDetector {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.reset();
  }

  setSensitivity(value) {
    this.opts.sensitivity = value;
  }

  reset() {
    this.history = [];
    this.cooldownUntil = 0;
    this.fistSince = null;
  }

  // 0..1 progress towards a pause, for the on-screen indicator.
  fistProgress(t) {
    if (this.fistSince === null) return 0;
    return Math.min(1, (t - this.fistSince) / this.opts.fistHoldMs);
  }

  update(frame) {
    const { t, hand, gesture, score } = frame;
    const o = this.opts;

    if (!hand) {
      this.history = [];
      this.fistSince = null;
      return null;
    }

    // Fist: hold it to pause. While the hand is closed it never counts as a swipe.
    if (gesture === 'Closed_Fist' && score >= o.fistMinScore) {
      this.history = [];
      if (this.fistSince === null) this.fistSince = t;
      if (t - this.fistSince >= o.fistHoldMs) {
        this.fistSince = null;
        return 'pause';
      }
      return null;
    }
    this.fistSince = null;

    this.history.push({ t, x: hand.x, y: hand.y });
    while (this.history.length && t - this.history[0].t > o.windowMs) this.history.shift();

    if (t < this.cooldownUntil || this.history.length < 2) return null;

    const first = this.history[0];
    const dx = hand.x - first.x;
    const dy = hand.y - first.y;
    if (Math.abs(dx) < swipeDistance(o.sensitivity)) return null;
    if (Math.abs(dy) > Math.abs(dx) * o.maxSlope) return null;

    this.history = [];
    this.cooldownUntil = t + o.cooldownMs;
    // Right-to-left on screen (x shrinking) means next page, like flicking paper.
    return dx < 0 ? 'next' : 'prev';
  }
}

// Palm centre from MediaPipe's 21 hand landmarks, mirrored to match the preview.
// Uses the wrist and the base of the index and little fingers, which stay
// steady while the fingers move.
export function palmCentre(landmarks) {
  if (!landmarks || landmarks.length < 18) return null;
  const pts = [landmarks[0], landmarks[5], landmarks[17]];
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x: 1 - x, y };
}
