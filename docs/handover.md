# flowbend — Architektur & Datendoku

_flowbend ist eine clientseitige Web-App (PWA) für geführte Dehn-, Mobilitäts- und
Kraft-Routinen. Sie läuft ohne Backend-Laufzeit: ausgeliefert werden statische Dateien
(HTML/JS/JSON + Bilder), die Logik steckt komplett im Browser._

---

## 1. Architektur & Datenfluss

```
data/poses.json  ─┐
data/routines.json┴─►  fetch (beim Start)  ─►  IndexedDB (Dexie)  ─►  UI (Dashboard/Player)
                        │
                        └─ schlägt fehl ─►  vorhandener IndexedDB-Cache  ─►  UI
                                            (kein Cache ⇒ leeres Dashboard + Hinweis)
```

- **Einzige Datenquelle:** `data/poses.json` und `data/routines.json`. Es gibt **keinen** im
  Code eingebetteten Fallback-Seed (bewusst, um doppelte Datenhaltung zu vermeiden).
- **IndexedDB** dient nur als Offline-Cache. Bei jedem erfolgreichen Start wird er geleert
  und neu befüllt (`clear()` + `bulkAdd()`), d. h. Änderungen an den JSON-Dateien greifen sofort.
- **Service Worker** (`sw.js`) cacht zusätzlich die App-Shell (HTML/JS/Dexie/Icon), damit
  nach dem ersten Laden auch die App-Runtime offline verfügbar ist (nicht nur die Daten).

## 2. Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Struktur, Styling, SVG-Strichmännchen, Bild-Element, PWA-Meta |
| `app.js` | Laden/Caching, Dashboard, Bereichs-Generator, Player, Bild/Fallback, Streak, SW-Registrierung |
| `manifest.json` | PWA-Manifest (installierbar) |
| `sw.js` | Service Worker (App-Shell cache-first, Daten network-first) |
| `data/poses.json` | 58 Posen (Stammdaten) |
| `data/routines.json` | 15 kuratierte Routinen |
| `vendor/dexie.min.js` | IndexedDB-Wrapper, lokal gevendored (kein CDN) |
| `img/<id>.webp` | Pose-Bilder (WebP, aus PNG konvertiert) |
| `img/icon-192.png`, `img/icon-512.png` | App-/Browser-Icons |
| `tools/check-data.py` | Invariantencheck (CI: poseIds & Bilder vorhanden) |

## 3. Datenmodell

### Pose (`data/poses.json`)
```json
{
  "id": "cobra",                 // eindeutig, von routines/Generator referenziert
  "name": "Cobra Pose",          // gängiger englischer Name
  "nameDe": "Kobra",             // deutscher Name (Titel im Bereichs-Generator)
  "focus": ["back","spine","chest"], // Bereiche; steuert Bereichs-Generator
  "position": "lying",           // standing|kneeling|seated|lying (Reihenfolge im Generator)
  "image": "img/cobra.webp",     // optional; vorhanden ⇒ Bild, sonst Strichmännchen
  "cue": "In Bauchlage ...",     // deutsche Ausführung (Beschreibung im Generator)
  "spine": [60,165,105,135],     // SVG-Linie x1,y1,x2,y2 (Fallback-Strichmännchen)
  "lLeg": [...], "rLeg": [...], "lArm": [...], "rArm": [...],
  "head": [115,126]              // Kreis cx,cy
}
```

### Routine (`data/routines.json`)
```json
{
  "id": "wakeup",
  "meta": "☀️ MORNING WAKE-UP",  // Emoji-Präfix wird im Dashboard per Regex entfernt
  "exercises": [
    { "title": "Großes Strecken", "desc": "...", "duration": 30, "poseId": "armsUp" }
  ]
}
```
**Invariante:** Jede `poseId` in `routines.json` muss in `poses.json` existieren
(der Player macht `db.poses.get(poseId)`).

## 4. Funktionen

