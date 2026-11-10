// Scripted hand for the demo. Runs in the page. Exposes window.__demo.
(() => {
  // Open palm, in screen (mirrored) coords relative to the wrist, y up is negative.
  const SHAPE = [[0,0],[-.12,-.08],[-.22,-.18],[-.3,-.27],[-.37,-.35],[-.1,-.42],[-.12,-.6],[-.13,-.72],[-.14,-.83],
    [.02,-.44],[.02,-.64],[.02,-.77],[.02,-.89],[.13,-.41],[.15,-.58],[.16,-.7],[.17,-.8],[.23,-.35],[.27,-.48],[.29,-.57],[.31,-.65]];
  const ease = (t) => (t < .5 ? 4*t*t*t : 1 - ((-2*t+2)**3)/2);
  const smooth = (t) => t*t*(3-2*t);
  // Timeline (ms from start of demo) -> palm screen x, plus visibility.
  // Each cycle: hand rests right, fast swipe left (turns page), slow drift back.
  const SWIPES = [1500, 4300, 7100];
  const RIGHT = 0.70, LEFT = 0.26, SWIPE_MS = 330, BACK_MS = 1300;
  function pose(ms) {
    let x = RIGHT, tilt = 0, vis = ms > 500;
    let enter = Math.min(1, Math.max(0, (ms - 500) / 600));
    let y = 0.80 - 0.18 * smooth(enter);
    for (const s of SWIPES) {
      const a = ms - s;
      if (a >= 0 && a < SWIPE_MS) { const p = ease(a / SWIPE_MS); x = RIGHT + (LEFT - RIGHT) * p; tilt = -0.25 * Math.sin(Math.PI * p); y -= 0.03 * Math.sin(Math.PI*p); }
      else if (a >= SWIPE_MS && a < SWIPE_MS + 250) { x = LEFT; }
      else if (a >= SWIPE_MS + 250 && a < SWIPE_MS + 250 + BACK_MS) { const p = smooth((a - SWIPE_MS - 250) / BACK_MS); x = LEFT + (RIGHT - LEFT) * p; }
    }
    // a little natural sway
    x += 0.004 * Math.sin(ms / 230); y += 0.004 * Math.sin(ms / 310);
    return { x, y, tilt, vis, enter };
  }
  const S = 0.40; // hand height as a share of the frame height
  function landmarks(ms) {
    const p = pose(ms);
    if (!p.vis) return null;
    const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
    // palm centre is roughly the mean of 0,5,17 -> offset wrist so palm centre lands at p
    const pc = [(0 - .1 + .23) / 3, (0 - .42 - .35) / 3];
    return SHAPE.map(([dx, dy], i) => {
      let rx = dx - pc[0], ry = dy - pc[1];
      const X = (rx * c - ry * s) * S * 0.75, Y = (rx * s + ry * c) * S;
      return { x: 1 - (p.x + X), y: p.y + Y, z: 0 }; // raw camera coords (unmirrored)
    });
  }
  window.__demo = { t0: null, now: () => (window.__demo.t0 == null ? 0 : performance.now() - window.__demo.t0), landmarks, pose, SWIPES };

  // Fake camera: a soft room with the hand in it, drawn every frame.
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d');
  const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
  function paint() {
    const bg = g.createLinearGradient(0, 0, 0, 480);
    bg.addColorStop(0, '#6d6458'); bg.addColorStop(1, '#3d362f');
    g.fillStyle = bg; g.fillRect(0, 0, 640, 480);
    // window light and a shelf, blurred
    g.fillStyle = 'rgba(255,240,215,.35)'; g.fillRect(420, 40, 170, 200);
    g.fillStyle = 'rgba(30,25,20,.35)'; g.fillRect(40, 150, 200, 14);
    // the reader: head and shoulders, low in frame
    g.fillStyle = '#2b2622'; g.beginPath(); g.ellipse(320, 520, 220, 150, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = '#8a6a55'; g.beginPath(); g.ellipse(320, 300, 70, 88, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = '#2a211c'; g.beginPath(); g.ellipse(320, 248, 78, 50, 0, Math.PI, Math.PI*2); g.fill();
    const lm = landmarks(window.__demo.now());
    if (lm) {
      const P = lm.map((q) => [q.x * 640, q.y * 480]);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#d9a688'; g.fillStyle = '#d9a688';
      g.beginPath(); [0,1,5,9,13,17].forEach((i, k) => (k ? g.lineTo(...P[i]) : g.moveTo(...P[i]))); g.closePath(); g.fill();
      g.lineWidth = 30; g.beginPath(); g.moveTo(...P[0]); g.lineTo(...P[9]); g.stroke();
      for (const f of [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]) {
        g.lineWidth = f[0] === 17 ? 15 : 18; g.beginPath(); g.moveTo(...P[f[0]]); f.slice(1).forEach((i) => g.lineTo(...P[i])); g.stroke();
      }
    }
    requestAnimationFrame(paint);
  }
  navigator.mediaDevices.getUserMedia = async () => { requestAnimationFrame(paint); paint(); return cv.captureStream(30); };
  window.__demo.CONN = CONN;
})();
