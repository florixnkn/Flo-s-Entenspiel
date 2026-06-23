// js/props.js — Prop system: trampoline, faucet, wind, cat, toilet.
//
// Each prop lives in level.props[] as {type, x, y, w, h, params, ...runtime fields}.
// Call propsInit(props) when loading a level to attach runtime state.
// Call propsUpdate(props, duck, dt) each PLAY tick — returns a string action or null:
//   "LOSE_TOILET" | "STUN" | null
// Call propsDraw(ctx, props, totalTime) each draw frame.
//
// NOTE: soap surface behaviour is handled by collision.js (surface:"soap" on the
// platform object) — propsInit converts soap prop entries into platform-style objects
// for the renderer.

// ---------------------------------------------------------------------------
// Trampoline bounce velocity — strong enough to reach the previous height or more
// ---------------------------------------------------------------------------
var TRAMPOLINE_VY = -1350;  // px/s upward (overrides normal charge)

// ---------------------------------------------------------------------------
// Cat stun duration in seconds
// ---------------------------------------------------------------------------
var CAT_STUN_DUR = 0.30;

// ---------------------------------------------------------------------------
// propsInit — attach mutable runtime fields to each prop in-place.
// Call once per level load.
// ---------------------------------------------------------------------------
function propsInit(props) {
  for (var i = 0; i < props.length; i++) {
    var p = props[i];

    if (p.type === "faucet") {
      // Oscillating position along axis; track offset from origin
      p._origin = (p.params.axis === "x") ? p.x : p.y;
      p._phase  = 0; // radians; starts at centre
    }

    if (p.type === "cat") {
      p._origin = (p.params.axis === "x") ? p.x : p.y;
      p._phase  = 0;
    }

    if (p.type === "wind") {
      p._time = 0; // running timer for pulse
    }

    // Stun state shared across prop types (cats apply it to the duck externally)
    // Stored here for completeness; actual stun lives on the duck via duck.stunTime
  }
}

// ---------------------------------------------------------------------------
// propsUpdate — run all prop logic, mutate duck as needed.
// Returns an action string or null.
// ---------------------------------------------------------------------------
function propsUpdate(props, duck, dt) {
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    var action = _updateProp(p, duck, dt);
    if (action) return action;
  }
  return null;
}

