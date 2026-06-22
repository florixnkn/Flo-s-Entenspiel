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
// Cute distressed cartoon toddler, ~95px tall, centered at (cx, cy).
// Onesie body, stubby raised arms, closed crying eyes, wide wailing mouth,
// big tear streams, rosy cheeks, hair tuft. Thick dark outlines.
// ---------------------------------------------------------------------------
function _drawCryingChild(ctx, cx, cy) {
  ctx.save();

  // Convenient vertical anchors (cy = vertical center of the figure)
  var headCy  = cy - 28;   // center of head circle
  var headR   = 18;        // head radius
  var bodyTop = cy - 10;   // top of onesie body
  var bodyH   = 34;        // onesie height
  var bodyW   = 26;        // onesie half-width * 2

  // --- Onesie body (light blue) ---
  ctx.fillStyle   = "#9cc4e8";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2;
  rrPath(ctx, cx - bodyW / 2, bodyTop, bodyW, bodyH, 8);
  ctx.fill();
  ctx.stroke();

  // Onesie inner highlight — soft lighter stripe on left
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.fillStyle   = "#ffffff";
  rrPath(ctx, cx - bodyW / 2 + 4, bodyTop + 4, 7, bodyH - 10, 3);
  ctx.fill();
  ctx.restore();

  // --- Stubby legs ---
  var legW = 9, legH = 16, legY = bodyTop + bodyH - 4;
  ctx.fillStyle   = "#9cc4e8";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2;
  // Left leg
  rrPath(ctx, cx - 13, legY, legW, legH, 5);
  ctx.fill();
  ctx.stroke();
  // Right leg
  rrPath(ctx, cx + 4, legY, legW, legH, 5);
  ctx.fill();
  ctx.stroke();

  // Small shoes / feet
  ctx.fillStyle   = "#cc8855";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx - 9, legY + legH + 3, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + 9, legY + legH + 3, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // --- Stubby arms raised up in distress ---
  var armW = 9, armH = 18;
  ctx.fillStyle   = "#9cc4e8";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2;
  // Left arm — angled up-left
  ctx.save();
  ctx.translate(cx - bodyW / 2 + 2, bodyTop + 6);
  ctx.rotate(-0.55);
  rrPath(ctx, -armW / 2, -armH, armW, armH, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Right arm — angled up-right
  ctx.save();
  ctx.translate(cx + bodyW / 2 - 2, bodyTop + 6);
  ctx.rotate(0.55);
  rrPath(ctx, -armW / 2, -armH, armW, armH, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // --- Head ---
  ctx.fillStyle   = "#f6c9a0";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hair tuft — a few short brown curved strokes on top
  ctx.strokeStyle = "#7a4a1a";
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = "round";
  var tuftBase = headCy - headR + 2;
  // Centre tuft
  ctx.beginPath();
  ctx.moveTo(cx, tuftBase);
  ctx.quadraticCurveTo(cx + 2, tuftBase - 9, cx + 1, tuftBase - 14);
  ctx.stroke();
  // Left tuft
  ctx.beginPath();
  ctx.moveTo(cx - 6, tuftBase + 1);
  ctx.quadraticCurveTo(cx - 9, tuftBase - 6, cx - 8, tuftBase - 11);
  ctx.stroke();
  // Right tuft
  ctx.beginPath();
  ctx.moveTo(cx + 6, tuftBase + 1);
  ctx.quadraticCurveTo(cx + 9, tuftBase - 6, cx + 8, tuftBase - 11);
  ctx.stroke();
  ctx.lineCap = "butt";

  // --- Rosy cheeks (soft pink, low alpha) ---
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle   = "#f6a6a6";
  ctx.beginPath();
  ctx.ellipse(cx - 11, headCy + 5, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 11, headCy + 5, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- Closed crying eyes — downward "^" arcs (squeezed shut) ---
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = "round";
  // Left eye — arc pointing downward (open side down = squeezed shut upward)
  ctx.beginPath();
  ctx.arc(cx - 6, headCy - 2, 5, Math.PI * 1.15, Math.PI * 1.85, false);
  ctx.stroke();
  // Right eye
  ctx.beginPath();
  ctx.arc(cx + 6, headCy - 2, 5, Math.PI * 1.15, Math.PI * 1.85, false);
  ctx.stroke();
  ctx.lineCap = "butt";

  // --- Tear streams — prominent elongated drops from each eye ---
  ctx.fillStyle = "#66aaff";
  // Left tear — two drops forming a stream
  ctx.beginPath();
  ctx.ellipse(cx - 9, headCy + 6,  2.5, 5, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - 10, headCy + 14, 2, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Right tear stream
  ctx.beginPath();
  ctx.ellipse(cx + 9, headCy + 6,  2.5, 5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 10, headCy + 14, 2, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // --- Wide-open wailing mouth ---
  // Dark maroon filled oval for the open mouth
  ctx.fillStyle   = "#771122";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth   = 1.8;
  ctx.beginPath();
  ctx.ellipse(cx, headCy + 9, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Small pink tongue at the bottom of the mouth
  ctx.fillStyle = "#ee6677";
  ctx.beginPath();
  ctx.ellipse(cx, headCy + 12, 3.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// rrPath() is now the shared global in constants.js — no local copy needed.
