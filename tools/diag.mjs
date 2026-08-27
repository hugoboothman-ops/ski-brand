import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5000);

console.log(await p.evaluate(() => {
  const hero = document.getElementById('hero');
  return {
    heroOffsetH: hero.offsetHeight,
    innerH: innerHeight,
    scrollH: document.documentElement.scrollHeight,
    run: hero.offsetHeight - innerHeight
  };
}));

// Force the video to a known time and shoot just the video element.
for (const time of [1.0, 5.5, 7.5, 9.5]) {
  await p.evaluate((t) => {
    const v = document.getElementById('hero-video');
    v.currentTime = t;
    return new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  }, time);
  await p.waitForTimeout(600);
  await p.locator('#hero-video').screenshot({ path: `tools/preview/vid-${time}.png` });
  console.log('shot', time);
}
await b.close();
