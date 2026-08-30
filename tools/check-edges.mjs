/** Measures the outermost pixels of the rendered page, looking for a light edge. */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/index-fonttest.html';
const b = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
});

for (const [w, h] of [[1440, 900], [1280, 800], [1024, 1366], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  await p.evaluate(() => {
    const hero = document.getElementById('hero');
    scrollTo(0, (hero.offsetHeight - innerHeight) * 0.12);
  });
  await p.waitForTimeout(1800);

  const shot = await p.screenshot();
  // decode via the page itself, then report the brightest pixel on each border
  const res = await p.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    const lum = (x, y) => {
      const i = (y * bmp.width + x) * 4;
      return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    };
    const W = bmp.width, H = bmp.height;
    // mean of a full row / column, at increasing inset. A drawn border shows
    // as inset 0 being far brighter than inset 3; content does not.
    const rowMean = (y) => { let s = 0; for (let x = 0; x < W; x++) s += lum(x, y); return Math.round(s / W); };
    const colMean = (x) => { let s = 0; for (let y = 0; y < H; y++) s += lum(x, y); return Math.round(s / H); };
    const at = [0, 1, 2, 3, 6, 12];
    return {
      size: `${W}x${H}`,
      top: at.map(rowMean),
      bottom: at.map((i) => rowMean(H - 1 - i)),
      left: at.map(colMean),
      right: at.map((i) => colMean(W - 1 - i))
    };
  }, Array.from(shot));

  console.log(`${String(w).padStart(4)}x${h}   row/col mean at inset 0,1,2,3,6,12px`);
  for (const k of ['top', 'bottom', 'left', 'right']) {
    console.log(`   ${k.padEnd(7)} ${res[k].map((v) => String(v).padStart(4)).join(' ')}`);
  }
  await p.close();
}
await b.close();
