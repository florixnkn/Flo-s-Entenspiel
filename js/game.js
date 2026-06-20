// js/game.js — Main loop, state, update, draw orchestration.
// Slice 1: PLAY state only. No levels, tub, timer, or props.

(function () {
  var canvas = document.getElementById("game");
  var ctx    = canvas.getContext("2d");

  // --- Ground platform (single flat ground for Slice 1) ---
  var platforms = [
    { x: 0, y: GROUND_Y, w: CANVAS_W, h: GROUND_H, surface: "normal" }
  ];

  // Duck start position: sitting on ground, horizontally centred
  var START_X = CANVAS_W / 2;
  var START_Y = GROUND_Y - DUCK_RADIUS;

  var duck = createDuck(START_X, START_Y);

  // --- Fixed-timestep loop ---
  var FIXED_DT   = 1 / 60;    // 60 Hz physics
  var MAX_ACCUM  = 0.200;     // clamp to avoid spiral of death

  var lastTime   = null;
  var accumulator = 0;

  function tick(timestamp) {
    requestAnimationFrame(tick);

    if (lastTime === null) { lastTime = timestamp; }
    var rawDt = (timestamp - lastTime) / 1000;
    lastTime  = timestamp;

    // Clamp runaway delta
    if (rawDt > MAX_ACCUM) rawDt = MAX_ACCUM;
    accumulator += rawDt;

    // --- Fixed-step updates ---
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
      // Flush per-step so pressed-once actions don't double-fire when
      // multiple fixed steps run in a single rAF.
      Input.flush();
    }

    // --- Render ---
    draw();
  }

  // --- Update ---
  function update(dt) {
    // R = reset
    if (Input.pressed("KeyR")) {
      duckReset(duck, START_X, START_Y);
    }

    duckUpdate(duck, dt, platforms);
  }

  // --- Draw ---
  function draw() {
    // Background
    ctx.fillStyle = PAL.sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawGround(ctx);
    drawAimIndicator(ctx, duck);
    duckDraw(ctx, duck);
    drawPowerMeter(ctx, duck);
    drawHint(ctx);
  }

  // --- Ground ---
  function drawGround(ctx) {
    // Main fill
    ctx.fillStyle = PAL.ground;
    ctx.fillRect(0, GROUND_Y, CANVAS_W, GROUND_H);

    // Top stripe (slightly lighter)
    ctx.fillStyle = PAL.groundTop;
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 6);

    // Outline
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0,       GROUND_Y);
    ctx.lineTo(CANVAS_W, GROUND_Y);
    ctx.stroke();
  }

  // --- Aim indicator: small arrow showing facing direction + launch angle ---
  function drawAimIndicator(ctx, duck) {
    if (!duck.onGround && !duck.charging) return;  // only when grounded

    var angleRad  = LAUNCH_ANGLE * (Math.PI / 180);
    var arrowLen  = 36 + duck.power * 22;  // grows with power when charging
    var dx = Math.cos(angleRad) * arrowLen * duck.facing;
    var dy = -Math.sin(angleRad) * arrowLen;

    var ox = duck.x;
    var oy = duck.y;

    ctx.save();
    ctx.globalAlpha = duck.charging ? 0.55 + duck.power * 0.4 : 0.35;
    ctx.strokeStyle = PAL.aimArrow;
    ctx.fillStyle   = PAL.aimArrow;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";

    // Shaft
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + dx, oy + dy);
    ctx.stroke();

    // Arrowhead
    var headLen  = 9;
    var headAngle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ox + dx, oy + dy);
    ctx.lineTo(
      ox + dx - headLen * Math.cos(headAngle - 0.42),
      oy + dy - headLen * Math.sin(headAngle - 0.42)
    );
    ctx.lineTo(
      ox + dx - headLen * Math.cos(headAngle + 0.42),
      oy + dy - headLen * Math.sin(headAngle + 0.42)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // --- Power meter UI ---
  function drawPowerMeter(ctx, duck) {
    var mw = 120;
    var mh = 14;
    var mx = duck.x - mw / 2;
    var my = duck.y - duck.radius - 26;

    // Only draw when charging or briefly after launch? Show whenever on ground.
    if (!duck.onGround && !duck.charging) return;

    // Background
    ctx.fillStyle   = PAL.powerBg;
    ctx.strokeStyle = PAL.powerBorder;
    ctx.lineWidth   = 1.5;
    _roundRect(ctx, mx, my, mw, mh, 4);
    ctx.fill();
    ctx.stroke();

    // Fill
    if (duck.power > 0) {
      // Colour shifts green→yellow→red with power
      var r = Math.round(255 * Math.min(1, duck.power * 2));
      var g = Math.round(255 * Math.min(1, (1 - duck.power) * 2));
      ctx.fillStyle = "rgb(" + r + "," + g + ",30)";
      _roundRect(ctx, mx + 1, my + 1, (mw - 2) * duck.power, mh - 2, 3);
      ctx.fill();
    }

    // Label
    ctx.fillStyle  = "#ffffff";
    ctx.font       = "bold 9px monospace";
    ctx.textAlign  = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("POWER", duck.x, my + mh / 2);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // --- Hint bar at bottom ---
  function drawHint(ctx) {
    ctx.save();
    ctx.fillStyle    = PAL.hintText;
    ctx.font         = "13px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      "SPACE halten = laden  ·  ←/→ = Richtung  ·  loslassen = Sprung  ·  R = Reset",
      CANVAS_W / 2,
      CANVAS_H - 6
    );
    ctx.restore();
  }

  // --- Kick off the loop ---
  requestAnimationFrame(tick);
}());
