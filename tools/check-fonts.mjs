import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const b = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
console.log(await p.evaluate(async () => {
  await document.fonts.ready;
  return {
    archivo: document.fonts.check('700 100px Archivo'),
    plex: document.fonts.check('400 12px "IBM Plex Mono"'),
    newsreader: document.fonts.check('italic 300 30px Newsreader'),
    loaded: [...document.fonts].map(f => f.family + ' ' + f.status).slice(0, 6)
  };
}));
await b.close();
