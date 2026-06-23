// js/duck.js — Rubber duck entity: charge, launch, physics, squash/stretch, draw.

// ---------------------------------------------------------------------------
// Trail / glow tuning constants (dial freely)
// ---------------------------------------------------------------------------
var DUCK_TRAIL_LEN          = 8;     // max history positions stored
var DUCK_TRAIL_SPEED_MIN    = 120;   // px/s — trail only shown above this speed
var DUCK_TRAIL_ALPHA_HEAD   = 0.38;  // alpha of the freshest ghost (closest to duck)
var DUCK_TRAIL_ALPHA_TAIL   = 0.04;  // alpha of the oldest ghost (most faded)

var DUCK_CHARGE_GLOW_BASE   = 14;    // px base glow ring radius offset beyond duck.radius
var DUCK_CHARGE_GLOW_PULSE  = 8;     // px extra radius at full power
var DUCK_CHARGE_SPARK_RATE  = 0.06;  // s between spark particle emits during charge
// Charge spark color ramp: interpolated warm orange→red by power level
// (pure code, no extra assets)

function createDuck(startX, startY) {
  return {
    x:       startX,
    y:       startY,
    prevX:   startX,
    prevY:   startY,
    vx:      0,
    vy:      0,
    radius:  DUCK_RADIUS,

    onGround: false,
    facing:   1,          // 1 = right, -1 = left
    aimAngle: AIM_ANGLE_DEFAULT,  // degrees above horizontal; adjustable with ↑/↓

    // Charge state
    charging: false,
    power:    0,           // 0..1 oscillating
    chargeT:  0,           // time accumulator for oscillation

    // Squash/stretch animation
    scaleX:   1,
    scaleY:   1,
    animState: "idle",     // "idle" | "charging" | "flying" | "landing" | "settling"
    animT:    0,           // timer for transient animations

    // Set by collision resolver; read and cleared in update
    triggerLand: false,

    // Cat stun — set by props.js; duckUpdate blocks input while > 0
    stunTime: 0,

    // Hurt timer — > 0 while duck lies on the floor after a fall
    hurtTimer: 0,

    // Motion trail — array of {x,y} world positions; capped at DUCK_TRAIL_LEN
    _trail: [],

    // Charge spark throttle timer
    _sparkTimer: 0,
  };
}

function duckReset(duck, startX, startY) {
  duck.x       = startX;
  duck.y       = startY;
  duck.prevX   = startX;
  duck.prevY   = startY;
  duck.vx      = 0;
  duck.vy      = 0;
  duck.onGround = false;
  duck.facing   = 1;
  duck.aimAngle = AIM_ANGLE_DEFAULT;
  duck.charging = false;
  duck.power    = 0;
  duck.chargeT  = 0;
  duck.scaleX   = 1;
  duck.scaleY   = 1;
  duck.animState = "idle";
  duck.animT    = 0;
  duck.triggerLand = false;
  duck.fellOff  = false;
  duck.stunTime = 0;
  duck.hurtTimer = 0;
  duck.animState = "idle";
  duck._trail   = [];
  duck._sparkTimer = 0;
}