### Kuratierte Routinen
15 fest definierte Routinen mit ausformulierten deutschen Texten (siehe Tabelle unten).

### Bereichs-Generator (5/10/15 Min)
- Dashboard-Buttons je Körperbereich + Dauer-Umschalter.
- Algorithmus: Posen nach `focus`-Tag filtern → nach `position` sortieren
  (standing→kneeling→seated→lying, Aufwärm- zu Ausklang-Bogen) → auf Zielzeit auffüllen.
- **Haltedauer ~40 s**, Restsekunden exakt verteilt ⇒ Summe = exakt 5/10/15 Min.
- Kleiner Pool ⇒ Sequenz wird zyklisch wiederholt.
- Bereiche: Rücken, Nacken, Schultern, Brust, Core, **Kraft**, Hüften, Beine, Balance, Entspannung.

### Bild mit Strichmännchen-Fallback
- Pose hat `image` ⇒ Bild in **voller Breite** (Ring ausgeblendet).
- Kein `image` **oder** Ladefehler (`onerror`) ⇒ SVG-Strichmännchen (200×200, Atemanimation).

### Streak
Zählt **zusammenhängende** Trainingstage bis heute (oder gestern), gespeichert in
`localStorage` unter dem Key `fb_history`. Trainiert man einen Tag nicht, beginnt der
Zähler beim nächsten Training wieder bei 1.

## 5. Besonderheiten & Stolperfallen

- **`file://` blockt `fetch`.** Per Doppelklick geöffnet bleibt das Dashboard leer
  (CORS für lokale Dateien). Lokal testen mit `python3 -m http.server`.
- **Bilddateinamen case-sensitive.** Auf Linux-Hosts muss `img/cobra.webp` exakt passen –
  `Cobra.webp` lädt nicht und fällt aufs Strichmännchen zurück.
- **`position` ist nicht durchgängig anatomisch.** `downwardDog`/`dolphinPose` stehen auf
  `kneeling`, die Planks und `cobra`/`upwardDog` auf `lying`. Das Feld steuert nur die
  Generator-Reihenfolge, nicht die echte Körperhaltung – beim Foto-Briefing nicht stolpern.
- **Dünne Fokus-Bereiche wiederholen sich.** z. B. Nacken (3 Posen): ein 10-Min-Programm
  spielt die Sequenz mehrfach. Rücken (27) trägt 15 Min ohne Wiederholung.
- **Einseitige Posen werden automatisch beidseitig gespielt.** Posen in der `BILATERAL`-Liste
  (`app.js`) werden im Ablauf in „(rechts)" + „(links)" aufgeteilt (Haltezeit hälftig), die
  linke Seite wird per CSS `scaleX(-1)` gespiegelt.
- **„Bereit machen"-Phase.** Vor jeder Übung läuft ein kurzer Vorbereitungs-Countdown
  (`PREP_SECONDS`, Standard 5 s) mit Banner „als Nächstes: …".
- **Player-Timer ist zeitstempel-basiert** (`phaseEndsAt`), damit er nach Bildschirm-Sleep/
  Tab-Wechsel stimmt; zusätzlich hält ein **Screen Wake Lock** den Bildschirm während der
  Routine an (Fallback: läuft ohne Wake Lock normal weiter).
