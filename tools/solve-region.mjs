/** For each short window in a time range, finds the best (clip, source offset). */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');

const EDIT = '/tmp/cut/joined.mp4';
const FINE = 24, W = 64, H = 36, WIN = 0.5;
const from = Number(process.argv[2]), to = Number(process.argv[3]);

function frames(file, start, dur, crop) {
  const vf = [crop, `scale=${W}:${H}`, 'format=gray'].filter(Boolean).join(',');
  const r = spawnSync(ffmpeg, ['-v', 'error', '-ss', String(start), '-t', String(dur),
    '-i', file, '-vf', `fps=${FINE},${vf}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 1 << 28 });
  const b = r.stdout, n = W * H, out = [];
  for (let i = 0; i + n <= b.length; i += n) out.push(b.subarray(i, i + n));
  return out;
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const clips = readdirSync('/tmp/raw').filter((f) => /^g\d+v\d+\.mp4$/.test(f)).sort()
  .map((f) => ({ name: f.replace('.mp4', ''), frames: frames('/tmp/raw/' + f, 0, 6, 'crop=768:432:0:40') }));

console.log('window        clip    src in    diff');
for (let t = from; t < to - 0.05; t += WIN) {
  const dur = Math.min(WIN, to - t);
  const tgt = frames(EDIT, t, dur, null);
  let best = { d: Infinity, name: '?', at: 0 };
  for (const c of clips) {
    for (let i = 0; i + tgt.length <= c.frames.length; i++) {
      let d = 0;
      for (let k = 0; k < tgt.length; k++) d += dist(tgt[k], c.frames[i + k]);
      d /= tgt.length;
      if (d < best.d) best = { d, name: c.name, at: i / FINE };
    }
  }
  console.log(`${t.toFixed(2)}–${(t + dur).toFixed(2)}s  ${best.name.padEnd(6)}  ${best.at.toFixed(3)}s   ${best.d.toFixed(1)}`);
}
