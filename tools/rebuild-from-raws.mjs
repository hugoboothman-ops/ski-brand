/**
 * Rebuilds the delivered edit from the original Midjourney clips.
 *
 * The edit that arrived had been through iMovie, which upscaled 768x512 to
 * 1280x720 and cropped 3:2 to 16:9 — adding pixels but no detail, then
 * re-encoding. This reassembles the same cut from the untouched sources at
 * native resolution, so every bit of bitrate goes to real detail and the
 * full 3:2 frame survives for responsive cropping.
 *
 * The edit is not re-cut: cut points are recovered from the delivered file by
 * frame matching, so the creative decisions in it are preserved exactly.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');

const EDIT = process.argv[2] || '/tmp/cut/joined.mp4';
const OUT = process.argv[3] || '/tmp/cut/rebuilt.mp4';
const FINE = 24, W = 64, H = 36;

/* Coarse runs recovered by tools/derive-edl.mjs */
const runs = [
  ['g3v1',  0.00,  8.00, 0.00],
  ['g1v0',  8.00, 10.13, 0.13],
  ['g1v1', 10.13, 11.71, 0.00],
  ['g2v2', 11.71, 13.58, 1.58],
  ['g2v3', 13.58, 14.58, 4.20],
  ['g4v1', 14.58, 16.71, 3.20],
  ['g4v2', 16.71, 19.58, 0.08],
  ['g2v1', 19.58, 20.42, 0.70],
  ['g1v2', 20.42, 21.58, 0.20],
  ['g2v0', 21.58, 23.00, 3.70],
  ['g4v3', 23.00, 25.65, 2.58]
];

function frames(file, from, dur, crop) {
  const vf = [crop, `scale=${W}:${H}`, 'format=gray'].filter(Boolean).join(',');
  const r = spawnSync(ffmpeg, ['-v', 'error', '-ss', String(from), '-t', String(dur),
    '-i', file, '-vf', `fps=${FINE},${vf}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 1 << 28 });
  const b = r.stdout, n = W * H, out = [];
  for (let i = 0; i + n <= b.length; i += n) out.push(b.subarray(i, i + n));
  return out;
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const parts = [];
console.log('segment  clip    edit in–out      source in   diff');
runs.forEach(([clip, from, to, guess], idx) => {
  const dur = to - from;
  const target = frames(EDIT, from, dur, null);
  let best = { d: Infinity, at: guess };
  for (let off = Math.max(0, guess - 0.5); off <= guess + 0.5; off += 1 / FINE) {
    const cand = frames(`/tmp/raw/${clip}.mp4`, off, dur, 'crop=768:432:0:40');
    const n = Math.min(cand.length, target.length);
    if (!n) continue;
    let d = 0;
    for (let k = 0; k < n; k++) d += dist(cand[k], target[k]);
    d /= n;
    if (d < best.d) best = { d, at: off };
  }
  console.log(`${String(idx + 1).padStart(4)}     ${clip}  ` +
    `${from.toFixed(2)}–${to.toFixed(2)}s`.padEnd(16) +
    `${best.at.toFixed(3)}s`.padEnd(12) + best.d.toFixed(1));

  const part = `/tmp/cut/part${idx}.mp4`;
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(best.at), '-t', String(dur),
    '-i', `/tmp/raw/${clip}.mp4`, '-an', '-vsync', 'cfr', '-r', '24',
    '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', part], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
  parts.push(part);
});

writeFileSync('/tmp/cut/parts.txt', parts.map((p) => `file '${p}'`).join('\n'));
spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0',
  '-i', '/tmp/cut/parts.txt', '-c', 'copy', OUT], { stdio: 'inherit' });
console.log(`\n${OUT}  ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
