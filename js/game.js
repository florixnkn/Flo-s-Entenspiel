// js/game.js — Main loop, state machine, update, draw orchestration.
// Slice 8+: Title screen, level-intro beat, bathroom backdrop, best-time persistence.
//           + Mute button, LEVELSELECT screen, improved title layout.

(function () {
  var canvas = document.getElementById("game");
  var ctx    = canvas.getContext("2d");

  // ---------------------------------------------------------------------------
  // Best-time persistence (localStorage, guarded for file:// restriction)
  // ---------------------------------------------------------------------------
  var BEST_TIME_KEY = "entenspiel_bestTime";

  function bestTimeLoad() {
    try {
      var v = localStorage.getItem(BEST_TIME_KEY);
      return v !== null ? parseFloat(v) : null;
    } catch (e) {
      return null;
    }
  }

  function bestTimeSave(score) {
    try {
      var current = bestTimeLoad();
      if (current === null || score > current) {
        localStorage.setItem(BEST_TIME_KEY, String(score));
        return true; // new best
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // --- Mutable game state ---
  // g.state: "TITLE" | "LEVELSELECT" | "LEVEL_INTRO" | "PLAY" | "WIN_BEAT" |
  //          "WIN" | "LOSE_CHILD" | "LOSE_TOILET" | "ALLCLEAR"
  var g = {
    levelIndex:    0,
    level:         null,
    platforms:     [],
    tub:           null,
    props:         [],
    state:         "TITLE",  // boot into TITLE
    timeLeft:      0,
    childProgress: 0,
    timeBonus:     0,
    totalTime:     0,    // running seconds across all states (for animation)
    winBeatTimer:  0,    // countdown for the "Level geschafft!" beat (WIN_BEAT state)
    introTimer:    0,    // countdown for the level-intro banner (LEVEL_INTRO state)
    introAlpha:    0,    // 0..1 fade-in; stays 1, then fades out at end
    allclearTime:  0,    // accumulated play time for ALLCLEAR screen
    isNewBest:     false,
    bestTime:      null,  // cached on TITLE/ALLCLEAR entry; avoids 60fps localStorage reads
    // Juice helpers
    _prevState:    "",    // intentionally different from "TITLE" so entry one-shot fires
    _lastTickSec:  -1
  };

  var duck = createDuck(0, 0);

  // ---------------------------------------------------------------------------
  // Level loader — loads level, initialises props, injects faucet/trampoline
  // props into g.platforms so the standard collision resolver handles them.
  // ---------------------------------------------------------------------------
  function _startLevel(index) {
    loadLevel(index, duck, g);

    var rawProps = (g.level.props || []).slice();
    // Deep-copy props so runtime fields don't bleed between attempts
    g.props = rawProps.map(function (p) {
      return Object.assign({}, p, p.params ? { params: Object.assign({}, p.params) } : {});
    });

    // Initialise runtime state on props
    propsInit(g.props);

    // Inject faucet and trampoline into the platforms array so resolveAllPlatforms
    // can handle landing on them. They are the SAME objects, so updating
    // p.x / p.y in propsUpdate automatically moves the collision rect too.
    for (var i = 0; i < g.props.length; i++) {
      var p = g.props[i];
      if (p.type === "faucet" || p.type === "trampoline") {
        g.platforms.push(p);
      }
    }

    g.timeLeft      = g.level.timeLimit;
    g.childProgress = 0;
    g.timeBonus     = 0;
    g.winBeatTimer  = 0;
    g._lastTickSec  = -1;

    // Reset juice so particles/shake/slow-mo don't bleed across levels/retries
    Juice.reset();

    // Reset duck stun state
    duck.stunTime = 0;

    // Begin with the level-intro beat — timer freezes until intro is done
    g.state      = "LEVEL_INTRO";
    g.introTimer = 1.2;   // seconds the banner stays visible
    g.introAlpha = 0;
    g._prevState = "LEVEL_INTRO";
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
    g.totalTime += dt;

    // Juice system update (particles, shake, slow-mo decay) — always runs
    Juice.update(dt);

    // M key toggles mute from any state
    if (Input.pressed("KeyM")) {
      SFX.toggleMute();
    }

    // --- TITLE screen ---
    if (g.state === "TITLE") {
      // Cache best time once on entry so draw doesn't hit localStorage at 60fps
      if (g._prevState !== "TITLE") {
        g.bestTime   = bestTimeLoad();
        g._prevState = "TITLE";
      }
      // SPACE = quick-start Level 1
      if (Input.pressed("Space")) {
        g.allclearTime = 0;
        g.isNewBest    = false;
        _startLevel(0);
      }
      // L = open level select
      if (Input.pressed("KeyL")) {
        g.state = "LEVELSELECT";
        // leave g._prevState unchanged — LEVELSELECT entry guard will fire on first tick
      }
      return;
    }

    // --- LEVELSELECT screen ---
    if (g.state === "LEVELSELECT") {
      if (g._prevState !== "LEVELSELECT") {
        g.bestTime   = bestTimeLoad();
        g._prevState = "LEVELSELECT";
      }
      // Number keys 1/2/3 jump straight into a level
      if (Input.pressed("Digit1")) {
        g.allclearTime = 0; g.isNewBest = false; _startLevel(0);
      }
      if (Input.pressed("Digit2")) {
        g.allclearTime = 0; g.isNewBest = false; _startLevel(1);
      }
      if (Input.pressed("Digit3")) {
        g.allclearTime = 0; g.isNewBest = false; _startLevel(2);
      }
      // Esc / L return to title
      if (Input.pressed("Escape") || Input.pressed("KeyL")) {
        g.state           = "TITLE";
        g._prevState      = "TITLE";
        _hoveredTileIndex = -1;
      }
      return;
    }

    // --- LEVEL_INTRO beat: show banner, freeze timer ---
    if (g.state === "LEVEL_INTRO") {
      var FADE_SPEED = 4.0;  // alpha units per second

      if (g.introTimer > 0.15) {
        // Fade in during first ~0.2 s
        g.introAlpha = Math.min(1, g.introAlpha + dt * FADE_SPEED);
      } else {
        // Fade out during last 0.15 s
        g.introAlpha = Math.max(0, g.introAlpha - dt * FADE_SPEED * 2);
      }

      g.introTimer -= dt;
      if (g.introTimer <= 0) {
        // Intro done — switch to PLAY (timer starts now)
        g.state      = "PLAY";
        g._prevState = "PLAY";
        g.introAlpha = 0;
      }
      // Timer does NOT tick here — the player isn't penalised during the intro.
      return;
    }

    // --- ALLCLEAR: R restarts from TITLE ---
    if (g.state === "ALLCLEAR") {
      // One-shot ALLCLEAR jingle on state entry
      if (g._prevState !== "ALLCLEAR") {
        SFX.allclear();
        // Save best time, then cache result for draw
        g.isNewBest  = bestTimeSave(g.allclearTime);
        g.bestTime   = bestTimeLoad();
        g._prevState = "ALLCLEAR";
      }
      if (Input.pressed("KeyR")) {
        g.allclearTime = 0;
        g.state        = "TITLE";
        g._prevState   = "";   // force TITLE entry guard to re-read best time from localStorage
      }
      return;
    }

    // --- Non-PLAY overlays: R restarts CURRENT level ---
    if (g.state !== "PLAY" && g.state !== "WIN_BEAT") {
      // One-shot SFX on state entry
      if (g._prevState !== g.state) {
        if (g.state === "LOSE_CHILD")  { SFX.cry();  }
        if (g.state === "LOSE_TOILET") { SFX.plop(); }
        g._prevState = g.state;
      }
      if (Input.pressed("KeyR")) {
        _startLevel(g.levelIndex);
      }
      return;
    }

    // --- WIN_BEAT: brief "Level geschafft!" pause, then advance ---
    if (g.state === "WIN_BEAT") {
      // One-shot win SFX on entry
      if (g._prevState !== "WIN_BEAT") {
        SFX.win();
        Juice.splashBurst(g.tub.x + g.tub.w / 2, g.tub.y + g.tub.h / 2);
        Juice.shake(JUICE_SHAKE_SPLASH_MAG, JUICE_SHAKE_SPLASH_DUR);
        g._prevState = "WIN_BEAT";
      }
      g.winBeatTimer -= dt;
      if (Input.pressed("KeyR")) {
        // R during beat skips to next level immediately
        _advanceLevel();
        return;
      }
      if (g.winBeatTimer <= 0) {
        _advanceLevel();
      }
      return;
    }

    // --- PLAY state ---
    if (g.state !== "PLAY") return;

    if (g._prevState !== "PLAY") { g._prevState = "PLAY"; }

    // R restarts current level
    if (Input.pressed("KeyR")) {
      _startLevel(g.levelIndex);
      return;
    }

    // Tick down duck stun (blocks input in duck.js if stunTime > 0)
    if (duck.stunTime > 0) {
      duck.stunTime -= dt;
      if (duck.stunTime < 0) duck.stunTime = 0;
    }

    duckUpdate(duck, dt, g.platforms);

    // Respawn if duck fell off bottom (timer keeps running)
    if (duck.fellOff) {
      duckReset(duck, g.level.start.x, g.level.start.y);
      duck.stunTime = 0;
      return;
    }

    // --- WIN check: duck body enters tub rectangle ---
    var tub = g.tub;
    if (
      duck.x + duck.radius > tub.x &&
      duck.x - duck.radius < tub.x + tub.w &&
      duck.y + duck.radius > tub.y &&
      duck.y - duck.radius < tub.y + tub.h
    ) {
      g.timeBonus     = g.timeLeft;
      g.allclearTime += g.timeBonus;
      g.state         = "WIN_BEAT";
      g.winBeatTimer  = 1.8;  // 1.8 s of "Level geschafft!" before next level
      // Slow-mo on tub entry
      Juice.slowMo(JUICE_SLOWMO_FACTOR, JUICE_SLOWMO_DUR);
      SFX.splash();
      return;
    }

    // --- Props update (trampoline, wind, cat, toilet) ---
    var propAction = propsUpdate(g.props, duck, dt);
    if (propAction === "LOSE_TOILET") {
      g.state = "LOSE_TOILET";
      return;
    }

    // --- Timer ---
    g.timeLeft -= dt;
    if (g.timeLeft < 0) { g.timeLeft = 0; }

    g.childProgress = 1 - g.timeLeft / g.level.timeLimit;

    // --- Clock tick SFX + pulse (last 5 seconds, once per integer second) ---
    if (g.timeLeft > 0 && g.timeLeft <= 5) {
      var currentSec = Math.ceil(g.timeLeft);
      if (currentSec !== g._lastTickSec) {
        g._lastTickSec = currentSec;
        SFX.tick();
        Juice.triggerClockPulse();
      }
    }

    // --- Footstep crescendo (child approaching) ---
    Juice.updateFootstep(g.childProgress, dt);

    if (g.timeLeft <= 0) {
      g.state = "LOSE_CHILD";
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Advance to next level or ALLCLEAR
  // ---------------------------------------------------------------------------
  function _advanceLevel() {
    var next = g.levelIndex + 1;
    if (next < LEVELS.length) {
      _startLevel(next);
    } else {
      g.state = "ALLCLEAR";
    }
  }

  // ---------------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------------
  function draw() {
    // Clear full canvas first (outside shake transform so background doesn't jitter)
    ctx.fillStyle = PAL.sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // TITLE and LEVELSELECT get their own full-screen treatment
    if (g.state === "TITLE") {
      _drawTitleScreen(ctx);
      _drawMuteButton(ctx);
      return;
    }

    if (g.state === "LEVELSELECT") {
      _drawLevelSelectScreen(ctx);
      _drawMuteButton(ctx);
      return;
    }

    // Cartoon bathroom backdrop — drawn BEFORE screenshake so it stays fixed
    drawBackdrop(ctx);

    // --- Screenshake: apply translate before drawing world, restore after ---
    ctx.save();
    Juice.applyShake(ctx);

    drawPlatforms(ctx, g.platforms);
    drawTub(ctx, g.tub);

    // Draw all props (toilet, faucet, trampoline, wind, cat, soap)
    propsDraw(ctx, g.props, g.totalTime);

    drawAimIndicator(ctx, duck);
    duckDraw(ctx, duck, g.timeLeft);
    drawPowerMeter(ctx, duck);

    // Particles drawn inside shake transform so they move with the world
    Juice.drawParticles(ctx);

    ctx.restore();
    // --- End screenshake region ---

    // Level-intro banner (drawn outside shake, on top of everything)
    if (g.state === "LEVEL_INTRO") {
      _drawLevelIntroBanner(ctx, g.levelIndex, g.introAlpha);
    }

    // HUD always drawn outside shake (stays stable on screen)
    if (g.state !== "LEVEL_INTRO") {
      drawHUD(ctx, g.timeLeft, g.level ? g.level.timeLimit : 1, g.childProgress);
    }

    // Level name badge
    _drawLevelBadge(ctx, g.levelIndex, LEVELS.length);

    if (g.state === "WIN_BEAT") {
      _drawWinBeatOverlay(ctx, g.levelIndex, g.timeBonus, g.winBeatTimer);
    } else if (g.state === "WIN") {
      // WIN is only used if we reach it from outside (currently unused but kept as guard)
      drawWinOverlay(ctx, g.timeBonus);
    } else if (g.state === "LOSE_CHILD") {
      drawLoseChildOverlay(ctx);
    } else if (g.state === "LOSE_TOILET") {
      drawLoseToiletOverlay(ctx);
    } else if (g.state === "ALLCLEAR") {
      _drawAllclearOverlay(ctx, g.allclearTime, LEVELS.length, g.isNewBest);
    } else if (g.state === "PLAY") {
      drawHint(ctx);
    }

    // Mute button drawn on top of everything on in-game screens too
    _drawMuteButton(ctx);
  }

  // ---------------------------------------------------------------------------
  // Mute button — speaker icon, TOP-RIGHT corner, all screens
  //
  // Icon geometry: circle at (cx,cy) r=11, speaker body + waves / slash when muted.
  // Hit area: 44x44 px square centred on the icon (touch-friendly).
  // ---------------------------------------------------------------------------
  var MUTE_BTN = {
    cx: CANVAS_W - 95,   // icon centre X — clear of the door HUD (x:885–951)
    cy: 24,              // icon centre Y
    r:  16               // hit-circle radius (generous)
  };

  function _drawMuteButton(ctx) {
    var cx = MUTE_BTN.cx;
    var cy = MUTE_BTN.cy;
    var muted = SFX.isMuted();

    ctx.save();

    // Soft dark backing circle so the icon reads on any background
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15,25,50,0.55)";
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Speaker body — a simple trapezoid
    //  Left edge:   cx-9 to cx-9 (x), cy-5 to cy+5 (y)
    //  Right edge:  cx-4 to cx-4,     cy-9 to cy+9
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 4);
    ctx.lineTo(cx - 9, cy + 4);
    ctx.lineTo(cx - 2, cy + 9);
    ctx.lineTo(cx - 2, cy - 9);
    ctx.closePath();
    ctx.fillStyle = muted ? "#ff5544" : "#ffffff";
    ctx.fill();

    if (muted) {
      // Red cross / slash to indicate muted
      ctx.strokeStyle = "#ff5544";
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = "round";
      ctx.beginPath();
      ctx.moveTo(cx + 3,  cy - 7);
      ctx.lineTo(cx + 11, cy + 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 11, cy - 7);
      ctx.lineTo(cx + 3,  cy + 5);
      ctx.stroke();
    } else {
      // Two concentric sound-wave arcs on the right side
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth   = 2;
      ctx.lineCap     = "round";

      // Inner arc (small)
      ctx.beginPath();
      ctx.arc(cx - 2, cy, 7, -Math.PI * 0.42, Math.PI * 0.42, false);
      ctx.stroke();

      // Outer arc (large)
      ctx.beginPath();
      ctx.arc(cx - 2, cy, 13, -Math.PI * 0.42, Math.PI * 0.42, false);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // TITLE screen — hero image area + buttons + controls + best time
  // ---------------------------------------------------------------------------
  function _drawTitleScreen(ctx) {
    // Bathroom backdrop also visible on title for atmosphere
    drawBackdrop(ctx);

    ctx.save();

    // Semi-transparent dark overlay so text pops
    ctx.fillStyle = "rgba(10,20,40,0.45)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // --- Hero image area (upper-centre, ~16:9 proportions) ---
    // This function is the ONE place a real image will be swapped in.
    // To use a real image later, load it once at startup and draw it here:
    //   var _heroImg = new Image(); _heroImg.src = "./assets/title-hero.png";
    //   then replace drawTitleHero's placeholder body with:
    //   ctx.drawImage(_heroImg, x, y, w, h);
    var heroW = 540;
    var heroH = Math.round(heroW * 9 / 16);   // 304 px — keeps 16:9
    var heroX = (CANVAS_W - heroW) / 2;
    var heroY = 30;
    drawTitleHero(ctx, heroX, heroY, heroW, heroH);

    // --- Main card — sits below the hero area ---
    var bw = 580;
    var bh = 230;
    var bx = (CANVAS_W - bw) / 2;
    var by = heroY + heroH + 14;

    ctx.fillStyle = "#fffde8";
    rrPath(ctx, bx, by, bw, bh, 22);
    ctx.fill();
    ctx.strokeStyle = "#c89030";
    ctx.lineWidth   = 5;
    rrPath(ctx, bx, by, bw, bh, 22);
    ctx.stroke();

    // Title text
    ctx.fillStyle    = "#cc6600";
    ctx.font         = "bold 46px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Ab in die Wanne!", CANVAS_W / 2, by + 18);

    // One-liner goal
    ctx.fillStyle = "#443322";
    ctx.font      = "13px system-ui, sans-serif";
    ctx.fillText(
      "Bring die Gummiente in die Wanne, bevor das Kind ins Bad kommt!",
      CANVAS_W / 2, by + 72
    );

    // Controls summary
    ctx.fillStyle = "#334455";
    ctx.font      = "12px system-ui, sans-serif";
    ctx.fillText("SPACE halten = laden  ·  ←/→ = Richtung  ·  ↑/↓ = Winkel  ·  loslassen = Sprung  ·  R = neu  ·  M = Ton", CANVAS_W / 2, by + 96);

    // Divider
    ctx.strokeStyle = "#ddc880";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + 40, by + 116);
    ctx.lineTo(bx + bw - 40, by + 116);
    ctx.stroke();

    // Best time display (cached on TITLE entry — no per-frame localStorage read)
    var best = g.bestTime;
    if (best !== null && best !== undefined) {
      ctx.fillStyle = "#886600";
      ctx.font      = "13px system-ui, sans-serif";
      ctx.fillText("Beste: " + Math.ceil(Math.max(0, best)) + " s Bonus", CANVAS_W / 2, by + 128);
    }

    // --- Two action buttons: START (Space) + LEVEL WÄHLEN (L) ---
    var btnY   = by + 156;
    var btnH   = 40;
    var btnGap = 20;
    var btnW   = 210;
    var btn1X  = CANVAS_W / 2 - btnW - btnGap / 2;
    var btn2X  = CANVAS_W / 2 + btnGap / 2;

    // START button
    ctx.fillStyle = "#dd6600";
    rrPath(ctx, btn1X, btnY, btnW, btnH, 10);
    ctx.fill();
    ctx.strokeStyle = "#aa4400";
    ctx.lineWidth   = 3;
    rrPath(ctx, btn1X, btnY, btnW, btnH, 10);
    ctx.stroke();

    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 16px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("START  [SPACE]", btn1X + btnW / 2, btnY + btnH / 2);

    // LEVEL WÄHLEN button
    ctx.fillStyle = "#336699";
    rrPath(ctx, btn2X, btnY, btnW, btnH, 10);
    ctx.fill();
    ctx.strokeStyle = "#224477";
    ctx.lineWidth   = 3;
    rrPath(ctx, btn2X, btnY, btnW, btnH, 10);
    ctx.stroke();

    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 16px system-ui, sans-serif";
    ctx.fillText("LEVEL WÄHLEN  [L]", btn2X + btnW / 2, btnY + btnH / 2);

    ctx.restore();

    // Store button rects for click handling (in canvas-space coords)
    _titleBtnRects.start  = { x: btn1X, y: btnY, w: btnW, h: btnH };
    _titleBtnRects.select = { x: btn2X, y: btnY, w: btnW, h: btnH };
  }

  // Hero image placeholder — isolate here so a real image swap is ONE edit.
  // Replace the body of this function when ./assets/title-hero.png is ready.
  // To load a real image add at the top of the IIFE:
  //   var _heroImg = new Image();
  //   _heroImg.src = "./assets/title-hero.png";
  // Then inside drawTitleHero replace the placeholder block with:
  //   if (_heroImg.complete && _heroImg.naturalWidth) {
  //     ctx.drawImage(_heroImg, x, y, w, h);
  //   } else { /* draw placeholder below while loading */ }
  function drawTitleHero(ctx, x, y, w, h) {
    ctx.save();

    // --- Real image fast-path ---
    if (imgReady(IMG.titleHero)) {
      // Clip to rounded-rect slot so the image stays within the frame
      rrPath(ctx, x, y, w, h, 12);
      ctx.clip();
      drawImageCover(ctx, IMG.titleHero, x, y, w, h);
      ctx.restore();
      // Stroke the border frame on top (outside the clip save/restore)
      ctx.save();
      ctx.strokeStyle = "#4488bb";
      ctx.lineWidth   = 3;
      rrPath(ctx, x, y, w, h, 12);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Placeholder: dark-blue framed rect with rubber-duck scene hint
    ctx.fillStyle = "#1a2a4a";
    rrPath(ctx, x, y, w, h, 12);
    ctx.fill();

    // Inner gradient-like fill (top lighter, simulating sky)
    ctx.fillStyle = "#2a4a7a";
    rrPath(ctx, x + 4, y + 4, w - 8, h * 0.55, 8);
    ctx.fill();

    // "Floor" / tub area at bottom of hero
    ctx.fillStyle = "#1a3a5a";
    ctx.fillRect(x + 4, y + h * 0.55, w - 8, h * 0.45 - 4);

    // Rubber duck silhouette (simple yellow oval + beak)
    var dcx = x + w * 0.5;
    var dcy = y + h * 0.45;

    ctx.fillStyle = "#f5d000";
    ctx.beginPath();
    ctx.ellipse(dcx, dcy, 34, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Duck head
    ctx.beginPath();
    ctx.arc(dcx + 26, dcy - 16, 16, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = "#e06010";
    ctx.beginPath();
    ctx.moveTo(dcx + 38, dcy - 16);
    ctx.lineTo(dcx + 50, dcy - 13);
    ctx.lineTo(dcx + 38, dcy - 10);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(dcx + 30, dcy - 19, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(dcx + 31, dcy - 20, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Tub outline
    ctx.strokeStyle = "#4488bb";
    ctx.lineWidth   = 3;
    rrPath(ctx, x + w * 0.3, y + h * 0.62, w * 0.4, h * 0.28, 8);
    ctx.stroke();

    // Border frame for the hero area
    ctx.strokeStyle = "#4488bb";
    ctx.lineWidth   = 3;
    rrPath(ctx, x, y, w, h, 12);
    ctx.stroke();

    // Small label indicating this is a placeholder
    ctx.fillStyle    = "rgba(100,160,220,0.55)";
    ctx.font         = "11px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("[ Titelbild kommt hier — ./assets/title-hero.png ]", x + w / 2, y + h - 6);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // LEVELSELECT screen
  // ---------------------------------------------------------------------------
  // Tile positions stored here so the click handler can hit-test them.
  var _levelTileRects = [];

  function _drawLevelSelectScreen(ctx) {
    // Bathroom backdrop for atmosphere
    drawBackdrop(ctx);

    ctx.save();

    ctx.fillStyle = "rgba(10,20,40,0.55)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Screen title
    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 38px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Level wählen", CANVAS_W / 2, 30);

    ctx.fillStyle = "rgba(180,210,255,0.70)";
    ctx.font      = "14px system-ui, sans-serif";
    ctx.fillText("Klicken oder 1 / 2 / 3 drücken", CANVAS_W / 2, 80);

    // --- Level tiles ---
    var tileW  = 240;
    var tileH  = 200;
    var tileGap = 36;
    var totalW  = LEVELS.length * tileW + (LEVELS.length - 1) * tileGap;
    var startX  = (CANVAS_W - totalW) / 2;
    var tileY   = 120;

    _levelTileRects = [];   // reset each frame so coords stay fresh

    for (var i = 0; i < LEVELS.length; i++) {
      var lvl  = LEVELS[i];
      var tx   = startX + i * (tileW + tileGap);

      _levelTileRects.push({ x: tx, y: tileY, w: tileW, h: tileH, index: i });

      // Tile background
      var isHovered = (i === _hoveredTileIndex);
      ctx.fillStyle = isHovered ? "#264a72" : "#1e3a5a";
      rrPath(ctx, tx, tileY, tileW, tileH, 14);
      ctx.fill();
      ctx.strokeStyle = isHovered ? "#88ccff" : "#4488cc";
      ctx.lineWidth   = isHovered ? 4 : 3;
      rrPath(ctx, tx, tileY, tileW, tileH, 14);
      ctx.stroke();

      // Subtle inset glow on hover
      if (isHovered) {
        ctx.save();
        ctx.strokeStyle = "rgba(136,204,255,0.30)";
        ctx.lineWidth   = 8;
        rrPath(ctx, tx + 4, tileY + 4, tileW - 8, tileH - 8, 11);
        ctx.stroke();
        ctx.restore();
      }

      // Level number badge
      ctx.fillStyle = "#4488cc";
      rrPath(ctx, tx + 10, tileY + 10, 44, 44, 8);
      ctx.fill();
      ctx.fillStyle    = "#ffffff";
      ctx.font         = "bold 26px system-ui, sans-serif";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), tx + 32, tileY + 32);

      // Level name
      ctx.fillStyle    = "#e8f4ff";
      ctx.font         = "bold 18px system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(lvl.name, tx + tileW / 2, tileY + 70);

      // Time limit info
      ctx.fillStyle = "#88aacc";
      ctx.font      = "13px system-ui, sans-serif";
      ctx.fillText("Zeit: " + lvl.timeLimit + " s", tx + tileW / 2, tileY + 104);

      // Best time (shared localStorage value — whole-game best, not per-level)
      // Per-level bests aren't tracked yet; show a dash until the system is extended.
      ctx.fillStyle = "#aaccee";
      ctx.font      = "12px system-ui, sans-serif";
      ctx.fillText("Beste: —", tx + tileW / 2, tileY + 130);

      // Key hint at bottom of tile
      ctx.fillStyle    = "rgba(100,160,220,0.65)";
      ctx.font         = "bold 13px system-ui, sans-serif";
      ctx.textBaseline = "bottom";
      ctx.fillText("[" + (i + 1) + "]", tx + tileW / 2, tileY + tileH - 10);
    }

    // Back button
    var backW = 160, backH = 38;
    var backX = (CANVAS_W - backW) / 2;
    var backY = tileY + tileH + 28;

    ctx.fillStyle = "rgba(40,60,100,0.85)";
    rrPath(ctx, backX, backY, backW, backH, 10);
    ctx.fill();
    ctx.strokeStyle = "#6699cc";
    ctx.lineWidth   = 2;
    rrPath(ctx, backX, backY, backW, backH, 10);
    ctx.stroke();

    ctx.fillStyle    = "#cce4ff";
    ctx.font         = "bold 15px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Zurück  [Esc]", backX + backW / 2, backY + backH / 2);

    ctx.restore();

    // Store back button rect for click handling
    _levelSelectBackRect = { x: backX, y: backY, w: backW, h: backH };
  }

  // Rects for click handling — updated each draw call
  var _titleBtnRects       = { start: null, select: null };
  var _levelSelectBackRect = null;

  // Hover state for LEVELSELECT tiles — -1 means no tile hovered
  var _hoveredTileIndex = -1;

  // ---------------------------------------------------------------------------
  // Level-intro banner — fades in/out over 1.2 s, timer paused meanwhile
  // ---------------------------------------------------------------------------
  function _drawLevelIntroBanner(ctx, levelIndex, alpha) {
    if (alpha <= 0) return;

    var lvl = LEVELS[levelIndex];
    if (!lvl) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Horizontal banner across the centre
    // Slide down into place as alpha fades in: offset shrinks from -40 to 0
    var bw = 540, bh = 100;
    var bx = (CANVAS_W - bw) / 2;
    var by = (CANVAS_H - bh) / 2 - (1 - alpha) * 40;

    ctx.fillStyle = "#1a2a4a";
    rrPath(ctx, bx, by, bw, bh, 14);
    ctx.fill();
    ctx.strokeStyle = "#4488cc";
    ctx.lineWidth   = 3;
    rrPath(ctx, bx, by, bw, bh, 14);
    ctx.stroke();

    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 32px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Level " + (levelIndex + 1) + " — " + lvl.name, CANVAS_W / 2, by + bh / 2 - 12);

    ctx.font      = "14px system-ui, sans-serif";
    ctx.fillStyle = "#aaccee";
    ctx.fillText("Viel Erfolg!", CANVAS_W / 2, by + bh / 2 + 22);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Platform renderer — cartoon rounded rects with label.
  // Soap platforms get an extra shiny blue tint overlay.
  // ---------------------------------------------------------------------------
  function drawPlatforms(ctx, platforms) {
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];

      // Skip prop-platforms (faucet/trampoline) — propsDraw handles those
      if (p.type === "faucet" || p.type === "trampoline") continue;

      var isFloor = (p.label === "");
      ctx.save();

      if (isFloor) {
        ctx.fillStyle   = PAL.ground;
        rrPath(ctx, p.x, p.y, p.w, p.h, 4);
        ctx.fill();
        ctx.strokeStyle = PAL.outline;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      } else {
        var isSoap = (p.surface === "soap");

        ctx.fillStyle = isSoap ? "#99ccee" : "#c8a878";
        rrPath(ctx, p.x, p.y, p.w, p.h, 6);
        ctx.fill();

        // Top stripe
        ctx.fillStyle = isSoap ? "#bbddff" : "#dbbe94";
        rrPath(ctx, p.x, p.y, p.w, 6, 4);
        ctx.fill();

        if (isSoap) {
          // Shiny specular streak
          ctx.fillStyle   = "#ffffff";
          ctx.globalAlpha = 0.5;
          rrPath(ctx, p.x + 4, p.y + 2, p.w - 8, 4, 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        ctx.strokeStyle = isSoap ? "#3366cc" : PAL.outline;
        ctx.lineWidth   = 2.5;
        rrPath(ctx, p.x, p.y, p.w, p.h, 6);
        ctx.stroke();

        if (p.label) {
          ctx.fillStyle    = isSoap ? "#003388" : PAL.outline;
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
    var tx = tub.x, ty = tub.y, tw = tub.w, th = tub.h;
    ctx.save();

    ctx.fillStyle = "#b8e8f8";
    rrPath(ctx, tx, ty, tw, th, 12);
    ctx.fill();

    ctx.fillStyle = "#d4f0fc";
    rrPath(ctx, tx + 6, ty + 6, tw - 12, th * 0.45, 6);
    ctx.fill();

    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth   = 3;
    rrPath(ctx, tx, ty, tw, th, 12);
    ctx.stroke();

    ctx.strokeStyle  = "#ffffff";
    ctx.lineWidth    = 2;
    ctx.globalAlpha  = 0.55;
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
  // WIN overlay — kept for compatibility (currently unused in normal flow)
  // ---------------------------------------------------------------------------
  function drawWinOverlay(ctx, timeBonus) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    var bw = 440, bh = 180;
    var bx = (CANVAS_W - bw) / 2;
    var by = (CANVAS_H - bh) / 2;

    ctx.fillStyle = "#fffae8";
    rrPath(ctx, bx, by, bw, bh, 18);
    ctx.fill();
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth   = 4;
    rrPath(ctx, bx, by, bw, bh, 18);
    ctx.stroke();

    ctx.fillStyle    = "#226611";
    ctx.font         = "bold 42px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GESCHAFFT! 🦆🛁", CANVAS_W / 2, by + 62);

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
  // WIN_BEAT overlay — "Level geschafft!" transitional banner
  // ---------------------------------------------------------------------------
  function _drawWinBeatOverlay(ctx, levelIndex, timeBonus, timer) {
    ctx.save();
    var alpha = Math.min(0.7, (1.8 - timer) * 0.7);
    ctx.fillStyle = "rgba(20,100,30," + alpha + ")";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    var bw = 480, bh = 160;
    var bx = (CANVAS_W - bw) / 2;
    var by = (CANVAS_H - bh) / 2;

    ctx.fillStyle = "#eefff0";
    rrPath(ctx, bx, by, bw, bh, 18);
    ctx.fill();
    ctx.strokeStyle = "#228833";
    ctx.lineWidth   = 4;
    rrPath(ctx, bx, by, bw, bh, 18);
    ctx.stroke();

    ctx.fillStyle    = "#115522";
    ctx.font         = "bold 36px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Level " + (levelIndex + 1) + " geschafft! 👏", CANVAS_W / 2, by + 58);

    var bonusSecs = Math.ceil(Math.max(0, timeBonus));
    ctx.fillStyle = "#336600";
    ctx.font      = "16px system-ui, sans-serif";
    ctx.fillText("+ " + bonusSecs + " s übrig", CANVAS_W / 2, by + 98);

    var nextIdx = levelIndex + 1;
    var nextText = (nextIdx < LEVELS.length)
      ? "Weiter zu Level " + (nextIdx + 1) + " →"
      : "Alle Level geschafft!";
    ctx.fillStyle = PAL.hintText;
    ctx.font      = "15px system-ui, sans-serif";
    ctx.fillText(nextText, CANVAS_W / 2, by + 132);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // ALLCLEAR end screen
  // ---------------------------------------------------------------------------
  function _drawAllclearOverlay(ctx, totalBonusTime, levelCount, isNewBest) {
    ctx.save();
    if (imgReady(IMG.winSplash)) {
      drawImageCover(ctx, IMG.winSplash, 0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "rgba(0,0,40,0.45)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = "rgba(0,0,50,0.7)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    var bw = 560, bh = 290;
    var bx = (CANVAS_W - bw) / 2;
    var by = (CANVAS_H - bh) / 2;

    ctx.fillStyle = "#fffde8";
    rrPath(ctx, bx, by, bw, bh, 22);
    ctx.fill();
    ctx.strokeStyle = "#aa8800";
    ctx.lineWidth   = 5;
    rrPath(ctx, bx, by, bw, bh, 22);
    ctx.stroke();

    ctx.fillStyle    = "#aa6600";
    ctx.font         = "bold 44px system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Alle Level geschafft! 🦆🛁", CANVAS_W / 2, by + 68);

    ctx.fillStyle = "#553300";
    ctx.font      = "18px system-ui, sans-serif";
    ctx.fillText(levelCount + " Level sauber gemeistert 🌟", CANVAS_W / 2, by + 118);

    var bonusSecs = Math.ceil(Math.max(0, totalBonusTime));
    ctx.fillStyle = "#886600";
    ctx.font      = "16px system-ui, sans-serif";
    ctx.fillText("Gesamt-Bonus: " + bonusSecs + " s übrig", CANVAS_W / 2, by + 155);

    // Best time line (cached on ALLCLEAR entry — no per-frame localStorage read)
    var best = g.bestTime;
    if (best !== null && best !== undefined) {
      var bestStr = "Beste: " + Math.ceil(Math.max(0, best)) + " s Bonus";
      if (isNewBest) { bestStr += " ★ Neuer Rekord!"; }
      ctx.fillStyle = isNewBest ? "#cc4400" : "#886600";
      ctx.font      = isNewBest ? "bold 15px system-ui, sans-serif" : "15px system-ui, sans-serif";
      ctx.fillText(bestStr, CANVAS_W / 2, by + 190);
    }

    ctx.fillStyle = "#334455";
    ctx.font      = "bold 17px system-ui, sans-serif";
    ctx.fillText("R = von vorn", CANVAS_W / 2, by + 240);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Aim indicator — arrow at duck.aimAngle + dotted trajectory preview
  // ---------------------------------------------------------------------------
  function drawAimIndicator(ctx, duck) {
    if (!duck.onGround && !duck.charging) return;

    var angleRad = duck.aimAngle * (Math.PI / 180);
    var arrowLen = 36 + duck.power * 22;
    var dx = Math.cos(angleRad) * arrowLen * duck.facing;
    var dy = -Math.sin(angleRad) * arrowLen;
    var ox = duck.x, oy = duck.y;

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
    ctx.lineTo(ox + dx - headLen * Math.cos(headAngle - 0.42), oy + dy - headLen * Math.sin(headAngle - 0.42));
    ctx.lineTo(ox + dx - headLen * Math.cos(headAngle + 0.42), oy + dy - headLen * Math.sin(headAngle + 0.42));
    ctx.closePath();
    ctx.fill();

    // --- Dotted trajectory preview ---
    // Simulate the same parabola as the real launch using local vars only.
    // Speed mirrors _duckLaunch exactly; preview length pulses with power.
    var simSpeed = MIN_LAUNCH + duck.power * (MAX_LAUNCH - MIN_LAUNCH);
    var simVx    = Math.cos(angleRad) * simSpeed * duck.facing;
    var simVy    = -Math.sin(angleRad) * simSpeed;
    var simX     = duck.x;
    var simY     = duck.y;
    var simDt    = 1 / 60;

    ctx.globalAlpha = 0.5;
    ctx.fillStyle   = PAL.aimArrow;

    for (var step = 0; step < 90; step++) {
      simVy += GRAVITY * simDt;
      simX  += simVx  * simDt;
      simY  += simVy  * simDt;

      // Stop if the simulated point leaves the canvas
      if (simY > CANVAS_H || simX < 0 || simX > CANVAS_W) break;

      // Draw a dot every 5th step
      if (step % 5 === 4) {
        ctx.beginPath();
        ctx.arc(simX, simY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Power meter
  // ---------------------------------------------------------------------------
  function drawPowerMeter(ctx, duck) {
    if (!duck.onGround && !duck.charging) return;

    var mw = 120, mh = 14;
    var mx = duck.x - mw / 2;
    var my = duck.y - duck.radius - 26;

    ctx.fillStyle   = PAL.powerBg;
    ctx.strokeStyle = PAL.powerBorder;
    ctx.lineWidth   = 1.5;
    rrPath(ctx, mx, my, mw, mh, 4);
    ctx.fill();
    ctx.stroke();

    if (duck.power > 0) {
      var r  = Math.round(255 * Math.min(1, duck.power * 2));
      var gv = Math.round(255 * Math.min(1, (1 - duck.power) * 2));
      ctx.fillStyle = "rgb(" + r + "," + gv + ",30)";
      rrPath(ctx, mx + 1, my + 1, (mw - 2) * duck.power, mh - 2, 3);
      ctx.fill();
    }

    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 9px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("POWER", duck.x, my + mh / 2);
  }

  // ---------------------------------------------------------------------------
  // Level badge — small top-left indicator of current level
  // ---------------------------------------------------------------------------
  function _drawLevelBadge(ctx, levelIndex, totalLevels) {
    if (g.state === "TITLE" || g.state === "LEVELSELECT" || g.state === "ALLCLEAR") return;
    var lvl = LEVELS[levelIndex];
    if (!lvl) return;
    ctx.save();
    ctx.fillStyle    = "rgba(20,20,40,0.55)";
    rrPath(ctx, 8, 6, 140, 32, 6);
    ctx.fill();
    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 11px system-ui, sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "top";
    ctx.fillText("L" + (levelIndex + 1) + "/" + totalLevels + "  " + lvl.name, 16, 12);
    ctx.restore();
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
      "SPACE halten = laden  ·  ←/→ = Richtung  ·  ↑/↓ = Winkel  ·  loslassen = Sprung  ·  R = Reset",
      CANVAS_W / 2,
      CANVAS_H - 6
    );
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Mouse / click handling
  //
  // The canvas may be CSS-scaled (style width != canvas pixel width).
  // getBoundingClientRect() gives the rendered size; we scale the mouse
  // coords back to canvas-space before hit-testing.
  // ---------------------------------------------------------------------------
  canvas.addEventListener("click", function (e) {
    var rect  = canvas.getBoundingClientRect();
    var scaleX = CANVAS_W / rect.width;
    var scaleY = CANVAS_H / rect.height;
    var cx    = (e.clientX - rect.left) * scaleX;
    var cy    = (e.clientY - rect.top)  * scaleY;

    // Mute button — always active (icon is at MUTE_BTN.cx, MUTE_BTN.cy)
    var mdx = cx - MUTE_BTN.cx;
    var mdy = cy - MUTE_BTN.cy;
    if (Math.sqrt(mdx * mdx + mdy * mdy) <= MUTE_BTN.r) {
      SFX.toggleMute();
      return;
    }

    // --- TITLE buttons ---
    if (g.state === "TITLE") {
      if (_hitRect(cx, cy, _titleBtnRects.start)) {
        g.allclearTime = 0;
        g.isNewBest    = false;
        _startLevel(0);
        return;
      }
      if (_hitRect(cx, cy, _titleBtnRects.select)) {
        g.state = "LEVELSELECT";
        // leave g._prevState unchanged — LEVELSELECT entry guard will fire on first tick
        return;
      }
    }

    // --- LEVELSELECT tiles + back button ---
    if (g.state === "LEVELSELECT") {
      for (var i = 0; i < _levelTileRects.length; i++) {
        if (_hitRect(cx, cy, _levelTileRects[i])) {
          g.allclearTime = 0;
          g.isNewBest    = false;
          _startLevel(_levelTileRects[i].index);
          return;
        }
      }
      if (_levelSelectBackRect && _hitRect(cx, cy, _levelSelectBackRect)) {
        g.state      = "TITLE";
        g._prevState = "TITLE";
        return;
      }
    }
  });

  // Mousemove — tracks which LEVELSELECT tile the cursor is over.
  // Uses the same getBoundingClientRect scale mapping as the click handler.
  canvas.addEventListener("mousemove", function (e) {
    if (g.state !== "LEVELSELECT") {
      if (_hoveredTileIndex !== -1) { _hoveredTileIndex = -1; }
      return;
    }
    var rect   = canvas.getBoundingClientRect();
    var scaleX = CANVAS_W / rect.width;
    var scaleY = CANVAS_H / rect.height;
    var cx     = (e.clientX - rect.left) * scaleX;
    var cy     = (e.clientY - rect.top)  * scaleY;

    var found = -1;
    for (var i = 0; i < _levelTileRects.length; i++) {
      if (_hitRect(cx, cy, _levelTileRects[i])) {
        found = i;
        break;
      }
    }
    _hoveredTileIndex = found;
  });

  // Point-in-rect helper
  function _hitRect(px, py, rect) {
    if (!rect) return false;
    return px >= rect.x && px <= rect.x + rect.w &&
           py >= rect.y && py <= rect.y + rect.h;
  }

  // --- Kick off ---
  requestAnimationFrame(tick);
}());
