// js/hud.js — Stakes HUD: clock, "Kind nähert sich" bar, door with light strip.
//
// Called every PLAY frame via drawHUD(ctx, timeLeft, timeLimit, childProgress).
// childProgress = 1 - timeLeft/timeLimit  (0 = just started, 1 = kid enters)
//
// Door is drawn top-right; its light strip and handle animate with childProgress.
// Clock turns red in the last 5 seconds.
// All shapes are cartoon placeholder rects/paths — no external assets.

function drawHUD(ctx, timeLeft, timeLimit, childProgress) {
  _drawClock(ctx, timeLeft);
  _drawChildBar(ctx, childProgress);
  _drawDoor(ctx, childProgress);
}

// ---------------------------------------------------------------------------
// Clock — top-center, shows remaining seconds, turns red below 5 s
// Juice: pulses in scale each second during last 5s via Juice.clockPulse.
// ---------------------------------------------------------------------------
function _drawClock(ctx, timeLeft) {
  var cx = CANVAS_W / 2;
  var cy = 30;
  var r  = 22;

  var isUrgent = timeLeft <= 5;
  var faceCol  = isUrgent ? "#ff2222" : "#ffffff";
  var rimCol   = isUrgent ? "#cc0000" : "#334455";

  // Scale pop driven by Juice.clockPulse (0 when idle, 1 at peak)
  var pulse     = (typeof Juice !== "undefined") ? Juice.clockPulse : 0;
  var clockScale = 1 + pulse * 0.18;  // max 1.18x size at tick moment

  ctx.save();

  if (isUrgent && clockScale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(clockScale, clockScale);
    ctx.translate(-cx, -cy);
  }

  // Clock face
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = faceCol;
  ctx.fill();
  ctx.strokeStyle = rimCol;
  ctx.lineWidth   = 3;
  ctx.stroke();

  // Second hand — sweeps based on fractional seconds remaining
  // Points to the current second position on the clock face
  var frac = (timeLeft % 60) / 60;  // 0..1 full rotation
  var angle = (frac * Math.PI * 2) - Math.PI / 2;  // 12-o'clock start
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * (r - 5), cy + Math.sin(angle) * (r - 5));
  ctx.strokeStyle = isUrgent ? "#ffffff" : rimCol;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Digit label — seconds left (ceil so it shows 20 not 19 at start)
  var secs = Math.ceil(Math.max(0, timeLeft));
  ctx.fillStyle    = isUrgent ? "#ffffff" : "#111111";
  ctx.font         = "bold 11px monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(secs + "s", cx, cy + r + 10);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// "Kind nähert sich" bar — below the clock, fills left-to-right
