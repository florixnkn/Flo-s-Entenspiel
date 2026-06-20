// js/juice.js — Particles, screenshake, slow-mo, clock pulse, footstep cadence.
//
// Public API (called from game.js / duck.js / props.js hooks):
//   Juice.landDust(x, y)          — dust puff on landing
//   Juice.splashBurst(x, y)       — water burst + ring on tub win
//   Juice.trampolineBurst(x, y)   — energy puff on boing
//   Juice.catPuff(x, y)           — small puff on cat hit
//   Juice.shake(magnitude, dur)   — screenshake  (adds to existing)
//   Juice.slowMo(factor, dur)     — slow-mo dt scale
//   Juice.update(dt)              — call every fixed-tick (real dt, not slowed)
//   Juice.getDt(dt)               — returns dt scaled by slow-mo factor
//   Juice.applyShake(ctx)         — call ctx.save() THEN this THEN draw THEN ctx.restore()
//   Juice.drawParticles(ctx)      — draw all live particles
//   Juice.clockPulse              — float 0..1, > 0 when ticking (for scale in hud.js)
//   Juice.updateFootstep(childProgress, dt) — call each PLAY tick; triggers SFX.step()

// ---------------------------------------------------------------------------
// Tuning constants — dial these freely
// ---------------------------------------------------------------------------
var JUICE_SHAKE_LAND_MAG   = 3.5;   // px   — shake on hard landing
var JUICE_SHAKE_LAND_DUR   = 0.12;  // s
var JUICE_SHAKE_SPLASH_MAG = 8.0;   // px   — shake on tub win
var JUICE_SHAKE_SPLASH_DUR = 0.30;  // s
var JUICE_SHAKE_BOING_MAG  = 5.0;   // px   — shake on trampoline
var JUICE_SHAKE_BOING_DUR  = 0.18;  // s
var JUICE_SHAKE_CAT_MAG    = 4.5;   // px   — shake on cat hit
var JUICE_SHAKE_CAT_DUR    = 0.14;  // s

var JUICE_SLOWMO_FACTOR     = 0.22;  // dt multiplier during slow-mo (lower = more dramatic)
var JUICE_SLOWMO_DUR        = 0.40;  // s — how long slow-mo lasts on tub entry

var JUICE_DUST_COUNT        = 8;     // particles per land-dust puff
var JUICE_SPLASH_COUNT      = 14;    // particles per splash burst
var JUICE_BOING_COUNT       = 10;    // particles per trampoline burst
var JUICE_CAT_COUNT         = 6;     // particles per cat-hit puff

var JUICE_MAX_PARTICLES     = 80;    // hard cap — never exceed this pool

// Footstep timing: interval lerps from MIN (slow) to MAX (fast) as childProgress rises.
var JUICE_STEP_INTERVAL_MIN = 1.20;  // s between steps when child is far
var JUICE_STEP_INTERVAL_MAX = 0.28;  // s between steps when child is almost in

