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
//   Full-power jump: vx ≈ 575 px/s, vy₀ ≈ -996 px/s
//   Flight time ≈ 0.91 s   →  max horizontal ≈ 521 px
//   Max height gain ≈ 225 px
//   Keep gaps <= 430 px horiz; downward steps only (gravity helps).
//
// Faucet + trampoline props are also injected into g.platforms by game.js
// so that the standard collision resolver handles landing on them.

var LEVELS = [
  // =========================================================================
  // Level 1 — "Der Schrank"
  // Route: cabinet (top-left) → 5 descending platforms → tub (bottom-right)
  // All jumps are short-to-medium and DOWNWARD — generous for a tutorial.
  //
  // Gap check (all horizontal gaps << 430 px limit):
  //   P0 right=190 → P1 left=260  gap=70  ✓
  //   P1 right=380 → P2 left=430  gap=50  ✓
  //   P2 right=495 → P3 left=590  gap=95  ✓
  //   P3 right=730 → P4 left=740  gap=10  ✓
  //   P4 right=850 → Tub left=760 (duck falls onto tub)  ✓
  // =========================================================================
  {
    name:       "Der Schrank",
    timeLimit:  20,

    start: { x: 125, y: 28 },
    tub:   { x: 760, y: 510, w: 170, h: 60 },

    platforms: [
      { x: 60,  y: 50,  w: 130, h: 30,  surface: "normal", label: "Schrank"    },
      { x: 260, y: 140, w: 120, h: 20,  surface: "normal", label: "Regal"       },
      { x: 430, y: 235, w: 65,  h: 20,  surface: "normal", label: "Heizkörper"  },
      { x: 590, y: 340, w: 140, h: 20,  surface: "normal", label: "Waschbecken" },
      { x: 740, y: 440, w: 110, h: 20,  surface: "normal", label: "Hocker"      },
      { x: 680, y: 550, w: CANVAS_W - 680, h: 50, surface: "normal", label: "" }
    ],

    props: [
      { type: "toilet", x: 330, y: 295, w: 50, h: 40 }
    ]
  },

  // =========================================================================
  // Level 2 — "Rutschpartie"
  // Introduces: soap (slippery surface), faucet (moving platform), trampoline.
  // Tighter windows and one less second than L1.
  //
  // Route: cabinet → soap shelf → faucet (moving) → normal shelf → trampoline → tub
  //
  // Gap check (horizontal, using faucet at leftmost position for worst case):
  //   P0 right=170 → P1 left=240   gap=70   ✓
  //   P1 right=340 → Faucet leftmost=380  gap=40   ✓  (faucet origin 430, range 50 → min x=380)
  //   Faucet right at rightmost = 430+50+85=565 → P3 left=580  gap=15   ✓  (faucet center right+P3)
  //   Faucet rightmost right=565 → P3 left=580  gap=15   ✓  (tight but doable)
  //   P3 right=680 → Trampoline left=720  gap=40   ✓
  //   Trampoline centre=770 → Tub left=750  (tub is directly below, duck bounces up and lands in)
  //
  // Height drops (all downward):
  //   P0 y=60 → P1 y=160   drop=100  ✓
  //   P1 y=160 → Faucet y=255  drop=95   ✓
  //   Faucet y=255 → P3 y=360  drop=105  ✓
  //   P3 y=360 → Trampoline y=450  drop=90   ✓
  //   Trampoline at y=450 → Tub y=490 (duck bounces up -1350 px/s, flight 1.23 s,
  //     then falls back down into tub which is y=490..550 — tub is wide enough)   ✓
  //
  // Soap note: SOAP_FRICTION=0.98 means the duck barely slows on landing;
  //   player needs to aim carefully to stop on the soap platform.
  // =========================================================================
  {
    name:       "Rutschpartie",
    timeLimit:  18,

    start: { x: 110, y: 35 },
    tub:   { x: 700, y: 490, w: 200, h: 70 },

    platforms: [
      // 0 — Cabinet (start)
      { x: 50,  y: 60,  w: 120, h: 25,  surface: "normal", label: "Schrank"   },
      // 1 — Soap shelf (slippery!)
      { x: 240, y: 160, w: 100, h: 20,  surface: "soap",   label: "Seife"     },
      // 2 — Normal shelf after faucet
      { x: 580, y: 360, w: 100, h: 20,  surface: "normal", label: "Regal"     },
      // 3 — Floor safety net
      { x: 640, y: 550, w: CANVAS_W - 640, h: 50, surface: "normal", label: "" }
    ],

    props: [
      // Toilet sits between soap shelf and faucet — punishment for overshooting P1 left
      { type: "toilet",    x: 300, y: 315, w: 50,  h: 42 },
      // Faucet — moving platform that oscillates left/right
      // Physical rect: x=430, y=255, w=85, h=16; origin x=430, range=50
      { type: "faucet",    x: 430, y: 255, w: 85,  h: 16,
        params: { axis: "x", range: 50, speed: 1.8 } },
      // Trampoline — right before the tub
      { type: "trampoline", x: 720, y: 450, w: 100, h: 16,
        params: { bounce: 1350 } }
    ]
  },

  // =========================================================================
  // Level 3 — "Knapp"
  // Introduces: wind (Föhn gusts, pulsed) + cat (moving hazard).
  // Also keeps a soap platform and a trampoline for familiarity.
  // Hardest: narrow tub, least time, wind disrupts trajectory.
  //
  // Route: cabinet → soap ledge → wind zone crossing → narrow bridge →
  //        cat patrol zone → trampoline → narrow tub
  //
  // Gap check:
  //   P0 right=160 → P1 left=220  gap=60    ✓
  //   P1 right=330 → P2 left=400  gap=70    ✓  (crosses wind zone horizontally)
  //   P2 right=490 → P3 left=540  gap=50    ✓
  //   P3 right=650 → Trampoline left=700  gap=50   ✓
  //   Trampoline → Tub directly below   ✓
  //
  // Height drops:
  //   P0 y=55 → P1 y=155  drop=100  ✓
  //   P1 y=155 → P2 y=255  drop=100  ✓
  //   P2 y=255 → P3 y=355  drop=100  ✓
  //   P3 y=355 → Trampoline y=445  drop=90   ✓
  //
  // Wind zone: x=340..510, y=100..450 — covers most of the jump between P1 and P2.
  //   fx=350 (rightward gust), period=2.5 s (on 1.25s / off 1.25s)
  //   Player must time their jump for the wind-off phase OR aim left to compensate.
  //
  // Cat patrols on P2 (x=400..490) — oscillates ±40 px on x-axis.
  //   Contact knocks duck back with stun 0.3 s — not lethal.
  // =========================================================================
  {
    name:       "Knapp",
    timeLimit:  16,

    start: { x: 100, y: 30 },
    tub:   { x: 720, y: 490, w: 140, h: 60 },

    platforms: [
      // 0 — Cabinet
      { x: 50,  y: 55,  w: 110, h: 25, surface: "normal", label: "Schrank"    },
      // 1 — Soap ledge
      { x: 220, y: 155, w: 110, h: 20, surface: "soap",   label: "Seife"      },
      // 2 — Narrow bridge (wide enough to land, narrow enough to challenge)
      { x: 400, y: 255, w: 90,  h: 20, surface: "normal", label: "Brett"      },
      // 3 — Shelf before trampoline
      { x: 540, y: 355, w: 110, h: 20, surface: "normal", label: "Regal"      },
      // 4 — Floor safety net
      { x: 650, y: 550, w: CANVAS_W - 650, h: 50, surface: "normal", label: "" }
    ],

    props: [
      // Toilet — sits between P1 soap and P2 narrow bridge, punishes bad aim
      { type: "toilet",    x: 310, y: 310, w: 50,  h: 42 },
      // Wind zone — Föhn gust blows right, pulsed every 2.5 s
      { type: "wind",      x: 340, y: 100, w: 180, h: 360,
        params: { fx: 350, fy: 0, period: 2.5 } },
      // Cat patrols on top of P2 (y slightly above P2 surface = 255-30=225, h=28)
      { type: "cat",       x: 415, y: 225, w: 40,  h: 28,
        params: { axis: "x", range: 32, speed: 2.2 } },
      // Trampoline right before tub
      { type: "trampoline", x: 700, y: 445, w: 100, h: 16,
        params: { bounce: 1350 } }
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
