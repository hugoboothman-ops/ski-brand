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
    if (t < 0.10) intensity = lerp(0.16, 0.34, t / 0.10);
    else if (t < 0.40) intensity = lerp(0.34, 1, ease((t - 0.10) / 0.30));
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

  /* Figure: hooded, still, skis planted alongside. Drawn as one union. */
  function buildFigure() {
    var p = new Path2D();

    /* hood + head */
    p.moveTo(37, 52);
    p.bezierCurveTo(32, 25, 39, 7, 50, 7);
    p.bezierCurveTo(61, 7, 68, 25, 63, 52);
    p.closePath();

    /* torso — dropped shoulder, parka hem */
    p.moveTo(50, 42);
    p.bezierCurveTo(64, 44, 74, 55, 76, 73);
    p.lineTo(72, 134);
    p.bezierCurveTo(62, 142, 38, 142, 28, 134);
    p.lineTo(24, 73);
    p.bezierCurveTo(26, 55, 36, 44, 50, 42);
    p.closePath();

    /* arms, hanging still */
    p.moveTo(26, 72); p.lineTo(19, 77); p.lineTo(16, 129); p.lineTo(25, 132); p.closePath();
    p.moveTo(74, 72); p.lineTo(81, 77); p.lineTo(84, 129); p.lineTo(75, 132); p.closePath();

    /* legs */
    p.moveTo(31, 132); p.lineTo(46, 132); p.lineTo(45, 254); p.lineTo(32, 254); p.closePath();
    p.moveTo(54, 132); p.lineTo(69, 132); p.lineTo(68, 254); p.lineTo(55, 254); p.closePath();

    /* skis planted to the right, tips curled */
    p.moveTo(88, 44); p.bezierCurveTo(88, 30, 94, 30, 94, 44);
    p.lineTo(94, 256); p.lineTo(88, 256); p.closePath();
    p.moveTo(97, 40); p.bezierCurveTo(97, 26, 103, 26, 103, 40);
    p.lineTo(103, 256); p.lineTo(97, 256); p.closePath();

    return p;
  }

  /* Seams, drawn clipped inside the figure once the material reveals. */
  function seams(ctx) {
    ctx.beginPath();
    ctx.moveTo(50, 44); ctx.lineTo(50, 138);            /* centre zip */
    ctx.moveTo(26, 76); ctx.bezierCurveTo(40, 71, 60, 71, 74, 76); /* yoke */
    ctx.moveTo(55, 92); ctx.lineTo(70, 92);             /* chest pocket */
    ctx.moveTo(24, 112); ctx.lineTo(76, 112);           /* waist baffle */
    ctx.stroke();
  }

  function createStorm(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var rand = mulberry32(opts.seed == null ? 0x5c01d : opts.seed);
    var figure = buildFigure();
    var density = opts.density == null ? 1 : opts.density;
    var figureX = opts.figureX == null ? 0.62 : opts.figureX;
    var baseY = opts.baseY == null ? 0.92 : opts.baseY;
    var figureH = opts.figureH == null ? 0.68 : opts.figureH;

    var W = 0, H = 0, dpr = 1, clock = 0;
    var flakes = [], haze = [];

    function build() {
      var n = clamp(Math.round((W * H) / 5200 * density), 80, 620);
      flakes.length = 0;
      for (var i = 0; i < n; i++) {
        flakes.push({
          x: rand() * W, y: rand() * H,
          z: 0.16 + rand() * 0.84,
          r: 0.45 + rand() * 1.85,
          sway: 0.4 + rand() * 1.7,
          ph: rand() * Math.PI * 2,
          spd: 0.6 + rand() * 0.85
        });
      }
      haze.length = 0;
      for (var j = 0; j < 5; j++) {
        haze.push({
          x: rand() * W,
          y: H * (0.18 + rand() * 0.7),
          r: W * (0.26 + rand() * 0.42),
          spd: 0.1 + rand() * 0.34,
          a: 0.028 + rand() * 0.042
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
    }

    function fit(maxDpr) {
      var r = canvas.getBoundingClientRect();
      resize(r.width || 1, r.height || 1,
        Math.min(global.devicePixelRatio || 1, maxDpr || 2));
    }

    function step(dt, s) {
      clock += dt;
      var wind = lerp(5, 172, s.intensity);
      var fall = lerp(34, 112, s.intensity);
      var i, f;
      for (i = 0; i < flakes.length; i++) {
        f = flakes[i];
        var depth = 0.28 + f.z;
        f.x += (wind * depth + Math.sin(clock * f.sway + f.ph) * 15 * s.intensity) * dt;
        f.y += fall * depth * f.spd * dt;
        if (f.x > W + 30) { f.x = -30; f.y = rand() * H; }
        else if (f.x < -30) { f.x = W + 30; }
        if (f.y > H + 30) { f.y = -30; f.x = rand() * W; }
      }
      for (i = 0; i < haze.length; i++) {
        var g = haze[i];
        g.x += wind * g.spd * 0.4 * dt;
        if (g.x - g.r > W) g.x = -g.r;
      }
    }

    function draw(s) {
      var fh = H * figureH;
      var fw = fh * (FW / FH);
      var fx = W * figureX - fw / 2;
      var fy = H * baseY - fh;
      var unit = fh / FH;
      var chestX = fx + 50 * unit;
      var chestY = fy + 88 * unit;
      var pushScale = 1 + (s.push || 0) * 2.1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      /* cold sky wash */
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0b1014');
      sky.addColorStop(0.6, '#070a0c');
      sky.addColorStop(1, '#040506');
      ctx.globalAlpha = 1;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(chestX, chestY);
      ctx.scale(pushScale, pushScale);
      ctx.translate(-chestX, -chestY);

      /* spindrift haze */
      var i;
      for (i = 0; i < haze.length; i++) {
        var g = haze[i];
        var rg = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
        rg.addColorStop(0, 'rgba(' + FROST + ',' + (g.a * s.intensity).toFixed(4) + ')');
        rg.addColorStop(1, 'rgba(' + FROST + ',0)');
        ctx.fillStyle = rg;
        ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
      }

      /* driven snow — dots when calm, streaks when it blows */
      ctx.strokeStyle = 'rgb(' + FROST + ')';
      ctx.fillStyle = 'rgb(' + FROST + ')';
      ctx.lineCap = 'round';
      for (i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        var depth = 0.28 + f.z;
        ctx.globalAlpha = (0.05 + f.z * 0.4) * lerp(0.4, 1, s.intensity) * s.veil;
        var streak = s.intensity * 52 * depth;
        if (streak > 6) {
          ctx.lineWidth = f.r * 0.9;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x - streak, f.y - streak * 0.15);
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

        var px = 1 / (unit * pushScale);   /* keep hairlines hairline */

        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = s.figure;
        ctx.fillStyle = '#000';
        ctx.fill(figure);

        ctx.globalCompositeOperation = 'source-over';

        if (s.material > 0.001) {
          ctx.save();
          ctx.clip(figure);
          var fab = ctx.createLinearGradient(10, 20, 96, 250);
          fab.addColorStop(0, 'rgba(30, 38, 44, ' + (0.95 * s.material).toFixed(3) + ')');
          fab.addColorStop(0.45, 'rgba(15, 20, 24, ' + (0.95 * s.material).toFixed(3) + ')');
          fab.addColorStop(1, 'rgba(7, 9, 11, ' + (0.95 * s.material).toFixed(3) + ')');
          ctx.fillStyle = fab;
          ctx.fillRect(0, 0, FW, FH);

          ctx.globalAlpha = 0.5 * s.material;
          ctx.strokeStyle = 'rgba(' + BONE + ',0.5)';
          ctx.lineWidth = px * 1.1;
          seams(ctx);
          ctx.restore();
        }

        /* rim light — the one edge the weather gives you */
        ctx.globalAlpha = s.figure * (0.14 + 0.4 * s.material);
        ctx.strokeStyle = 'rgba(' + BONE + ',1)';
        ctx.lineWidth = px * 1.35;
        ctx.stroke(figure);
        ctx.globalAlpha = 1;
        ctx.restore();

        /* snow banked at the feet, so the figure is planted not floating */
        var bank = ctx.createRadialGradient(
          chestX, fy + fh, 0, chestX, fy + fh, fw * 1.5);
        bank.addColorStop(0, 'rgba(' + FROST + ',' + (0.075 * s.figure).toFixed(4) + ')');
        bank.addColorStop(1, 'rgba(' + FROST + ',0)');
        ctx.fillStyle = bank;
        ctx.fillRect(chestX - fw * 1.5, fy + fh - fw * 0.75, fw * 3, fw * 1.5);
      }

      ctx.restore();
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