- **Generierte Programme nutzen deutsche Namen + Ausführungen** aus den Pose-Feldern
  `nameDe`/`cue`. Fehlen sie, greift ein Fallback (englischer Name + „Ruhig halten …").
- **Generierte Programme sind deterministisch** (kein Zufall) – gleiches Programm bei jedem Start.
- **SVG-Koordinaten sind nicht visuell getestet.** Besonders Planks/Side Plank ggf. nachjustieren.
- **Emoji-Präfix der Routinen-Titel** wird per `replace(/^\s*\S+\s+/, "")` entfernt.
- **Service Worker cacht die App-Shell.** Nach Änderungen an `index.html`/`app.js` die
  Cache-Version in `sw.js` (`const CACHE = "flowbend-v1"`) hochzählen, damit Clients neu laden.

## 6. Deployment

1. Repo-Inhalt in den Web-Root legen; Ordnerstruktur (`data/`, `vendor/`, `img/`) beibehalten.
2. Pose-Bilder nach `img/` legen, exakt nach `id` benannt (`img/cobra.webp` …). PNG/JPG-Uploads
   wandelt die `optimize-images`-Action automatisch in WebP um. Optional – fehlende Bilder ⇒ Strichmännchen.
3. Lokal testen: `python3 -m http.server` im Projektordner, dann `http://localhost:8000`.

## 7. Offene Ausbaustufen (Ideen)

- **Routine-Editor im Browser**: neue Routinen anlegen. Empfohlen mit **getrennten Stores**
  (`userRoutines`/`userPoses`), die beim Sync **nicht** geleert werden – sonst löscht der
  `clear()`-Schritt eigene Einträge.
- **Variable Haltezeiten** (z. B. Entspannung länger, Kraft kürzer) über `holdSeconds`.
- **Abwechslung** im Generator (Shuffle innerhalb der Positionsgruppen).

---

## 8. Routinen-Übersicht

| id | Titel | Übungen | ~Dauer |
|---|---|---:|---:|
| `wakeup` | ☀️ MORNING WAKE-UP | 4 | 2 min |
| `desk` | 💻 SCHREIBTISCH RESET | 4 | 2 min |
| `sleep` | 🌙 TIEFER SCHLAF FLOW | 4 | 4 min |
| `strength` | 💪 KRAFT & STABILITÄT | 5 | 3 min |
| `backcare` | 🌿 RÜCKEN WOHLFÜHLEN | 5 | 3 min |
| `balance` | ⚖️ BALANCE FLOW | 4 | 2 min |
| `mobility` | 🤸 BEWEGLICHKEIT | 4 | 2 min |
| `energizer` | ⚡ ENERGIE-KICK | 4 | 2 min |
| `hips` | 🦵 HÜFTÖFFNER | 4 | 3 min |
| `neckShoulder` | 🧣 NACKEN & SCHULTERN | 4 | 2 min |
| `legs` | 🦿 BEINE & WADEN | 4 | 2 min |
| `corestretch` | 🔥 CORE & DEHNUNG | 4 | 2 min |
| `calm` | 🧘 RUHE & ATEM | 4 | 4 min |
| `fullbody` | 🌟 GANZKÖRPER | 6 | 4 min |
| `quickstretch` | ⏱️ KURZE PAUSE | 3 | 1 min |

## 9. Posen-Referenz (58, Dateireihenfolge)

| # | id | Name | Position | Fokus |
|---:|---|---|---|---|
| 1 | `armsUp` | Upward Salute | standing | shoulders, chest, fullbody |
| 2 | `mountain` | Mountain Pose | standing | posture, balance, fullbody |
| 3 | `sideStretch` | Standing Side Stretch | standing | back, shoulders, obliques |
| 4 | `chestOpen` | Standing Chest Opener | standing | chest, shoulders |
| 5 | `neckStretch` | Neck Release | standing | neck, shoulders |
| 6 | `quadStretch` | Standing Quad Stretch | standing | quads, legs |
| 7 | `forwardFold` | Standing Forward Fold | standing | hamstrings, back, legs |
| 8 | `warrior1` | Warrior I | standing | legs, hips, balance, strength |
| 9 | `warrior2` | Warrior II | standing | legs, hips, shoulders, strength |
| 10 | `tree` | Tree Pose | standing | balance, legs, core |
| 11 | `chair` | Chair Pose | standing | legs, quads, core, strength |
| 12 | `eaglePrep` | Eagle Arms | standing | shoulders, back |
| 13 | `standingTwist` | Standing Twist | standing | spine, back, core |
| 14 | `halfMoon` | Half Moon Pose | standing | balance, legs, core |
| 15 | `standingBackbend` | Standing Backbend | standing | chest, back, spine |
| 16 | `shoulderRolls` | Shoulder Rolls | standing | shoulders, neck |
| 17 | `wristStretch` | Wrist Stretch | standing | wrists, arms |
| 18 | `calfRaise` | Calf Raise | standing | calves, legs, balance, strength |
| 19 | `lateralLunge` | Side Lunge | standing | hips, legs, hamstrings |
| 20 | `standingSideReach` | Standing Side Reach | standing | obliques, shoulders, back |
| 21 | `catCow` | Cat-Cow | kneeling | spine, back, core |
| 22 | `cowPose` | Cow Pose | kneeling | spine, back |
| 23 | `catPose` | Cat Pose | kneeling | spine, back |
| 24 | `childsPose` | Child's Pose | kneeling | back, hips, relaxation |
| 25 | `threadNeedle` | Thread the Needle | kneeling | shoulders, spine, back |
| 26 | `lowLunge` | Low Lunge | kneeling | hips, legs, quads |
| 27 | `camel` | Camel Pose | kneeling | chest, back, spine |
| 28 | `gatePose` | Gate Pose | kneeling | obliques, hips, back |
| 29 | `tableTop` | Tabletop | kneeling | core, back |
| 30 | `birdDog` | Bird Dog | kneeling | core, back, balance, strength |
| 31 | `seatedForwardFold` | Seated Forward Fold | seated | hamstrings, back |
| 32 | `seatedTwist` | Seated Twist | seated | spine, back, core |
| 33 | `butterfly` | Butterfly Pose | seated | hips, legs |
| 34 | `seatedSideStretch` | Seated Side Stretch | seated | obliques, shoulders, back |
| 35 | `boatPose` | Boat Pose | seated | core, legs, strength |
| 36 | `headToKnee` | Head-to-Knee Pose | seated | hamstrings, back |
| 37 | `seatedMeditation` | Easy Pose | seated | hips, relaxation, posture |
| 38 | `cowFaceArms` | Cow Face Arms | seated | shoulders, chest |
| 39 | `staffPose` | Staff Pose | seated | back, core, posture |
| 40 | `seatedNeckStretch` | Seated Neck Stretch | seated | neck, shoulders |
| 41 | `lyingTwist` | Supine Twist | lying | spine, back, hips |
| 42 | `bridge` | Bridge Pose | lying | back, glutes, chest |
| 43 | `cobra` | Cobra Pose | lying | back, spine, chest |
| 44 | `sphinx` | Sphinx Pose | lying | back, spine |
| 45 | `supineKneeHug` | Knees-to-Chest | lying | back, hips, relaxation |
| 46 | `happyBaby` | Happy Baby | lying | hips, back |
| 47 | `legsUpWall` | Legs-Up-the-Wall | lying | legs, relaxation |
| 48 | `savasana` | Corpse Pose | lying | relaxation, fullbody |
| 49 | `recliningButterfly` | Reclining Bound Angle | lying | hips, chest, relaxation |
| 50 | `upwardDog` | Upward-Facing Dog | lying | back, chest, arms |
| 51 | `plank` | High Plank | lying | core, shoulders, arms, strength |
| 52 | `forearmPlank` | Forearm Plank | lying | core, shoulders, strength |
| 53 | `sidePlank` | Side Plank | lying | core, obliques, shoulders, strength |
| 54 | `downwardDog` | Downward-Facing Dog | kneeling | arms, shoulders, hamstrings, strength |
| 55 | `dolphinPose` | Dolphin Pose | kneeling | shoulders, core, arms, strength |
| 56 | `locustPose` | Locust Pose | lying | back, glutes, core, strength |
| 57 | `hollowHold` | Hollow Hold | lying | core, strength |
| 58 | `reverseTabletop` | Reverse Tabletop | seated | core, arms, glutes, chest, strength |
