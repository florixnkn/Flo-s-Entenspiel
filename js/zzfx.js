// js/zzfx.js — ZzFX micro sound library (Frank Force, MIT licence, ~1KB)
// Single shared AudioContext; lazily created on first call or on unlock.

var zzfxX; // shared AudioContext (initialised on first use or unlock)

// zzfx — generate and play a sound immediately.
// Parameters (all optional, defaults shown):
// volume, randomness, frequency, attack, sustain, release, shape,
// shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
// noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo
function zzfx(
  volume, randomness, frequency, attack, sustain, release,
  shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime,
  repeatTime, noise, modulation, bitCrush, delay,
  sustainVolume, decay, tremolo
) {
  // Default every param to avoid undefined maths
  volume        = volume        == null ? 1    : volume;
  randomness    = randomness    == null ? 0.05 : randomness;
  frequency     = frequency     == null ? 220  : frequency;
  attack        = attack        == null ? 0    : attack;
  sustain       = sustain       == null ? 0    : sustain;
  release       = release       == null ? 0.1  : release;
  shape         = shape         == null ? 0    : shape;
  shapeCurve    = shapeCurve    == null ? 1    : shapeCurve;
  slide         = slide         == null ? 0    : slide;
  deltaSlide    = deltaSlide    == null ? 0    : deltaSlide;
  pitchJump     = pitchJump     == null ? 0    : pitchJump;
  pitchJumpTime = pitchJumpTime == null ? 0    : pitchJumpTime;
  repeatTime    = repeatTime    == null ? 0    : repeatTime;
  noise         = noise         == null ? 0    : noise;
  modulation    = modulation    == null ? 0    : modulation;
  bitCrush      = bitCrush      == null ? 0    : bitCrush;
  delay         = delay         == null ? 0    : delay;
  sustainVolume = sustainVolume == null ? 1    : sustainVolume;
  decay         = decay         == null ? 0    : decay;
  tremolo       = tremolo       == null ? 0    : tremolo;

  // Guard: no audio context yet (user hasn't interacted) — fail silently
  if (!zzfxX) { return; }

  var sampleRate = 44100;
  var PI2        = Math.PI * 2;

  // Frequency in radians per sample
  var startFreq = frequency * (1 + randomness * (Math.random() * 2 - 1));
  var b = [];
  var t = 0;           // sample time
  var tm = 0;          // modulation time
  var i = 0;           // sample index
  var j = 1;           // repeat period sample
  var r = 0;           // current frequency
  var length;
  var pc = 0;          // pitch change counter
  var sign = 1;
  var n = 0;           // noise sample

  // Total length in samples
  length = sampleRate * (attack + sustain + release + decay | 0) + 9;
  r = startFreq * PI2 / sampleRate;
  slide    *= PI2 * 500 / sampleRate / sampleRate;
  deltaSlide *= PI2 * 500 / sampleRate / sampleRate / sampleRate;

  for (; i < length; i++, t++) {
    // Modulation
    var s = shapeCurve == 1 ? r / PI2 * sampleRate : 0;
    tm += modulation != 0 ? 1 / (1 + Math.abs(Math.sin(tm))) : 0;
    r += slide;
    slide += deltaSlide;

    // Pitch jump
    if (pitchJump != 0 && (pc += pitchJumpTime) > sampleRate) {
      r += pitchJump * PI2 / sampleRate;
      pc = 0;
    }

    // Repeat
    if (repeatTime != 0 && !(j-- % (repeatTime * sampleRate | 0))) {
      r = startFreq * PI2 / sampleRate;
      slide = 0;
    }

    // Wave generation
    var wave;
    var freq = r + modulation * Math.sin(tm * PI2);
    if      (shape == 0) { wave = Math.sin(t * freq); }            // sine
    else if (shape == 1) { wave = (t * freq / PI2 % 1) * 2 - 1; } // sawtooth
    else if (shape == 2) { wave = (t * freq / PI2 % 1) > .5 ? sign = -sign : sign; } // square
    else if (shape == 3) { wave = Math.abs(t * freq / PI2 % 1) * 2 - 1; } // triangle
    else                 { wave = Math.random() * 2 - 1; }          // noise

    // Noise
    if (noise) { wave += (Math.random() * 2 - 1) * noise; }

    // Bit crush
    if (bitCrush) { wave = ~~(wave * bitCrush) / bitCrush; }

    // Envelope
    var env;
    var tt = t / sampleRate;
    if      (tt < attack)                     { env = tt / attack; }
    else if (tt < attack + sustain)            { env = sustainVolume; }
    else if (tt < attack + sustain + release)  { env = ((attack + sustain + release - tt) / release) * sustainVolume; }
    else                                       { env = 0; }

    // Tremolo
    if (tremolo) { env *= 1 - tremolo * Math.sin(PI2 * t / sampleRate * tremolo * 2); }

    b[i] = wave * env;
  }

  // Send to AudioContext
  var buffer  = zzfxX.createBuffer(1, b.length, sampleRate);
  var source  = zzfxX.createBufferSource();
  buffer.getChannelData(0).set(b);
  source.buffer = buffer;

  // Gain node for volume
  var gainNode = zzfxX.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(zzfxX.destination);
  source.start();
  return source;
}

// zzfxInit — call on first user gesture to unlock AudioContext.
// Called by audio.js on keydown; safe to call multiple times.
function zzfxInit() {
  if (!zzfxX) {
    try {
      zzfxX = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      // Audio unavailable — zzfx calls will silently no-op (zzfxX stays falsy)
    }
  }
  if (zzfxX && zzfxX.state === "suspended") {
    zzfxX.resume();
  }
}
