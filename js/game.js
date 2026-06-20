// js/game.js — Main loop, state machine, update, draw orchestration.
// Slice 4: timer, child-progress, LOSE (time / toilet), WIN guard, restart.

(function () {
  var canvas = document.getElementById("game");
  var ctx    = canvas.getContext("2d");

  // --- Mutable game state ---
  // g.state: "PLAY" | "WIN" | "LOSE_CHILD" | "LOSE_TOILET"
  var g = {
    levelIndex:    0,
    level:         null,
    platforms:     [],
    tub:           null,
    props:         [],
    state:         "PLAY",
    timeLeft:      0,     // seconds remaining this level
    childProgress: 0,     // 0..1 (derived each tick)
    timeBonus:     0      // time left when WIN was achieved (mini-score)
  };

  var duck = createDuck(0, 0);

  // Boot straight into Level 1
  _startLevel(0);

  // ---------------------------------------------------------------------------
  // Level loader (wraps loadLevel, also resets timer + child state)
  // ---------------------------------------------------------------------------
  function _startLevel(index) {
    loadLevel(index, duck, g);
    g.props         = (g.level.props || []).slice();
    g.timeLeft      = g.level.timeLimit;
    g.childProgress = 0;
    g.timeBonus     = 0;
    g.state         = "PLAY";
  }

  // ---------------------------------------------------------------------------
  // Fixed-timestep loop
  // ---------------------------------------------------------------------------
  var FIXED_DT    = 1 / 60;
  var MAX_ACCUM   = 0.200;
  var lastTime    = null;
  var accumulator = 0;

  function tick(timestamp) {
    requestAnimationFrame(tick);

    if (lastTime === null) { lastTime = timestamp; }
    var rawDt = (timestamp - lastTime) / 1000;
    lastTime  = timestamp;
    if (rawDt > MAX_ACCUM) rawDt = MAX_ACCUM;
    accumulator += rawDt;

    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
      Input.flush();
    }

    draw();
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    // R restarts from ANY non-PLAY state
    if (g.state !== "PLAY") {
      if (Input.pressed("KeyR")) {
        _startLevel(g.levelIndex);
      }
      return;
    }

    // --- PLAY state ---

    // R restarts current level
    if (Input.pressed("KeyR")) {
      _startLevel(g.levelIndex);
      return;
    }

    duckUpdate(duck, dt, g.platforms);

    // Respawn if duck fell off bottom (timer keeps running)
    if (duck.fellOff) {
      duckReset(duck, g.level.start.x, g.level.start.y);
      return;
    }

    // --- WIN check first: duck body enters tub rectangle ---
    // Evaluated BEFORE decrementing the timer so a duck reaching the tub on the
    // exact final frame wins rather than losing.
    var tub = g.tub;
    if (
      duck.x + duck.radius > tub.x &&
      duck.x - duck.radius < tub.x + tub.w &&
      duck.y + duck.radius > tub.y &&
      duck.y - duck.radius < tub.y + tub.h
    ) {
      g.state     = "WIN";
      g.timeBonus = g.timeLeft;
      // SFX.splash()  — stub for the juice pass
      return;
    }

    // --- Toilet zone check (instant LOSE) ---
    // Only fires when duck is DESCENDING (vy > 0) and horizontally within the bowl,
    // preventing sideways pass-through false triggers.
    for (var i = 0; i < g.props.length; i++) {
      var prop = g.props[i];
      if (prop.type === "toilet") {
        if (
          duck.vy > 0 &&
          duck.x >= prop.x && duck.x <= prop.x + prop.w &&
          _duckOverlapsRect(duck, prop)
        ) {
          g.state = "LOSE_TOILET";
          // SFX.plop()  — stub for the juice pass
          return;
        }
      }
    }

    // Count down timer
    g.timeLeft -= dt;
    if (g.timeLeft < 0) { g.timeLeft = 0; }

    // Derive child progress
    g.childProgress = 1 - g.timeLeft / g.level.timeLimit;

    // SFX.tick()  — stub: play tick sound each second in the last 5s (juice pass)

    // Time ran out → LOSE (child entered)
    if (g.timeLeft <= 0) {
      g.state = "LOSE_CHILD";
      // SFX.cry()  — stub for the juice pass
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Axis-aligned circle vs rect overlap (for prop/toilet detection)
  // ---------------------------------------------------------------------------
  function _duckOverlapsRect(duck, rect) {
    return circleOverlapsRect(
      duck.x, duck.y, duck.radius,
      rect.x, rect.y, rect.w, rect.h
    );
  }

  // ---------------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------------
  function draw() {
    // Background — bathroom-y light blue
    ctx.fillStyle = PAL.sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawPlatforms(ctx, g.platforms);
    drawTub(ctx, g.tub);

    // Draw toilet props
    for (var i = 0; i < g.props.length; i++) {
      if (g.props[i].type === "toilet") {
        drawToilet(ctx, g.props[i]);
      }
    }

    drawAimIndicator(ctx, duck);
    duckDraw(ctx, duck, g.timeLeft);
    drawPowerMeter(ctx, duck);

    // HUD (clock + bar + door) — always drawn during PLAY and over the scene in LOSE/WIN
    drawHUD(ctx, g.timeLeft, g.level ? g.level.timeLimit : 1, g.childProgress);

    if (g.state === "WIN") {
      drawWinOverlay(ctx, g.timeBonus);
    } else if (g.state === "LOSE_CHILD") {
      drawLoseChildOverlay(ctx);
    } else if (g.state === "LOSE_TOILET") {
      drawLoseToiletOverlay(ctx);
    } else {
      drawHint(ctx);
    }
  }

  // ---------------------------------------------------------------------------
  // Platform renderer — cartoon rounded rects with label
  // ---------------------------------------------------------------------------
  function drawPlatforms(ctx, platforms) {
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      var isFloor = (p.label === "");

      ctx.save();

      if (isFloor) {
        ctx.fillStyle   = PAL.ground;
        _roundRect(ctx, p.x, p.y, p.w, p.h, 4);
        ctx.fill();
        ctx.strokeStyle = PAL.outline;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = "#c8a878";
        _roundRect(ctx, p.x, p.y, p.w, p.h, 6);
        ctx.fill();

        ctx.fillStyle = "#dbbe94";
        _roundRect(ctx, p.x, p.y, p.w, 6, 4);
        ctx.fill();

        ctx.strokeStyle = PAL.outline;
        ctx.lineWidth   = 2.5;
        _roundRect(ctx, p.x, p.y, p.w, p.h, 6);
        ctx.stroke();

        if (p.label) {
          ctx.fillStyle    = PAL.outline;
          ctx.font         = "bold 10px system-ui, sans-serif";
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.label, p.x + p.w / 2, p.y + p.h / 2);
        }
      }

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Tub renderer
  // ---------------------------------------------------------------------------
  function drawTub(ctx, tub) {
    if (!tub) return;

    var tx = tub.x;
    var ty = tub.y;
    var tw = tub.w;
    var th = tub.h;

    ctx.save();

    ctx.fillStyle = "#b8e8f8";
    _roundRect(ctx, tx, ty, tw, th, 12);
    ctx.fill();

    ctx.fillStyle = "#d4f0fc";
    _roundRect(ctx, tx + 6, ty + 6, tw - 12, th * 0.45, 6);
    ctx.fill();

    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth   = 3;
    _roundRect(ctx, tx, ty, tw, th, 12);
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth   = 2;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(tx + 14, ty + 4);
    ctx.lineTo(tx + tw - 14, ty + 4);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle    = "#1155aa";
    ctx.font         = "bold 12px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Wanne", tx + tw / 2, ty + th / 2);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Win overlay — shows time bonus
  // ---------------------------------------------------------------------------
  function drawWinOverlay(ctx, timeBonus) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    var bw = 440;
    var bh = 180;
    var bx = (CANVAS_W - bw) / 2;
    var by = (CANVAS_H - bh) / 2;
    ctx.fillStyle = "#fffae8";
    _roundRect(ctx, bx, by, bw, bh, 18);
    ctx.fill();
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth   = 4;
    _roundRect(ctx, bx, by, bw, bh, 18);
    ctx.stroke();

    ctx.fillStyle    = "#226611";
    ctx.font         = "bold 42px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GESCHAFFT! 🦆🛁", CANVAS_W / 2, by + 62);

    // Show remaining time as mini-score
    var bonusSecs = Math.ceil(Math.max(0, timeBonus));
    ctx.fillStyle = "#886600";
    ctx.font      = "16px system-ui, sans-serif";
    ctx.fillText("+ " + bonusSecs + " s übrig", CANVAS_W / 2, by + 108);

    ctx.fillStyle = PAL.hintText;
    ctx.font      = "17px system-ui, sans-serif";
    ctx.fillText("R = nochmal", CANVAS_W / 2, by + 148);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Aim indicator
  // ---------------------------------------------------------------------------
  function drawAimIndicator(ctx, duck) {
    if (!duck.onGround && !duck.charging) return;

    var angleRad = LAUNCH_ANGLE * (Math.PI / 180);
    var arrowLen = 36 + duck.power * 22;
    var dx = Math.cos(angleRad) * arrowLen * duck.facing;
    var dy = -Math.sin(angleRad) * arrowLen;
    var ox = duck.x;
    var oy = duck.y;

    ctx.save();
    ctx.globalAlpha  = duck.charging ? 0.55 + duck.power * 0.4 : 0.35;
    ctx.strokeStyle  = PAL.aimArrow;
    ctx.fillStyle    = PAL.aimArrow;
    ctx.lineWidth    = 2.5;
    ctx.lineCap      = "round";

    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + dx, oy + dy);
    ctx.stroke();

    var headLen   = 9;
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

  // ---------------------------------------------------------------------------
  // Power meter
  // ---------------------------------------------------------------------------
  function drawPowerMeter(ctx, duck) {
    if (!duck.onGround && !duck.charging) return;

    var mw = 120;
    var mh = 14;
    var mx = duck.x - mw / 2;
    var my = duck.y - duck.radius - 26;

    ctx.fillStyle   = PAL.powerBg;
    ctx.strokeStyle = PAL.powerBorder;
    ctx.lineWidth   = 1.5;
    _roundRect(ctx, mx, my, mw, mh, 4);
    ctx.fill();
    ctx.stroke();

    if (duck.power > 0) {
      var r  = Math.round(255 * Math.min(1, duck.power * 2));
      var gv = Math.round(255 * Math.min(1, (1 - duck.power) * 2));
      ctx.fillStyle = "rgb(" + r + "," + gv + ",30)";
      _roundRect(ctx, mx + 1, my + 1, (mw - 2) * duck.power, mh - 2, 3);
      ctx.fill();
    }

    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 9px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("POWER", duck.x, my + mh / 2);
  }

  // ---------------------------------------------------------------------------
  // Hint bar
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Shared rounded-rect path helper
  // ---------------------------------------------------------------------------
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

  // --- Kick off ---
  requestAnimationFrame(tick);
}());
