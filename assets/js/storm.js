/* ==========================================================================
   KALTHAUS — storm renderer
   One simulation, three consumers:
     1. tools/render-placeholder.mjs  — renders the placeholder hero footage
     2. the hero fallback canvas      — if the video cannot decode
     3. the closing act               — snow settling, low intensity
   Deterministic when stepped with a fixed dt from a fixed seed, so the
   generated footage is reproducible.
   ========================================================================== */
(function (global) {
  'use strict';

  var FROST = '168, 188, 198';
  var BONE = '233, 229, 221';

  /* figure local box */
  var FW = 104, FH = 260;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* Normalised ramp: 0 below `from`, 1 above `to`, eased between. */
  function ramp(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return ease((t - from) / (to - from));
  }

  /* ------------------------------------------------------------------------
     The story. Timeline position (0..1) -> what the frame is doing.
     Shared by the renderer, the HUD and the iris so they never disagree.
     ------------------------------------------------------------------------ */
  function storyState(t) {
    t = clamp(t, 0, 1);

    var intensity;
    if (t < 0.10) intensity = lerp(0.18, 0.46, t / 0.10);
    else if (t < 0.40) intensity = lerp(0.46, 1, (t - 0.10) / 0.30);
    else if (t < 0.66) intensity = 1;
    else intensity = lerp(1, 0.26, ease((t - 0.66) / 0.34));

    return {
      t: t,
      intensity: intensity,
      figure: ramp(t, 0.30, 0.45) * lerp(1, 0.86, ramp(t, 0.72, 1)),
      material: ramp(t, 0.68, 0.95),
      push: ramp(t, 0.64, 1),
      veil: 1
    };
  }

  /* Figure: hooded, still, skis planted alongside.
     One union of subpaths — filled with nonzero winding so the interior
     joins never show. Never stroke it: stroking would trace every buried
     subpath edge and turn it into a paper cutout. */
  function buildFigure() {
    var p = new Path2D();

    /* hood + head */
    p.moveTo(36, 54);
    p.bezierCurveTo(30, 26, 38, 6, 50, 6);
    p.bezierCurveTo(62, 6, 70, 26, 64, 54);
    p.closePath();

    /* parka — boxy, hip length, dropped shoulder */
    p.moveTo(50, 44);
    p.bezierCurveTo(66, 46, 77, 58, 78, 78);
    p.lineTo(75, 150);
    p.bezierCurveTo(62, 158, 38, 158, 25, 150);
    p.lineTo(22, 78);
    p.bezierCurveTo(23, 58, 34, 46, 50, 44);
    p.closePath();

    /* arms, hanging still */
    p.moveTo(24, 76); p.lineTo(16, 82); p.lineTo(13, 142); p.lineTo(23, 146); p.closePath();
    p.moveTo(76, 76); p.lineTo(84, 82); p.lineTo(87, 142); p.lineTo(77, 146); p.closePath();

    /* legs into ski boots */
    p.moveTo(33, 146); p.lineTo(47, 146); p.lineTo(47, 224);
    p.lineTo(49, 224); p.lineTo(49, 252); p.lineTo(30, 252); p.lineTo(30, 224);
    p.lineTo(33, 224); p.closePath();
    p.moveTo(53, 146); p.lineTo(67, 146); p.lineTo(67, 224);
    p.lineTo(70, 224); p.lineTo(70, 252); p.lineTo(51, 252); p.lineTo(51, 224);
    p.lineTo(53, 224); p.closePath();

    /* skis planted to the right, tips curled */
    p.moveTo(88, 52); p.bezierCurveTo(88, 38, 94, 38, 94, 52);
    p.lineTo(94, 252); p.lineTo(88, 252); p.closePath();
    p.moveTo(97, 48); p.bezierCurveTo(97, 34, 103, 34, 103, 48);
    p.lineTo(103, 252); p.lineTo(97, 252); p.closePath();

    return p;
  }

  /* Seams, drawn clipped inside the figure once the material reveals. */
  function seams(ctx) {
    ctx.beginPath();
    ctx.moveTo(50, 46); ctx.lineTo(50, 154);            /* centre zip */
    ctx.moveTo(24, 80); ctx.bezierCurveTo(38, 74, 62, 74, 76, 80); /* shoulder yoke */
    ctx.moveTo(56, 98); ctx.lineTo(72, 98);             /* chest pocket */
    ctx.moveTo(23, 122); ctx.lineTo(77, 122);           /* waist baffle */
    ctx.moveTo(16, 108); ctx.lineTo(24, 108);           /* sleeve articulation */
    ctx.moveTo(84, 108); ctx.lineTo(76, 108);
    ctx.stroke();
  }

  function createStorm(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var rand = mulberry32(opts.seed == null ? 0x5c01d : opts.seed);
    var figure = buildFigure();
    var density = opts.density == null ? 1 : opts.density;
    var figureX = opts.figureX == null ? 0.62 : opts.figureX;
    var baseY = opts.baseY == null ? 0.9 : opts.baseY;
    var figureH = opts.figureH == null ? 0.7 : opts.figureH;
    var ground = opts.ground !== false;
    var sky = opts.sky !== false;

    var W = 0, H = 0, dpr = 1, clock = 0;
    var flakes = [], near = [], haze = [], drift = [];
    var grain = null;

    /* A dark gradient is the worst thing you can hand a video encoder: it
       bands into visible blocks. Dithering the source frame prevents it, and
       reads as film grain either way. */
    function buildGrain() {
      var n = 128;
      var tile = document.createElement('canvas');
      tile.width = n; tile.height = n;
      var g = tile.getContext('2d');
      var img = g.createImageData(n, n);
      for (var i = 0; i < n * n; i++) {
        var v = 100 + rand() * 56;
        img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      grain = ctx.createPattern(tile, 'repeat');
    }

    function build() {
      var n = clamp(Math.round((W * H) / 1750 * density), 220, 1900);
      flakes.length = 0;
      for (var i = 0; i < n; i++) {
        flakes.push({
          x: rand() * W, y: rand() * H,
          z: Math.pow(rand(), 1.25),         /* biased far — most snow is distant */
          r: 0,
          sway: 0.35 + rand() * 1.8,
          ph: rand() * 6.2832,
          spd: 0.55 + rand() * 0.95,
          len: 0.45 + rand() * 1.5,
          vx: 0, vy: 0
        });
        var f = flakes[i];
        f.r = 0.35 + f.z * 1.7;
      }

      /* Foreground snow, out of focus — the depth cue that sells a plate. */
      near.length = 0;
      var m = clamp(Math.round(n * 0.016), 6, 26);
      for (var k = 0; k < m; k++) {
        near.push({
          x: rand() * W, y: rand() * H,
          r: W * (0.004 + rand() * 0.011),
          spd: 1.9 + rand() * 1.9,
          sway: 0.3 + rand() * 0.8,
          ph: rand() * 6.2832,
          a: 0.035 + rand() * 0.055
        });
      }

      haze.length = 0;
      for (var j = 0; j < 6; j++) {
        haze.push({
          x: rand() * W,
          y: H * (0.1 + rand() * 0.75),
          r: W * (0.22 + rand() * 0.4),
          spd: 0.1 + rand() * 0.34,
          a: 0.03 + rand() * 0.045
        });
      }

      /* Spindrift running along the snow surface. */
      drift.length = 0;
      for (var d = 0; d < 14; d++) {
        drift.push({
          x: rand() * W,
          y: 1 - Math.pow(rand(), 2),        /* hugs the surface */
          w: W * (0.06 + rand() * 0.2),
          spd: 1.1 + rand() * 1.6,
          a: 0.05 + rand() * 0.09
        });
      }
    }

    function resize(w, h, ratio) {
      W = Math.max(1, Math.round(w));
      H = Math.max(1, Math.round(h));
      dpr = ratio || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      build();
      buildGrain();
    }

    function fit(maxDpr) {
      var r = canvas.getBoundingClientRect();
      resize(r.width || 1, r.height || 1,
        Math.min(global.devicePixelRatio || 1, maxDpr || 2));
    }

    function step(dt, s) {
      clock += dt;
      var wind = lerp(4, 210, s.intensity);
      var fall = lerp(30, 96, s.intensity);
      var i, f, depth;

      for (i = 0; i < flakes.length; i++) {
        f = flakes[i];
        depth = 0.22 + f.z * 1.25;
        f.vx = wind * depth + Math.sin(clock * f.sway + f.ph) * 22 * s.intensity;
        f.vy = fall * depth * f.spd;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.x > W + 40) { f.x = -40; f.y = rand() * H; }
        else if (f.x < -40) { f.x = W + 40; }
        if (f.y > H + 40) { f.y = -40; f.x = rand() * W; }
      }

      for (i = 0; i < near.length; i++) {
        var p = near[i];
        p.x += (wind * p.spd + Math.sin(clock * p.sway + p.ph) * 30) * dt;
        p.y += fall * p.spd * 1.3 * dt;
        if (p.x - p.r > W) { p.x = -p.r; p.y = rand() * H; }
        if (p.y - p.r > H) { p.y = -p.r; p.x = rand() * W; }
      }

      for (i = 0; i < haze.length; i++) {
        var g = haze[i];
        g.x += wind * g.spd * 0.32 * dt;
        if (g.x - g.r > W) g.x = -g.r;
      }

      for (i = 0; i < drift.length; i++) {
        var d = drift[i];
        d.x += wind * d.spd * dt;
        if (d.x - d.w > W) { d.x = -d.w; d.y = 1 - Math.pow(rand(), 2); }
      }
    }

    function draw(s) {
      var fh = H * figureH;
      var fw = fh * (FW / FH);
      var fx = W * figureX - fw / 2;
      var horizon = H * baseY;
      var fy = horizon - fh * (252 / FH);
      var unit = fh / FH;
      var chestX = fx + 50 * unit;
      var chestY = fy + 92 * unit;
      var pushScale = 1 + (s.push || 0) * 2.2;
      var i;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      /* cold sky — omitted where the canvas sits over page background it
         must not seam against */
      if (sky) {
        var wash = ctx.createLinearGradient(0, 0, 0, H);
        wash.addColorStop(0, '#080d12');
        wash.addColorStop(0.55, '#05080b');
        wash.addColorStop(1, '#030507');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.save();
      ctx.translate(chestX, chestY);
      ctx.scale(pushScale, pushScale);
      ctx.translate(-chestX, -chestY);

      /* what is left of the sun, somewhere behind all that */
      if (sky) {
      var sun = ctx.createRadialGradient(W * 0.38, H * 0.14, 0, W * 0.38, H * 0.14, W * 0.72);
      sun.addColorStop(0, 'rgba(' + FROST + ',' + (0.042 * lerp(0.45, 1, s.intensity)).toFixed(4) + ')');
      sun.addColorStop(0.45, 'rgba(' + FROST + ',' + (0.012 * s.intensity).toFixed(4) + ')');
      sun.addColorStop(1, 'rgba(' + FROST + ',0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
      }

      /* the snowfield */
      if (ground) {
        var gnd = ctx.createLinearGradient(0, horizon - H * 0.05, 0, H);
        gnd.addColorStop(0, 'rgba(' + FROST + ',0)');
        gnd.addColorStop(0.28, 'rgba(' + FROST + ',' + (0.062 * lerp(0.55, 1, s.intensity)).toFixed(4) + ')');
        gnd.addColorStop(1, 'rgba(' + FROST + ',0.012)');
        ctx.fillStyle = gnd;
        ctx.fillRect(0, horizon - H * 0.05, W, H - horizon + H * 0.05);
      }

      /* spindrift haze */
      for (i = 0; i < haze.length; i++) {
        var g = haze[i];
        var rg = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
        rg.addColorStop(0, 'rgba(' + FROST + ',' + (g.a * s.intensity).toFixed(4) + ')');
        rg.addColorStop(1, 'rgba(' + FROST + ',0)');
        ctx.fillStyle = rg;
        ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
      }

      /* driven snow — dots when calm, streaks along the true velocity when it blows */
      ctx.strokeStyle = 'rgb(' + FROST + ')';
      ctx.fillStyle = 'rgb(' + FROST + ')';
      ctx.lineCap = 'round';
      var bright = lerp(0.42, 1, s.intensity) * s.veil;
      for (i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        ctx.globalAlpha = (0.055 + f.z * 0.5) * bright;
        var seconds = f.len * 0.055 * s.intensity;
        var dx = f.vx * seconds, dy = f.vy * seconds;
        if (dx * dx + dy * dy > 30) {
          ctx.lineWidth = f.r * 1.05;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x - dx, f.y - dy);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      /* --- the figure ------------------------------------------------------
         Punched out of the storm rather than drawn on top of it: the only
         still thing in frame is an absence. Material fills in later, as the
         camera pushes in and the garment becomes the subject.
         -------------------------------------------------------------------- */
      if (s.figure > 0.001) {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(unit, unit);
        var px = 1 / (unit * pushScale);

        /* Rim light: an offset copy laid down first, then carved back by the
           silhouette itself — only the sliver the weather catches survives.
           Squared so the interior never ghosts while the figure fades in. */
        ctx.globalAlpha = s.figure * s.figure * (0.30 + 0.3 * s.material);
        ctx.fillStyle = 'rgba(' + BONE + ',1)';
        ctx.save();
        ctx.translate(-px * 1.6, -px * 1.6);
        ctx.fill(figure);
        ctx.restore();

        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = s.figure;
        ctx.fillStyle = '#000';
        ctx.fill(figure);

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = s.figure;
        ctx.fillStyle = '#050607';
        ctx.fill(figure);
        ctx.globalAlpha = 1;

        if (s.material > 0.001) {
          ctx.save();
          ctx.clip(figure);
          var fab = ctx.createLinearGradient(6, 16, 100, 250);
          fab.addColorStop(0, 'rgba(32, 41, 48, ' + s.material.toFixed(3) + ')');
          fab.addColorStop(0.42, 'rgba(17, 22, 27, ' + s.material.toFixed(3) + ')');
          fab.addColorStop(1, 'rgba(8, 10, 13, ' + s.material.toFixed(3) + ')');
          ctx.fillStyle = fab;
          ctx.fillRect(0, 0, FW, FH);

          ctx.globalAlpha = 0.42 * s.material;
          ctx.strokeStyle = 'rgba(' + BONE + ',1)';
          ctx.lineWidth = px * 1.05;
          seams(ctx);
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      /* spindrift racing across the surface, in front of the figure's feet */
      if (ground) {
        for (i = 0; i < drift.length; i++) {
          var d = drift[i];
          var dy2 = horizon + (H - horizon) * d.y * 0.85;
          var lg = ctx.createLinearGradient(d.x, 0, d.x + d.w, 0);
          lg.addColorStop(0, 'rgba(' + FROST + ',0)');
          lg.addColorStop(0.5, 'rgba(' + FROST + ',' + (d.a * s.intensity).toFixed(4) + ')');
          lg.addColorStop(1, 'rgba(' + FROST + ',0)');
          ctx.fillStyle = lg;
          ctx.fillRect(d.x, dy2, d.w, Math.max(1, H * 0.006));
        }
      }

      /* foreground snow, out of focus */
      for (i = 0; i < near.length; i++) {
        var p = near[i];
        var ng = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        ng.addColorStop(0, 'rgba(' + FROST + ',' + (p.a * bright).toFixed(4) + ')');
        ng.addColorStop(0.55, 'rgba(' + FROST + ',' + (p.a * 0.45 * bright).toFixed(4) + ')');
        ng.addColorStop(1, 'rgba(' + FROST + ',0)');
        ctx.fillStyle = ng;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }

      ctx.restore();

      /* Overlay keeps mid-grey as identity, so this dithers the gradient
         without lifting the blacks. Screen space — grain does not scale with
         the camera push, and real grain does not either. */
      if (grain && sky) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 1;
        ctx.fillStyle = grain;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    return {
      resize: resize,
      fit: fit,
      step: step,
      draw: draw,
      frame: function (dt, s) { step(dt, s); draw(s); },
      size: function () { return { w: W, h: H }; }
    };
  }

  global.Kalthaus = global.Kalthaus || {};
  global.Kalthaus.createStorm = createStorm;
  global.Kalthaus.storyState = storyState;
  global.Kalthaus.util = { clamp: clamp, lerp: lerp, ease: ease, ramp: ramp };
}(window));
