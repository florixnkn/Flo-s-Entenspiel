// js/juice.js — Particles, screenshake, slow-mo, clock pulse, footstep cadence.
//
// Public API (called from game.js / duck.js / props.js hooks):
//   Juice.landDust(x, y)          — dust puff on landing
//   Juice.splashBurst(x, y)       — water burst + ring on tub win
//   Juice.trampolineBurst(x, y)   — energy puff on boing
//   Juice.catPuff(x, y)           — small puff on cat hit
//   Juice.launchBurst(x, y, ang)  — directional kick-off puff on launch
//   Juice.ambientTick(dt)         — call each PLAY tick; spawns background bubbles
//   Juice.drawAmbient(ctx)        — draw ambient bubbles (before world, inside shake)
//   Juice.flash(color, dur)       — brief screen-space flash (call in draw, outside shake)
//   Juice.drawFlash(ctx)          — draw the active flash rect (call outside shake region)
//   Juice.confetti()              — celebratory particle shower (ALLCLEAR)
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
var JUICE_SHAKE_LAUNCH_MAG = 2.0;   // px   — subtle shake on launch
var JUICE_SHAKE_LAUNCH_DUR = 0.08;  // s

var JUICE_SLOWMO_FACTOR     = 0.22;  // dt multiplier during slow-mo (lower = more dramatic)
var JUICE_SLOWMO_DUR        = 0.40;  // s — how long slow-mo lasts on tub entry

var JUICE_DUST_COUNT        = 8;     // particles per land-dust puff
var JUICE_SPLASH_COUNT      = 22;    // particles per splash burst (boosted for win polish)
var JUICE_BOING_COUNT       = 10;    // particles per trampoline burst
var JUICE_CAT_COUNT         = 6;     // particles per cat-hit puff
var JUICE_LAUNCH_COUNT      = 7;     // particles per launch kick-off puff
var JUICE_CONFETTI_COUNT    = 40;    // particles for ALLCLEAR confetti shower

var JUICE_MAX_PARTICLES     = 80;    // hard cap — never exceed this pool

// Ambient bubble tuning
var JUICE_BUBBLE_CAP        = 18;    // separate pool; never starves burst pool
var JUICE_BUBBLE_SPAWN_RATE = 0.55;  // s between bubble spawns (lower = more frequent)
var JUICE_BUBBLE_ALPHA_MIN  = 0.18;  // minimum bubble alpha
var JUICE_BUBBLE_ALPHA_MAX  = 0.35;  // maximum bubble alpha
var JUICE_BUBBLE_RISE_MIN   = 28;    // px/s minimum upward rise speed
var JUICE_BUBBLE_RISE_MAX   = 72;    // px/s maximum upward rise speed
var JUICE_BUBBLE_DRIFT      = 18;    // px/s max lateral drift (random each bubble)
var JUICE_BUBBLE_R_MIN      = 4;     // minimum bubble radius
var JUICE_BUBBLE_R_MAX      = 14;    // maximum bubble radius
var JUICE_BUBBLE_LIFE_MIN   = 3.2;   // s min bubble lifetime
var JUICE_BUBBLE_LIFE_MAX   = 6.5;   // s max bubble lifetime

// Flash tuning
var JUICE_FLASH_WIN_COLOR   = "rgba(255,255,255,1)"; // white flash on win
var JUICE_FLASH_WIN_DUR     = 0.30;  // s — how long win flash takes to fade
var JUICE_FLASH_CLEAR_COLOR = "rgba(220,255,180,1)"; // green-tint flash on ALLCLEAR
var JUICE_FLASH_CLEAR_DUR   = 0.40;  // s

// Footstep timing: silent until the child is genuinely close, then interval
// lerps from MIN (slow) to MAX (fast). Kept sparse + quiet so it doesn't spam.
var JUICE_STEP_START        = 0.50;  // childProgress before footsteps begin at all
var JUICE_STEP_INTERVAL_MIN = 0.85;  // s between steps when child first becomes audible
var JUICE_STEP_INTERVAL_MAX = 0.45;  // s between steps when child is almost in

