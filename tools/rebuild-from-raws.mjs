/**
 * Rebuilds the delivered edit from the original Midjourney clips.
 *
 * The edit that arrived had been through iMovie, which upscaled 768x512 to
 * 1280x720 and cropped 3:2 to 16:9 — adding pixels but no detail, then
 * re-encoding. This reassembles the same cut from the untouched sources at
 * native resolution, so every bit of bitrate goes to real detail, and keeps
 * the full 3:2 frame so the page can crop it per viewport instead of being
 * stuck with one baked-in 16:9 crop.
 *
 * The edit is NOT re-cut. Cut points were recovered from the delivered file
 * by frame matching (tools/derive-edl.mjs), so every creative decision in it
 * survives — including the AI hand artefacts that were deliberately removed.
 *
 *   node tools/rebuild-from-raws.mjs [out.mp4]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');

const OUT = process.argv[2] || '/tmp/cut/rebuilt.mp4';
const END = 25.65;

/* Recovered by derive-edl.mjs at 24fps. Every row matched the delivered edit
   at a mean frame difference under 1.2 — the same frames, not similar ones.
   `at` is where the matcher locked on; `src` is the source in-point there.
   Cuts sit midway between one run ending and the next beginning. */
const runs = [
  { clip: 'g3v1', at:  0.00, to:  7.96, src: 0.00 },
  { clip: 'g1v0', at:  8.08, to:  9.25, src: 0.17 },
  { clip: 'g4v0', at:  9.42, to: 10.58, src: 0.21 },
  { clip: 'g1v1', at: 10.83, to: 11.67, src: 0.21 },
  { clip: 'g2v2', at: 11.71, to: 13.54, src: 1.58 },
  { clip: 'g2v3', at: 13.58, to: 14.54, src: 4.21 },
  { clip: 'g4v1', at: 14.58, to: 16.58, src: 3.17 },
  { clip: 'g4v2', at: 16.75, to: 19.54, src: 0.13 },
  { clip: 'g2v1', at: 19.58, to: 20.17, src: 0.71 },
  { clip: 'g2v3', at: 20.21, to: 20.50, src: 0.04 },
  { clip: 'g1v2', at: 20.54, to: 21.63, src: 0.33 },
  { clip: 'g2v0', at: 21.67, to: 23.00, src: 3.83 },
  { clip: 'g4v3', at: 23.04, to: 25.63, src: 2.63 }
];

const LEN = { g3v1: 9.04 };                 /* the rest run 5.21s */
const cut = runs.map((r, i) => (i === 0 ? 0 : (runs[i - 1].to + r.at) / 2));
cut.push(END);

/* Frame signatures, used to refine each segment's source in-point. The
   coarse pass locates the clip; this finds the frame. */
const FINE = 24, SW = 64, SH = 36;
function sigOf(file, from, dur, crop) {
  const vf = [crop, `scale=${SW}:${SH}`, 'format=gray'].filter(Boolean).join(',');
  const r = spawnSync(ffmpeg, ['-v', 'error', '-ss', String(from), '-t', String(dur),
    '-i', file, '-vf', `fps=${FINE},${vf}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 1 << 28 });
  const b = r.stdout, n = SW * SH, out = [];
  for (let i = 0; i + n <= b.length; i += n) out.push(b.subarray(i, i + n));
  return out;
}
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const parts = [];
console.log('  clip    edit in–out        source in–out      diff');
runs.forEach((r, i) => {
  const from = cut[i];
  let dur = cut[i + 1] - from;
  const len = LEN[r.clip] || 5.21;
  const guess = Math.max(0, r.src - (r.at - from));

  /* Search around the guess for the in-point that actually lines up. */
  const target = sigOf('/tmp/cut/joined.mp4', from, dur, null);
  let best = { d: Infinity, at: guess };
  for (let o = Math.max(0, guess - 0.4); o <= Math.min(guess + 0.4, len - dur); o += 1 / FINE) {
    const cand = sigOf(`/tmp/raw/${r.clip}.mp4`, o, dur, 'crop=768:432:0:40');
    const n = Math.min(cand.length, target.length);
    if (!n) continue;
    let d = 0;
    for (let k = 0; k < n; k++) d += diff(cand[k], target[k]);
    if (d / n < best.d) best = { d: d / n, at: o };
  }
  const src = best.at;
  if (src + dur > len) dur = len - src;      /* never read past the clip */

  console.log(`  ${r.clip}  ${from.toFixed(2)}–${(from + dur).toFixed(2)}s`.padEnd(26) +
    `${src.toFixed(3)}–${(src + dur).toFixed(3)}s`.padEnd(19) + best.d.toFixed(1));

  const part = `/tmp/cut/p${String(i).padStart(2, '0')}.mp4`;
  const run = spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(src), '-t', String(dur),
    '-i', `/tmp/raw/${r.clip}.mp4`, '-an', '-vsync', 'cfr', '-r', '24',
    '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-pix_fmt', 'yuv420p', part],
    { stdio: 'inherit' });
  if (run.status !== 0) process.exit(1);
  parts.push(part);
});

writeFileSync('/tmp/cut/parts.txt', parts.map((p) => `file '${p}'`).join('\n'));
spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0',
  '-i', '/tmp/cut/parts.txt', '-c', 'copy', OUT], { stdio: 'inherit' });
console.log(`\n${OUT}  ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
