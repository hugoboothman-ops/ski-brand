/* ==========================================================================
   KALTHAUS — sound
   The footage arrives silent, so the wind is synthesised rather than shipped:
   filtered noise for the storm body, a low sine under it, both driven by the
   same intensity curve that moves the instrument readout. No audio file, no
   download, and it tracks the scroll exactly because it is generated from it.

   Muted until asked for. Browsers block unprompted audio anyway, and a site
   that makes noise at you unasked is a site people close.
   ========================================================================== */
(function (global) {
  'use strict';

  /* The choice is deliberately not remembered across visits. Audio needs a
     user gesture to start, so a remembered "on" could only take effect on
     some later unrelated click — which is exactly the unasked-for noise this
     is muted to avoid. */

  function create() {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;

    var ctx = null, master = null, windGain = null, subGain = null, filter = null;
    var started = false;
    var on = false;
    var level = 0;

    function build() {
      ctx = new Ctx();

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      /* Two seconds of noise, looped — the storm body. */
      var frames = ctx.sampleRate * 2;
      var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

      var noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 0.8;

      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(filter).connect(windGain).connect(master);

      /* Slow gusting, so it never sits at one pitch. */
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      var lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 260;
      lfo.connect(lfoDepth).connect(filter.frequency);
      lfo.start();

      /* The weight under it. Felt more than heard. */
      var sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 38;
      subGain = ctx.createGain();
      subGain.gain.value = 0;
      sub.connect(subGain).connect(master);

      noise.start();
      sub.start();
      started = true;
    }

    function ramp(param, value, seconds) {
      var now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + seconds);
    }

    return {
      get on() { return on; },

      toggle: function () {
        if (!started) build();
        on = !on;
        if (on && ctx.state === 'suspended') ctx.resume();
        ramp(master.gain, on ? 1 : 0, 0.7);
        return on;
      },

      /* Called every frame with the storm intensity and whether the hero
         still owns the viewport. Sound belongs to the hero only. */
      update: function (intensity, inHero) {
        if (!started || !on) return;
        var target = inHero ? intensity : 0;
        /* Smooth here rather than on the audio params: cheaper, and it stops
           scroll jitter turning into audible zipper noise. */
        level += (target - level) * 0.06;
        var t = ctx.currentTime;
        windGain.gain.setTargetAtTime(0.03 + level * 0.32, t, 0.15);
        subGain.gain.setTargetAtTime(level * 0.11, t, 0.25);
        filter.frequency.setTargetAtTime(320 + level * 1500, t, 0.2);
      },

    };
  }

  global.Kalthaus = global.Kalthaus || {};
  global.Kalthaus.createSound = create;
}(window));
