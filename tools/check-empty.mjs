import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4173/index-fonttest.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
await p.evaluate(() => document.getElementById('range').scrollIntoView());
await p.waitForTimeout(1200);
const read = () => p.evaluate(() => ({
  slotShown: getComputedStyle(document.getElementById('fit-slot')).display,
  state: document.getElementById('fit-state').textContent,
  btn: document.getElementById('fit-go').textContent,
  disabled: document.getElementById('fit-go').disabled
}));
console.log('look 1 (has clip) ', JSON.stringify(await read()));
await p.click('.looks li:nth-child(4) .look');
await p.waitForTimeout(1000);
console.log('look 4 (no clip)  ', JSON.stringify(await read()));
await p.click('#fit-go', { force: true }); // disabled, so this must do nothing
await p.waitForTimeout(600);
console.log('after pressing go ', JSON.stringify(await read()));
await p.click('.looks li:nth-child(1) .look');
await p.waitForTimeout(1200);
console.log('back to look 1    ', JSON.stringify(await read()));
console.log('errors:', errs.length ? errs : 'none');
await b.close();
