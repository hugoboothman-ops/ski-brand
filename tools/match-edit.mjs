/**
 * Works out which raw clips an edit was assembled from, and where.
 *
 * Reduces every frame to a tiny grayscale signature, then slides each raw
 * clip along the edit's timeline looking for the alignment with the lowest
 * mean difference. The raws are 3:2 and the edit is 16:9, so raws are centre
 * cropped to match before comparing.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');

const FPS = 6, W = 32, H = 18;

function sig(file, crop) {
  const vf = [`fps=${FPS}`, crop, `scale=${W}:${H}`, 'format=gray']
    .filter(Boolean).join(',');
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', vf,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 });
  const b = r.stdout, n = W * H, out = [];
  for (let i = 0; i + n <= b.length; i += n) out.push(b.subarray(i, i + n));
  return out;
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

const edit = sig(process.argv[2], null);
console.log(`edit: ${edit.length} frames at ${FPS}fps\n`);

for (const clip of process.argv.slice(3)) {
  const name = clip.split('/').pop().replace('.mp4', '');
  // 768x512 -> centre 16:9
  const frames = sig(clip, 'crop=768:432:0:40');
  let best = { d: Infinity, at: -1 };
  const win = Math.min(frames.length, 12);
  for (let off = 0; off + win <= edit.length; off++) {
    let d = 0;
    for (let k = 0; k < win; k++) d += dist(frames[k], edit[off + k]);
    d /= win;
    if (d < best.d) best = { d, at: off };
  }
  const flag = best.d < 12 ? 'USED' : best.d < 20 ? 'maybe' : '—';
  console.log(`${name.padEnd(6)} best match at ${(best.at / FPS).toFixed(2)}s`.padEnd(38) +
    `mean diff ${best.d.toFixed(1).padStart(5)}   ${flag}`);
}
