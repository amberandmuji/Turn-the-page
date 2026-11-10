// Tracks the hand in each frame of the source clips with the same MediaPipe model the app uses.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] }); const p = await b.newPage();
  await p.goto('http://localhost:8124/extract.html'); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  for (const n of ['swipes', 'pinch']) {
    const c = fs.readdirSync(`${process.env.WORK}/site/clip-${n}`).length;
    const r = await p.evaluate(([n, c]) => window.run('clip-' + n, c), [n, c]);
    fs.writeFileSync(process.env.WORK + `/lm-${n}.json`, JSON.stringify(r));
    console.log(n, r.filter(Boolean).length, 'frames with a hand');
  }
  await b.close();
})();
