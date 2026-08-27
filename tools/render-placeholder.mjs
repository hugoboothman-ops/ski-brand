/**
 * Renders the placeholder hero footage.
 *
 * Drives assets/js/storm.js frame by frame in headless Chromium, then encodes
 * the frames to VP8/WebM with every frame a keyframe (-g 1) so the browser can
 * seek to any playhead position instantly — which is what scroll scrubbing is.
 *
 *   npm run placeholder
 *
 * Replace the output with real footage when it lands; see README.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const W = 1280;
const H = 720;
const FPS = 24;
const SECONDS = 11;
const TOTAL = FPS * SECONDS;

const OUT_DIR = resolve(root, 'assets/video');
const OUT_WEBM = resolve(OUT_DIR, 'hero-placeholder.webm');
const OUT_POSTER = resolve(OUT_DIR, 'hero-poster.jpg');

function findFfmpeg() {
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const entry of readdirSync(base)) {
    if (!entry.startsWith('ffmpeg')) continue;
    const bin = resolve(base, entry, 'ffmpeg-linux');
    if (existsSync(bin) && statSync(bin).isFile()) return bin;
  }
  return null;
}

const ffmpeg = process.env.FFMPEG || findFfmpeg();
if (!ffmpeg) {
  console.error('No ffmpeg found. Set FFMPEG=/path/to/ffmpeg and retry.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('file://' + resolve(here, 'frame.html'));
await page.evaluate(([w, h, total]) => window.setup(w, h, total), [W, H, TOTAL]);

const enc = spawn(ffmpeg, [
  '-y',
  '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
  '-c:v', 'libvpx',
  '-b:v', '2600k', '-crf', '31',
  '-g', '1',                 // every frame a keyframe — seek anywhere, instantly
  '-deadline', 'good', '-cpu-used', '2',
  '-an',
  OUT_WEBM
], { stdio: ['pipe', 'ignore', 'pipe'] });

let ffmpegErr = '';
enc.stderr.on('data', (d) => { ffmpegErr += d.toString(); });

const done = new Promise((res, rej) => {
  enc.on('close', (code) => code === 0 ? res() : rej(new Error(ffmpegErr.slice(-2000))));
  enc.on('error', rej);
});

process.stdout.write(`Rendering ${TOTAL} frames at ${W}x${H}\n`);

for (let i = 0; i < TOTAL; i++) {
  await page.evaluate((n) => window.renderFrame(n), i);
  const buf = await page.locator('#c').screenshot({ type: 'jpeg', quality: 92 });

  if (i === Math.round(TOTAL * 0.02)) writeFileSync(OUT_POSTER, buf);

  if (!enc.stdin.write(buf)) {
    await new Promise((r) => enc.stdin.once('drain', r));
  }
  if (i % 24 === 0) process.stdout.write(`  ${i}/${TOTAL}\n`);
}

enc.stdin.end();
await done;
await browser.close();

const size = statSync(OUT_WEBM).size;
process.stdout.write(`\nWrote ${OUT_WEBM} (${(size / 1e6).toFixed(2)} MB)\n`);
process.stdout.write(`Wrote ${OUT_POSTER}\n`);
