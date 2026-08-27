/* ==========================================================================
   KALTHAUS — scene
   Scroll drives the hero video's playhead. Overlay copy is cued to
   normalised positions on that same timeline, so re-timing the edit means
   editing data-in / data-out in the markup and nothing else.
   ========================================================================== */
(function () {
  'use strict';

  var K = window.Kalthaus;
  var clamp = K.util.clamp;
  var lerp = K.util.lerp;
  var ramp = K.util.ramp;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var hero = document.getElementById('hero');
  var stage = document.querySelector('.hero__stage');
  var video = document.getElementById('hero-video');
  var heroCanvas = document.getElementById('hero-canvas');
  var closeCanvas = document.getElementById('close-canvas');
  var overlayIris = document.querySelector('.hero__iris');
  var scrollcue = document.querySelector('.scrollcue');
  var hud = document.getElementById('hud');
  var hudFill = document.getElementById('hud-fill');
  var root = document.documentElement;

  var cues = [].slice.call(document.querySelectorAll('.cue')).map(function (el) {
    return {
      el: el,
      from: parseFloat(el.dataset.in) || 0,
      to: el.dataset.out == null ? 1 : parseFloat(el.dataset.out),
      live: null
    };
  });

  var readouts = {
    temp: document.getElementById('hud-temp'),
    wind: document.getElementById('hud-wind'),
    time: document.getElementById('hud-time'),
    act: document.getElementById('hud-act')
  };

  /* ------------------------------------------------------------------------
     Hero timeline position
     ------------------------------------------------------------------------ */

  function heroProgress() {
    var r = hero.getBoundingClientRect();
    var run = hero.offsetHeight - window.innerHeight;
    if (run <= 0) return clamp(1 - (r.bottom / window.innerHeight), 0, 1);
    return clamp(-r.top / run, 0, 1);
  }

  function pageProgress() {
    var run = document.documentElement.scrollHeight - window.innerHeight;
    return run <= 0 ? 0 : clamp(window.scrollY / run, 0, 1);
  }

  /* ------------------------------------------------------------------------
     Video scrubbing
     ------------------------------------------------------------------------ */

  var videoReady = false;
  var usingCanvas = false;
  var playhead = 0;

  function useCanvasFallback() {
    if (usingCanvas) return;
    usingCanvas = true;
    stage.setAttribute('data-source', 'canvas');
    heroStorm = K.createStorm(heroCanvas, { seed: 0x5c01d, figureX: 0.63 });
    heroStorm.fit(2);
  }

  var heroStorm = null;
  var closeStorm = null;

  if (video) {
    video.addEventListener('loadedmetadata', function () {
      if (!isFinite(video.duration) || video.duration <= 0) return useCanvasFallback();
      videoReady = true;
      video.pause();
    });
    /* Scrubbing is seeking. If the host does not serve HTTP Range requests the
       browser reports an empty seekable range and every currentTime assignment
       is silently ignored — so render the storm live instead of freezing. */
    video.addEventListener('canplay', function () {
      if (!video.seekable.length) useCanvasFallback();
    });
    video.addEventListener('error', useCanvasFallback);
    if (video.readyState >= 1 && isFinite(video.duration) && video.duration > 0) {
      videoReady = true;
    }
    /* Warm the decoder: a muted play/pause makes the first seek land clean. */
    var warm = video.play();
    if (warm && warm.then) warm.then(function () { video.pause(); }, function () {});
    /* If nothing has decoded by now, the file is missing or unsupported. */
    window.setTimeout(function () {
      if (!videoReady || video.readyState < 1) useCanvasFallback();
    }, 3500);
  } else {
    useCanvasFallback();
  }

  function scrubVideo(t, dt) {
    if (!videoReady || usingCanvas) return;
    var target = t * Math.max(0, video.duration - 0.05);
    if (reduced.matches) {
      playhead = target;
    } else {
      /* Frame-rate independent easing — the playhead trails the scroll
         slightly, which reads as camera weight rather than lag. */
      playhead += (target - playhead) * (1 - Math.pow(0.0016, dt));
    }
    if (Math.abs(video.currentTime - playhead) > 1 / 50) {
      try { video.currentTime = playhead; } catch (e) { /* mid-seek */ }
    }
  }

  /* ------------------------------------------------------------------------
     Overlay cues
     ------------------------------------------------------------------------ */

  function updateCues(t) {
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      var live = t >= c.from && t <= c.to;
      if (live !== c.live) {
        c.live = live;
        c.el.classList.toggle('is-live', live);
      }
    }
  }

  /* ------------------------------------------------------------------------
     Instrument readout
     ------------------------------------------------------------------------ */

  var ACTS = ['I &mdash; Environment', 'II &mdash; Arrival', 'III &mdash; Reveal',
              'IV &mdash; Winter 01', 'V &mdash; Close'];

  function currentAct(t, past) {
    if (past === 'range') return 3;
    if (past === 'close') return 4;
    if (t < 0.36) return 0;
    if (t < 0.66) return 1;
    return 2;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var lastAct = -1;
  function updateHud(t, s, page, zone, tail) {
    hud.style.setProperty('--hud-progress', page.toFixed(4));

    /* Past the hero the weather keeps easing off, so the readout still
       agrees with the copy: by the closing act the storm has stopped. */
    var weather = zone === 'hero' ? s.intensity : lerp(0.26, 0.01, tail);
    var wind = Math.round(lerp(6, 88, weather));
    var temp = -Math.round(lerp(9, 26, weather));
    var mins = Math.round(zone === 'hero'
      ? lerp(902, 1040, t)
      : lerp(1040, 1071, tail));                 /* 15:02 -> 17:51, light gone */

    readouts.wind.textContent = wind + ' km/h';
    readouts.temp.textContent = '−' + Math.abs(temp) + '°';
    readouts.time.textContent = pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);

    var act = currentAct(t, zone);
    if (act !== lastAct) {
      lastAct = act;
      readouts.act.innerHTML = ACTS[act];
    }
    hud.classList.toggle('is-live', page > 0.02);
  }

  /* ------------------------------------------------------------------------
     Which block owns the viewport centre
     ------------------------------------------------------------------------ */

  var rangeEl = document.getElementById('range');
  var closeEl = document.getElementById('close');

  function tailProgress() {
    var run = document.documentElement.scrollHeight - window.innerHeight;
    var heroRun = hero.offsetHeight - window.innerHeight;
    if (run <= heroRun) return 0;
    return clamp((window.scrollY - heroRun) / (run - heroRun), 0, 1);
  }

  function zoneAt() {
    var mid = window.innerHeight * 0.5;
    if (closeEl && closeEl.getBoundingClientRect().top <= mid) return 'close';
    if (rangeEl && rangeEl.getBoundingClientRect().top <= mid) return 'range';
    return 'hero';
  }

  /* ------------------------------------------------------------------------
     Loop
     ------------------------------------------------------------------------ */

  var last = performance.now();
  var closeVisible = false;

  function tick(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    var t = heroProgress();
    var s = K.storyState(t);
    var page = pageProgress();
    var zone = zoneAt();

    scrubVideo(t, dt);
    updateCues(t);
    updateHud(t, s, page, zone, tailProgress());

    /* Theatre iris: a tight pool of light on the cold open, wide for the
       weather, then closing hard as attention narrows onto the kit. */
    var iris = lerp(58, 145, ramp(t, 0, 0.12));
    iris = lerp(iris, 44, s.push);
    root.style.setProperty('--iris', iris.toFixed(1) + '%');

    scrollcue.classList.toggle('is-gone', t > 0.03);

    if (usingCanvas && heroStorm && zone === 'hero') heroStorm.frame(dt, s);

    if (closeStorm && closeVisible) {
      /* Snow settling: no wind left, just weight. */
      closeStorm.frame(dt, {
        t: 1, intensity: 0.07, figure: 0, material: 0, push: 0, veil: 0.85
      });
    }

    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------------
     Closing act — ambient settle
     ------------------------------------------------------------------------ */

  if (closeCanvas && !reduced.matches) {
    closeStorm = K.createStorm(closeCanvas, {
      seed: 0x51e, density: 0.45, sky: false, ground: false
    });
    closeStorm.fit(1.5);
    new IntersectionObserver(function (entries) {
      closeVisible = entries[0].isIntersecting;
    }, { rootMargin: '10%' }).observe(closeCanvas);
  }

  /* ------------------------------------------------------------------------
     Reveals
     ------------------------------------------------------------------------ */

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

  [].forEach.call(document.querySelectorAll('[data-reveal]'), function (el) {
    io.observe(el);
  });

  /* ------------------------------------------------------------------------
     Product slots — drop a path into data-src to fill one
     ------------------------------------------------------------------------ */

  [].forEach.call(document.querySelectorAll('.slot'), function (slot) {
    var src = (slot.dataset.src || '').trim();
    if (!src) return;
    slot.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
    slot.classList.add('is-filled');
  });

  /* ------------------------------------------------------------------------
     Signup
     ------------------------------------------------------------------------ */

  var form = document.getElementById('signup');
  if (form) {
    var note = document.getElementById('signup-note');
    var input = document.getElementById('email');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        note.textContent = 'That address will not reach you. Check it and try again.';
        note.classList.add('is-error');
        input.focus();
        return;
      }
      /* No endpoint yet — wire this to the list provider before launch. */
      note.classList.remove('is-error');
      note.textContent = 'You are on the list. One message, in October.';
      form.querySelector('.signup__row').hidden = true;
      form.querySelector('.signup__label').hidden = true;
    });
  }

  /* ------------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------------ */

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (heroStorm) heroStorm.fit(2);
      if (closeStorm) closeStorm.fit(1.5);
    }, 180);
  }, { passive: true });

  requestAnimationFrame(function (t) { last = t; tick(t); });
}());
