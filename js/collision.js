// js/collision.js — Per-axis circle-vs-rect collision resolution.
//
// Usage pattern each tick:
//   1. Save duck.prevX / duck.prevY before integrating position.
//   2. Integrate x and y separately (or together).
//   3. Call resolveCircleRect for each platform.
//
// Resolution uses the PRE-MOVE axis to decide push direction, so it
// stays stable when many platforms are checked in sequence.

// Returns true if circle (cx,cy,r) overlaps rect (rx,ry,rw,rh).
function circleOverlapsRect(cx, cy, r, rx, ry, rw, rh) {
  var nearX = Math.max(rx, Math.min(cx, rx + rw));
  var nearY = Math.max(ry, Math.min(cy, ry + rh));
  var dx = cx - nearX;
  var dy = cy - nearY;
  return (dx * dx + dy * dy) < (r * r);
}

// Resolves a circle against a single rect, per axis.
// duck      — object with x, y, prevX, prevY, vx, vy, radius, onGround
// platform  — { x, y, w, h, surface }   (surface: "normal" | "soap")
// Returns true if a collision was resolved.
function resolveCircleRect(duck, platform) {
  var r  = duck.radius;
  var cx = duck.x;
  var cy = duck.y;
  var rx = platform.x;
  var ry = platform.y;
  var rw = platform.w;
  var rh = platform.h;

  if (!circleOverlapsRect(cx, cy, r, rx, ry, rw, rh)) return false;

  // Determine approach axis from prev position to decide push direction.
  var prevCx = duck.prevX;
  var prevCy = duck.prevY;

  // Was the duck ABOVE the platform top before moving? (top-surface landing)
  var wasAbove = (prevCy + r) <= (ry + LAND_TOLERANCE);
  // Was the duck BELOW the platform bottom before moving?
  var wasBelow = (prevCy - r) >= (ry + rh - LAND_TOLERANCE);
  // Was the duck LEFT of the platform left edge?
  var wasLeft  = (prevCx + r) <= (rx + LAND_TOLERANCE);
  // Was the duck RIGHT of the platform right edge?
  var wasRight = (prevCx - r) >= (rx + rw - LAND_TOLERANCE);

  if (wasAbove) {
    // Landing on top surface — position correction always applies
    duck.y      = ry - r;
    duck.vy     = 0;
    duck.onGround = true;
    // Apply friction and land trigger only once per tick (guard against seam doubles)
    if (!duck.triggerLand) {
      var friction = (platform.surface === "soap") ? SOAP_FRICTION : GROUND_FRICTION;
      duck.vx    *= friction;
      duck.triggerLand = true;
    }
  } else if (wasBelow) {
    // Head bump against bottom of platform
    duck.y   = ry + rh + r;
    duck.vy  = Math.abs(duck.vy) * BOUNCE_DAMPEN; // small deflect downward
  } else if (wasLeft) {
    // Hit left wall
    duck.x   = rx - r;
    duck.vx  = -Math.abs(duck.vx) * BOUNCE_DAMPEN;
  } else if (wasRight) {
    // Hit right wall
    duck.x   = rx + rw + r;
    duck.vx  =  Math.abs(duck.vx) * BOUNCE_DAMPEN;
  } else {
    // Corner / ambiguous — push out via smallest penetration axis
    var overlapTop    = (cy + r) - ry;
    var overlapBottom = (ry + rh) - (cy - r);
    var overlapLeft   = (cx + r) - rx;
    var overlapRight  = (rx + rw) - (cx - r);
    var minO = Math.min(overlapTop, overlapBottom, overlapLeft, overlapRight);
    if (minO === overlapTop) {
      duck.y = ry - r;
      duck.vy = 0;
      duck.onGround = true;
      if (!duck.triggerLand) {
        duck.vx *= GROUND_FRICTION;
        duck.triggerLand = true;
      }
    } else if (minO === overlapBottom) {
      duck.y  = ry + rh + r;
      duck.vy = Math.abs(duck.vy) * BOUNCE_DAMPEN;
    } else if (minO === overlapLeft) {
      duck.x  = rx - r;
      duck.vx = -Math.abs(duck.vx) * BOUNCE_DAMPEN;
    } else {
      duck.x  = rx + rw + r;
      duck.vx =  Math.abs(duck.vx) * BOUNCE_DAMPEN;
    }
  }

  return true;
}

// Resolve duck against an array of platforms.
// Call this AFTER saving prevX/prevY and integrating position.
function resolveAllPlatforms(duck, platforms) {
  duck.onGround   = false;
  duck.triggerLand = false;
  for (var i = 0; i < platforms.length; i++) {
    resolveCircleRect(duck, platforms[i]);
  }
}