function duckUpdate(duck, dt, platforms) {
  // While hurt, the duck lies frozen on the floor — game.js ticks the timer
  // and calls duckReset when it expires. Skip all input / physics this tick.
  if (duck.hurtTimer > 0) { return; }

  // Fall-off-bottom check (duck.fellOff kept for backwards-compat but
  // will no longer trigger because game.js catches GROUND_Y first).
  duck.fellOff = (duck.y - duck.radius > CANVAS_H);
  if (duck.fellOff) { return; }

  // --- Input: facing direction (only while NOT airborne, for clarity;
  //     SPEC allows direction change always) ---
  // Direction input is blocked during cat stun
  var isStunned = (duck.stunTime > 0);
  if (!isStunned) {
    if (Input.held("ArrowLeft"))  duck.facing = -1;
    if (Input.held("ArrowRight")) duck.facing =  1;
  }

  // --- Aim angle: ↑/↓ while on ground (idle or charging), never affects facing ---
  if (!isStunned && duck.onGround) {
    if (Input.held("ArrowUp"))   duck.aimAngle += AIM_RATE_DEG * dt;
    if (Input.held("ArrowDown")) duck.aimAngle -= AIM_RATE_DEG * dt;
    // Clamp to allowed range
    if (duck.aimAngle < AIM_ANGLE_MIN) duck.aimAngle = AIM_ANGLE_MIN;
    if (duck.aimAngle > AIM_ANGLE_MAX) duck.aimAngle = AIM_ANGLE_MAX;
  }

  // --- Charge / Launch --- (blocked while stunned)
  if (!isStunned && duck.onGround && !duck.charging && Input.held("Space")) {
    duck.charging = true;
    duck.chargeT  = 0;
    duck.animState = "charging";
    duck._trail   = [];   // clear trail when we start charging
    duck._sparkTimer = 0;
  }

  if (duck.charging) {
    duck.chargeT += dt;
    // Continuous repeating 0→1→0→1 sweep using cosine; never flatlines
    duck.power = (1 - Math.cos(2 * Math.PI * duck.chargeT / POWER_CYCLE)) / 2;

    // Squash proportional to power
    var squashAmt = 1 - (1 - SQUASH_CHARGE) * duck.power;
    duck.scaleY = squashAmt;
    // Compensate width to keep volume constant (cartoony)
    duck.scaleX = 1 + (1 - squashAmt) * 0.5;

    // Emit charge sparks at throttled rate
    duck._sparkTimer -= dt;
    if (duck._sparkTimer <= 0) {
      duck._sparkTimer = DUCK_CHARGE_SPARK_RATE * (0.8 + Math.random() * 0.4);
      _emitChargeSpark(duck);
    }

    if (!Input.held("Space")) {
      // Release: launch!
      _duckLaunch(duck);
    }
  }

  // _duckLaunch() sets charging=false, so physics runs same tick as launch; prevX/prevY are snapshotted below.
  // --- Physics (only when not charging on ground) ---
  if (!duck.charging) {
    // Save previous position before integration
    duck.prevX = duck.x;
    duck.prevY = duck.y;

    duck.vy += GRAVITY * dt;
    duck.x  += duck.vx * dt;
    duck.y  += duck.vy * dt;

    // Resolve collisions
    var wasOnGround = duck.onGround;
    resolveAllPlatforms(duck, platforms);

    // Fire the land effects ONLY on the airborne -> grounded transition.
    // triggerLand is set every frame the duck rests on a platform (gravity re-sinks
    // it each tick, so the resolver re-lands it). Without the !wasOnGround guard the
    // land SFX/dust/shake machine-gun ~60x/s while standing still — that was the loud
    // noise heard when idle, and it stopped while charging (physics block is skipped).
    if (duck.triggerLand && !wasOnGround) {
      _duckLand(duck);
      duck._trail = [];  // clear trail on landing
    }

    // Keep duck within canvas horizontal bounds
    if (duck.x - duck.radius < 0) {
      duck.x  = duck.radius;
      duck.vx = Math.abs(duck.vx) * BOUNCE_DAMPEN;
    }
    if (duck.x + duck.radius > CANVAS_W) {
      duck.x  = CANVAS_W - duck.radius;
      duck.vx = -Math.abs(duck.vx) * BOUNCE_DAMPEN;
    }

    // --- Update motion trail (airborne + fast only) ---
    if (!duck.onGround && duck.hurtTimer <= 0) {
      var spd = Math.sqrt(duck.vx * duck.vx + duck.vy * duck.vy);
      if (spd >= DUCK_TRAIL_SPEED_MIN) {
        // Push current position; keep array capped
        duck._trail.push({ x: duck.x, y: duck.y });
        if (duck._trail.length > DUCK_TRAIL_LEN) {
          duck._trail.shift();
        }
      } else {
        // Slow down — trim the trail so it doesn't linger after slowing
        if (duck._trail.length > 0) { duck._trail.shift(); }
      }
    } else if (duck.onGround) {
      // Clear trail immediately on ground contact
      duck._trail = [];
    }
  }

  // --- Animation state machine ---
  _duckAnimUpdate(duck, dt);
}

// Emit a single rising orange-red spark from the duck during charge.
// Delegates to Juice.chargeSpark which spawns a tiny upward particle.
function _emitChargeSpark(duck) {
  Juice.chargeSpark(duck.x, duck.y, duck.power);
}

