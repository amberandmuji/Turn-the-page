// Records the demo frame by frame from the real reader, with the browser clock
// paused so every frame is exact. MediaPipe and the camera are swapped for a
// scripted hand (hand.js, vision-stub.mjs); everything else is the app as is.
// Usage: node record.cjs <site url> <frames dir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [url = 'http://localhost:8123/', OUT = '/tmp/demo-frames'] = process.argv.slice(2);
const FPS = 30, SECONDS = 10;
const here = (f) => path.join(__dirname, f);
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.route('**/vendor/mediapipe/vision_bundle.mjs', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(here('vision-stub.mjs'), 'utf8') }));
  await p.addInitScript(() => { localStorage.setItem('turn-the-page:seen-help', 'true'); });
  await p.addInitScript({ path: here('hand.js') });
  await p.addInitScript({ path: here('overlay.js') });
  await p.clock.install();
  await p.goto(url);
  const settle = async (n) => { for (let i = 0; i < n; i++) { await p.clock.runFor(50); await p.waitForTimeout(40); } };
  await settle(5);
  await p.setInputFiles('#file-input', path.join(__dirname, '../../demo/The-Lighthouse-at-Hollow-Bay.pdf'));
  await settle(30);
  await p.click('#gesture-btn');
  await settle(20);
  // From here on, time only moves when we say so.
  await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 100);
  await p.evaluate(() => { window.__demo.t0 = performance.now(); document.activeElement?.blur(); });
  const turns = [];
  let label = await p.textContent('#page-label');
  for (let f = 0; f < FPS * SECONDS; f++) {
    await p.clock.runFor(f % 3 === 2 ? 34 : 33);
    await p.waitForTimeout(25); // real time for PDF.js to draw
    await p.screenshot({ path: `${OUT}/f${String(f).padStart(4, '0')}.png` });
    const l = await p.textContent('#page-label');
    if (l !== label) { turns.push(f); label = l; console.log('page turned at frame', f, l); }
  }
  fs.writeFileSync(path.join(OUT, 'turns.json'), JSON.stringify(turns));
  await browser.close();
})();