var JUICE_CLOCK_PULSE_DUR   = 0.18;  // s — how long each tick pulse lasts on clock

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------
var Juice = (function () {

  // --- Particle pool ---
  // Each particle: { x, y, vx, vy, life, maxLife, r, color, alpha, shape }
  // shape: "circle" | "ring" (ring grows outward, used for splash ring)
  var _particles = [];

  // --- Screenshake state ---
  var _shakeMag = 0;   // current magnitude (px)
  var _shakeDur = 0;   // time remaining (s)
  var _shakeX   = 0;   // computed offset this frame
  var _shakeY   = 0;

  // --- Slow-mo state ---
  var _slowMoFactor = 1;   // current dt multiplier
  var _slowMoTimer  = 0;   // time remaining at reduced speed

  // --- Clock pulse ---
  var _clockPulse    = 0;  // 0..1 decays down each frame
  var _lastTickFloor = -1; // last integer second we ticked at

  // --- Footstep cadence ---
  var _stepTimer = JUICE_STEP_INTERVAL_MIN;  // pre-seeded so first step isn't instant

  // ---------------------------------------------------------------------------
  // _spawnParticles — internal helper, respects pool cap
  // ---------------------------------------------------------------------------
  function _spawnParticles(list) {
    for (var i = 0; i < list.length; i++) {
      if (_particles.length >= JUICE_MAX_PARTICLES) { break; }
      _particles.push(list[i]);
    }
  }

  // ---------------------------------------------------------------------------
  // Public emitters
  // ---------------------------------------------------------------------------
  function landDust(x, y) {
    var batch = [];
    for (var i = 0; i < JUICE_DUST_COUNT; i++) {
      var angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.8; // spread upward
      var speed = 60 + Math.random() * 90;
      batch.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.28 + Math.random() * 0.12,
        maxLife: 0.40,
        r: 3 + Math.random() * 3,
        color: "#c8a878",
        alpha: 0.75,
        shape: "circle"
      });
    }
    _spawnParticles(batch);
  }

  function splashBurst(x, y) {
    var batch = [];
    // Water droplets radiate outward
    for (var i = 0; i < JUICE_SPLASH_COUNT; i++) {
      var angle = (Math.PI * 2 * i / JUICE_SPLASH_COUNT) - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      var speed = 90 + Math.random() * 160;
      batch.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.38 + Math.random() * 0.18,
        maxLife: 0.56,
        r: 3 + Math.random() * 4,
        color: "#55aaee",
        alpha: 0.90,
        shape: "circle"
      });
    }
    // Expanding ring
    batch.push({
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      life: 0.45,
      maxLife: 0.45,
      r: 8,          // starting radius — grows in update
      rGrow: 180,    // px/s growth
      color: "#88ccff",
      alpha: 0.70,
      shape: "ring"
    });
    _spawnParticles(batch);
  }

  function trampolineBurst(x, y) {
    var batch = [];
    for (var i = 0; i < JUICE_BOING_COUNT; i++) {
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.0;
      var speed = 80 + Math.random() * 120;
      batch.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.30 + Math.random() * 0.15,
        maxLife: 0.45,
        r: 2 + Math.random() * 3,
        color: i % 2 === 0 ? "#ff4444" : "#ffcc44",
        alpha: 0.85,
        shape: "circle"
      });
    }
    _spawnParticles(batch);
  }

  function catPuff(x, y) {
    var batch = [];
    for (var i = 0; i < JUICE_CAT_COUNT; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 50 + Math.random() * 80;
      batch.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0.22 + Math.random() * 0.10,
        maxLife: 0.32,
        r: 3 + Math.random() * 3,
        color: "#ff8833",
        alpha: 0.80,
        shape: "circle"
      });
    }
    _spawnParticles(batch);
  }

  // ---------------------------------------------------------------------------
  // Screenshake
  // ---------------------------------------------------------------------------
  function shake(magnitude, dur) {
    // Additive — multiple events stack but naturally decay
    _shakeMag = Math.max(_shakeMag, magnitude);
    _shakeDur = Math.max(_shakeDur, dur);
  }

  // Call ctx.save() first, then this, then draw scene, then ctx.restore().
  function applyShake(ctx) {
    if (_shakeMag > 0.5) {
      ctx.translate(_shakeX, _shakeY);
    }
  }

  // ---------------------------------------------------------------------------
  // Slow-mo
  // ---------------------------------------------------------------------------
  function slowMo(factor, dur) {
    _slowMoFactor = factor;
    _slowMoTimer  = dur;
  }

  // Returns dt scaled by slow-mo — use for all gameplay-irrelevant animation.
  // Logic that must not slow down (timers, win state) uses raw dt directly.
  function getDt(dt) {
    if (_slowMoTimer > 0) { return dt * _slowMoFactor; }
    return dt;
  }

  // ---------------------------------------------------------------------------
  // Clock pulse — triggered externally (game.js) each second under 5s
  // ---------------------------------------------------------------------------
  function triggerClockPulse() {
    _clockPulse = 1.0;
  }

  // ---------------------------------------------------------------------------
  // Footstep cadence
  // ---------------------------------------------------------------------------
  function updateFootstep(childProgress, dt) {
    var t = Math.max(0, Math.min(1, childProgress));
    var interval = JUICE_STEP_INTERVAL_MIN + (JUICE_STEP_INTERVAL_MAX - JUICE_STEP_INTERVAL_MIN) * t;

    _stepTimer -= dt;
    if (_stepTimer <= 0) {
      SFX.step();
      _stepTimer = interval;
    }
  }

  // ---------------------------------------------------------------------------
  // Master update — call once per fixed tick with REAL dt (not slowed).
  // ---------------------------------------------------------------------------
  function update(dt) {
    // --- Slow-mo timer ---
    if (_slowMoTimer > 0) {
      _slowMoTimer -= dt;
      if (_slowMoTimer < 0) {
        _slowMoTimer  = 0;
        _slowMoFactor = 1;
      }
    }

    // --- Screenshake ---
    if (_shakeDur > 0) {
      _shakeDur -= dt;
      if (_shakeDur > 0) {
        var decay = Math.min(1, _shakeDur * 8);  // eases out as duration drains
        _shakeX = (Math.random() * 2 - 1) * _shakeMag * decay;
        _shakeY = (Math.random() * 2 - 1) * _shakeMag * decay;
      } else {
        _shakeMag = 0;
        _shakeX   = 0;
        _shakeY   = 0;
      }
    }

    // --- Clock pulse decay ---
    if (_clockPulse > 0) {
      _clockPulse -= dt / JUICE_CLOCK_PULSE_DUR;
      if (_clockPulse < 0) { _clockPulse = 0; }
    }

    // --- Particles ---
    // pdt: slow-mo shrinks particle physics so bursts hang in the air beautifully.
    // _slowMoTimer itself decays on real dt (above) so slow-mo ends on schedule.
    var pdt = (_slowMoTimer > 0) ? dt * _slowMoFactor : dt;
    var gravity = 320; // px/s² downward drag on particles
    for (var i = _particles.length - 1; i >= 0; i--) {
      var p = _particles[i];
      p.life -= pdt;
      if (p.life <= 0) {
        _particles.splice(i, 1);
        continue;
      }
      p.x  += p.vx * pdt;
      p.y  += p.vy * pdt;
      p.vy += gravity * pdt;
      // Drag
      p.vx *= Math.pow(0.96, pdt / (1 / 60));
      p.vy *= Math.pow(0.96, pdt / (1 / 60));

      // Ring grows
      if (p.shape === "ring" && p.rGrow) {
        p.r += p.rGrow * pdt;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Draw particles — call AFTER main scene, INSIDE the shake transform.
  // ---------------------------------------------------------------------------
  function drawParticles(ctx) {
    for (var i = 0; i < _particles.length; i++) {
      var p    = _particles[i];
      var frac = Math.max(0, p.life / p.maxLife);
      var a    = p.alpha * frac;

      ctx.save();
      ctx.globalAlpha = a;

      if (p.shape === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = 2.5 * frac;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.r * frac), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Reset — call between levels/retries so nothing bleeds across attempts.
  // ---------------------------------------------------------------------------
  function reset() {
    _particles.length = 0;
    _shakeMag         = 0;
    _shakeDur         = 0;
    _shakeX           = 0;
    _shakeY           = 0;
    _slowMoFactor     = 1;
    _slowMoTimer      = 0;
    _clockPulse       = 0;
    _lastTickFloor    = -1;
    _stepTimer        = JUICE_STEP_INTERVAL_MIN;  // delay first step by one full interval
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------
  return {
    landDust:          landDust,
    splashBurst:       splashBurst,
    trampolineBurst:   trampolineBurst,
    catPuff:           catPuff,
    shake:             shake,
    applyShake:        applyShake,
    slowMo:            slowMo,
    getDt:             getDt,
    triggerClockPulse: triggerClockPulse,
    update:            update,
    drawParticles:     drawParticles,
    updateFootstep:    updateFootstep,
    reset:             reset,

    // Read-only getters
    get clockPulse() { return _clockPulse; },
    get slowMoActive() { return _slowMoTimer > 0; }
  };

}());
