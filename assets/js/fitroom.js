/* ==========================================================================
   KALTHAUS — the fit room
   Pick a look, then put it under weather. Each look is one clip: the figure
   holding still, then the load hits, then it settles. Selecting swaps the
   clip and holds frame one; sending the weather plays it through once.

   Swapping in real footage means editing data-clip / data-still in the
   markup. Nothing here knows the difference.
   ========================================================================== */
(function (global) {
  'use strict';

  var video = document.getElementById('fit-video');
  var go = document.getElementById('fit-go');
  var state = document.getElementById('fit-state');
  var list = document.getElementById('looks');
  if (!video || !go || !list) return;

  var reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
  var readouts = {
    wind: document.getElementById('fit-wind'),
    temp: document.getElementById('fit-temp'),
    load: document.getElementById('fit-load')
  };

  var looks = [].slice.call(list.querySelectorAll('.look'));
  var current = null;
  var running = false;

  function select(btn) {
    if (btn === current) return;
    current = btn;
    looks.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });

    video.poster = btn.dataset.still || '';
    video.src = btn.dataset.clip;
    video.load();
    settle();
  }

  function settle() {
    running = false;
    if (global.Kalthaus && global.Kalthaus.sound) global.Kalthaus.sound.drive(0);
    go.disabled = false;
    go.textContent = 'Send the weather';
    state.textContent = 'Holding.';
    readouts.wind.innerHTML = '6&nbsp;km/h';
    readouts.temp.innerHTML = '&minus;9&deg;';
    readouts.load.textContent = 'Calm';
    document.body.classList.remove('is-blasting');
    try { video.pause(); video.currentTime = 0; } catch (e) { /* not ready yet */ }
  }

  function blast() {
    if (running) return;

    /* Reduced motion: step to the settled frame instead of playing there. */
    if (reduced.matches) {
      if (!video.duration) return;
      video.currentTime = video.duration * 0.55;
      state.textContent = 'Still standing.';
      readouts.load.textContent = 'Held';
      go.textContent = 'Send it again';
      return;
    }

    running = true;
    go.disabled = true;
    go.textContent = 'Incoming';
    state.textContent = 'Loading.';
    document.body.classList.add('is-blasting');

    /* The readout climbs with the clip rather than on a timer of its own, so
       the numbers always agree with what is on screen. */
    readouts.load.textContent = 'Slab release';

    var play = video.play();
    if (play && play.catch) play.catch(function () { settle(); });
  }

  video.addEventListener('timeupdate', function () {
    if (!running || !video.duration) return;
    var t = video.currentTime / video.duration;
    var peak = 1 - Math.abs(t - 0.45) / 0.55;     /* hardest around the middle */
    var wind = Math.round(6 + Math.max(0, peak) * 88);
    readouts.wind.innerHTML = wind + '&nbsp;km/h';
    readouts.temp.innerHTML = '&minus;' + Math.round(9 + Math.max(0, peak) * 17) + '&deg;';
    if (global.Kalthaus.sound) global.Kalthaus.sound.drive(Math.max(0, peak));
    if (t > 0.75) state.textContent = 'Clearing.';
  });

  video.addEventListener('ended', function () {
    if (global.Kalthaus.sound) global.Kalthaus.sound.drive(0);
    state.textContent = 'Still standing.';
    readouts.load.textContent = 'Held';
    go.disabled = false;
    go.textContent = 'Send it again';
    running = false;
    document.body.classList.remove('is-blasting');
    /* Leave the settled frame up — that is the point of the exercise. */
  });

  video.addEventListener('error', function () {
    state.textContent = 'That clip did not load.';
    go.disabled = true;
  });

  looks.forEach(function (btn) {
    btn.addEventListener('click', function () { select(btn); });
  });
  go.addEventListener('click', blast);

  select(looks[0]);
}(window));
