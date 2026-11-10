// Turns a stream of hand-tracking frames into reader actions.
// Pure logic with no browser APIs, so it can be tested in Node.
//
// Each frame passed to update():
//   { t: ms timestamp, hand: { x, y } | null, gesture: string, score: number }
// where x and y are the palm centre in 0..1, already mirrored so that x grows
// to the right of the screen as the reader sees it in the preview.
//
// update() returns one of 'next', 'prev', 'pause' or null.
//
// How a swipe is recognised
// -------------------------
// Hand movement is cut into strokes: a stroke starts when the hand moves
// sideways quickly and ends when it slows down or reverses. A stroke turns the
// page when it is long enough and fast enough, and mostly sideways.
//
// Two natural movements look like swipes the wrong way, and are ignored:
//   - the wind-up: moving the hand into position before swiping. It is
//     usually slower than the swipe, so it fails the speed check.
//   - the return: bringing the hand back after a swipe. A stroke that starts
//     soon after a page-turning stroke, in the opposite direction, is treated
//     as a return and never turns the page. Returns are also usually slower.

export const DEFAULTS = {
  sensitivity: 5,       // 1 (needs a big, fast swipe) .. 10 (a small flick is enough)
  swapDirection: false, // true: left-to-right means next page
  smoothing: 0.5,       // 0..1, weight of the newest sample in the smoothed position
  startSpeed: 0.5,      // frame widths per second at which a stroke starts
  endSpeed: 0.25,       // ... and below which it ends
  returnMs: 700,        // an opposite stroke starting this soon after a stroke is a return
  repeatMs: 450,        // minimum gap between two page turns
  gapMs: 250,           // a hand missing for longer than this ends the stroke
  fistHoldMs: 800,      // a fist must be held this long to pause
  fistMinScore: 0.6,    // how sure the recogniser must be that it sees a fist
  maxSlope: 0.7,        // vertical movement allowed per unit of horizontal movement
};

const clampSensitivity = (s) => Math.min(10, Math.max(1, Number(s) || DEFAULTS.sensitivity));

// Share of the frame width a swipe must cover: 1 -> 0.36, 5 -> 0.24, 10 -> 0.09.
export function swipeDistance(sensitivity) {
  return 0.36 - (clampSensitivity(sensitivity) - 1) * 0.03;
}

// Peak speed a swipe must reach, in frame widths per second: 1 -> 1.6, 5 -> 1.0, 10 -> 0.3.
export function swipeSpeed(sensitivity) {
  return 1.6 - (clampSensitivity(sensitivity) - 1) * (1.3 / 9);
}

export class GestureDetector {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.reset();
  }

  setSensitivity(value) {
    this.opts.sensitivity = value;
  }

  setSwapDirection(on) {
    this.opts.swapDirection = !!on;
  }

  reset() {
    this.last = null;        // last smoothed sample { t, x, y }
    this.stroke = null;      // stroke in progress
    this.lastStroke = null;  // { dir, endT } of the last finished stroke
    this.lastTurnAt = -Infinity;
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
      // Fast movement can blur the hand for a frame or two: keep the stroke
      // alive across a short gap, end it after a long one.
      if (this.last && t - this.last.t > o.gapMs) {
        this.endStroke(this.last.t);
        this.last = null;
      }
      this.fistSince = null;
      return null;
    }

    // Fist: hold it to pause. A closed hand never counts as a swipe.
    if (gesture === 'Closed_Fist' && score >= o.fistMinScore) {
      this.endStroke(t);
      this.last = null;
      if (this.fistSince === null) this.fistSince = t;
      if (t - this.fistSince >= o.fistHoldMs) {
        this.fistSince = null;
        return 'pause';
      }
      return null;
    }
    this.fistSince = null;

    if (!this.last || t - this.last.t > o.gapMs) {
      this.endStroke(this.last ? this.last.t : t);
      this.last = { t, x: hand.x, y: hand.y };
      return null;
    }

    const a = o.smoothing;
    const cur = { t, x: a * hand.x + (1 - a) * this.last.x, y: a * hand.y + (1 - a) * this.last.y };
    const dt = Math.max(1, t - this.last.t) / 1000;
    const vx = (cur.x - this.last.x) / dt;
    const dx = cur.x - this.last.x;
    const dy = cur.y - this.last.y;
    this.last = cur;

    const dir = Math.sign(vx);
    const speed = Math.abs(vx);

    // End the stroke when the hand slows down or turns around.
    if (this.stroke && (speed < o.endSpeed || (dir !== 0 && dir !== this.stroke.dir))) {
      this.endStroke(t);
    }

    if (!this.stroke) {
      if (speed < o.startSpeed) return null;
      const isReturn = !!this.lastStroke
        && this.lastStroke.dir !== dir
        && t - this.lastStroke.endT < o.returnMs;
      this.stroke = { dir, dx: 0, dy: 0, peak: 0, fired: false, isReturn };
    }

    const s = this.stroke;
    s.dx += dx;
    s.dy += Math.abs(dy);
    s.peak = Math.max(s.peak, speed);

    if (s.fired || s.isReturn) return null;
    if (Math.abs(s.dx) < swipeDistance(o.sensitivity)) return null;
    if (s.peak < swipeSpeed(o.sensitivity)) return null;
    if (s.dy > Math.abs(s.dx) * o.maxSlope) return null;
    if (t - this.lastTurnAt < o.repeatMs) return null;

    s.fired = true;
    this.lastTurnAt = t;
    // Right-to-left on screen (x shrinking) means next page, like flicking paper.
    const leftward = s.dx < 0;
    return leftward !== o.swapDirection ? 'next' : 'prev';
  }

  endStroke(t) {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    // Only a stroke that turned the page sets up a return to ignore. An
    // unfired stroke is often the wind-up before the real swipe, which must
    // not be blocked.
    if (s.fired) this.lastStroke = { dir: s.dir, endT: t };
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
