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
  },

  // =========================================================================
  // Level 4 — "Gegenwind"  (timeLimit 18 — RIGHT→LEFT, pulsed headwind)
  //
  // SOLVABILITY:
  //   Start rechts oben, Wanne links unten — Spieler drückt ← zum Zielen.
  //   Wind bläst nach rechts (Gegenwind), gepulst → in der Wind-Pause springen.
  //   Alle Sprünge gap 70–110 / drop ~95, nach links absteigend.
  // =========================================================================
  {
    name:       "Gegenwind",
    timeLimit:  18,

    start: { x: 845, y: 68 },
    tub:   { x: 40, y: 505, w: 170, h: 60 },

    platforms: [
      { x: 780, y: 90,  w: 130, h: 25, surface: "normal", label: "Schrank"     },
      { x: 560, y: 185, w: 120, h: 20, surface: "normal", label: "Regal"       },
      { x: 355, y: 280, w: 120, h: 20, surface: "normal", label: "Waschbecken" },
      { x: 165, y: 375, w: 120, h: 20, surface: "normal", label: "Heizkörper"  },
      { x: 0,   y: 570, w: 360, h: 30, surface: "normal", label: ""            }
    ],

    props: [
      { type: "toilet", x: 470, y: 385, w: 50, h: 45 },
      { type: "wind",   x: 300, y: 120, w: 280, h: 330,
        params: { fx: 220, fy: 0, period: 2.6 } }
    ]
  },

  // =========================================================================
  // Level 5 — "Aufzug"  (timeLimit 18 — vertical faucet elevator)
  //
  // SOLVABILITY:
  //   Auf den senkrecht fahrenden Hahn aufspringen (trägt die Ente hoch),
  //   oben auf Regal abspringen, dann rechts runter über Waschbecken in die Wanne.
  //   Timing des Fahrstuhls = Kern.
  // =========================================================================
  {
    name:       "Aufzug",
    timeLimit:  18,

    start: { x: 100, y: 298 },
    tub:   { x: 760, y: 505, w: 180, h: 60 },

    platforms: [
      { x: 40,  y: 320, w: 120, h: 25, surface: "normal", label: "Schrank"     },
      { x: 470, y: 180, w: 110, h: 20, surface: "normal", label: "Regal"       },
      { x: 660, y: 300, w: 120, h: 20, surface: "normal", label: "Waschbecken" },
      { x: 520, y: 570, w: 440, h: 30, surface: "normal", label: ""            }
    ],

    props: [
      { type: "faucet", x: 250, y: 300, w: 100, h: 16,
        params: { axis: "y", range: 120, speed: 1.2 } },
      { type: "toilet", x: 600, y: 250, w: 50, h: 45 }
    ]
  },

  // =========================================================================
  // Level 6 — "Spiegelverkehrt"  (timeLimit 17 — RIGHT→LEFT, soap + cat)
  //
  // SOLVABILITY:
  //   Gespiegelt nach links absteigend. Seife (rutschig) trägt zusätzlich eine
  //   patrouillierende Katze. Sprünge gap 80–110 / drop ~100.
  // =========================================================================
  {
    name:       "Spiegelverkehrt",
    timeLimit:  17,

    start: { x: 845, y: 58 },
    tub:   { x: 40, y: 505, w: 160, h: 60 },

    platforms: [
      { x: 785, y: 80,  w: 120, h: 25, surface: "normal", label: "Schrank"     },
      { x: 560, y: 185, w: 105, h: 20, surface: "soap",   label: "Seife"       },
      { x: 340, y: 285, w: 110, h: 20, surface: "normal", label: "Regal"       },
      { x: 150, y: 385, w: 110, h: 20, surface: "normal", label: "Heizkörper"  },
      { x: 0,   y: 570, w: 350, h: 30, surface: "normal", label: ""            }
    ],

    props: [
      { type: "cat",    x: 575, y: 157, w: 40,  h: 28,
        params: { axis: "x", range: 35, speed: 2.2 } },
      { type: "toilet", x: 440, y: 390, w: 50, h: 45 }
    ]
  },

  // =========================================================================
  // Level 7 — "Föhn-Sturm"  (timeLimit 17 — three wind zones, L→R)
  //
  // SOLVABILITY:
  //   Drei Föhn-Zonen mit unterschiedlichen Richtungen (rechts, links, Aufwind),
  //   alle gepulst → in den Pausen springen. Härtester Timing-Test.
  // =========================================================================
  {
    name:       "Föhn-Sturm",
    timeLimit:  17,

    start: { x: 100, y: 58 },
    tub:   { x: 770, y: 505, w: 170, h: 60 },

    platforms: [
      { x: 40,  y: 80,  w: 120, h: 25, surface: "normal", label: "Schrank"     },
      { x: 300, y: 200, w: 100, h: 20, surface: "normal", label: "Regal"       },
      { x: 560, y: 250, w: 100, h: 20, surface: "normal", label: "Brett"       },
      { x: 720, y: 370, w: 120, h: 20, surface: "normal", label: "Waschbecken" },
      { x: 600, y: 570, w: 360, h: 30, surface: "normal", label: ""            }
    ],

    props: [
      { type: "wind",   x: 180, y: 120, w: 140, h: 330,
        params: { fx: 240, fy: 0, period: 2.4 } },
      { type: "wind",   x: 400, y: 140, w: 150, h: 300,
        params: { fx: -240, fy: 0, period: 2.2 } },
      { type: "wind",   x: 600, y: 260, w: 140, h: 300,
        params: { fx: 0, fy: -300, period: 2.0 } },
      { type: "toilet", x: 430, y: 320, w: 50, h: 45 }
    ]
  },

  // =========================================================================
  // Level 8 — "Katzenjammer"  (timeLimit 16 — three cats, L→R)
  //
  // SOLVABILITY:
  //   Zwei Katzen patrouillieren auf Plattformen, eine senkrecht in einer Lücke.
  //   Sprünge gap ~110–130 / drop ~95, Katzen umtimen.
  // =========================================================================
  {
    name:       "Katzenjammer",
    timeLimit:  16,

    start: { x: 100, y: 58 },
    tub:   { x: 760, y: 505, w: 170, h: 60 },

    platforms: [
      { x: 40,  y: 80,  w: 120, h: 25, surface: "normal", label: "Schrank"     },
      { x: 290, y: 175, w: 110, h: 20, surface: "normal", label: "Regal"       },
      { x: 500, y: 270, w: 100, h: 20, surface: "normal", label: "Brett"       },
      { x: 700, y: 365, w: 120, h: 20, surface: "normal", label: "Waschbecken" },
      { x: 600, y: 570, w: 360, h: 30, surface: "normal", label: ""            }
    ],

    props: [
      { type: "cat",    x: 305, y: 147, w: 40,  h: 28,
        params: { axis: "x", range: 30, speed: 2.4 } },
      { type: "cat",    x: 510, y: 242, w: 40,  h: 28,
        params: { axis: "x", range: 30, speed: 2.6 } },
      { type: "cat",    x: 620, y: 300, w: 38,  h: 28,
        params: { axis: "y", range: 60, speed: 2.0 } },
      { type: "toilet", x: 410, y: 300, w: 50, h: 45 }
    ]
  },

  // =========================================================================
  // Level 9 — "Kopfüber"  (timeLimit 16 — RIGHT→LEFT descent, downdraft)
  //
  // SOLVABILITY:
  //   Start rechts oben, Wanne links unten. Fallwind (fy>0) drückt nach unten
  //   — bei schlechtem Timing in die WCs. Nach links absteigend,
  //   gap 70–110 / drop ~100.
  // =========================================================================
  {
    name:       "Kopfüber",
    timeLimit:  16,

    start: { x: 860, y: 48 },
    tub:   { x: 50, y: 505, w: 170, h: 60 },

    platforms: [
      { x: 800, y: 70,  w: 120, h: 25, surface: "normal", label: "Schrank"     },
      { x: 580, y: 165, w: 110, h: 20, surface: "normal", label: "Regal"       },
      { x: 360, y: 265, w: 120, h: 20, surface: "normal", label: "Waschbecken" },
      { x: 180, y: 370, w: 100, h: 20, surface: "normal", label: "Hocker"      },
      { x: 0,   y: 570, w: 380, h: 30, surface: "normal", label: ""            }
    ],

    props: [
      { type: "wind",   x: 320, y: 120, w: 320, h: 360,
        params: { fx: 0, fy: 300, period: 2.4 } },
      { type: "toilet", x: 480, y: 270, w: 50, h: 45 },
      { type: "toilet", x: 290, y: 375, w: 50, h: 45 }
    ]
  },

  // =========================================================================
  // Level 10 — "Das große Finale"  (timeLimit 15 — all combined, start center-top)
  //
  // SOLVABILITY:
  //   Mittig oben starten → links zur Seife → links runter zum Hocker →
  //   senkrechten Hahn-Fahrstuhl nehmen → mit Rückenwind nach rechts aufs
  //   Waschbecken (Katze ausweichen) → rechts runter in die schmale Wanne.
  //   Beide Richtungen, kürzeste Zeit = Finale.
  // =========================================================================
  {
    name:       "Das große Finale",
    timeLimit:  15,

    start: { x: 480, y: 48 },
    tub:   { x: 800, y: 508, w: 130, h: 58 },

    platforms: [
      { x: 420, y: 70,  w: 120, h: 25, surface: "normal", label: "Schrank"     },
      { x: 210, y: 175, w: 100, h: 20, surface: "soap",   label: "Seife"       },
      { x: 60,  y: 290, w: 100, h: 20, surface: "normal", label: "Hocker"      },
      { x: 560, y: 300, w: 110, h: 20, surface: "normal", label: "Waschbecken" },
      { x: 520, y: 570, w: 440, h: 30, surface: "normal", label: ""            }
    ],

    props: [
      { type: "faucet", x: 300, y: 330, w: 95, h: 16,
        params: { axis: "y", range: 110, speed: 1.3 } },
      { type: "wind",   x: 400, y: 150, w: 160, h: 320,
        params: { fx: 280, fy: 0, period: 2.2 } },
      { type: "cat",    x: 575, y: 272, w: 40,  h: 28,
        params: { axis: "x", range: 30, speed: 2.6 } },
      { type: "toilet", x: 140, y: 300, w: 50, h: 45 }
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
