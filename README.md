# KALTHAUS

A scroll-driven site for a ski and snowboard apparel brand. Video is the
primary medium: scroll position drives the hero video's playhead, and overlay
copy is cued to positions on that same timeline.

Static HTML, CSS and JavaScript. No build step, no framework, no dependencies
at runtime.

```
npm install
npm run dev     # serve at http://localhost:4173
```

## Hosting requirement

**The host must serve HTTP Range requests.** Scrubbing is seeking, and a
browser will only seek within `video.seekable` — which is empty unless the
server answers `Range` with `206 Partial Content`. Without it every
`currentTime` assignment is silently ignored and the hero sits frozen on the
first frame with no error anywhere.

Netlify, Vercel, Cloudflare Pages, S3/CloudFront and nginx all do this by
default. Python's `http.server` does not, which is why `npm run dev` runs
`tools/serve.mjs` instead. The site detects the failure at runtime and falls
back to the live canvas storm, but that is a safety net, not the intent.

## Deploying

A GitHub Actions workflow (`.github/workflows/deploy.yml`) publishes the site
to GitHub Pages on every push. **Pages has to be switched on once, by hand:**

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Then re-run the workflow from the Actions tab. Until that is done the run
fails at `configure-pages`; everything before it, including staging the site,
already works. The workflow token cannot enable Pages itself — the API answers
`Resource not accessible by integration`, since creating a Pages site needs
admin rights the token does not carry.

The site lands at `https://<owner>.github.io/<repo>/`. All asset paths are
relative, so it works from a subpath without configuration.

Netlify and Vercel need no config either — point them at the repository, leave
the build command empty and the publish directory as the repository root.

## The concept

Blackout theatre, in five acts.

The acts follow the footage's own beats, not an imposed structure:

| Act | | Timeline | What is on screen |
|---|---|---|---|
| — | Cold open | `0.00–0.055` | Eye contact, hood up, white ground |
| I | **Arrival** | `0.075–0.145` | The portrait, still holding |
| II | **Reveal** | `0.17–0.28` | Camera pulls back; skis, shell, poles |
| III | **Environment** | `0.38–0.60` | Ground cuts to black, snow lets go |
| — | Pull quote | `0.66–0.88` | Stillness against chaos |
| IV | **Product** | `#range` | Winter 01 |
| V | **Close** | `#close` | The storm stops |

Product is a consequence of the environment, not a shop front: the kit is only
named once the camera has pulled back far enough to show it being worn.

**Scrims, not a repaint.** The edit cuts between white grounds and black
grounds several times, so light copy cannot survive on its own and a
scroll-locked light/dark type inversion would strobe as the shots cut. Instead
a gradient scrim fades in behind the copy — and only while copy is on screen,
so the image is never dimmed for nothing. Opacity is driven from which cue is
live (`--scrim-l`, `--scrim-r`, `--scrim-o`).

## The footage

`assets/video/hero.mp4` is the graded edit, 25.7s at 1280×720. It was
delivered in two halves and joined before encoding:

```sh
# strip the attached-picture stream so concat sees one video stream each
ffmpeg -i part1.mov -map 0:0 -an -c copy a.mp4
ffmpeg -i part2.mov -map 0:0 -an -c copy b.mp4
printf "file 'a.mp4'\nfile 'b.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4
```

**H.264 MP4 only, deliberately.** Every current browser decodes H.264, and an
all-keyframe WebM of the same edit came to 17 MB against the MP4's 9 MB —
weight for an audience that does not exist. Add a WebM source only if
analytics turn one up.

To replace the edit, drop the new file at the same path, re-encode as below,
and update `poster`.

### Encoding for scrubbing

Scrubbing is seeking, not playing. A normal delivery encode has a keyframe
every 2–10 seconds, so every scroll frame forces the decoder to rebuild from
the last keyframe and the scrub stutters. **Encode the hero with every frame a
keyframe:**

```sh
ffmpeg -i joined.mp4 -an -c:v libx264 -preset slow -crf 26 \
       -g 1 -keyint_min 1 -sc_threshold 0 \
       -pix_fmt yuv420p -movflags +faststart -vf fps=24 \
       assets/video/hero.mp4
```

