// js/audio.js — Named SFX map wrapping ZzFX param arrays.
//
// Usage:  SFX.jump()  SFX.land()  SFX.splash()  etc.
// All calls silently no-op if ZzFX AudioContext hasn't been unlocked yet.
//
// AudioContext unlock:
//   The first keydown event calls zzfxInit(), which creates and/or resumes
//   the AudioContext.  After that every SFX.* call goes through.
//   This is the minimal-footprint way to handle the browser autoplay policy.

window.addEventListener("keydown", function () {
  zzfxInit();
  // { once: true } above ensures this fires only once — no manual removeEventListener needed.
}, { once: true });

// ---------------------------------------------------------------------------
// SFX — public named sound map
// ---------------------------------------------------------------------------
var SFX = (function () {

  // Small wrapper so each call site stays clean.
  // zzfx(volume, randomness, freq, attack, sustain, release, shape,
  //      shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime,
  //      repeatTime, noise, modulation, bitCrush, delay,
  //      sustainVolume, decay, tremolo)

  return {

    // Duck "squeak" on every jump — high, rubbery sine blip.
    // Signature sound of the game.
    squeak: function () {
      zzfx(0.25, 0.08, 520, 0, 0.06, 0.12, 0, 1.5, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Land thud — short low thump on platform landing.
    land: function () {
      zzfx(0.30, 0.05, 90, 0, 0.01, 0.08, 2, 0.5, -1.2, 0, 0, 0, 0, 0.1, 0, 0, 0, 1, 0.05, 0);
    },

    // Trampoline boing — springy upward whoop.
    boing: function () {
      zzfx(0.30, 0.04, 180, 0, 0.04, 0.18, 1, 1, 2.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Splash / win — water entry plunge + shimmer (played on tub entry).
    splash: function () {
      zzfx(0.35, 0.1, 280, 0, 0.05, 0.28, 4, 1, -1.8, 0, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0);
    },

    // Toilet plop — comedy low-pitched bubble + thud.
    plop: function () {
      zzfx(0.40, 0.06, 55, 0, 0.05, 0.22, 0, 0.8, -1.6, 0, 0, 0, 0, 0.3, 0, 0, 0, 1, 0.08, 0);
    },

    // Crying child — descending trombone wail.
    cry: function () {
      zzfx(0.30, 0.05, 340, 0.04, 0.1, 0.5, 1, 0.5, -1.4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Cat hit — percussive hiss + blip.
    catHit: function () {
      zzfx(0.28, 0.15, 380, 0, 0.02, 0.14, 2, 1, 0.5, 0, 80, 0.05, 0, 0.2, 0, 0, 0, 1, 0.03, 0);
    },

    // Tick — short, sharp, high metronome click (last 5 seconds).
    tick: function () {
      zzfx(0.20, 0.02, 900, 0, 0, 0.04, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Footstep — dull soft thud (child approaching).
    step: function () {
      zzfx(0.18, 0.08, 60, 0, 0.01, 0.07, 2, 0.4, -0.5, 0, 0, 0, 0, 0.15, 0, 0, 0, 1, 0.04, 0);
    },

    // Win fanfare — short major-chord sting when level is cleared.
    win: function () {
      zzfx(0.32, 0.03, 520, 0.02, 0.12, 0.22, 0, 1, 0.3, 0, 260, 0.08, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // All-clear jingle — slightly grander, double-pitch jump.
    allclear: function () {
      zzfx(0.35, 0.03, 440, 0.02, 0.18, 0.35, 0, 1, 0.2, 0, 440, 0.12, 0, 0, 0, 0, 0, 1, 0, 0);
    }
  };

}());
