// Viewer aids for the demo video only: a large hand that shows the swipe,
// and a closing title card.
window.addEventListener('DOMContentLoaded', () => {
  const css = document.createElement('style');
  css.textContent = `
  .demo-hand{position:fixed;left:0;top:0;font-size:118px;line-height:1;z-index:9999;pointer-events:none;
    font-family:'Noto Color Emoji';filter:drop-shadow(0 10px 18px rgba(0,0,0,.28));will-change:transform,opacity}
  .demo-trail{position:fixed;top:0;height:14px;border-radius:7px;z-index:9998;pointer-events:none;
    background:linear-gradient(90deg,rgba(3,105,161,.0),rgba(3,105,161,.35));}
  .demo-end{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;pointer-events:none;
    background:rgba(246,245,241,.9);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;font-family:Inter,system-ui,sans-serif;color:#1f2328;text-align:center}
  .demo-end h2{font-size:54px;letter-spacing:-.03em;margin:0 0 10px;font-weight:700}
  .demo-end p{font-size:22px;margin:0;color:#57606a}
  .demo-end .url{margin-top:22px;font-size:17px;color:#0369a1;font-weight:600}`;
  document.head.append(css);
  const hand = Object.assign(document.createElement('div'), { className: 'demo-hand', textContent: '✋' });
  const trail = Object.assign(document.createElement('div'), { className: 'demo-trail' });
  const end = Object.assign(document.createElement('div'), { className: 'demo-end' });
  end.innerHTML = '<div><h2>Turn the page</h2><p>Swipe in the air to turn PDF pages. Your camera never leaves your device.</p><div class="url">amberandmuji.github.io/Turn-the-page</div></div>';
  hand.style.opacity = 0; trail.style.opacity = 0;
  document.body.append(trail, hand, end);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const Y = 420;
  const toScreen = (x) => 640 + (x - 0.48) * 760;
  function tick() {
    const d = window.__demo;
    const ms = d && d.t0 != null ? d.now() : -1;
    if (ms >= 0) {
      const pose = d.pose(ms);
      let op = 0, trailOp = 0, x = toScreen(pose.x);
      for (const s of d.SWIPES) {
        const a = ms - s;
        if (a > -700 && a < 650) {
          op = a < 0 ? clamp((a + 700) / 300) : clamp(1 - (a - 400) / 250);
          if (a > 0) trailOp = clamp(1 - (a - 250) / 350);
          trail.style.left = x + 60 + 'px';
          trail.style.width = Math.max(0, toScreen(0.70) - x) + 'px';
        }
      }
      hand.style.opacity = op;
      hand.style.transform = `translate(${x - 59}px, ${Y - 59 + (pose.y - 0.62) * 300}px) rotate(${-pose.tilt * 40}deg)`;
      trail.style.opacity = trailOp * 0.9;
      trail.style.top = Y - 7 + 'px';
      end.style.opacity = clamp((ms - 8600) / 450);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});
