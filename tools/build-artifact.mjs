/**
 * Bundles the site into one self-contained HTML file for publishing.
 *
 * The Artifact CSP admits Google Fonts and nothing else, so the stylesheet,
 * both scripts, the poster and the hero video are all inlined. The video
 * becomes a data URI, which the browser holds in memory — so it stays
 * seekable, and the scrub keeps working without a Range-serving host.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const b64 = (p) => readFileSync(resolve(root, p)).toString('base64');

const html = read('index.html');
const css = read('assets/css/styles.css');
const storm = read('assets/js/storm.js');
const scene = read('assets/js/scene.js');

const video = `data:video/mp4;base64,${b64('assets/video/hero-embed.mp4')}`;
const poster = `data:image/jpeg;base64,${b64('assets/video/hero-poster.jpg')}`;

const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@300;400;500&family=Newsreader:ital,opsz,wght@1,6..72,200..500&display=swap';

// Take the page content only — the artifact host supplies the document shell.
let body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
body = body
  .replace(/\n<script src="assets\/js\/[^"]+"><\/script>/g, '')
  .replace('src="assets/video/hero.mp4"', `src="${video}"`)
  .replace('poster="assets/video/hero-poster.jpg"', `poster="${poster}"`);

const out = `<title>Kalthaus</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
/* The host document scrolls, so the pinned stage measures against it. */
html, body { max-width: 100%; }
</style>
<script>document.documentElement.className = 'js';</script>
${body}
<script>
${storm}
</script>
<script>
${scene}
</script>
`;

const dest = resolve(root, 'tools/kalthaus-artifact.html');
writeFileSync(dest, out);
console.log(`${dest} — ${(statSync(dest).size / 1e6).toFixed(2)} MB`);
