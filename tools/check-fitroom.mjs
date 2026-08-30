import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4173/index-fonttest.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
await p.evaluate(() => document.getElementById('range').scrollIntoView());
await p.waitForTimeout(1500);

const read = () => p.evaluate(() => ({
  src: (document.getElementById('fit-video').currentSrc || '').split('/').pop(),
  state: document.getElementById('fit-state').textContent,
  load: document.getElementById('fit-load').textContent,
  wind: document.getElementById('fit-wind').textContent,
  btn: document.getElementById('fit-go').textContent,
  disabled: document.getElementById('fit-go').disabled,
  pressed: [...document.querySelectorAll('.look')].map(l => l.getAttribute('aria-pressed'))
}));

console.log('initial      ', JSON.stringify(await read()));
await p.click('.looks li:nth-child(2) .look');
await p.waitForTimeout(1200);
console.log('after select ', JSON.stringify(await read()));
await p.click('#fit-go');
await p.waitForTimeout(1500);
console.log('mid blast    ', JSON.stringify(await read()));
await p.waitForTimeout(5000);
console.log('after end    ', JSON.stringify(await read()));
await p.screenshot({ path: 'tools/preview/fitroom.png' });
console.log('errors:', errs.length ? errs : 'none');
await b.close();
