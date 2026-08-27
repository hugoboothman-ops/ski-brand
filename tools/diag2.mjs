import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5000);

for (const f of [0.10, 0.25, 0.44, 0.55]) {
  await p.evaluate((frac) => {
    const run = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: run * frac, behavior: 'instant' });
  }, f);
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => {
    const hero = document.getElementById('hero');
    const v = document.getElementById('hero-video');
    const r = hero.getBoundingClientRect();
    const run = hero.offsetHeight - innerHeight;
    return {
      scrollY: Math.round(scrollY),
      heroT: +(-r.top / run).toFixed(3),
      vTime: +v.currentTime.toFixed(2),
      vDur: v.duration,
      seeking: v.seeking,
      paused: v.paused,
      buffered: v.buffered.length ? `${v.buffered.start(0).toFixed(1)}-${v.buffered.end(0).toFixed(1)}` : 'none'
    };
  });
  console.log(f, JSON.stringify(s));
}
await b.close();
