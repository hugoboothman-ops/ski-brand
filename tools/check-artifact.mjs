import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
// Wrap the fragment the way the artifact host does.
await p.goto('http://localhost:4173/tools/artifact-preview.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(7000);
console.log('seek/scrub:', JSON.stringify(await p.evaluate(() => {
  const v = document.getElementById('hero-video');
  return { dur: v.duration, seekable: v.seekable.length ? `${v.seekable.start(0)}-${v.seekable.end(0).toFixed(1)}` : 'NONE',
           fallback: document.querySelector('.hero__stage').getAttribute('data-source') };
})));
for (const f of [0.02, 0.30, 0.55, 0.80, 1.0]) {
  await p.evaluate((x) => { const r = document.documentElement.scrollHeight - innerHeight; scrollTo({top: r*x, behavior:'instant'}); }, f);
  await p.waitForTimeout(1800);
  const t = await p.evaluate(() => +document.getElementById('hero-video').currentTime.toFixed(2));
  await p.screenshot({ path: `tools/preview/art-${Math.round(f*100)}.png` });
  console.log(`scroll ${f} -> video ${t}s`);
}
console.log('errors:', errs.length ? errs.slice(0,5) : 'none');
await b.close();
