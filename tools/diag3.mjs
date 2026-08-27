import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5000);
console.log(await p.evaluate(async () => {
  const v = document.getElementById('hero-video');
  const out = {
    seekableLen: v.seekable.length,
    seekable: v.seekable.length ? `${v.seekable.start(0)}-${v.seekable.end(0)}` : 'none',
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    readyState: v.readyState,
    duration: v.duration
  };
  v.currentTime = 6;
  await new Promise(r => setTimeout(r, 1200));
  out.afterManualSeek = v.currentTime;
  return out;
}));
await b.close();
