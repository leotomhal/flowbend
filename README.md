# flowbend

**Geführte Dehn-, Mobilitäts- und Kraft-Routinen – komplett im Browser, offline-fähig, ohne Backend.**

flowbend ist eine clientseitige Web-App (PWA). Ausgeliefert werden nur statische Dateien
(HTML/JS/JSON + Bilder); die gesamte Logik läuft im Browser. Zwei Modi: **Beweglichkeit**
(kuratierte Flows + Bereichs-Generator) und **Kraft** (getimte Zirkel). Ein Timer mit
Wake-Lock, Atem-Pacing, Ton/Vibration und Pose-Bildern führt durch die Übungen.

<!-- Screenshots folgen -->
<!--
![Dashboard](img/screenshot-dashboard.png)
![Player](img/screenshot-player.png)
-->

## Features

**Beweglichkeit**
- **15 kuratierte Routinen** mit ausformulierten deutschen Texten (Aufwachen, Schreibtisch-Reset, Schlaf, Rücken, Balance …).
- **Bereichs-Generator:** Körperbereich + Dauer (5/10/15 Min) → on demand ein Programm aus den Mobilitäts-Posen; einseitige Posen werden automatisch beidseitig gespielt (rechts/links).
- **Atem-Pacing** (4 s ein / 6 s aus) während des Haltens.
- **Bereichs-Generator mit Shuffle:** jede Session variiert die Posen-Auswahl, der Bogen stehend → liegen bleibt erhalten.

**Durchatmen**
- **Vollbild-Atem-Modus** („Breath Orb"): animierte Atemkugel im 4/6-Rhythmus, wählbare Dauer (1/3 Min oder ∞), optionaler **generativer Ambient-Klang** (WebAudio, offline, keine Audiodateien).

**Kraft**
- **Umschalter Beweglichkeit ⇄ Kraft** auf dem Dashboard.
- **16 Kraft-Übungen** und **7 getimte Zirkel** (Arbeit/Pause/Runden), kuratiert und per **Generator** (Dauer + Intensität) – u. a. HIIT, Core (leise), Bein- und Oberkörper-Zirkel.
- **Leise-Modus** („Nachbarn nicht ärgern") blendet laute/springende Übungen aus.

**Player & Komfort**
- Zeitstempel-Timer + **Screen Wake Lock** (Bildschirm bleibt an), „Bereit machen"-Countdown, Übungszähler, Zurück/Weiter, Ton/Vibration-Schalter.
- **Verlauf/Statistik** (Heatmap, Streak, Rekord, Minuten) und adaptiver **„Was heute?"-Vorschlag** aus dem lokalen Verlauf.
- **Teilbare Fortschritts-Karte**: nach der Session eine Canvas-Karte (Übungen · Minuten · 🔥 Streak) per **Web Share** teilen oder als PNG speichern.
- **Dark Mode** (automatisch), **Streak**, medizinischer Hinweis.

**Technik**
- **Offline-fähig** (Service Worker), **installierbar** als PWA mit App-Icon.
- **In-App-Update mit Nachfrage**: neue Version wird im Hintergrund geladen, ein Banner bietet „Aktualisieren".
- **Pose-Bilder (WebP) mit Fallback:** fehlt/lädt ein Bild nicht, zeigt flowbend ein animiertes SVG-Strichmännchen.

## Lokal starten

`fetch` funktioniert nicht über `file://` (CORS). Daher über einen lokalen Server öffnen:

```bash
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

## Deployment

flowbend ist eine reine Statik-Seite. Auslieferung läuft über **GitHub Releases + Auto-Updater**
(siehe [`deploy/`](deploy/README.md)) – der Release-Workflow baut `flowbend.zip`, `update-check.php`
(Webcron) spielt es in den Web-Root. Manuell: Repo-Inhalt in den Web-Root legen, Ordnerstruktur
(`data/`, `vendor/`, `img/`) beibehalten. Pose-Bilder: `img/<id>.webp`, case-sensitive.

## Projektstruktur

```
index.html            App-Struktur, Styling, SVG-Strichmännchen, PWA-Meta
app.js                Laden/Caching, Dashboard, Generator, Player, Zirkel, Statistik, Update
manifest.json         PWA-Manifest
sw.js                 Service Worker (Offline-Cache, Update-Signal)
data/poses.json       74 Posen (58 Mobilität + 16 Kraft), inkl. nameDe/cue
data/routines.json    15 kuratierte Flows
data/workouts.json    7 Kraft-Zirkel (Arbeit/Pause/Runden)
vendor/dexie.min.js   IndexedDB-Wrapper (lokal gevendored, kein CDN)
img/                  Pose-Bilder (img/<id>.webp) + App-Icons
ROADMAP.md            Geplante Features & Ideen
docs/handover.md      Ausführliche Architektur- & Datendoku
docs/uebungen.md      Die 58 Mobilitäts-Posen mit Beschreibung
docs/kraftuebungen.md Kraft-Übungen (Bild-Briefing)
deploy/               update-check.php (Auto-Updater) + Anleitung
tools/check-data.py       CI-Invariantencheck (poseIds & Bilder)
tools/check-poses.py      Abgleich: welche Pose-Bilder fehlen noch?
tools/optimize-images.sh  Bilder lokal verkleinern/komprimieren (en Block)
```

## Bilder pflegen

- **Fehlende finden:** `python3 tools/check-poses.py`.
- **Format:** einfach PNG/JPG nach `img/` hochladen – die GitHub-Action `optimize-images`
  verkleinert auf max. 800 px und wandelt in **WebP** um. Am Rechner: `bash tools/optimize-images.sh`.

## Datenmodell (Kurzform)

**Pose** (`data/poses.json`): `id`, `name`, `nameDe`, `focus[]` (steuert den Generator),
`position`, optional `image` (WebP), `cue` (deutsche Ausführung), SVG-Koordinaten fürs
Strichmännchen; optional `circuitOnly` (nur Kraft) und `loud` (im Leise-Modus ausgeblendet).

**Flow** (`data/routines.json`): `id`, `meta`, `exercises[]` mit `title`, `desc`, `duration`, `poseId`.

**Zirkel** (`data/workouts.json`): `id`, `meta`, `rounds`, `work`, `rest`, `exercises[]` (`poseId`).

> **Invariante:** jede `poseId` in Routinen/Zirkeln muss in `poses.json` existieren (Check: `tools/check-data.py`).

Details, Stolperfallen und Ausbau-Ideen: siehe [`docs/handover.md`](docs/handover.md).

## Lizenz

[MIT](LICENSE)