// ---------------------------------------------------------------------------
function _drawChildBar(ctx, childProgress) {
  var bw   = 160;
  var bh   = 14;
  var bx   = (CANVAS_W - bw) / 2;
  var by   = 80;
  var fill = Math.min(1, Math.max(0, childProgress));

  ctx.save();

  // Background track
  ctx.fillStyle   = "rgba(30,30,50,0.55)";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth   = 1.5;
  rrPath(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  // Fill — shifts from green through orange to red
  if (fill > 0) {
    var r, gv;
    if (fill < 0.5) {
      r  = Math.round(fill * 2 * 255);
      gv = 200;
    } else {
      r  = 255;
      gv = Math.round((1 - (fill - 0.5) * 2) * 200);
    }
    ctx.fillStyle = "rgb(" + r + "," + gv + ",30)";
    rrPath(ctx, bx + 1, by + 1, (bw - 2) * fill, bh - 2, 3);
    ctx.fill();
  }

  // Label
  ctx.fillStyle    = "#ffffff";
  ctx.font         = "bold 8px system-ui, sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("KIND NÄHERT SICH", CANVAS_W / 2, by + bh / 2);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Door — top-right corner.  Light strip under it grows with childProgress.
// Near full (>0.85) the handle visibly dips downward.
// ---------------------------------------------------------------------------
function _drawDoor(ctx, childProgress) {
  var fill = Math.min(1, Math.max(0, childProgress));

  // Door geometry (fixed position, top-right area)
  var dw   = 56;
  var dh   = 88;
  var dx   = CANVAS_W - dw - 14;
  var dy   = 8;

  ctx.save();

  // Door frame
  ctx.fillStyle   = "#8b6040";
  rrPath(ctx, dx - 5, dy - 5, dw + 10, dh + 10, 5);
  ctx.fill();
  ctx.strokeStyle = "#4a3020";
  ctx.lineWidth   = 3;
  rrPath(ctx, dx - 5, dy - 5, dw + 10, dh + 10, 5);
  ctx.stroke();

  // Door panel
  ctx.fillStyle = "#c8944a";
  rrPath(ctx, dx, dy, dw, dh, 3);
  ctx.fill();
  ctx.strokeStyle = "#4a3020";
  ctx.lineWidth   = 2;
  rrPath(ctx, dx, dy, dw, dh, 3);
  ctx.stroke();

  // Door panel inset detail
  ctx.strokeStyle = "rgba(80,50,20,0.4)";
  ctx.lineWidth   = 1;
  rrPath(ctx, dx + 6, dy + 6, dw - 12, dh - 12, 2);
  ctx.stroke();

  // Handle — dips downward when childProgress > 0.85
  var handleDip = (fill > 0.85) ? ((fill - 0.85) / 0.15) * 8 : 0; // 0..8 px dip
  var hx        = dx + dw - 12;
  var hy        = dy + dh * 0.55 + handleDip;
  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, Math.PI * 2);
  ctx.fillStyle   = "#f0c050";
  ctx.fill();
  ctx.strokeStyle = "#806010";
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Light strip under the door — 40 px tall so it reads clearly at a glance
  var stripMaxH = 40;
  var stripH    = fill * stripMaxH;
  var stripY    = dy + dh + 3; // just below the door panel

  if (stripH > 0.5) {
    // Soft glow halo behind strip
    ctx.globalAlpha = 0.30 * fill;
    ctx.fillStyle   = "#ffee88";
    rrPath(ctx, dx - 4, stripY - 2, dw + 8, stripMaxH + 4, 4);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Actual strip — grows from bottom edge upward as child approaches
    var lightAlpha = 0.65 + fill * 0.35;
    ctx.globalAlpha = lightAlpha;
    ctx.fillStyle   = "#ffe060";
    rrPath(ctx, dx, stripY + (stripMaxH - stripH), dw, stripH, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Vertical light crack from the door's inner-left edge — grows in width (0→14px)
  // This makes the door look like it's cracking open as the child approaches.
  var crackW = fill * 14;
  if (crackW > 0.5) {
    // Glow backing for the crack
    ctx.globalAlpha = 0.25 * fill;
    ctx.fillStyle   = "#ffee88";
    ctx.fillRect(dx - 2, dy, crackW + 6, dh);
    ctx.globalAlpha = 1;

    // Bright crack slice
    ctx.globalAlpha = 0.55 + fill * 0.45;
    ctx.fillStyle   = "#fff5a0";
    ctx.fillRect(dx, dy, crackW, dh);
    ctx.globalAlpha = 1;
  }

  // Label above door
  ctx.fillStyle    = "rgba(30,20,10,0.75)";
  ctx.font         = "bold 8px system-ui, sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("TÜR", dx + dw / 2, dy - 6);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// LOSE overlay — child entered (time ran out)
// ---------------------------------------------------------------------------
function drawLoseChildOverlay(ctx) {
  // SFX.cry() is triggered once in game.js when the state first enters LOSE_CHILD.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  var bw = 460;
  var bh = 220;
  var bx = (CANVAS_W - bw) / 2;
  var by = (CANVAS_H - bh) / 2;

  // Box
  ctx.fillStyle = "#fff0f0";
  rrPath(ctx, bx, by, bw, bh, 18);
  ctx.fill();
  ctx.strokeStyle = "#cc2222";
  ctx.lineWidth   = 4;
  rrPath(ctx, bx, by, bw, bh, 18);
  ctx.stroke();

  // Crying child figure (simple cartoon placeholder)
  _drawCryingChild(ctx, bx + 54, by + bh / 2);

  // Text
  ctx.fillStyle    = "#aa1111";
  ctx.font         = "bold 32px system-ui, sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Das Kind weint 😭", CANVAS_W / 2 + 24, by + 70);

  ctx.fillStyle = "#444444";
  ctx.font      = "17px system-ui, sans-serif";
  ctx.fillText("R = nochmal", CANVAS_W / 2 + 24, by + 130);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// LOSE overlay — toilet fall
// ---------------------------------------------------------------------------
function drawLoseToiletOverlay(ctx) {
  // SFX.plop() is triggered once in game.js when the state first enters LOSE_TOILET.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  var bw = 520;
  var bh = 180;
  var bx = (CANVAS_W - bw) / 2;
  var by = (CANVAS_H - bh) / 2;

  ctx.fillStyle = "#f0f8ff";
  rrPath(ctx, bx, by, bw, bh, 18);
  ctx.fill();
  ctx.strokeStyle = "#336699";
  ctx.lineWidth   = 4;
  rrPath(ctx, bx, by, bw, bh, 18);
  ctx.stroke();

  ctx.fillStyle    = "#003388";
  ctx.font         = "bold 28px system-ui, sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PLOPP! In die Toilette gefallen 🚽", CANVAS_W / 2, by + 72);

  ctx.fillStyle = "#444444";
  ctx.font      = "17px system-ui, sans-serif";
  ctx.fillText("R = nochmal", CANVAS_W / 2, by + 128);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Simple cartoon crying-child figure (pure shapes, ~80px tall)
// cx, cy = center of figure
// ---------------------------------------------------------------------------
function _drawCryingChild(ctx, cx, cy) {
  ctx.save();

  // Body
  ctx.fillStyle   = "#f5c842";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(cx - 14, cy - 16, 28, 36, 6)
    : (function(){ rrPath(ctx, cx - 14, cy - 16, 28, 36, 6); })();
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.fillStyle = "#fad98a";
  ctx.beginPath();
  ctx.arc(cx, cy - 32, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Eyes (squinted / sad — downward arcs)
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(cx - 6, cy - 34, 5, Math.PI * 0.1, Math.PI * 0.9, false); // left eye arc
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 6, cy - 34, 5, Math.PI * 0.1, Math.PI * 0.9, false); // right eye arc
  ctx.stroke();

  // Tears — two small blue drops per eye
  ctx.fillStyle = "#66aaff";
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy - 24, 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy - 24, 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (down-turned frown)
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(cx, cy - 26, 6, Math.PI * 0.1, Math.PI * 0.9, false);
  ctx.stroke();

  // Arms out (distressed)
  ctx.strokeStyle = "#f5c842";
  ctx.lineWidth   = 4;
  ctx.lineCap     = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy - 8);
  ctx.lineTo(cx - 26, cy + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 14, cy - 8);
  ctx.lineTo(cx + 26, cy + 4);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy + 20);
  ctx.lineTo(cx - 7, cy + 38);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 7, cy + 20);
  ctx.lineTo(cx + 7, cy + 38);
  ctx.stroke();

  ctx.restore();
}

// rrPath() is now the shared global in constants.js — no local copy needed.
