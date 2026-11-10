// Prints book.html to demo/The-Lighthouse-at-Hollow-Bay.pdf (an original story written for the demo).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'book.html'));
  await page.pdf({ path: path.join(__dirname, '../../demo/The-Lighthouse-at-Hollow-Bay.pdf'), width: '5.5in', height: '8.5in', printBackground: true });
  await browser.close();
})();
