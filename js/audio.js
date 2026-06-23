// js/audio.js — Named SFX map wrapping ZzFX param arrays.
//
// Usage:  SFX.squeak()  SFX.land()  SFX.splash()  etc.
// All calls silently no-op if ZzFX AudioContext hasn't been unlocked yet,
// OR if the global mute is active.
//
// Mute API:
//   SFX.toggleMute()   — flip mute state, persist to localStorage
//   SFX.isMuted()      — returns boolean
//
// AudioContext unlock:
//   The first keydown event calls zzfxInit(), which creates and/or resumes
//   the AudioContext.  After that every SFX.* call goes through.
//   This is the minimal-footprint way to handle the browser autoplay policy.

window.addEventListener("keydown", function () {
  zzfxInit();
}, { once: true });

// ---------------------------------------------------------------------------
// SFX — public named sound map
// ---------------------------------------------------------------------------
var SFX = (function () {

  // --- Mute state — loaded from localStorage on startup ---
  var MUTE_KEY = "entenspiel_muted";
  var _muted = false;

  // Guarded read — fails silently on file:// restrictions
  try {
    _muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (e) {
    _muted = false;
  }

  function _saveMute() {
    try {
      localStorage.setItem(MUTE_KEY, _muted ? "1" : "0");
    } catch (e) {
      // file:// or private-mode — ignore
    }
  }

  // Small wrapper so each call site stays clean.
  // Returns early when muted so no sound plays.
  function _play() {
    if (_muted) return;
    // zzfx expects individual arguments — forward them
    zzfx.apply(null, arguments);
  }

  // zzfx(volume, randomness, freq, attack, sustain, release, shape,
  //      shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime,
  //      repeatTime, noise, modulation, bitCrush, delay,
  //      sustainVolume, decay, tremolo)

  return {

    // --- Mute control ---
    toggleMute: function () {
      _muted = !_muted;
      _saveMute();
    },

    isMuted: function () {
      return _muted;
    },

    // Duck "squeak" on every jump — soft sine blip, warmer than before.
    squeak: function () {
      _play(0.20, 0.05, 440, 0.01, 0.05, 0.13, 0, 2, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Land thud — gentle low thump on platform landing.
    land: function () {
      _play(0.26, 0.04, 85, 0.005, 0.02, 0.10, 1, 0.6, -1.0, 0, 0, 0, 0, 0.05, 0, 0, 0, 1, 0.06, 0);
    },

    // Trampoline boing — springy upward whoop, triangle wave.
    boing: function () {
      _play(0.26, 0.04, 170, 0.01, 0.05, 0.18, 1, 1, 2.2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Splash — water entry plunge, less noisy than before.
    splash: function () {
      _play(0.28, 0.06, 240, 0.02, 0.06, 0.34, 4, 1, -1.4, 0, 0, 0, 0, 0.25, 0, 0, 0, 1, 0, 0);
    },

    // Toilet plop — warm low-pitched bubble + thud.
    plop: function () {
      _play(0.34, 0.05, 55, 0.005, 0.05, 0.22, 0, 0.8, -1.5, 0, 0, 0, 0, 0.2, 0, 0, 0, 1, 0.08, 0);
    },

    // Crying child — gentler descending triangle wail.
    cry: function () {
      _play(0.26, 0.04, 300, 0.06, 0.10, 0.5, 1, 0.6, -1.2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Cat hit — softer percussive blip, reduced noise.
    catHit: function () {
      _play(0.22, 0.08, 300, 0.005, 0.03, 0.14, 1, 1, 0.4, 0, 60, 0.05, 0, 0.08, 0, 0, 0, 1, 0.03, 0);
    },

    // Tick — quieter 680 Hz triangle click (last 5 seconds).
    tick: function () {
      _play(0.14, 0.02, 680, 0.004, 0, 0.05, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // Footstep — soft warm thud (child approaching). Quiet + sparse on purpose.
    step: function () {
      _play(0.09, 0.05, 75, 0.005, 0.01, 0.06, 1, 0.5, -0.4, 0, 0, 0, 0, 0.06, 0, 0, 0, 1, 0.04, 0);
    },

    // Hurt — soft descending boing/ouch when duck hits the floor.
    hurt: function () {
      _play(0.26, 0.05, 200, 0.005, 0.04, 0.18, 1, 0.7, -1.6, 0, 0, 0, 0, 0.06, 0, 0, 0, 1, 0.05, 0);
    },

    // Win fanfare — warm sine sting when level is cleared.
    win: function () {
      _play(0.28, 0.03, 440, 0.02, 0.12, 0.22, 0, 1.5, 0.2, 0, 220, 0.09, 0, 0, 0, 0, 0, 1, 0, 0);
    },

    // All-clear jingle — slightly grander, gentle double-pitch jump.
    allclear: function () {
      _play(0.30, 0.03, 392, 0.03, 0.18, 0.36, 0, 1.5, 0.15, 0, 392, 0.12, 0, 0, 0, 0, 0, 1, 0, 0);
    }
  };

}());
