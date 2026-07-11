# flowbend

**Geführte Dehn-, Mobilitäts- und Kraft-Routinen – komplett im Browser, offline-fähig, ohne Backend.**

flowbend ist eine clientseitige Web-App (PWA). Ausgeliefert werden nur statische Dateien
(HTML/JS/JSON + Bilder); die gesamte Logik läuft im Browser. Kuratierte Routinen und ein
Bereichs-Generator (5/10/15 Min) führen dich mit Timer, Atem-Animation und optionalen
Pose-Bildern durch die Übungen.

<!-- Screenshots folgen -->
<!--
![Dashboard](img/screenshot-dashboard.png)
![Player](img/screenshot-player.png)
-->

## Features

- **15 kuratierte Routinen** mit ausformulierten deutschen Beschreibungen (Aufwachen, Schreibtisch-Reset, Schlaf, Kraft, Rücken, Balance …).
- **Bereichs-Generator:** wähle Körperbereich + Dauer (5/10/15 Min) – flowbend baut on demand ein passendes Programm aus 58 Posen.
- **Offline-fähig:** Service Worker cacht App und Daten; nach dem ersten Laden läuft alles ohne Netz.
- **Pose-Bilder mit Fallback:** liegt kein Bild vor (oder lädt es nicht), wird automatisch ein animiertes SVG-Strichmännchen gezeigt.
- **Streak:** zählt zusammenhängende Trainingstage (lokal im Browser, `localStorage`).
- **Installierbar** als PWA (Manifest + Icon) auf Handy und Desktop.

## Lokal starten

`fetch` funktioniert nicht über `file://` (CORS). Daher über einen lokalen Server öffnen:

```bash
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

## Deployment

flowbend ist eine reine Statik-Seite – einfach den Repo-Inhalt in den Web-Root legen
(z. B. GitHub Pages, goneo, Netlify). Wichtig:

- Ordnerstruktur beibehalten (`data/`, `vendor/`, `img/` neben der `index.html`).
- Pose-Bilder gehören nach `img/` und müssen **exakt** nach der Pose-`id` benannt sein
  (`img/cobra.png` …), Dateinamen sind auf Linux-Hosts **case-sensitive**.

## Projektstruktur

```
index.html          App-Struktur, Styling, SVG-Strichmännchen
app.js              Laden/Caching, Dashboard, Generator, Player
manifest.json       PWA-Manifest
sw.js               Service Worker (Offline-Cache)
data/poses.json     58 Posen (Stammdaten)
data/routines.json  15 kuratierte Routinen
vendor/dexie.min.js IndexedDB-Wrapper (lokal gevendored, kein CDN)
img/                Pose-Bilder (img/<id>.png) + App-Icon
docs/handover.md    Ausführliche Architektur- & Datendoku
docs/uebungen.md    Alle 58 Übungen mit Beschreibung
tools/check-poses.py     Abgleich: welche Pose-Bilder fehlen noch?
tools/optimize-images.sh Bilder lokal verkleinern/komprimieren (en Block)
```

## Bilder pflegen

- **Fehlende Bilder finden:** `python3 tools/check-poses.py` listet alle Posen ohne Bild
  (und Bilder mit falscher Dateiendung).
- **Verkleinern:** Bilder einfach nach `img/` hochladen – die GitHub-Action
  `optimize-images` verkleinert sie automatisch auf max. 800 px und committet sie
  zurück. Am Rechner alternativ `bash tools/optimize-images.sh`.

## Datenmodell (Kurzform)

**Pose** (`data/poses.json`): `id`, `name`, `focus[]` (steuert den Generator),
`position` (standing|kneeling|seated|lying), optional `image`, plus SVG-Koordinaten
für das Fallback-Strichmännchen.

**Routine** (`data/routines.json`): `id`, `meta` (Titel mit Emoji-Präfix),
`exercises[]` mit `title`, `desc`, `duration` (Sek.) und `poseId`.

> **Invariante:** jede `poseId` in `routines.json` muss in `poses.json` existieren.

Details, Stolperfallen und Ausbau-Ideen: siehe [`docs/handover.md`](docs/handover.md).

## Lizenz

[MIT](LICENSE)
