# SPEC — Ab in die Wanne! 🦆🛁

## Pitch
Eine Gummiente steht auf dem Badezimmerschrank und muss sich **parcours-mäßig in die Badewanne hüpfen**, bevor das **Kind zur Badezeit reinkommt**. Kommt das Kind zuerst → verloren, das Kind weint. 😭

## Locked
- **Engine:** Vanilla JS + Canvas, kein Build-Step, statischer Deploy.
- **Stil:** Cartoon/Comic — kräftige Outlines, hell, freundlich, ohne Vorwissen lesbar.
- **Umfang:** 3 kurze Level mit Steigerung.
- **Canvas:** 960×600, **ein Screen pro Level** (kein Scrolling/Kamera).

## Steuerung — Charge-&-Release-Bounce (PRIORITÄT #1)
Tight/Arcade, nicht Ragdoll. Bewusst nur 2 Variablen:
- **Richtung** (←/→) + **Power** über eine **oszillierende Leiste (0→1→0)**. Abschuss-**Winkel fix ~60°** nach oben in Blickrichtung. **Loslassen = Boing.**
- Squash beim Laden (scaleY↓), Stretch entlang Velocity beim Abschuss, kurzer Squash+Settle bei Landung.
- Keys: Halten = laden (Space ODER ←/→ halten?), ←/→ = Richtung, Loslassen = Sprung, `R` = Neustart. (Genaues Mapping beim Tunen festlegen — Hauptsache fair & lesbar.)

### Feel-Konstanten (Startwerte, live tunen — alle in constants.js)
```
GRAVITY        = 2200   px/s²
LAUNCH_ANGLE   = 60°    nach oben, in Blickrichtung
MIN_LAUNCH     = 350    px/s     MAX_LAUNCH = 950 px/s
POWER_CYCLE    = 0.85 s (voller 0→1→0 Sweep)
GROUND_FRICTION= 0.80            SOAP_FRICTION = 0.98
SQUASH_CHARGE  = scaleY→0.6      STRETCH_LAUNCH = 1.3 entlang Velocity
LAND_TOLERANCE = klein (verzeihend)
AIR_STEER      = 0 (evtl. kleine seitliche Korrektur beim Tunen)
```

## Physik & Kollision (Bug aus dem Trockenlauf vermeiden!)
- `vy += GRAVITY*dt; x += vx*dt; y += vy*dt`, fixed timestep dt=1/60, accumulator, clamp ≤200ms.
- Ente als Kreis (oder AABB). **prevX/prevY vor dem Move speichern.** Kollision **pro Achse** (vertikal, dann horizontal) gegen die **Originalposition** auflösen, gegen ALLE Plattformen — Position NICHT über Plattformen hinweg verketten/mutieren.
- Landung: Abwärtsbewegung auf Plattform-Oberkante → snappen, `onGround=true`, `vx *= friction` (Seife = fast reibungslos), kleiner Settle.

## Dateistruktur (klassische <script>-Tags in dieser Reihenfolge)
```
index.html  · style.css
js/constants.js   Feel-Params + Palette + Canvas
js/zzfx.js        Mini-SFX-Lib
js/audio.js       SFX-Map (SFX.squeak() …)
js/input.js       Tastatur/Maus-State
js/duck.js        Ente: charge, launch, physik, squash/stretch
js/collision.js   Kreis-vs-Rect, per-Achse vs Originalpos
js/props.js       Verhalten: trampoline, soap, faucet, wind, toilet, cat
js/levels.js      3 Level-Daten + Loader
js/hud.js         Uhr, "Kind nähert sich"-Leiste, Türlicht
js/game.js        State-Machine + Loop + Draw-Orchestrierung
```

## Loop & States
TITLE → PLAY → (WIN → nächstes Level | LOSE → Retry) → ALLCLEAR. `update(state)`/`render(state)`. `R` = Neustart.

## Level-Datenformat (Steigerung = nur Daten + 1 neuer Prop/Level)
```js
{ name:"Der Schrank", timeLimit:18, childSpeed:1.0,
  start:{x,y}, tub:{x,y,w,h},
  platforms:[ {x,y,w,h, surface:"normal"|"soap"}, ... ],
  props:[ {type:"trampoline"|"faucet"|"wind"|"toilet"|"cat", x,y,w,h, params}, ... ] }
```
- **L1 Der Schrank:** normale Plattformen, großzügige Zeit, Einführung Bounce. Handtuchstange, Seife.
- **L2 Rutschpartie:** Seife (rutschig) + Hahn (bewegliche Plattform), enger, weniger Zeit.
- **L3 Knapp:** Föhn-Böen + Katze (bewegliches Hindernis), schmales Wannen-Zeitfenster, Kind nah.

## Stakes (eine Uhr treibt alles)
Pro Level `timeLeft` runter; `childProgress = 1 − timeLeft/timeLimit`. Visuell: tickende Uhr, wachsendes Türlicht, „Kind nähert sich"-Leiste, schneller werdende Schritte. `timeLeft ≤ 0` → LOSE (weinendes Kind). Ente erreicht Wannen-Zone → WIN.
Sofort-Fails: Toiletten-Zone → LOSE (lustiger Plopp). Unten rausfallen → Respawn am Levelstart (Zeit läuft weiter).

## Juice-Checkliste (jam-gamefeel)
squash/stretch · Lande-Staub + Platsch-Partikel · Screenshake (harte Landung, Platsch) · **Slow-Mo bei Wannen-Eintritt (~0.4s)** · Tick-SFX pulsiert rot letzte 5s · Schritt-Crescendo · Enten-Augen weiten sich bei timeLeft<5 · Power-Leiste-Bounce · Leiste wackelt kurz vor voll.
ZzFX-SFX: squeak, land-thud, splash, toilet-plop, tick, win-fanfare, lose-trombone.

## Placeholder-first (nie von Assets blockiert)
Alles zuerst mit **gezeichneten Platzhaltern** (Ente = gelber runder Body + Schnabel + Auge; Plattformen = beschriftete Rects; Kind = simple Figur). Spiel ist **komplett spielbar & deploybar ohne ein einziges Bild**. Echte ChatGPT-Bilder kommen später in dieselben Zeichen-Hooks.

## Build-Reihenfolge (delegiert; push + reviewer-Gate nach JEDEM)
1. Skelett + Loop + States + leere Screens.
2. **Ente + Charge-Bounce + flacher Boden → FEEL TUNEN (mit Florian).**
3. Kollision + Level 1 + Wannen-Win.
4. Timer + Kind + Win/Lose/Retry + Toilet-Fail → **spielbare Slice → Florian zeigen + ERSTES DEPLOY.**
5. Props + Level 2 & 3.
6. Juice + ZzFX.
7. ChatGPT-Assets einbinden.
8. Titel, Level-Übergänge, ALLCLEAR, Best-Time (localStorage).
9. `/jam:ship`: Deploy + live verifizieren + Repo/Live-Link posten.
```
