# flowbend – Roadmap

Leitplanken: flowbend bleibt eine **clientseitige PWA** – offline-fähig, ohne Backend-Laufzeit,
ohne Tracking, Daten bleiben lokal im Browser. Features werden daran gemessen, ob sie in diesem
Rahmen funktionieren.

**Legende:** ✅ erledigt · 🔜 als Nächstes · 🧩 geplant · 💡 Idee

---

## ✅ Bereits ausgeliefert (v1.0.0 – v1.2.2)

- Rebrand ZenFlow → flowbend, lokal gevendortes Dexie, README/Doku
- **PWA**: Manifest, Service Worker (offline), installierbar, eigenes App-Icon (Android/iOS)
- **Auto-Update**: GitHub-Release-Pipeline + `update-check.php` (goneo-Webcron)
- **Bilder**: Pose-Bilder als WebP, auto-Optimierung geänderter Bilder per Action
- **Player**: Screen Wake Lock, zeitstempel-basierter Timer, „Bereit machen"-Phase,
  einseitige Posen automatisch beidseitig (rechts/links, gespiegelt), Übungszähler,
  Zurück/Weiter, Abschluss-Ansicht, Ton-/Vibrations-Schalter
- **Inhalt**: deutsche Namen + Ausführungs-Cues in generierten Programmen
- **Komfort**: gemerkte Dauer, Dark Mode, Atem-Pacing (4 s ein / 6 s aus)
- **Qualität**: Daten-Invariantencheck (CI), Abgleichs-Tool für fehlende Bilder
- **Update**: In-App-Update mit Nachfrage + Versionsanzeige, Auto-Stempelung im Release (v1.0.9)
- **Verlauf & Vorschlag**: Statistik-Ansicht (Heatmap, Streak, Rekord) + adaptiver
  „Was heute?"-Vorschlag aus dem lokalen Verlauf (v1.1.0)
- **Kraft-Modus**: Umschalter Beweglichkeit/Kraft, getimte Zirkel (Arbeit/Pause/Runden),
  Zirkel-Generator (Dauer/Intensität), 6 neue Kraft-Übungen (v1.2.0);
  **Leise-Modus** („Nachbarn nicht ärgern") blendet laute Übungen aus (v1.2.1)

---

## 🔜 Als Nächstes

### Routinen teilen per Link
Eigene/aktuelle Routine komprimiert im URL-Hash – Empfänger spielt sie ohne Konto ab.
**Aufwand: klein–mittel · Wirkung: hoch.**

---

## 🧩 Geplant (offener Backlog)

### Player / UX
- **Eigener Routinen-Builder**: Posen wählen, Reihenfolge & Dauer setzen, lokal speichern.
  ⚠️ Getrennte Stores (`userRoutines`/`userPoses`), die der Sync **nicht** leert (sonst löscht `clear()` sie).
- **Favoriten & „zuletzt genutzt"** auf dem Dashboard.
- **Einstellungen-Ansicht**: Haltezeit, Prep-Länge, Signale – zentral statt verstreut.
- **Variable Haltezeiten** je Pose/Typ (`holdSeconds`): Entspannung länger, Kraft kürzer.
- **Abwechslung im Generator**: Shuffle innerhalb der Positionsgruppen (aktuell deterministisch).
- **Warm-up/Cool-down** automatisch vor-/anhängen.

### Inhalt
- Mehr kuratierte Routinen & thematische Programme.
- SVG-Strichmännchen-Koordinaten visuell nachjustieren (v. a. Planks/Side Plank).

### Personalisierung & Daten
- **Backup/Export & Import** von Verlauf und eigenen Routinen als JSON-Datei.
- **Erinnerungen ohne Push-Backend**: `.ics`-Kalendereintrag zum selbst Abonnieren.

### Community
- **Übungs-Vorschläge** (Formular → `suggest.php` → GitHub-Issue als Review-Panel).
  MVP ist skizziert (`docs/`), KI-Anreicherung als spätere Stufe.

### Infrastruktur / Qualität
- **Maskable-Icon** mit eigener Safe-Zone-Variante feinschleifen.
- **Wake-Lock-Fallback** (unsichtbares Loop-Video) für ältere/zickige Browser.
- **GitHub Pages** als öffentliche Test-/Demo-Instanz.
- **i18n**: Deutsch/Englisch umschaltbar für größere Reichweite.

---

## 💡 Fünf coole neue Ideen

### 1. Routinen teilen per Link (ohne Backend)
Eine eigene Routine wird **komprimiert in den URL-Hash** kodiert (`bend.fitmitbauch.de/#r=…`).
Wer den Link öffnet, bekommt genau diese Routine – kein Server, kein Konto. Perfekt zum Teilen
mit Freund:innen oder als „heute mit mir mitmachen"-Link.

### 2. „Was heute?" – adaptiver Vorschlag ✅ (v1.1.0)
Umgesetzt: lernt aus dem lokalen Verlauf (vernachlässigter Bereich + Tageszeit) und schlägt
oben auf dem Dashboard ein passendes Programm vor, mit Begründung und 🔀 für Alternativen.

### 3. Vollbild-Atem-Modus („Breath Orb")
Ein eigener Zen-Modus mit einer schön animierten Atemkugel, die sich im 4/6-Rhythmus weitet und
zusammenzieht – optional mit **generativem Ambient-Sound aus der WebAudio-API** (keine Audiodateien,
offline). Auch als eigenständige „1 Minute durchatmen"-Kachel.

### 4. Teilbare Fortschritts-Karte
Nach einer Session (oder für die Streak) wird per **Canvas eine hübsche Zusammenfassungs-Karte**
gerendert (Übungen · Minuten · 🔥 Streak · Badge) und lässt sich als Bild speichern/teilen –
Motivation zum Weitermachen, ganz ohne Social-Backend.

### 5. Tägliche Challenge
Ein **datums-gesätes** Mini-Programm (`Seed = Datum`): alle bekommen am selben Tag dieselbe
kurze Challenge, deterministisch erzeugt – ein täglicher Anreiz, ohne dass irgendwo ein Server
etwas ausspielen muss.

---

## 🚫 Bewusst kein Ziel

- Kein Nutzer-Tracking / keine Analytics-Dienste.
- Keine Pflicht-Accounts, keine Cloud-Speicherung von Trainingsdaten.
- Keine schweren Frameworks – die App bleibt schlank und in Vanilla-JS wartbar.

_Reihenfolge und Umfang sind Richtwerte, keine Zusagen. Vorschläge willkommen – gern als Issue._
