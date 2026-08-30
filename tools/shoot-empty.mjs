import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:4173/index-fonttest.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
await p.evaluate(() => document.getElementById('range').scrollIntoView());
await p.waitForTimeout(1000);
await p.click('.looks li:nth-child(4) .look');
await p.waitForTimeout(1200);
await p.screenshot({ path: 'tools/preview/empty-look.png' });
await p.evaluate(() => document.querySelector('.topsheets').scrollIntoView());
await p.waitForTimeout(1500);
await p.screenshot({ path: 'tools/preview/topsheets.png' });
await b.close();