function _duckLaunch(duck) {
  duck.charging  = false;
  var speed      = MIN_LAUNCH + duck.power * (MAX_LAUNCH - MIN_LAUNCH);
  var angleRad   = duck.aimAngle * (Math.PI / 180);  // player-chosen angle
  duck.vx        = Math.cos(angleRad) * speed * duck.facing;
  duck.vy        = -Math.sin(angleRad) * speed;   // negative = upward
  duck.onGround  = false;
  duck.animState = "flying";
  duck.animT     = STRETCH_DURATION;

  // Stretch in launch direction
  duck.scaleX = 1 / STRETCH_LAUNCH;  // narrow in perpendicular
  duck.scaleY = STRETCH_LAUNCH;       // ... but we rotate scale to velocity dir in draw

  // Juice: rubber duck squeak SFX on every jump
  SFX.squeak();

  // Juice: directional kick-off puff + subtle shake
  // The launch direction in canvas-space: vx, vy computed above.
  // launchBurst expects the launch angle; it emits particles in the OPPOSITE direction.
  // aimAngle is degrees above horizontal, and facing may flip x.
  // In canvas coords: launch dir angle = atan2(duck.vy, duck.vx)
  var launchAngle = Math.atan2(duck.vy, duck.vx);
  Juice.launchBurst(duck.x, duck.y, launchAngle);
  Juice.shake(JUICE_SHAKE_LAUNCH_MAG, JUICE_SHAKE_LAUNCH_DUR);

  // Clear trail on launch so old positions don't show briefly
  duck._trail = [];
  duck._sparkTimer = 0;
}

function _duckLand(duck) {
  duck.animState = "landing";
  duck.animT    = LAND_SQUASH_DUR;
  duck.scaleX   = 1 + 0.25;   // squash wide on impact
  duck.scaleY   = 0.65;

  // Juice: land SFX + dust puff + screenshake
  SFX.land();
  Juice.landDust(duck.x, duck.y + duck.radius);
  Juice.shake(JUICE_SHAKE_LAND_MAG, JUICE_SHAKE_LAND_DUR);
}

function _duckAnimUpdate(duck, dt) {
  if (duck.animState === "flying") {
    if (duck.animT > 0) {
      duck.animT -= dt;
    } else {
      // Normalise scale gradually during flight
      duck.scaleX += (1 - duck.scaleX) * 10 * dt;
      duck.scaleY += (1 - duck.scaleY) * 10 * dt;
    }
  } else if (duck.animState === "landing") {
    duck.animT -= dt;
    if (duck.animT <= 0) {
      duck.animState = "settling";
      duck.animT    = SETTLE_DUR;
    }
  } else if (duck.animState === "settling") {
    duck.animT -= dt;
    var t = Math.max(0, duck.animT / SETTLE_DUR);
    duck.scaleX = 1 + (1.25 - 1) * t;
    duck.scaleY = 0.65 + (1 - 0.65) * (1 - t);
    if (duck.animT <= 0) {
      duck.animState = "idle";
      duck.scaleX   = 1;
      duck.scaleY   = 1;
    }
  } else if (duck.animState === "idle") {
    // Gentle idle breathe
    duck.scaleX = 1;
    duck.scaleY = 1;
  }
}

// ---------- Drawing ----------

