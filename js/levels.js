// js/levels.js — Level data + loader.
//
// Level format (matches SPEC):
//   { name, timeLimit, childSpeed,
//     start:{x,y},  tub:{x,y,w,h},
//     platforms:[{x,y,w,h,surface,label},...],
//     props:[] }
//
// Duck physics reference (for layout math):
//   MAX_LAUNCH 1150 px/s, 60 deg, GRAVITY 2200 px/s²
//   Full-power jump: ~521 px horizontal, ~225 px height gain
//   Keep gaps <= 430 px horiz; downward steps only (gravity helps).
//
// Adding a new level = append one more object to LEVELS. That's it.

var LEVELS = [
  // -----------------------------------------------------------------------
  // Level 1 — "Der Schrank"
  // Route: cabinet (top-left, high) → 5 descending platforms → tub (bottom-right)
  // All jumps are short-to-medium and DOWNWARD — easily cleared at any power.
  //
  // Horizontal positions of platform LEFT edges (for gap verification):
  //   P0 cabinet right edge  ~ 190
  //   P1 left edge           ~ 260  => gap from P0 right = 70 px (trivial)
  //   P2 left edge           ~ 430  => gap from P1 right = 50 px
  //   P3 left edge           ~ 590  => gap from P2 right = 30 px
  //   P4 left edge           ~ 740  => gap from P3 right = 30 px
  //   Tub left edge          ~ 760  => duck falls onto tub after P4
  // All gaps well under 430 px limit. ✓
  // -----------------------------------------------------------------------
  {
    name:       "Der Schrank",
    timeLimit:  25,          // seconds (not used until Step 4 timer)
    childSpeed: 1.0,         // not used yet

    // Duck starts on top of the cabinet (platform[0])
    // platform[0]: x=60, y=50, w=130, h=30 → duck.y = 50 - DUCK_RADIUS (22) = 28
    start: { x: 125, y: 28 },

    // Bathtub goal zone — bottom-right corner
    tub: { x: 760, y: 510, w: 170, h: 60 },

    // Platforms — descending staircase from top-left to bottom-right.
    // Collision uses x,y,w,h (y = top of surface).
    // "label" is used only for the placeholder renderer; ignored by physics.
    platforms: [
      // 0 — Cabinet (start platform)
      { x: 60,  y: 50,  w: 130, h: 30,  surface: "normal", label: "Schrank" },
      // 1 — Regal shelf
      { x: 260, y: 140, w: 120, h: 20,  surface: "normal", label: "Regal" },
      // 2 — Heizkörper top (narrowed to 65 px to require aim)
      { x: 430, y: 235, w: 65,  h: 20,  surface: "normal", label: "Heizkörper" },
      // 3 — Waschbecken edge
      { x: 590, y: 340, w: 140, h: 20,  surface: "normal", label: "Waschbecken" },
      // 4 — Hocker (stool)
      { x: 740, y: 440, w: 110, h: 20,  surface: "normal", label: "Hocker" },
      // 5 — Floor strip at the right side so the duck can't fall off screen
      //     Also acts as a safety net before the tub (optional, keeps level fair)
      { x: 680, y: 550, w: CANVAS_W - 680, h: 50, surface: "normal", label: "" }
    ],

    props: []  // props arrive in Level 2
  }

  // Level 2 and 3 go here as additional array entries.
];

// ---------------------------------------------------------------------------
// loadLevel(index)
// Sets up duck position + active game state for the given level.
// game.js calls this; it writes into the mutable g object (passed by ref).
// ---------------------------------------------------------------------------
function loadLevel(index, duck, g) {
  var lvl = LEVELS[index];
  if (!lvl) { return; }

  g.levelIndex = index;
  g.level      = lvl;
  g.platforms  = lvl.platforms.slice(); // defensive copy — same objects, new array
  g.tub        = lvl.tub;

  // Place duck on top of the start point
  duckReset(duck, lvl.start.x, lvl.start.y);
}
