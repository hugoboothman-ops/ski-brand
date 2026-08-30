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

console.log('button present:', await p.locator('#sound').count());
console.log('initial aria-pressed:', await p.getAttribute('#sound', 'aria-pressed'));

await p.click('#sound');
await p.waitForTimeout(800);
console.log('after click  aria-pressed:', await p.getAttribute('#sound', 'aria-pressed'));

// scroll into the storm and read the live audio graph
await p.evaluate(() => {
  const hero = document.getElementById('hero');
  scrollTo(0, (hero.offsetHeight - innerHeight) * 0.5);
});
await p.waitForTimeout(2500);
console.log('graph:', JSON.stringify(await p.evaluate(() => {
  const btn = document.getElementById('sound');
  return { level: btn.style.getPropertyValue('--level'),
           pressed: btn.getAttribute('aria-pressed') };
})));

await p.click('#sound');
await p.waitForTimeout(500);
console.log('toggled off:', await p.getAttribute('#sound', 'aria-pressed'));
console.log('errors:', errs.length ? errs : 'none');
await b.close();