This inflates the file — budget for it. The current edit lands at 9.0 MB;
keep the hero under about 12 MB. 1280×720 at 24fps is plenty. Strip the audio
track; the hero is silent by design.

Scroll length is set by `.hero { height }` in the stylesheet — 820vh paces
25.7s of footage at roughly 300px of scroll per second.

### Re-timing the copy

Overlay copy is positioned on the video timeline, not on scroll distance.
Each block carries normalised in/out points:

```html
<div class="cue cue--left" data-in="0.40" data-out="0.63">
```

`0` is the first frame, `1` is the last. Re-timing the edit means editing
these numbers — nothing else. To lengthen or shorten the scrub itself, change
`.hero { height }` in `assets/css/styles.css`.

## Product slots

Every placeholder is a `.slot` with an empty `data-src`. Fill one by pointing
it at an image:

```html
<div class="slot slot--jacket" data-slot="jacket" data-src="assets/img/whiteout-shell.jpg">
```

The script sets the background and hides the placeholder label. Slots are
sized to their subject: jackets are 3:4 portrait, ski topsheets are tall
verticals racked in threes.

| Slot | Count | Ratio |
|---|---|---|
| `slot--jacket` | 3 | 3:4 |
| `slot--ski` | 3 | tall vertical |

## Regenerating the placeholder

```
npm install
npm run placeholder
```

`tools/render-placeholder.mjs` drives `assets/js/storm.js` frame by frame in
headless Chromium and pipes the frames to ffmpeg. Because the simulation is
seeded and stepped with a fixed `dt`, the render is reproducible.

`tools/shoot-site.mjs` screenshots the running site at a list of positions.
Prefix a value with `h:` to address the hero video timeline rather than the
whole page, which is what you want when checking where copy lands:

```
./tools/preview-build.sh                                            # first
node tools/shoot-site.mjs http://localhost:4173/index-fonttest.html h:0.11,h:0.45
node tools/shoot-site.mjs http://localhost:4173/index-fonttest.html 0.8,1.0 390 844
```

**Why the preview copy exists.** The sandbox browser cannot reach
`fonts.googleapis.com` and its Chromium is built without H.264, so screenshots
of `index.html` silently render in fallback fonts with the hero dropped to the
canvas fallback. `tools/preview-build.sh` writes `index-fonttest.html` with
self-hosted fonts and a VP9 copy of the hero substituted in. Neither
substitution ships; both exist so what you review is what users get.

`tools/preview-frames.mjs` renders single frames across the timeline into
`tools/preview/` for checking the look without a full encode:

```
node tools/preview-frames.mjs 0.1,0.5,0.9
```

## Files

```
index.html              markup, copy, and the cue in/out points
assets/css/styles.css   tokens, type, layout
assets/js/storm.js      the storm simulation — shared by the placeholder
                        renderer, the no-video fallback and the closing act
assets/js/scene.js      scrubbing, cues, instrument readout, slots, signup
tools/                  placeholder rendering (not shipped)
```

## Behaviour worth knowing

- **No video, no problem.** If the file is missing or the codec is
  unsupported, the hero falls back to rendering the same storm live on a
  canvas, driven by the same scroll position and the same story curve.
- **The readout is real.** The instrument strip along the bottom reports the
  actual state of the simulation — wind tracks the particle wind, temperature
  falls as the storm builds, the clock runs from 15:02 to 17:20 as the light
  goes. It replaces section numbering.
- **Reduced motion is respected.** `prefers-reduced-motion` removes the
  playhead easing, the reveal transitions and the ambient closing snow. The
  scrub itself is kept: it is 1:1 with the user's own scroll input.
- **Copy stays readable.** Hero overlays fade rather than unmount, so all of
  the narrative copy is in the accessibility tree at every scroll position.

## Still to wire

The signup form validates and confirms in the UI but posts nowhere. Point it
at the list provider in `assets/js/scene.js` before launch.
