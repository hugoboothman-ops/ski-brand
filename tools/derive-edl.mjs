/**
 * Derives an edit decision list: for every frame of the edit, finds the
 * closest frame across all raw clips, then collapses the result into runs.
 * Robust where clips are near-identical, because it decides frame by frame
 * rather than by sliding a whole clip along.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');

const FPS = 8, W = 48, H = 27;

function sig(file, crop) {
  const vf = [`fps=${FPS}`, crop, `scale=${W}:${H}`, 'format=gray'].filter(Boolean).join(',');
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', vf,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 });
  const b = r.stdout, n = W * H, out = [];
  for (let i = 0; i + n <= b.length; i += n) out.push(b.subarray(i, i + n));
  return out;
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const edit = sig(process.argv[2], null);
const clips = readdirSync('/tmp/raw').filter((f) => /^g\d+v\d+\.mp4$/.test(f)).sort();
const banks = clips.map((c) => ({ name: c.replace('.mp4', ''), frames: sig('/tmp/raw/' + c, 'crop=768:432:0:40') }));

const picks = edit.map((f) => {
  let best = { d: Infinity, name: '?', at: 0 };
  for (const b of banks) {
    for (let i = 0; i < b.frames.length; i++) {
      const d = dist(f, b.frames[i]);
      if (d < best.d) best = { d, name: b.name, at: i / FPS };
    }
  }
  return best;
});

// collapse into runs
let runs = [], cur = null;
picks.forEach((p, i) => {
  const t = i / FPS;
  if (!cur || cur.name !== p.name) { cur = { name: p.name, from: t, to: t, srcFrom: p.at, srcTo: p.at, d: [p.d] }; runs.push(cur); }
  else { cur.to = t; cur.srcTo = p.at; cur.d.push(p.d); }
});

console.log('edit time      clip     source in/out    mean diff');
for (const r of runs) {
  const dur = r.to - r.from + 1 / FPS;
  if (dur < 0.3) continue;                       // ignore single-frame noise
  const md = r.d.reduce((a, b) => a + b, 0) / r.d.length;
  console.log(`${r.from.toFixed(2).padStart(5)}–${r.to.toFixed(2).padStart(5)}s  ` +
    `${r.name.padEnd(6)}  ${r.srcFrom.toFixed(2)}→${r.srcTo.toFixed(2)}s`.padEnd(22) +
    `${md.toFixed(1).padStart(5)}`);
}
