// Records the real reader frame by frame (browser clock paused), replaying the hand
// tracked from the source clips and showing those clips in the camera window.
// Env: WORK = working folder with lm-*.json; clip frames served at localhost:8124.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const D = process.env.WORK, OUT = D + '/frames', FPS = 30, SECONDS = 18;
const BOOK = require('path').join(__dirname, '../../demo/The-Lighthouse-at-Hollow-Bay.pdf');
const KEYS = [[8000, '+'], [8350, '+'], [11800, '0']];
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
  const LM = { swipes: JSON.parse(fs.readFileSync(D + '/lm-swipes.json')), pinch: JSON.parse(fs.readFileSync(D + '/lm-pinch.json')) };
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.route('**/vendor/mediapipe/vision_bundle.mjs', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(__dirname + '/vision-stub.mjs', 'utf8') }));
  await p.addInitScript(() => { localStorage.setItem('turn-the-page:seen-help', 'true'); });
  await p.addInitScript(`window.__LM = ${JSON.stringify(LM)};`);
  await p.addInitScript({ path: __dirname + '/timeline.js' });
  await p.clock.install();
  await p.goto('http://localhost:8123/');
  const settle = async (n) => { for (let i = 0; i < n; i++) { await p.clock.runFor(50); await p.waitForTimeout(40); } };
  await settle(5);
  await p.setInputFiles('#file-input', BOOK);
  await settle(30);
  await p.click('#gesture-btn');
  await settle(20);
  await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 100);
  await p.evaluate(() => { window.__demo.t0 = performance.now(); document.activeElement?.blur(); });
  const card = await p.evaluate(() => { const r = document.querySelector('.preview-card').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const log = { card, turns: [], keys: [] };
  let label = await p.textContent('#page-label'); let k = 0;
  for (let f = 0; f < FPS * SECONDS; f++) {
    await p.clock.runFor(f % 3 === 2 ? 34 : 33);
    const ms = await p.evaluate(() => window.__demo.now());
    while (k < KEYS.length && ms >= KEYS[k][0]) { await p.keyboard.press(KEYS[k][1]); log.keys.push([f, KEYS[k][1]]); k++; }
    const s = await p.evaluate((ms) => window.__demo.src(ms), ms);
    await p.evaluate((u) => window.__demoCam(u), `http://localhost:8124/clip-${s.clip}/f${String(s.idx).padStart(4, '0')}.png`);
    await p.waitForTimeout(20);
    await p.screenshot({ path: `${OUT}/f${String(f).padStart(4, '0')}.png` });
    const l = await p.textContent('#page-label');
    if (l !== label) { log.turns.push(f); label = l; console.log('turn', f, (f / 30).toFixed(2), l); }
    if (f % 30 === 0) { const st = await p.evaluate(() => [document.querySelector('#preview').hidden, document.querySelector('#pages').scrollTop|0, document.querySelector('.pinch-dot')?.hidden]); console.log('t', f / 30, JSON.stringify(st)); }
  }
  fs.writeFileSync(D + '/log.json', JSON.stringify(log));
  await b.close();
})();
