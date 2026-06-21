// js/constants.js — All tunable feel parameters. Tweak freely.

var CANVAS_W = 960;
var CANVAS_H = 600;

// ---------------------------------------------------------------------------
// Shared rounded-rect path helper — loaded before all other scripts so every
// file can call rrPath(ctx, x, y, w, h, r) without duplicating the code.
// Builds the path only; caller must fill/stroke afterwards.
// ---------------------------------------------------------------------------
function rrPath(ctx, x, y, w, h, r) {
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

// ---------------------------------------------------------------------------
// Image registry — eagerly loaded so all scripts can reference IMG.*
// Keys match the asset filenames; paths are lowercase relative with "./" prefix.
// ---------------------------------------------------------------------------
var IMG = {
  titleHero:  new Image(),
  bgBathroom: new Image(),
  winSplash:  new Image()
};
IMG.titleHero.src  = "./assets/title-hero.png";
IMG.bgBathroom.src = "./assets/bg-bathroom.png";
IMG.winSplash.src  = "./assets/win-splash.png";

// Returns true only when an Image element has fully decoded pixel data available.
function imgReady(img) {
  return !!(img && img.complete && img.naturalWidth > 0);
}

// object-fit:cover — scales src so it fully covers (dx,dy,dw,dh), centre-crops
// the overflow, then draws via the 9-arg form of drawImage.
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  var sw = img.naturalWidth;
  var sh = img.naturalHeight;
  var scale = Math.max(dw / sw, dh / sh);
  var scaledW = sw * scale;
  var scaledH = sh * scale;
  var sx = (sw - dw / scale) / 2;
  var sy = (sh - dh / scale) / 2;
  var srcW = dw / scale;
  var srcH = dh / scale;
  ctx.drawImage(img, sx, sy, srcW, srcH, dx, dy, dw, dh);
}

// --- Physics ---
var GRAVITY        = 2200;   // px/s² downward acceleration
var GROUND_FRICTION = 0.80;  // vx multiplier on land (lower = more brake)
var SOAP_FRICTION   = 0.98;  // vx multiplier on soap surface (near-frictionless)

// --- Launch ---
var LAUNCH_ANGLE   = 60;     // degrees above horizontal
var MIN_LAUNCH     = 500;    // px/s at power=0
var MAX_LAUNCH     = 1150;   // px/s at power=1

// --- Power meter oscillation ---
var POWER_CYCLE    = 0.85;   // seconds for a full 0→1→0 sweep

// --- Squash / Stretch ---
var SQUASH_CHARGE  = 0.60;   // scaleY while fully charged (1=normal, 0.6=squashed)
var STRETCH_LAUNCH = 1.30;   // scale along velocity axis on launch

// --- Collision feel ---
var LAND_TOLERANCE = 8;      // px — how forgiving vertical landing snap is
var BOUNCE_DAMPEN  = 0.18;   // fraction of vy kept on bounce (very small = dead stop feel)

// --- Duck geometry ---
var DUCK_RADIUS    = 22;     // collision circle radius in px

// --- Squash/stretch animation durations (seconds) ---
var STRETCH_DURATION = 0.12; // how long the launch stretch lasts
var LAND_SQUASH_DUR  = 0.10; // squash on land
var SETTLE_DUR       = 0.08; // bounce-back to normal after land squash

// --- Cartoon palette ---
var PAL = {
  sky:        "#d6f0ff",   // background
  ground:     "#7a5c3a",   // ground platform fill
  groundTop:  "#9b7a50",   // ground top stripe
  outline:    "#222222",   // thick cartoon outlines
  duckBody:   "#f5d000",   // rubber duck yellow
  duckBeak:   "#e06010",   // orange beak
  duckEye:    "#111111",   // eye fill
  duckEyeW:   "#ffffff",   // eye white
  duckChest:  "#f7e050",   // lighter belly
  powerBg:    "#444444",   // power meter background
  powerFill:  "#ff4422",   // power meter fill
  powerBorder:"#ffffff",
  aimArrow:   "#ff6600",
  hintText:   "#445566",
};
