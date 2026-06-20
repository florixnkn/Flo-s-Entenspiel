// js/duck.js — Rubber duck entity: charge, launch, physics, squash/stretch, draw.

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
}

function duckUpdate(duck, dt, platforms) {
  // Fall-off-bottom check runs every tick regardless of charge state,
  // so a charging duck can still respawn. Actual reset is done by the caller
  // (game.js) which reads duck.fellOff and triggers duckReset.
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

  // --- Charge / Launch --- (blocked while stunned)
  if (!isStunned && duck.onGround && !duck.charging && Input.held("Space")) {
    duck.charging = true;
    duck.chargeT  = 0;
    duck.animState = "charging";
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
  }

  // --- Animation state machine ---
  _duckAnimUpdate(duck, dt);
}

function _duckLaunch(duck) {
  duck.charging  = false;
  var speed      = MIN_LAUNCH + duck.power * (MAX_LAUNCH - MIN_LAUNCH);
  var angleRad   = LAUNCH_ANGLE * (Math.PI / 180);
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

// timeLeft is optional — when < 5 the duck's eyes widen to mirror clock urgency.
function duckDraw(ctx, duck, timeLeft) {
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

  var r = duck.radius;

  // Shadow (only when near ground)
  // (skipped for Slice 1 — keep it minimal)

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
