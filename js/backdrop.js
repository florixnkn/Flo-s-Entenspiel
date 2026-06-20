// js/backdrop.js — Cartoon bathroom backdrop.
//
// drawBackdrop(ctx) draws a low-contrast tiled-wall + floor strip + decorative
// shapes behind all gameplay elements.  Swap the entire body of this function
// to plug in a real ChatGPT background image later.
//
// Called once per draw frame from game.js BEFORE platforms/duck/props are drawn.

function drawBackdrop(ctx) {
  // --- Sky/wall base ---
  // Already cleared to PAL.sky (#d6f0ff) by game.js; paint a slightly warmer
  // wall colour on top so the tile grid stands out without competing with game objects.
  ctx.save();

  // Wall fill — soft cream, low-contrast
  ctx.fillStyle = "#e8f4f8";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H - 80);

  // Floor strip — slightly darker warm tile
  ctx.fillStyle = "#cce0e8";
  ctx.fillRect(0, CANVAS_H - 80, CANVAS_W, 80);

  // Floor/wall divider line
  ctx.strokeStyle = "#aaccd8";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_H - 80);
  ctx.lineTo(CANVAS_W, CANVAS_H - 80);
  ctx.stroke();

  // --- Wall tile grid ---
  // Subtle horizontal + vertical lines forming a 60×40 px tile pattern
  var tileW = 60;
  var tileH = 40;
  ctx.strokeStyle = "#c0dce6";
  ctx.lineWidth   = 0.8;

  // Vertical lines
  for (var tx = 0; tx <= CANVAS_W; tx += tileW) {
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx, CANVAS_H - 80);
    ctx.stroke();
  }
  // Horizontal lines
  for (var ty = 0; ty <= CANVAS_H - 80; ty += tileH) {
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(CANVAS_W, ty);
    ctx.stroke();
  }

  // --- Floor tile grid ---
  var ftileW = 50;
  ctx.strokeStyle = "#b0ccd8";
  ctx.lineWidth   = 0.8;
  for (var ftx = 0; ftx <= CANVAS_W; ftx += ftileW) {
    ctx.beginPath();
    ctx.moveTo(ftx, CANVAS_H - 80);
    ctx.lineTo(ftx, CANVAS_H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_H - 40);
  ctx.lineTo(CANVAS_W, CANVAS_H - 40);
  ctx.stroke();

  // --- Mirror / window shape (top-left area) ---
  // Faint rectangle suggesting a mirror or frosted window
  var mx = 30, my = 70, mw = 100, mh = 140;
  ctx.fillStyle   = "#d8eef8";
  ctx.globalAlpha = 0.55;
  rrPath(ctx, mx, my, mw, mh, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#b0ccd8";
  ctx.lineWidth   = 1.5;
  rrPath(ctx, mx, my, mw, mh, 6);
  ctx.stroke();

  // Mirror highlight streak
  ctx.strokeStyle  = "#ffffff";
  ctx.lineWidth    = 3;
  ctx.globalAlpha  = 0.45;
  ctx.lineCap      = "round";
  ctx.beginPath();
  ctx.moveTo(mx + 14, my + 10);
  ctx.lineTo(mx + 28, my + 60);
  ctx.stroke();
  ctx.globalAlpha  = 1;
  ctx.lineCap      = "butt";

  // Mirror frame border (slightly darker)
  ctx.strokeStyle = "#98bece";
  ctx.lineWidth   = 3;
  rrPath(ctx, mx, my, mw, mh, 6);
  ctx.stroke();

  // --- Towel rail shape (top-right area) ---
  // A horizontal bar suggesting a towel rack on the wall
  var railX = CANVAS_W - 200, railY = 180, railW = 140, railH = 8;
  ctx.fillStyle   = "#c0d8e4";
  ctx.globalAlpha = 0.70;
  rrPath(ctx, railX, railY, railW, railH, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#a8c4d0";
  ctx.lineWidth   = 1.5;
  rrPath(ctx, railX, railY, railW, railH, 4);
  ctx.stroke();

  // Rail end caps
  ctx.fillStyle = "#a8c4d0";
  ctx.globalAlpha = 0.70;
  ctx.beginPath();
  ctx.arc(railX, railY + railH / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(railX + railW, railY + railH / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Hanging towel shape — draped rectangle below the rail
  ctx.fillStyle   = "#c8e8f0";
  ctx.globalAlpha = 0.50;
  rrPath(ctx, railX + railW * 0.3, railY + railH, railW * 0.4, 60, 4);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// rrPath() is now the shared global in constants.js — no local copy needed.
