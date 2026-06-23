// js/music.js — Procedural background music module.
//
// Generates a cheerful looping melody with the Web Audio API, reusing
// the shared zzfxX AudioContext created by ZzFX.  Never creates its own
// AudioContext.  Loops seamlessly via a look-ahead scheduler (~25 ms tick,
// ~100 ms lookahead window).  Silenced by the M-key mute toggle (Music.setMuted).
//
// Key / tempo / structure:
//   Key: G major   Tempo: 112 BPM   Loop: 4 bars (16 quarter-note steps)
//   Voices: triangle lead + sine bass (+ optional light arpeggio pad on roots)

var Music = (function () {

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var MUSIC_VOLUME  = 0.11;   // master gain — kept quiet under SFX
  var LOOKAHEAD_S   = 0.10;   // seconds ahead to schedule
  var INTERVAL_MS   = 25;     // scheduler poll interval (ms)
  var BPM           = 112;
  var STEP_S        = 60 / BPM / 2;  // one eighth-note in seconds

  // ---------------------------------------------------------------------------
  // Equal-tempered note → frequency helper
  // note: string like "G4", "B3", "R" (rest).  Octave-aware.
  // ---------------------------------------------------------------------------
  function noteFreq(name) {
    if (!name || name === "R") { return 0; }  // rest
    var NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    var note = name.slice(0, name.length - 1);
    var oct  = parseInt(name[name.length - 1], 10);
    var semi = NAMES.indexOf(note);
    if (semi < 0) { return 0; }
    // A4 = 440 Hz, midi note = 12*(oct+1) + semi
    return 440 * Math.pow(2, (12 * (oct + 1) + semi - 69) / 12);
  }

  // ---------------------------------------------------------------------------
  // Song data — edit freely to retune the loop.
  // Each step is one eighth note (STEP_S seconds at 112 BPM).
  // 4 bars × 4 beats × 2 eighth-notes = 32 steps.
  // "R" = rest.  lead/bass arrays must be the same length.
  // ---------------------------------------------------------------------------

  // Lead melody — triangle wave, gentle ADSR
  var LEAD = [
    //  bar 1                         bar 2
    "G4","B4","D5","B4","G4","R","E4","G4",
    "A4","C5","A4","R","G4","B4","D5","G5",
    //  bar 3                         bar 4
    "E5","D5","B4","G4","A4","R","C5","B4",
    "A4","G4","E4","R","D4","G4","R", "G4"
  ];

  // Bass — sine wave, one note per two steps (sounds on even index)
  var BASS = [
    //  bar 1                         bar 2
    "G2","R","D3","R","G2","R","C3","R",
    "A2","R","E3","R","G2","R","D3","R",
    //  bar 3                         bar 4
    "C3","R","G2","R","A2","R","E3","R",
    "G2","R","D3","R","G2","R","R",  "R"
  ];

  // Arpeggio/pad — very soft sine chord tones floating behind the melody
  var PAD = [
    //  bar 1                         bar 2
    "B3","D4","G3","D4","E3","G3","G3","B3",
    "C4","E4","A3","E4","G3","B3","D4","G4",
    //  bar 3                         bar 4
    "G4","F#4","E4","D4","C4","E4","E4","D4",
    "C4","B3","G3","R","B3","D4","G3","R"
  ];

  // ---------------------------------------------------------------------------
  // Module state
  // ---------------------------------------------------------------------------
  var _masterGain    = null;   // GainNode connected to zzfxX.destination
  var _schedulerID   = null;   // setInterval handle
  var _nextNoteTime  = 0;      // absolute AudioContext time of next note
  var _stepIndex     = 0;      // position in LEAD/BASS/PAD arrays
  var _playing       = false;
  var _muted         = false;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  // Read mute state from SFX module or localStorage fallback.
  function _readMuteState() {
    if (typeof SFX !== "undefined" && SFX.isMuted) {
      return SFX.isMuted();
    }
    try {
      return localStorage.getItem("entenspiel_muted") === "1";
    } catch (e) {
      return false;
    }
  }

  // Ensure the master gain node exists and is wired to the destination.
  // Returns false if the context isn't ready.
  function _ensureMasterGain() {
    if (!zzfxX) { return false; }
    if (_masterGain) { return true; }
    try {
      _masterGain = zzfxX.createGain();
      _masterGain.gain.value = _muted ? 0 : MUSIC_VOLUME;
      _masterGain.connect(zzfxX.destination);
    } catch (e) {
      return false;
    }
    return true;
  }

  // Schedule a single oscillator note.
  //   type  — OscillatorType string ("triangle", "sine")
  //   freq  — frequency in Hz (0 = rest, skipped)
  //   when  — AudioContext start time (absolute)
  //   dur   — duration in seconds (sounding length)
  //   vol   — peak gain for this voice
  function _scheduleNote(type, freq, when, dur, vol) {
    if (!freq || !zzfxX || !_masterGain) { return; }
    try {
      var osc  = zzfxX.createOscillator();
      var gain = zzfxX.createGain();

      osc.type            = type;
      osc.frequency.value = freq;

      // ADSR-ish envelope: short attack, short decay, sustain, then release
      var attack  = 0.008;
      var release = Math.min(0.06, dur * 0.25);
      var peakAt  = when + attack;
      var offAt   = when + dur;

      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(vol, peakAt);
      gain.gain.setValueAtTime(vol * 0.75, peakAt + 0.02);   // tiny decay to sustain
      gain.gain.setValueAtTime(vol * 0.75, offAt - release);
      gain.gain.linearRampToValueAtTime(0, offAt);

      osc.connect(gain);
      gain.connect(_masterGain);

      osc.start(when);
      osc.stop(offAt);

      // Clean up nodes after note ends — prevent accumulation over long sessions.
      osc.onended = function () {
        try { osc.disconnect(); }  catch (e) {}
        try { gain.disconnect(); } catch (e) {}
      };
    } catch (e) {
      // Web Audio error — skip note silently
    }
  }

  // Look-ahead scheduler — called every INTERVAL_MS by setInterval.
  function _tick() {
    if (!zzfxX || !_masterGain) { return; }

    var lookAheadUntil = zzfxX.currentTime + LOOKAHEAD_S;

    while (_nextNoteTime < lookAheadUntil) {
      var i    = _stepIndex % LEAD.length;
      var when = _nextNoteTime;
      var dur  = STEP_S * 0.88;  // note slightly shorter than step (staccato breathing)

      // Lead — triangle, primary melody voice
      var lf = noteFreq(LEAD[i]);
      _scheduleNote("triangle", lf, when, dur, 0.38);

      // Bass — sine, lower octave root tones
      var bf = noteFreq(BASS[i]);
      _scheduleNote("sine", bf, when, dur * 1.1, 0.22);

      // Pad — very soft sine, fills harmonic space
      var pf = noteFreq(PAD[i]);
      _scheduleNote("sine", pf, when, STEP_S * 0.70, 0.10);

      _nextNoteTime += STEP_S;
      _stepIndex    += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {

    // Start the music scheduler.  Idempotent — safe to call multiple times.
    start: function () {
      if (!zzfxX) { return; }
      if (_playing) { return; }
      if (!_ensureMasterGain()) { return; }

      _muted = _readMuteState();
      // Apply mute state — silent immediately when muted; fade in when unmuted.
      var now = zzfxX.currentTime;
      _masterGain.gain.cancelScheduledValues(now);
      if (_muted) {
        _masterGain.gain.value = 0;
      } else {
        _masterGain.gain.setValueAtTime(0, now);
        _masterGain.gain.linearRampToValueAtTime(MUSIC_VOLUME, now + 1.2);
      }

      // Align first note slightly ahead so the first tick has time to schedule.
      _nextNoteTime = zzfxX.currentTime + 0.05;
      _stepIndex    = 0;
      _playing      = true;

      _schedulerID = setInterval(_tick, INTERVAL_MS);
    },

    // Stop the scheduler and silence immediately.
    stop: function () {
      if (_schedulerID !== null) {
        clearInterval(_schedulerID);
        _schedulerID = null;
      }
      _playing = false;
      if (_masterGain && zzfxX) {
        try {
          _masterGain.gain.cancelScheduledValues(zzfxX.currentTime);
          _masterGain.gain.setValueAtTime(0, zzfxX.currentTime);
        } catch (e) {}
      }
    },

    // Mute or unmute the music with a short gain ramp (avoids click).
    setMuted: function (muted) {
      _muted = !!muted;
      if (!_masterGain || !zzfxX) { return; }
      try {
        var now = zzfxX.currentTime;
        _masterGain.gain.cancelScheduledValues(now);
        _masterGain.gain.setValueAtTime(_masterGain.gain.value, now);
        _masterGain.gain.linearRampToValueAtTime(
          _muted ? 0 : MUSIC_VOLUME,
          now + 0.06
        );
      } catch (e) {}
    },

    // Returns true if the scheduler is running (regardless of mute state).
    isPlaying: function () {
      return _playing;
    }

  };

}());
