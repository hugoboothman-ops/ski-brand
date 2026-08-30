# KALTHAUS

A scroll-driven site for a ski and snowboard apparel brand. Video is the
primary medium: scroll position drives the hero video's playhead, and overlay
copy is cued to positions on that same timeline.

Static HTML, CSS and JavaScript. No build step, no framework, no dependencies
at runtime.

```
npm install
npm run dev          # serve at http://localhost:4173
npm run preview      # local preview copy, see below
npm run derivatives  # rebuild the local-only video copies
npm run artifact     # bundle to one self-contained HTML file
```

Nothing is required to build the site itself — `index.html` and `assets/` are
the whole deliverable. The scripts above are tooling.

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
| IV | **The fit room** | `#range` | Pick a look, send weather at it |
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
all-keyframe WebM of the same edit came to 16 MB against the MP4's 12 MB —
weight for an audience that does not exist. Add a WebM source only if
analytics turn one up.

A white frame around the page is not the page. Measured at four viewport
sizes, the outermost rendered row and column match the rows 3, 6 and 12px
inside them — the page paints its own ground right to its edge. A border
seen around it belongs to whatever is displaying it, and nothing inside a
document can paint over the frame around that document. Scaling the hero
does not reach it; open the page on its own URL instead.

**The master is 1280×720, and that is the quality ceiling.** `object-fit:
cover` plus the pan scales it about 1.3× on a 1440-wide window, and roughly
2.6× on a retina screen. Most of the softness is that upscale, not the
encode — dropping CRF from 26 to 22 cost 3.4 MB for a small gain. A 1080p or
4K master would do far more than any encoder setting.

To replace the edit, drop the new file at the same path, re-encode as below,
and update `poster`.

### Encoding for scrubbing

Scrubbing is seeking, not playing. A normal delivery encode has a keyframe
every 2–10 seconds, so every scroll frame forces the decoder to rebuild from
the last keyframe and the scrub stutters. **Encode the hero with every frame a
keyframe:**

```sh
ffmpeg -i joined.mp4 -an -c:v libx264 -preset veryslow -crf 22 \
       -g 1 -keyint_min 1 -sc_threshold 0 \
       -pix_fmt yuv420p -movflags +faststart -vf fps=24 \
       assets/video/hero.mp4
```

This inflates the file — budget for it. The current edit lands at 12.4 MB.
Strip the audio track; the hero is silent by design.

Two knobs in the stylesheet:

| | |
|---|---|
| `.hero { height }` | Scroll length. 820vh paces 25.7s at ~300px of scroll per second |
| `--hero-zoom` | How far the footage is panned in. `1` shows the delivered frame exactly, and is sharpest — the master is 720p and `cover` already upscales it. Raise only for composition |

### Re-timing the copy

Overlay copy is positioned on the video timeline, not on scroll distance.
Each block carries normalised in/out points:

```html
<div class="cue cue--left" data-in="0.40" data-out="0.63">
```

`0` is the first frame, `1` is the last. Re-timing the edit means editing
these numbers — nothing else. To lengthen or shorten the scrub itself, change
`.hero { height }` in `assets/css/styles.css`.

## Sound

The footage arrives silent, so the wind is **synthesised rather than shipped**:
looping noise through a gusting lowpass for the storm body, a 38 Hz sine
underneath for weight. Both are driven by the same intensity curve that moves
the instrument readout, so the mix tracks scroll position exactly and there is
no audio file to download.

It is **off until asked for**, via the control in the top right. Browsers block
unprompted audio anyway, and a site that makes noise at you unasked is a site
people close. The choice is deliberately not remembered across visits: audio
needs a user gesture to start, so a remembered "on" could only fire on some
later unrelated click — exactly the unasked-for noise this avoids.

Sound belongs to the hero. Past it the mix falls to silence.

Tuning is in `assets/js/sound.js`: `windGain` and `subGain` set the balance,
the LFO frequency and depth set how often it gusts.

## The fit room

The main event: pick a look, then put it under the conditions it was built
for. Selecting a look holds it on frame one; **Send the weather** plays its
clip through once, and it settles on the aftermath rather than resetting —
seeing the garment after the hit is the whole point.

**One clip per look.** Each is the same shot: the figure standing still, the
load arriving, then it clearing. Adding or swapping a look means editing two
attributes — no code:

```html
<button class="look" type="button" aria-pressed="false"
        data-clip="assets/video/looks/leeward-parka.mp4"
        data-still="assets/video/looks/leeward-parka.jpg">
```

| | |
|---|---|
| `data-clip` | The look's clip. Roughly 5s: hold, hit, settle |
| `data-still` | Poster frame, shown before playback and while loading |

The clips in `assets/video/looks/` are **placeholders cut from the hero
footage** so the interaction can be felt before real ones exist. They are
deliberately small; real ones can be heavier.

Unlike the hero these are played, not scrubbed, so they do **not** need
all-keyframe encoding — a normal encode is smaller and looks better:

```sh
ffmpeg -i look.mov -an -c:v libx264 -crf 23 -preset slow \
       -pix_fmt yuv420p -movflags +faststart assets/video/looks/<name>.mp4
ffmpeg -i look.mov -frames:v 1 -q:v 4 assets/video/looks/<name>.jpg
```

The readout beside the button climbs with the clip's own playhead rather
than on a timer, so the numbers always agree with the picture. If the sound
is on, the wind swells with it.

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
canvas fallback — wrong twice over, with no error. `npm run preview` writes
`index-fonttest.html` with self-hosted fonts and a VP9 copy of the hero
substituted in, so what you review is what users get.

Both video substitutes are local-only and gitignored. `npm run derivatives`
rebuilds them from `assets/video/hero.mp4`:

| File | Why |
|---|---|
| `hero-verify.webm` | VP9, so the sandbox Chromium can decode it |
| `hero-embed.mp4` | Lower bitrate, small enough to inline as a data URI in the artifact bundle |

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