var JUICE_CLOCK_PULSE_DUR   = 0.18;  // s — how long each tick pulse lasts on clock

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------
var Juice = (function () {

  // --- Particle pool ---
  // Each particle: { x, y, vx, vy, life, maxLife, r, color, alpha, shape }
  // shape: "circle" | "ring" (ring grows outward, used for splash ring)
  var _particles = [];

  // --- Ambient bubble pool (separate — never cleared by gameplay bursts) ---
  // Each bubble: { x, y, vx, vy, life, maxLife, r, alpha, wobblePhase }
  var _ambient = [];
  var _bubbleTimer = 0;  // countdown to next bubble spawn

  // --- Screen flash ---
  var _flashAlpha  = 0;      // current alpha (decays to 0)
  var _flashColor  = "rgba(255,255,255,1)";  // base colour string (no alpha — we blend via globalAlpha)
  var _flashDur    = 0.30;   // total duration (s) — used to compute decay rate

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
    // Water column — extra upward droplets that rain down (win polish: taller column)
    for (var i = 0; i < JUICE_SPLASH_COUNT; i++) {
      // Bias more particles into the upper hemisphere for a tall water column
      var angle;
      if (i < JUICE_SPLASH_COUNT * 0.6) {
        // Upper column arc: -PI*0.9 to -PI*0.1 (mostly upward)
        angle = -Math.PI * 0.9 + (i / (JUICE_SPLASH_COUNT * 0.6)) * Math.PI * 0.8 + (Math.random() - 0.5) * 0.3;
      } else {
        // Remainder: full radial spread for the splash ring
        angle = (Math.PI * 2 * i / JUICE_SPLASH_COUNT) - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      }
      var speed = 100 + Math.random() * 210;  // boosted for taller column
      batch.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.70,
        r: 3 + Math.random() * 5,
        color: i % 3 === 0 ? "#aaddff" : "#55aaee",
        alpha: 0.92,
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
      rGrow: 220,    // px/s growth (boosted)
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

  // Directional launch kick-off puff — emits opposite the launch direction.
  // angleRad: the launch angle in radians (pointing in launch dir; puff goes opposite).
  function launchBurst(x, y, angleRad) {
    var batch = [];
    // Opposite direction = angleRad + PI; spread around that axis
    var oppAngle = angleRad + Math.PI;
    for (var i = 0; i < JUICE_LAUNCH_COUNT; i++) {
      var spread = (Math.random() - 0.5) * 0.9;  // spread in radians
      var a      = oppAngle + spread;
      var speed  = 55 + Math.random() * 90;
      batch.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.18 + Math.random() * 0.12,
        maxLife: 0.30,
        r: 2 + Math.random() * 3,
        color: i % 2 === 0 ? "#ffe880" : "#ffcc44",
        alpha: 0.80,
        shape: "circle"
      });
    }
    _spawnParticles(batch);
  }

  // Charge spark — one tiny upward-biased spark at duck position during charge.
  // power: 0..1; color interpolates warm-orange → hot-red.
  function chargeSpark(x, y, power) {
    if (_particles.length >= JUICE_MAX_PARTICLES) { return; }
    var cr = 255;
    var cg = Math.round(180 * (1 - power * 0.85));
    var color = "rgb(" + cr + "," + cg + ",0)";
    // Random upward angle with some spread
    var angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
    var speed = 35 + Math.random() * 65;
    _particles.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.14 + Math.random() * 0.12,
      maxLife: 0.26,
      r: 1.5 + Math.random() * 2,
      color: color,
      alpha: 0.85,
      shape: "circle"
    });
  }

  // Confetti shower for ALLCLEAR — colored rect particles raining down.
  function confetti() {
    var batch = [];
    var colors = ["#ff5566", "#ffcc00", "#44ddaa", "#66aaff", "#ff88cc", "#aaee44"];
    for (var i = 0; i < JUICE_CONFETTI_COUNT; i++) {
      // Spawn across the top of the canvas, random x
      var cx = 60 + Math.random() * (CANVAS_W - 120);
      batch.push({
        x: cx,
        y: -10 - Math.random() * 80,   // start just above canvas
        vx: (Math.random() - 0.5) * 80,
        vy: 80 + Math.random() * 160,   // falls downward
        life: 2.0 + Math.random() * 1.5,
        maxLife: 3.5,
        r: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.90,
        shape: "confetti",
        spin: (Math.random() - 0.5) * 8,  // rad/s spin
        spinAngle: Math.random() * Math.PI * 2
      });
    }
    _spawnParticles(batch);
  }

  // ---------------------------------------------------------------------------
  // Ambient bubble emitter — call each PLAY tick
  // ---------------------------------------------------------------------------
  function ambientTick(dt) {
    _bubbleTimer -= dt;
    if (_bubbleTimer <= 0) {
      _bubbleTimer = JUICE_BUBBLE_SPAWN_RATE * (0.7 + Math.random() * 0.6);  // jitter interval

      if (_ambient.length < JUICE_BUBBLE_CAP) {
        var r = JUICE_BUBBLE_R_MIN + Math.random() * (JUICE_BUBBLE_R_MAX - JUICE_BUBBLE_R_MIN);
        _ambient.push({
          // Spawn anywhere along the bottom third of the canvas, avoid edges
          x:           60 + Math.random() * (CANVAS_W - 120),
          y:           CANVAS_H * 0.65 + Math.random() * (CANVAS_H * 0.30),
          vx:          (Math.random() - 0.5) * JUICE_BUBBLE_DRIFT,
          vy:          -(JUICE_BUBBLE_RISE_MIN + Math.random() * (JUICE_BUBBLE_RISE_MAX - JUICE_BUBBLE_RISE_MIN)),
          r:           r,
          life:        JUICE_BUBBLE_LIFE_MIN + Math.random() * (JUICE_BUBBLE_LIFE_MAX - JUICE_BUBBLE_LIFE_MIN),
          maxLife:     JUICE_BUBBLE_LIFE_MIN + Math.random() * (JUICE_BUBBLE_LIFE_MAX - JUICE_BUBBLE_LIFE_MIN),
          alpha:       JUICE_BUBBLE_ALPHA_MIN + Math.random() * (JUICE_BUBBLE_ALPHA_MAX - JUICE_BUBBLE_ALPHA_MIN),
          wobblePhase: Math.random() * Math.PI * 2  // phase offset for sine wobble
        });
      }
    }

    // Update existing bubbles
    for (var i = _ambient.length - 1; i >= 0; i--) {
      var b = _ambient[i];
      b.life -= dt;
      if (b.life <= 0 || b.y + b.r < -20) {
        _ambient.splice(i, 1);
        continue;
      }
      // Gentle sine wobble on x
      b.wobblePhase += dt * 1.4;
      b.x += Math.sin(b.wobblePhase) * 12 * dt + b.vx * dt;
      b.y += b.vy * dt;
    }
  }

  // Draw ambient bubbles — call INSIDE the shake region, BEFORE world geometry.
  function drawAmbient(ctx) {
    for (var i = 0; i < _ambient.length; i++) {
      var b    = _ambient[i];
      var frac = Math.max(0, b.life / b.maxLife);
      // Fade in during first 15% of life, fade out during last 20%
      var fadeIn  = Math.min(1, (1 - frac) / 0.15);  // 0→1 as life starts
      // frac goes 1→0, so "last 20%" is frac < 0.20
      var fadeOut = frac < 0.20 ? frac / 0.20 : 1;
      var a = b.alpha * Math.min(fadeIn, fadeOut);
      if (a <= 0) continue;

      ctx.save();
      ctx.globalAlpha = a;

      // Translucent fill — very soft blue-white
      ctx.fillStyle = "rgba(200,235,255,0.55)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // Rim stroke — slightly lighter, simulates rim light
      ctx.strokeStyle = "rgba(220,248,255,0.80)";
      ctx.lineWidth   = 1.2;
      ctx.stroke();

      // Inner arc highlight (top-left quadrant) — lens flare look
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth   = 1.0;
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.45, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Screen flash — screen-space, drawn OUTSIDE shake transform, under HUD
  // ---------------------------------------------------------------------------
  function flash(color, dur) {
    _flashAlpha = 1.0;
    _flashColor = color || "rgba(255,255,255,1)";
    _flashDur   = dur   || 0.30;
  }

  function drawFlash(ctx) {
    if (_flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = _flashAlpha;
    ctx.fillStyle   = _flashColor;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
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
    // Stay silent until the child is genuinely close. This loop used to fire the
    // whole level long, even while the player stood still aiming — that read as
    // a constantly-repeating / "hanging" thud. Now it only kicks in late.
    if (t < JUICE_STEP_START) {
      _stepTimer = JUICE_STEP_INTERVAL_MIN;
      return;
    }
    var k = (t - JUICE_STEP_START) / (1 - JUICE_STEP_START);
    var interval = JUICE_STEP_INTERVAL_MIN + (JUICE_STEP_INTERVAL_MAX - JUICE_STEP_INTERVAL_MIN) * k;

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

    // --- Flash decay ---
    if (_flashAlpha > 0) {
      _flashAlpha -= dt / _flashDur;
      if (_flashAlpha < 0) { _flashAlpha = 0; }
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

      // Confetti spins
      if (p.shape === "confetti" && p.spin !== undefined) {
        p.spinAngle += p.spin * pdt;
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
      } else if (p.shape === "confetti") {
        // Small rotated rectangle for confetti
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spinAngle || 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        // Slight highlight face
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r * 0.4);
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
    _ambient.length   = 0;
    _bubbleTimer      = 0;
    _flashAlpha       = 0;
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
    launchBurst:       launchBurst,
    chargeSpark:       chargeSpark,
    confetti:          confetti,
    ambientTick:       ambientTick,
    drawAmbient:       drawAmbient,
    flash:             flash,
    drawFlash:         drawFlash,
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
    get clockPulse()   { return _clockPulse; },
    get slowMoActive() { return _slowMoTimer > 0; }
  };

}());
