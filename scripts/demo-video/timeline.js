// Demo timeline: which moment of Sean's clips plays at each moment of the demo.
// window.__LM = { swipes: [...], pinch: [...] } is injected before this runs.
(() => {
  const PLAN = [
    // [demo start ms, demo end ms, clip, clip start s]
    [0, 1600, 'swipes', 0, true],      // title: hold the first frame
    [1600, 7600, 'swipes', 0],         // next, next, previous
    [7600, 10300, 'pinch', 0.1],       // zoom in, pinch and drag up
    [10300, 12000, 'pinch', 7.2],      // pinch and drag down, zoom out
    [12000, 14800, 'swipes', 10.2],    // fist to pause
    [14800, 1e9, 'swipes', 13.0, true],
  ];
  const FIST = [10.85, 11.95]; // swipes clip: the fist Sean held to pause
  function src(ms) {
    for (const [a, b, clip, s, hold] of PLAN) {
      if (ms >= a && ms < b) {
        const sec = hold ? s : s + (ms - a) / 1000;
        const n = window.__LM[clip].length;
        return { clip, sec, idx: Math.min(n, Math.max(1, Math.floor(sec * 30) + 1)) };
      }
    }
  }
  function frame(ms) {
    const s = src(ms);
    const f = window.__LM[s.clip][s.idx - 1];
    if (!f) return null;
    const lm = f.lm.map(([x, y]) => ({ x, y, z: 0 }));
    let g = f.g || 'None', score = f.s;
    if (s.clip === 'swipes' && s.sec >= FIST[0] && s.sec <= FIST[1]) { g = 'Closed_Fist'; score = 0.9; }
    return { lm, g, score };
  }
  window.__demo = { t0: null, now: () => (window.__demo.t0 == null ? -1 : performance.now() - window.__demo.t0), src, frame };

  // Fake camera stream (its picture is covered by Sean's footage anyway).
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d');
  const paint = () => { g.fillStyle = `rgb(110,100,90)`; g.fillRect(0, 0, 640, 480); g.fillStyle = '#000'; g.fillRect((performance.now() / 10) % 640, 0, 2, 2); requestAnimationFrame(paint); };
  navigator.mediaDevices.getUserMedia = async () => { paint(); return cv.captureStream(30); };

  // Sean's camera window footage, laid over the app's own camera window.
  window.addEventListener('DOMContentLoaded', () => {
    const css = document.createElement('style');
    css.textContent = `.demo-cam{position:absolute;inset:0;width:100%;height:100%;z-index:50;border-radius:inherit;object-fit:fill;display:block}
      .preview-card{position:relative;overflow:hidden} #hand-warning{display:none!important}`;
    document.head.append(css);
  });
  window.__demoCam = async (url) => {
    const card = document.querySelector('.preview-card');
    if (!card) return;
    let img = card.querySelector('.demo-cam');
    if (!img) { img = document.createElement('img'); img.className = 'demo-cam'; card.append(img); }
    if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; try { await img.decode(); } catch {} }
  };
})();
