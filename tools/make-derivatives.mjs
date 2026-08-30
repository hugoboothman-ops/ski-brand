/**
 * Rebuilds the local-only derivatives of assets/video/hero.mp4.
 *
 * Neither ships. They exist because two things in this environment cannot
 * play the real hero:
 *
 *   hero-verify.webm  VP9 copy. The sandbox Chromium is built without H.264,
 *                     so screenshots of the real file silently fall back to
 *                     the canvas storm instead of showing the footage.
 *   hero-embed.mp4    Smaller copy for the self-contained artifact build,
 *                     where the video is inlined as a data URI and the whole
 *                     page has to stay under 16 MB.
 *
 *   npm run derivatives
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG || require('ffmpeg-static');
const src = resolve(root, 'assets/video/hero.mp4');

if (!existsSync(src)) {
  console.error(`Missing ${src}. Nothing to derive from.`);
  process.exit(1);
}

const jobs = [
  {
    out: 'assets/video/hero-verify.webm',
    args: ['-an', '-vf', 'fps=24', '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0',
           '-g', '1', '-deadline', 'realtime', '-cpu-used', '6', '-row-mt', '1']
  },
  {
    out: 'assets/video/hero-embed.mp4',
    args: ['-an', '-vf', 'fps=24', '-c:v', 'libx264', '-preset', 'slow',
           '-crf', '30', '-g', '1', '-keyint_min', '1', '-sc_threshold', '0',
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
  }
];

for (const job of jobs) {
  const dest = resolve(root, job.out);
  process.stdout.write(`${job.out} … `);
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', src, ...job.args, dest],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error('failed'); process.exit(1); }
  console.log(`${(statSync(dest).size / 1e6).toFixed(2)} MB`);
}
