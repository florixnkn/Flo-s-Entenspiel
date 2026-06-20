# Projekt-Regeln — Flo's Entenspiel (SKAILE Building Challenge)

Game: **„Ab in die Wanne!"** — Tight-Arcade-Bounce-Plattformer. Details in `SPEC.md`.

## Git / Push (Pflicht laut Challenge)
- `origin` = mein eigenes Repo `florixnkn/Flo-s-Entenspiel`. Ziel NIE ändern. Vor Push `git remote -v` prüfen.
- **Nach JEDEM abgeschlossenen Arbeitsschritt sofort committen + pushen** (`git add -A`, kurze klare Message, `git push`). An den Fortschritt gekoppelt, kein Timer. Der Push-Verlauf wird bewertet — niemals am Ende alles auf einmal.
- Zu Beginn jeder Session `git log` + `git status` ansehen, orientieren, nahtlos weiterbauen.

## Qualität (so gewinnen wir)
- **Niemals die simpelste Lösung.** Jedes Feature braucht einen Mechanik-Kniff oder ein Game-Feel-Element. `jam-reviewer` lehnt Triviales ab.
- Erst **Core-Loop spielbar (Bounce-Feel!)**, dann Politur. Scope: 3 kurze Level, Level 1 zuerst perfekt.
- Sauber & klein: lesbare Module, klare Namen, keine Debug-/Toten-Reste.

## Deploy-Safety
- Relative Pfade (`./...`), Dateinamen **lowercase**, exakte Case (Vercel = Linux). Statischer Deploy, kein Build-Step.
- **Klassische `<script>`-Tags (file://-safe), KEINE ES-Module.**

## Arbeitsweise (Multi-Agent-System)
- Hauptmodell plant, integriert, reviewt. **Implementierung wird delegiert:** `jam-builder` (Code), `jam-gamefeel` (Juice/Sound), `jam-assets` (Bilder) — `jam-reviewer` als Gate vor jedem Push.
- Workflow-Commands: `/jam:feature`, `/jam:juice`, `/jam:asset`, `/jam:ship`.