// ---------- Hurt pose ----------
// Drawn when animState === "hurt" (hurtTimer > 0).  The duck is tipped on its
// back with dizzy stars circling above and an "x" eye.
function _duckDrawHurt(ctx, duck) {
  var r  = duck.radius;

  // Contact shadow (same as normal pose, world-space)
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle   = "#221100";
  ctx.beginPath();
  ctx.ellipse(duck.x, duck.y + r * 0.55, r * 0.80, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.translate(duck.x, duck.y);

  // Tip the duck ~63° (1.1 rad) — lands it on its back/side
  ctx.rotate(1.1);

  // Body (same ellipse, now rotated)
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle   = PAL.duckBody;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // Chest highlight
  ctx.beginPath();
  ctx.ellipse(r * 0.15, r * 0.15, r * 0.45, r * 0.35, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = PAL.duckChest;
  ctx.fill();

  // Head
  var hx = r * 0.55;
  var hy = -r * 0.5;
  var hr = r * 0.55;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle   = PAL.duckBody;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // Beak
  ctx.beginPath();
  ctx.moveTo(hx + hr * 0.75, hy);
  ctx.lineTo(hx + hr * 0.75 + r * 0.45, hy - r * 0.08);
  ctx.lineTo(hx + hr * 0.75 + r * 0.45, hy + r * 0.15);
  ctx.closePath();
  ctx.fillStyle   = PAL.duckBeak;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.8;
  ctx.stroke();

  // Eye white
  var ex = hx + hr * 0.25;
  var ey = hy - hr * 0.2;
  ctx.beginPath();
  ctx.arc(ex, ey, hr * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = PAL.duckEyeW;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // "x" eye — two short crossed strokes
  var xs = hr * 0.16;
  ctx.strokeStyle = PAL.duckEye;
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = "round";
  ctx.beginPath();
  ctx.moveTo(ex - xs, ey - xs);
  ctx.lineTo(ex + xs, ey + xs);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex + xs, ey - xs);
  ctx.lineTo(ex - xs, ey + xs);
  ctx.stroke();

  ctx.restore();  // end body transform

  // Dizzy stars — 3 small 4-point stars orbiting above the duck head.
  // Drawn in world space so they stay upright regardless of the body rotation.
  // Star centre is above duck.y (roughly where the head ended up visually).
  var orbitCx = duck.x + r * 0.30;   // slight right offset toward head side
  var orbitCy = duck.y - r * 1.0;    // above the duck
  var orbitR  = r * 0.55;
  // Spin speed: use a coarse time approximation from hurtTimer counting down.
  // We don't have totalTime here, so derive a phase from hurtTimer itself.
  var phase = (HURT_DURATION - duck.hurtTimer) * 3.0;  // ~3 rad/s spin
  var starColors = ["#ffe050", "#ffcc00", "#ffd866"];

  for (var si = 0; si < 3; si++) {
    var ang = phase + (si * Math.PI * 2 / 3);
    var sx  = orbitCx + Math.cos(ang) * orbitR;
    var sy  = orbitCy + Math.sin(ang) * orbitR * 0.55;  // flatten orbit vertically

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang * 1.5);   // spin each star on its own axis too

    var sr = r * 0.13;   // star arm half-length
    ctx.fillStyle = starColors[si];
    ctx.strokeStyle = "#cc9900";
    ctx.lineWidth   = 1.0;
    ctx.beginPath();
    // 4-point star: two crossed rectangles (diamond style)
    ctx.moveTo(0, -sr * 2.2);
    ctx.lineTo(sr * 0.65, -sr * 0.65);
    ctx.lineTo(sr * 2.2, 0);
    ctx.lineTo(sr * 0.65, sr * 0.65);
    ctx.lineTo(0, sr * 2.2);
    ctx.lineTo(-sr * 0.65, sr * 0.65);
    ctx.lineTo(-sr * 2.2, 0);
    ctx.lineTo(-sr * 0.65, -sr * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Draw the charge glow ring — a pulsing warm halo around the duck while charging.
// power: 0..1; totalTime: running time for pulse animation.
function _drawChargeGlow(ctx, duck) {
  var p   = duck.power;
  var r   = duck.radius;

  // Glow ring radius: base + power-scaled pulse
  var glowR = r + DUCK_CHARGE_GLOW_BASE + p * DUCK_CHARGE_GLOW_PULSE;

  // Color: lerp warm-orange (#ff8800) to hot-red (#ff1100) by power
  var cr = 255;
  var cg = Math.round(136 * (1 - p * 0.87));   // 136 → ~18
  var cb = 0;

  // Outer glow (large, very transparent)
  ctx.save();
  ctx.globalAlpha = 0.12 + p * 0.14;
  ctx.fillStyle   = "rgb(" + cr + "," + cg + "," + cb + ")";
  ctx.beginPath();
  ctx.arc(duck.x, duck.y, glowR + 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Main ring (crisp, medium alpha)
  ctx.save();
  ctx.globalAlpha    = 0.35 + p * 0.40;
  ctx.strokeStyle    = "rgb(" + cr + "," + cg + "," + cb + ")";
  ctx.lineWidth      = 2.5 + p * 2.0;
  ctx.shadowColor    = "rgb(" + cr + "," + cg + "," + cb + ")";
  ctx.shadowBlur     = 8 + p * 12;
  ctx.beginPath();
  ctx.arc(duck.x, duck.y, glowR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Draw the motion trail — fading yellow ghost circles behind the duck.
function _drawMotionTrail(ctx, duck) {
  var trail = duck._trail;
  if (!trail || trail.length === 0) return;

  var r   = duck.radius;
  var len = trail.length;

  for (var i = 0; i < len; i++) {
    // i=0 is oldest (tail), i=len-1 is newest (head, closest to duck)
    var t   = i / (len - 1 || 1);  // 0=tail, 1=head
    var a   = DUCK_TRAIL_ALPHA_TAIL + t * (DUCK_TRAIL_ALPHA_HEAD - DUCK_TRAIL_ALPHA_TAIL);
    var pos = trail[i];

    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle   = PAL.duckBody;  // match duck body colour (yellow)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * (0.55 + t * 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// timeLeft is optional — when < 5 the duck's eyes widen to mirror clock urgency.
function duckDraw(ctx, duck, timeLeft) {
  // Hurt state — delegate to the special pose drawer and exit
  if (duck.hurtTimer > 0 || duck.animState === "hurt") {
    _duckDrawHurt(ctx, duck);
    return;
  }

  // --- Motion trail (drawn BEFORE the duck body, behind it) ---
  // Only when airborne and not hurt/charging
  if (!duck.onGround && !duck.charging && duck._trail && duck._trail.length > 1) {
    _drawMotionTrail(ctx, duck);
  }

  // --- Charge glow ring (drawn BEFORE body, around the duck) ---
  if (duck.charging && duck.power > 0) {
    _drawChargeGlow(ctx, duck);
  }

  // Soft contact shadow — drawn in world space before the body transform so it
  // stays flat on the ground regardless of squash/stretch rotation.
  ctx.save();
  var r = duck.radius;
  var shadowAlpha = 0.22;  // always draw; subtle enough not to distract mid-air
  ctx.globalAlpha = shadowAlpha;
  ctx.fillStyle   = "#221100";
  ctx.beginPath();
  ctx.ellipse(duck.x, duck.y + r * 0.92, r * 0.72, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.translate(duck.x, duck.y);

  // For flying state, rotate the squash/stretch to align with velocity direction
  var drawAngle = 0;
  if (duck.animState === "flying" && duck.animT > 0) {
    var speed = Math.sqrt(duck.vx * duck.vx + duck.vy * duck.vy);
    if (speed > 10) {
      drawAngle = Math.atan2(duck.vy, duck.vx);
    }
  }
  ctx.rotate(drawAngle);
  ctx.scale(duck.scaleX * duck.facing, duck.scaleY);

  // --- Body ---
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle   = PAL.duckBody;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // --- Chest highlight ---
  ctx.beginPath();
  ctx.ellipse(r * 0.15, r * 0.15, r * 0.45, r * 0.35, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = PAL.duckChest;
  ctx.fill();

  // --- Head ---
  var hx = r * 0.55;
  var hy = -r * 0.5;
  var hr = r * 0.55;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle   = PAL.duckBody;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // --- Beak --- (tip points right when facing=1 before scale flip)
  ctx.beginPath();
  ctx.moveTo(hx + hr * 0.75, hy);
  ctx.lineTo(hx + hr * 0.75 + r * 0.45, hy - r * 0.08);
  ctx.lineTo(hx + hr * 0.75 + r * 0.45, hy + r * 0.15);
  ctx.closePath();
  ctx.fillStyle   = PAL.duckBeak;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.8;
  ctx.stroke();

  // --- Eye white — dilates when timeLeft < 5 to mirror clock urgency ---
  var isScared   = (typeof timeLeft === "number") && timeLeft < 5;
  var eyeScale   = isScared ? 1.45 : 1.0;   // 45 % bigger white + pupil at low time
  var ex = hx + hr * 0.25;
  var ey = hy - hr * 0.2;
  ctx.beginPath();
  ctx.arc(ex, ey, hr * 0.32 * eyeScale, 0, Math.PI * 2);
  ctx.fillStyle = PAL.duckEyeW;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // --- Pupil ---
  ctx.beginPath();
  ctx.arc(ex + hr * 0.08, ey + hr * 0.04, hr * 0.16 * eyeScale, 0, Math.PI * 2);
  ctx.fillStyle = PAL.duckEye;
  ctx.fill();

  // --- Eye shine ---
  ctx.beginPath();
  ctx.arc(ex + hr * 0.02, ey - hr * 0.06, hr * 0.07 * eyeScale, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.restore();
}
