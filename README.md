# KALTHAUS

A scroll-driven site for a ski and snowboard apparel brand. Video is the
primary medium: scroll position drives the hero video's playhead, and overlay
copy is cued to positions on that same timeline.

Static HTML, CSS and JavaScript. No build step, no framework, no dependencies
at runtime.

```
npm run dev     # serve at http://localhost:4173
```

## The concept

Blackout theatre, in five acts.

| Act | | Where |
|---|---|---|
| — | Cold open, in near-darkness | hero, `t 0.00–0.10` |
| I | **Environment** — the weather, before anything else | hero, `t 0.13–0.34` |
| II | **Arrival** — a lone figure, still, in contrast to the storm | hero, `t 0.40–0.63` |
| III | **Reveal** — attention narrows onto the kit | hero, `t 0.70–0.94` |
| IV | **Product** — Winter 01 | `#range` |
| V | **Close** — the storm stops | `#close` |

Product is a consequence of the environment, not a shop front: the garment is
literally invisible until the camera pushes into it in Act III.

The figure is drawn as an **absence**. The storm is rendered across the whole
frame, then the silhouette is punched out of it with `destination-out`. The
only still thing on screen is a hole in the weather. As Act III pushes in, the
hole fills with fabric and seams — the reveal is the silhouette becoming
material.

## Swapping in the real footage

The hero currently plays generated placeholder footage. To replace it:

1. Drop the final files into `assets/video/`.
2. Update the `<source>` elements in `index.html`:

   ```html
   <video class="hero__video" id="hero-video" ...>
     <source src="assets/video/hero.mp4"  type="video/mp4">
     <source src="assets/video/hero.webm" type="video/webm">
   </video>
   ```

   List MP4 first — Safari's WebM support is partial, and the placeholder is
   VP8/WebM only because that is what the sandbox could encode.
3. Update `poster` to a frame from the new edit.

### Encoding for scrubbing

Scrubbing is seeking, not playing. A normal delivery encode has a keyframe
every 2–10 seconds, so every scroll frame forces the decoder to rebuild from
the last keyframe and the scrub stutters. **Encode the hero with every frame a
keyframe:**

```sh
ffmpeg -i master.mov -c:v libx264 -crf 20 -g 1 -keyint_min 1 \
       -pix_fmt yuv420p -movflags +faststart -an assets/video/hero.mp4

ffmpeg -i master.mov -c:v libvpx-vp9 -crf 32 -b:v 0 -g 1 \
       -an assets/video/hero.webm
```

This inflates the file — budget for it. Keep the hero under about 12 MB:
1280×720 at 24fps is plenty, since the frame is dark and mostly atmosphere.
Strip the audio track; the hero is silent by design.

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
