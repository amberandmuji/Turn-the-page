// Notices when the camera can't see your hand, so a missed swipe doesn't feel
// like a bug. Pure logic with no browser APIs, so it can be tested in Node.
// Shared by the PDF reader and the Kindle extension.
//
// Each frame passed to update():
//   { t: ms timestamp, hand: { x, y } | null, light: 0..1, motion: 0..1 }
// hand is the palm centre (as from palmCentre), light is how bright the
// picture is on average, and motion is how much it changed since the last
// frame. The camera code measures light and motion on a tiny copy of each
// frame.
//
// update() returns the current warning, one of the keys of WARNINGS, or null:
//   dark  - the picture is too dark to find a hand in.
//   edge  - the hand slipped out of the side or top of the picture
//           without turning the page.
//   lost  - something is moving in front of the camera, but no hand is found
//           (too far away, too close, side-on or against a bright window).

export const WARNINGS = {
  dark: { title: 'Too dark to see your hand', tip: 'Turn on a light or face a window.' },
  edge: { title: 'Your hand left the picture', tip: 'Keep the swipe inside the camera view.' },
  lost: { title: 'Can\'t see your hand', tip: 'Hold it up, open and facing the camera, about an arm\'s length away.' },
};

export const WATCH_DEFAULTS = {
  darkLight: 0.11,    // average brightness below this is too dark ...
  brightAgain: 0.15,  // ... and it has to rise above this to count as fixed
  darkMs: 1500,       // dark for this long before saying so
  motion: 0.035,      // average change per frame that means something is moving
  lostMs: 700,        // moving without a hand for this long before saying so
  quietMs: 2500,      // a "lost" warning clears after this long without movement
  edgeMargin: 0.1,    // a palm this close to a side was near the edge
  edgeMs: 2500,       // how long the "left the picture" warning stays
  handGraceMs: 1000,  // a hand seen this recently means tracking works
};

export class HandWatch {
  constructor(options = {}) {
    this.opts = { ...WATCH_DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.warning = null;
    this.lastHand = null;     // { t, x, y } of the last frame with a hand
    this.darkSince = null;
    this.movingSince = null;  // start of the current run of movement with no hand
    this.lastMotionAt = -Infinity;
    this.edgeUntil = -Infinity;
    this.lastTurnAt = -Infinity;
    this.lastGoneCheck = null;
  }

  // Tell the watch a page turned, so a hand sweeping out of view at the end
  // of a good swipe isn't reported.
  turned(t) {
    this.lastTurnAt = t;
  }

  update({ t, hand, light = 1, motion = 0 }) {
    const o = this.opts;

    if (hand) {
      this.lastHand = { t, x: hand.x, y: hand.y };
      this.movingSince = null;
      this.darkSince = null;
      this.edgeUntil = -Infinity;
      this.warning = null;
      return null;
    }

    const handRecently = this.lastHand && t - this.lastHand.t < o.handGraceMs;

    // The hand has just gone. If it was near the left, right or top edge and
    // no page turned, the swipe probably ran out of the picture. (Lowering a
    // hand to rest leaves through the bottom, which is fine.)
    if (this.lastHand && this.lastHand.t !== this.lastGoneCheck) {
      this.lastGoneCheck = this.lastHand.t;
      const { x, y } = this.lastHand;
      const nearEdge = x < o.edgeMargin || x > 1 - o.edgeMargin || y < o.edgeMargin;
      if (nearEdge && this.lastHand.t - this.lastTurnAt > 600) this.edgeUntil = t + o.edgeMs;
    }

    // Light, with a little hysteresis so the warning doesn't flicker.
    const dark = this.warning === 'dark' ? light < o.brightAgain : light < o.darkLight;
    if (dark) {
      if (this.darkSince === null) this.darkSince = t;
    } else {
      this.darkSince = null;
    }

    // Movement in front of the camera with no hand found.
    if (motion >= o.motion) {
      this.lastMotionAt = t;
      if (this.movingSince === null) this.movingSince = t;
    } else if (t - this.lastMotionAt > 300) {
      this.movingSince = null;
    }

    let next = null;
    if (this.darkSince !== null && t - this.darkSince >= o.darkMs && !handRecently) {
      next = 'dark';
    } else if (t < this.edgeUntil) {
      next = 'edge';
    } else if (this.movingSince !== null && t - this.movingSince >= o.lostMs && !handRecently) {
      next = 'lost';
    } else if (this.warning === 'lost' && t - this.lastMotionAt < o.quietMs) {
      next = 'lost'; // stay up a moment after the movement stops, so it can be read
    }
    this.warning = next;
    return next;
  }
}

// Average brightness and change from the last frame, from RGBA pixels of a
// tiny copy of the picture. prev is the previous call's luma array (or null).
// Returns { light, motion, luma }.
export function frameStats(rgba, prev) {
  const n = rgba.length / 4;
  const luma = new Float32Array(n);
  let sum = 0;
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const l = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    luma[i] = l;
    sum += l;
    if (prev) diff += Math.abs(l - prev[i]);
  }
  return { light: sum / n, motion: prev && prev.length === n ? diff / n : 0, luma };
}
