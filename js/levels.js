// js/levels.js — Level data + loader.
//
// Level format (matches SPEC):
//   { name, timeLimit,
//     start:{x,y},  tub:{x,y,w,h},
//     platforms:[{x,y,w,h,surface,label},...],
//     props:[] }
//
// Duck physics reference (angle-aware, player-adjustable aim):
//   Angles: 25° (MIN) ≤ θ ≤ 80° (MAX)
//   Launch speed: v = 500 + power*650  (power ∈ [0,1])
//   Projectile: vx=v·cos θ  vy₀=-v·sin θ  gravity=2200 px/s²
//   FLAT shots (30–45°) = long low arcs, range up to ~600px, peak 30–150px
//   STEEP shots (70–80°) = high short hops, range 200–300px, peak 280–310px
//   Downward drops: range = vx·(vy₀+√(vy₀²+2·g·Δy))/g  (Δy=drop distance, positive down)
//
// NOTE: TRAMPOLINE was removed (vx=0 bounce only works with tub floating above it).
//   All tubs now sit at FLOOR level, making the final jump a straightforward
//   downward hop into the tub.
//
// Only the faucet is injected into g.platforms by game.js (it is a landable
// moving platform). Wind (force zone) and cat (hazard) are handled in propsUpdate.

var LEVELS = [
  // =========================================================================
  // Level 1 — "Der Schrank"  (timeLimit 20 — tutorial, all downhill)
  //
  // SOLVABILITY:
  //   0→1: gap 85px/drop 100px ✓
  //   1→2: gap 85px/drop 100px ✓
  //   2→3: gap 70px/drop 100px ✓
  //   3→4: overlap/drop 90px ✓
  //   4→tub: overlap/drop into tub ✓
  //   Toilet at (350, 300) sits in P1→P2 gap; punishes overshoot.
  // =========================================================================
  {
    name:       "Der Schrank",
    timeLimit:  20,

    start: { x: 115, y: 58 },
    tub:   { x: 740, y: 505, w: 180, h: 60 },

    platforms: [
      { x: 50,  y: 80,  w: 130, h: 25, surface: "normal", label: "Schrank"       },
      { x: 265, y: 180, w: 110, h: 20, surface: "normal", label: "Handtuchregal" },
      { x: 460, y: 280, w: 120, h: 20, surface: "normal", label: "Waschbecken"   },
      { x: 650, y: 380, w: 110, h: 20, surface: "normal", label: "Heizkörper"    },
      { x: 760, y: 470, w: 100, h: 20, surface: "normal", label: "Hocker"        },
      { x: 0,   y: 570, w: 960, h: 30, surface: "normal", label: ""              }
    ],

    props: [
      { type: "toilet", x: 350, y: 300, w: 50, h: 45 }
    ]
  },

  // =========================================================================
  // Level 2 — "Rutschpartie"  (timeLimit 18 — soap + moving faucet)
  //
  // SOLVABILITY:
  //   0→1: gap 75px/drop 100px (soap=careful landing) ✓
  //   1→faucet: gap 50–170px depending on faucet phase/drop 100px,
  //     time the moving platform ✓
  //   faucet→P2: gap ~35–95px/drop ~95px ✓
  //   P2→tub: overlap, hop down-right into floor tub ✓
  //   Toilet at (385, 300) in P1→faucet gap.
  // =========================================================================
  {
    name:       "Rutschpartie",
    timeLimit:  18,

    start: { x: 115, y: 48 },
    tub:   { x: 760, y: 505, w: 180, h: 60 },

    platforms: [
      { x: 50,  y: 70,  w: 130, h: 25, surface: "normal", label: "Schrank" },
      { x: 255, y: 170, w: 105, h: 20, surface: "soap",   label: "Seife"   },
      { x: 660, y: 365, w: 120, h: 20, surface: "normal", label: "Waschbecken" },
      { x: 560, y: 570, w: 400, h: 30, surface: "normal", label: ""        }
    ],

    props: [
      { type: "toilet", x: 385, y: 300, w: 50, h: 45 },
      { type: "faucet", x: 470, y: 270, w: 95, h: 16,
        params: { axis: "x", range: 60, speed: 1.6 } }
    ]
  },

  // =========================================================================
  // Level 3 — "Knapp"  (timeLimit 16 — wind + cat, hardest, narrow tub)
  //
  // SOLVABILITY:
  //   0→1: gap 75px/drop 100px ✓
  //   1→2: gap 95px/drop 95px — Föhn wind pushes right (period 2.5s),
  //     player times the gust-off or aims flatter/left; cat stuns non-lethally ✓
  //   2→3: gap 100px/drop 95px ✓
  //   3→tub: gap 50px/drop ~158px into NARROW 140px floor tub = precision finish ✓
  //   Toilet at (345, 300) in P1→P2 gap.
  // =========================================================================
  {
    name:       "Knapp",
    timeLimit:  16,

    start: { x: 105, y: 38 },
    tub:   { x: 790, y: 508, w: 140, h: 58 },

    platforms: [
      { x: 50,  y: 60,  w: 110, h: 25, surface: "normal", label: "Schrank"    },
      { x: 235, y: 160, w: 100, h: 20, surface: "soap",   label: "Seife"      },
      { x: 430, y: 255, w: 110, h: 20, surface: "normal", label: "Regal"      },
      { x: 640, y: 350, w: 100, h: 20, surface: "normal", label: "Heizkörper" },
      { x: 600, y: 570, w: 360, h: 30, surface: "normal", label: ""           }
    ],

    props: [
      { type: "toilet", x: 345, y: 300, w: 50, h: 45 },
      { type: "wind",   x: 330, y: 90,  w: 180, h: 380,
        params: { fx: 320, fy: 0, period: 2.5 } },
      { type: "cat",    x: 455, y: 227, w: 40,  h: 28,
        params: { axis: "x", range: 35, speed: 2.2 } }
    ]
  }
];

// ---------------------------------------------------------------------------
// loadLevel(index, duck, g)
// Sets duck position + active game state for the given level.
// game.js calls this; it writes into the mutable g object.
// ---------------------------------------------------------------------------
function loadLevel(index, duck, g) {
  var lvl = LEVELS[index];
  if (!lvl) { return; }

  g.levelIndex = index;
  g.level      = lvl;
  g.platforms  = lvl.platforms.slice();
  g.tub        = lvl.tub;

  duckReset(duck, lvl.start.x, lvl.start.y);
}
