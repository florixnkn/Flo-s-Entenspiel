// js/zzfx.js — ZzFXMicro (Zuper Zmall Zound Zynth) by Frank Force — MIT License.
// Canonical reference implementation. The shared AudioContext is created lazily
// on the first user gesture (zzfxInit) to satisfy the browser autoplay policy;
// zzfx() no-ops until then.

var zzfxV = 0.3;    // master volume
var zzfxR = 44100;  // sample rate
var zzfxX;          // AudioContext (created in zzfxInit)

// Play generated sample channels through the shared context.
function zzfxP() {
  var samples = arguments;
  var buffer = zzfxX.createBuffer(samples.length, samples[0].length, zzfxR);
  var source = zzfxX.createBufferSource();
  for (var i = 0; i < samples.length; i++) {
    buffer.getChannelData(i).set(samples[i]);
  }
  source.buffer = buffer;
  source.connect(zzfxX.destination);
  source.start();
  return source;
}

// Generate + play a sound. No-ops until the AudioContext is unlocked.
function zzfx() {
  if (!zzfxX) { return; }
  return zzfxP(zzfxG.apply(null, arguments));
}

// Generate sound samples — the ZzFX synth.
function zzfxG(
  volume = 1, randomness = 0.05, frequency = 220, attack = 0, sustain = 0,
  release = 0.1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0,
  pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0,
  bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0
) {
  var PI2 = Math.PI * 2;
  var sign = function (v) { return v > 0 ? 1 : -1; };
  var startSlide = slide *= 500 * PI2 / zzfxR / zzfxR;
  var startFrequency = frequency *= (1 + randomness * 2 * Math.random() - randomness) * PI2 / zzfxR;
  var b = [], t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f, length;

  attack = attack * zzfxR + 9;   // minimum attack avoids a click
  decay *= zzfxR;
  sustain *= zzfxR;
  release *= zzfxR;
  delay *= zzfxR;
  deltaSlide *= 500 * PI2 / (zzfxR * zzfxR * zzfxR);
  modulation *= PI2 / zzfxR;
  pitchJump *= PI2 / zzfxR;
  pitchJumpTime *= zzfxR;
  repeatTime = repeatTime * zzfxR | 0;

  for (length = attack + decay + sustain + release + delay | 0; i < length; b[i++] = s) {
    if (!(++c % (bitCrush * 100 | 0))) {                       // bit crush
      s = shape ? shape > 1 ? shape > 2 ? shape > 3 ?         // wave shape
        Math.sin((t % PI2) ** 3) :                            // 4 noise
        Math.max(Math.min(Math.tan(t), 1), -1) :              // 3 tan
        1 - (2 * t / PI2 % 2 + 2) % 2 :                       // 2 saw
        1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2) :     // 1 triangle
        Math.sin(t);                                          // 0 sin

      s = (repeatTime ?
        1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1) *  // tremolo
        sign(s) * (Math.abs(s) ** shapeCurve) *               // curve
        volume * zzfxV * (                                    // envelope
          i < attack ? i / attack :                           // attack
          i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume) :  // decay
          i < attack + decay + sustain ? sustainVolume :      // sustain
          i < length - delay ? (length - i - delay) / release * sustainVolume :    // release
          0);                                                 // post-release

      s = delay ? s / 2 + (delay > i ? 0 :                    // delay
        (i < length - delay ? 1 : (length - i) / delay) *
        b[i - delay | 0] / 2) : s;
    }

    f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++);  // frequency + modulation
    t += f - f * noise * (1 - (Math.sin(i) + 1) * 1e9 % 2);                // noise

    if (j && ++j > pitchJumpTime) {     // pitch jump
      frequency += pitchJump;
      startFrequency += pitchJump;
      j = 0;
    }

    if (repeatTime && !(++r % repeatTime)) {  // repeat
      frequency = startFrequency;
      slide = startSlide;
      j = j || 1;
    }
  }

  return b;
}

// Unlock / create the AudioContext on the first user gesture. Safe to call repeatedly.
function zzfxInit() {
  if (!zzfxX) {
    try {
      zzfxX = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* audio unavailable — zzfx() stays a no-op */ }
  }
  if (zzfxX && zzfxX.state === "suspended") {
    zzfxX.resume();
  }
}