function _updateProp(p, duck, dt) {

  // --- TOILET ---
  if (p.type === "toilet") {
    // Descending duck whose centre is horizontally within the bowl triggers instant LOSE.
    if (
      duck.vy > 0 &&
      duck.x >= p.x && duck.x <= p.x + p.w &&
      circleOverlapsRect(duck.x, duck.y, duck.radius, p.x, p.y, p.w, p.h)
    ) {
      return "LOSE_TOILET";
    }
    return null;
  }

  // --- FAUCET (moving platform) ---
  if (p.type === "faucet") {
    var params = p.params;
    p._phase += params.speed * dt;
    var offset = Math.sin(p._phase) * params.range;

    var prevFX = p.x;
    var prevFY = p.y;

    if (params.axis === "x") {
      p.x = p._origin + offset;
    } else {
      p.y = p._origin + offset;
    }

    // Carry the duck if it is standing on this faucet platform
    if (duck.onGround) {
      // Check if duck was standing on this faucet last frame
      // We detect this by checking if the duck's bottom is near our top surface
      var duckBottom = duck.y + duck.radius;
      var fTop       = p.y;  // current y (already updated)
      var onFaucet   = (
        Math.abs(duckBottom - fTop) < 6 &&
        duck.x >= p.x - 4 && duck.x <= p.x + p.w + 4
      );
      if (onFaucet) {
        duck.x += (p.x - prevFX);
        duck.y += (p.y - prevFY);
        duck.prevX += (p.x - prevFX);
        duck.prevY += (p.y - prevFY);
      }
    }
    return null;
  }

  // --- TRAMPOLINE ---
  if (p.type === "trampoline") {
    // When the duck lands on top of the trampoline (descending, overlapping top area),
    // apply a strong upward velocity — overriding the normal land settle.
    if (
      duck.vy >= 0 &&
      circleOverlapsRect(duck.x, duck.y, duck.radius, p.x, p.y, p.w, p.h)
    ) {
      var wasAbove = (duck.prevY + duck.radius) <= (p.y + LAND_TOLERANCE);
      if (wasAbove || duck.onGround) {
        duck.y        = p.y - duck.radius;
        duck.vy       = TRAMPOLINE_VY;
        duck.vx       = 0;
        duck.onGround = false;
        duck.charging = false;
        duck.animState = "flying";
        duck.animT     = STRETCH_DURATION;
        // Trampoline wind-up squish: compress vertically just before the launch pops it
        duck.scaleX    = 1.40;   // wider squash on hit
        duck.scaleY    = 0.55;   // strong vertical squash — SPEC "powerful climax"
        // The stretch back is handled by _duckAnimUpdate as normal flying state

        // Juice: boing SFX + energy burst + screenshake
        SFX.boing();
        Juice.trampolineBurst(duck.x, duck.y + duck.radius);
        Juice.shake(JUICE_SHAKE_BOING_MAG, JUICE_SHAKE_BOING_DUR);
      }
    }
    return null;
  }

  // --- WIND (Föhn zone) ---
  if (p.type === "wind") {
    p._time += dt;
    var params = p.params;

    // Pulse support: if period is defined, only apply force in the first half of each period
    var active = true;
    if (params.period) {
      var cycle = (p._time % params.period) / params.period; // 0..1
      active = (cycle < 0.5);
    }

    if (active) {
      // Check if duck centre is inside wind zone
      var inside = (
        duck.x >= p.x && duck.x <= p.x + p.w &&
        duck.y >= p.y && duck.y <= p.y + p.h
      );
      if (inside) {
        duck.vx += (params.fx || 0) * dt;
        duck.vy += (params.fy || 0) * dt;
      }
    }
    return null;
  }

  // --- CAT (moving hazard) ---
  if (p.type === "cat") {
    var params = p.params;
    p._phase += params.speed * dt;
    var offset = Math.sin(p._phase) * params.range;

    if (params.axis === "x") {
      p.x = p._origin + offset;
    } else {
      p.y = p._origin + offset;
    }

    // Collision with the duck
    if (circleOverlapsRect(duck.x, duck.y, duck.radius, p.x, p.y, p.w, p.h)) {
      // Only stun if duck is not currently stunned
      if (!duck.stunTime || duck.stunTime <= 0) {
        // Impulse away from cat centre
        var catCX = p.x + p.w / 2;
        var catCY = p.y + p.h / 2;
        var dx = duck.x - catCX;
        var dy = duck.y - catCY;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        duck.vx = (dx / dist) * 600;
        duck.vy = (dy / dist) * 600 - 300; // extra upward kick
        duck.stunTime = CAT_STUN_DUR;
        duck.onGround = false;

        // Juice: cat-hit SFX + puff + screenshake
        SFX.catHit();
        Juice.catPuff(duck.x, duck.y);
        Juice.shake(JUICE_SHAKE_CAT_MAG, JUICE_SHAKE_CAT_DUR);
      }
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// propsDraw — draw placeholder shapes for each prop
// totalTime is the game clock for animated effects
// ---------------------------------------------------------------------------
function propsDraw(ctx, props, totalTime) {
  for (var i = 0; i < props.length; i++) {
    var p = props[i];

    if (p.type === "toilet")     { _drawPropToilet(ctx, p);            continue; }
    if (p.type === "faucet")     { _drawPropFaucet(ctx, p, totalTime); continue; }
    if (p.type === "trampoline") { _drawPropTrampoline(ctx, p);        continue; }
    if (p.type === "wind")       { _drawPropWind(ctx, p, totalTime);   continue; }
    if (p.type === "cat")        { _drawPropCat(ctx, p);               continue; }
    if (p.type === "soap")       { _drawPropSoap(ctx, p);              continue; }
  }
}

// ---------------------------------------------------------------------------
// Toilet — white porcelain: cistern at top, open seat + bowl below, blue water.
// Matches soft-cartoon furniture style (thick dark outlines, blue shading, gloss).
// Prop rect (x,y,w,h) is the hazard/bowl zone — collision unchanged.
// Cistern rises cosmetically above y.
// ---------------------------------------------------------------------------
function _drawPropToilet(ctx, p) {
  // Draw the toilet a bit larger than its hazard rect for a realistic size,
  // anchored at the rect's bottom-centre (the central bowl stays over the hazard).
  var _ts = 1.5;
  var _tcx = p.x + p.w / 2, _tbottom = p.y + p.h;
  var w = p.w * _ts, h = p.h * _ts;
  var x = _tcx - w / 2, y = _tbottom - h;
  ctx.save();

  // --- Soft contact shadow beneath the base ---
  ctx.globalAlpha = 0.18;
  ctx.fillStyle   = "#221100";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 7, w * 0.44, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // --- Cistern / tank — sits above the prop rect (cosmetic) ---
  var cW = w * 0.68;
  var cH = h * 0.46;
  var cX = x + (w - cW) / 2;
  var cY = y - cH + 4;   // rises above y; bottom overlaps bowl top slightly

  // Cistern body — porcelain white
  ctx.fillStyle = "#eef4f8";
  rrPath(ctx, cX, cY, cW, cH, 5);
  ctx.fill();

  // Cistern blue shading on lower half
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle   = "#4488bb";
  rrPath(ctx, cX, cY + cH * 0.55, cW, cH * 0.45, 5);
  ctx.fill();
  ctx.restore();

  // Cistern gloss highlight
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle   = "#ffffff";
  rrPath(ctx, cX + 5, cY + 4, cW * 0.55, 5, 3);
  ctx.fill();
  ctx.restore();

  // Flush button — small circle on top of cistern
  var btnCx = cX + cW / 2;
  var btnCy = cY + 5;
  ctx.fillStyle   = "#d8e8f0";
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(btnCx, btnCy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Flush button inner dot
  ctx.fillStyle = "#aabbc8";
  ctx.beginPath();
  ctx.arc(btnCx, btnCy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Cistern dark outline
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2.5;
  rrPath(ctx, cX, cY, cW, cH, 5);
  ctx.stroke();

  // --- Bowl base — wider rounded rect for the pedestal ---
  var baseH = h * 0.30;
  var baseW = w * 0.55;
  var baseX = x + (w - baseW) / 2;
  ctx.fillStyle = "#eef4f8";
  rrPath(ctx, baseX, y + h * 0.70, baseW, baseH, 6);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle   = "#4488bb";
  rrPath(ctx, baseX, y + h * 0.80, baseW, baseH * 0.5, 6);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2;
  rrPath(ctx, baseX, y + h * 0.70, baseW, baseH, 6);
  ctx.stroke();

  // --- Bowl outer shell — the main porcelain bowl shape ---
  ctx.fillStyle = "#eef4f8";
  rrPath(ctx, x, y, w, h * 0.78, 10);
  ctx.fill();

  // Bowl blue volume shading — lower portion
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle   = "#4488bb";
  rrPath(ctx, x, y + h * 0.45, w, h * 0.33, 10);
  ctx.fill();
  ctx.restore();

  // Bowl left-side gloss highlight
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle   = "#ffffff";
  rrPath(ctx, x + 5, y + 8, 8, h * 0.40, 4);
  ctx.fill();
  ctx.restore();

  // --- Open seat ring — slightly inset oval showing the seat lip ---
  var seatInset = w * 0.07;
  var seatH     = h * 0.55;
  ctx.fillStyle   = "#f4fafd";
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2;
  rrPath(ctx, x + seatInset, y + 2, w - seatInset * 2, seatH, 12);
  ctx.fill();
  ctx.stroke();

  // --- Blue water inside the seat opening ---
  var waterInset = w * 0.14;
  ctx.fillStyle   = "#7ecaea";
  ctx.globalAlpha = 0.88;
  rrPath(ctx, x + waterInset, y + seatH * 0.28, w - waterInset * 2, seatH * 0.62, 8);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Water shimmer
  ctx.save();
  ctx.globalAlpha = 0.50;
  ctx.fillStyle   = "#aee6f8";
  rrPath(ctx, x + waterInset + 6, y + seatH * 0.32, (w - waterInset * 2) * 0.50, 5, 3);
  ctx.fill();
  ctx.restore();

  // --- Bowl outer outline (drawn last to cap everything) ---
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2.5;
  rrPath(ctx, x, y, w, h * 0.78, 10);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Faucet — metallic platform with animated water drip
// ---------------------------------------------------------------------------
function _drawPropFaucet(ctx, p, totalTime) {
  var x = p.x, y = p.y, w = p.w, h = p.h;
  ctx.save();

  // Platform body — steel gradient-ish flat colour
  ctx.fillStyle   = "#aabbcc";
  rrPath(ctx, x, y, w, h, 5);
  ctx.fill();

  // Sheen stripe
  ctx.fillStyle   = "#ddeeff";
  ctx.globalAlpha = 0.55;
  rrPath(ctx, x + 2, y + 2, w - 4, h * 0.4, 3);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#556677";
  ctx.lineWidth   = 2.5;
  rrPath(ctx, x, y, w, h, 5);
  ctx.stroke();

  // Faucet nozzle on top-right
  var nozzleX = x + w - 14;
  ctx.fillStyle = "#889aaa";
  ctx.fillRect(nozzleX, y - 10, 8, 12);
  ctx.strokeStyle = "#556677";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(nozzleX, y - 10, 8, 12);

  // Animated water drip
  var dripT  = (totalTime * 2.5) % 1.0; // 0..1 loop
  var dripY  = y + 2 + dripT * 24;
  var dripAlpha = 1 - dripT;
  ctx.globalAlpha = dripAlpha * 0.8;
  ctx.fillStyle   = "#55aaee";
  ctx.beginPath();
  ctx.ellipse(nozzleX + 4, dripY, 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Trampoline — striped bath mat
// ---------------------------------------------------------------------------
function _drawPropTrampoline(ctx, p) {
  var x = p.x, y = p.y, w = p.w, h = p.h;
  ctx.save();

  // Mat base — slightly rounded
  ctx.fillStyle = "#ee4444";
  rrPath(ctx, x, y, w, h, 6);
  ctx.fill();

  // Horizontal stripes
  var stripeW = w / 5;
  ctx.fillStyle   = "#ffcccc";
  ctx.globalAlpha = 0.65;
  for (var si = 0; si < 5; si += 2) {
    ctx.fillRect(x + si * stripeW, y + 2, stripeW, h - 4);
  }
  ctx.globalAlpha = 1;

  // Spring coils drawn as small arcs along the bottom edge
  ctx.strokeStyle = "#aaaaaa";
  ctx.lineWidth   = 1.5;
  var coilCount = 4;
  var coilSpacing = w / (coilCount + 1);
  for (var ci = 1; ci <= coilCount; ci++) {
    var cx2 = x + ci * coilSpacing;
    ctx.beginPath();
    ctx.arc(cx2, y + h - 2, 3, Math.PI, 0);
    ctx.stroke();
  }

  ctx.strokeStyle = "#cc2222";
  ctx.lineWidth   = 2.5;
  rrPath(ctx, x, y, w, h, 6);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Wind — semi-transparent zone with animated arrow streaks
// ---------------------------------------------------------------------------
function _drawPropWind(ctx, p, totalTime) {
  var x = p.x, y = p.y, w = p.w, h = p.h;
  var params = p.params;
  ctx.save();

  // Determine active state for pulse visual
  var active = true;
  if (params.period) {
    var cycle = ((p._time || 0) % params.period) / params.period;
    active = (cycle < 0.5);
  }

  // Zone background
  ctx.globalAlpha = active ? 0.18 : 0.07;
  ctx.fillStyle   = "#aaeeff";
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;

  // Dashed border
  ctx.strokeStyle  = "#44bbdd";
  ctx.lineWidth    = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.globalAlpha  = active ? 0.65 : 0.3;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.globalAlpha  = 1;

  // Animated streaks — direction from fx/fy
  var fx = params.fx || 0;
  var fy = params.fy || 0;
  var mag = Math.sqrt(fx * fx + fy * fy) || 1;
  var nx  = fx / mag;
  var ny  = fy / mag;

  if (active) {
    var streamCount = 4;
    for (var si = 0; si < streamCount; si++) {
      // Each stream offset in time
      var t = ((totalTime * 1.2 + si * 0.25) % 1.0);
      // Position perpendicular to the flow direction
      var perp = (si / streamCount) + 0.1;
      var perpX = -ny;  // perpendicular unit vector
      var perpY =  nx;

      var sx = x + w * (perpX >= 0 ? perp : (1 - perp)) + nx * w * t;
      var sy = y + h * (perpY >= 0 ? perp : (1 - perp)) + ny * h * t;

      // Clamp streaks inside zone
      sx = Math.max(x, Math.min(x + w, sx));
      sy = Math.max(y, Math.min(y + h, sy));

      var arrowLen = 22;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + nx * arrowLen, sy + ny * arrowLen);
      ctx.strokeStyle  = "#22aacc";
      ctx.lineWidth    = 2;
      ctx.globalAlpha  = 0.7 * (1 - t);
      ctx.stroke();
      ctx.globalAlpha  = 1;
    }
  }

  // Label
  ctx.fillStyle    = "#116688";
  ctx.font         = "bold 9px system-ui, sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.globalAlpha  = 0.9;
  ctx.fillText("Föhn", x + w / 2, y + 3);
  ctx.globalAlpha  = 1;

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cat — simple cartoon cat shape patrolling its axis; soft contact shadow added
// ---------------------------------------------------------------------------
function _drawPropCat(ctx, p) {
  var x = p.x, y = p.y, w = p.w, h = p.h;
  var cx2 = x + w / 2;
  var cy2 = y + h / 2;
  ctx.save();

  // Soft contact shadow under the cat body
  ctx.globalAlpha = 0.18;
  ctx.fillStyle   = "#221100";
  ctx.beginPath();
  ctx.ellipse(cx2, y + h + 3, w * 0.42, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Body
  ctx.fillStyle   = "#ff8833";
  ctx.strokeStyle = "#222222";
  ctx.lineWidth   = 2;
  rrPath(ctx, x + w * 0.1, y + h * 0.3, w * 0.8, h * 0.7, 8);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.fillStyle = "#ff8833";
  ctx.beginPath();
  ctx.arc(cx2, y + h * 0.28, h * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#222222";
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Ears — two small triangles
  var earH = h * 0.14;
  ctx.fillStyle = "#ff8833";
  ctx.beginPath();
  ctx.moveTo(cx2 - h * 0.18, y + h * 0.1);
  ctx.lineTo(cx2 - h * 0.06, y + h * 0.03);
  ctx.lineTo(cx2 - h * 0.06, y + h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx2 + h * 0.18, y + h * 0.1);
  ctx.lineTo(cx2 + h * 0.06, y + h * 0.03);
  ctx.lineTo(cx2 + h * 0.06, y + h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = "#222222";
  ctx.beginPath();
  ctx.arc(cx2 - h * 0.08, y + h * 0.26, h * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx2 + h * 0.08, y + h * 0.26, h * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = "#444444";
  ctx.lineWidth   = 1;
  // Left whiskers
  ctx.beginPath(); ctx.moveTo(cx2 - h * 0.22, y + h * 0.3); ctx.lineTo(cx2 - h * 0.04, y + h * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx2 - h * 0.22, y + h * 0.34); ctx.lineTo(cx2 - h * 0.04, y + h * 0.32); ctx.stroke();
  // Right whiskers
  ctx.beginPath(); ctx.moveTo(cx2 + h * 0.04, y + h * 0.3); ctx.lineTo(cx2 + h * 0.22, y + h * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx2 + h * 0.04, y + h * 0.32); ctx.lineTo(cx2 + h * 0.22, y + h * 0.34); ctx.stroke();

  // Tail
  ctx.strokeStyle = "#ff8833";
  ctx.lineWidth   = 3;
  ctx.lineCap     = "round";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.9, y + h * 0.7);
  ctx.quadraticCurveTo(x + w * 1.2, y + h * 0.5, x + w * 1.1, y + h * 0.25);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Soap — blue shiny platform surface marker (overlaid on top of platform)
// Soap platforms are defined with surface:"soap" in the platform data;
// this draw call renders a shiny tint on top.
// ---------------------------------------------------------------------------
function _drawPropSoap(ctx, p) {
  var x = p.x, y = p.y, w = p.w, h = p.h;
  ctx.save();

  // Blue tint over the surface
  ctx.fillStyle   = "#88bbff";
  ctx.globalAlpha = 0.45;
  rrPath(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Shiny specular strip
  ctx.fillStyle   = "#ffffff";
  ctx.globalAlpha = 0.55;
  rrPath(ctx, x + 4, y + 2, w - 8, 5, 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Outline
  ctx.strokeStyle = "#3366cc";
  ctx.lineWidth   = 2;
  rrPath(ctx, x, y, w, h, 5);
  ctx.stroke();

  ctx.restore();
}

// rrPath() is now the shared global in constants.js — no local copy needed.
