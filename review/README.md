# flowbend · Physio-Review-Bereich

Ein **separater, serverseitiger Bereich** (PHP + SQLite), in dem Physiotherapeut:innen
Bild und Beschreibung jeder Übung auf fachliche Genauigkeit prüfen und mit **1–5 Sternen**
bewerten. Der Durchschnitt entscheidet: **ab 3,5 = ok**, darunter landet die Übung auf der
Liste **„muss gearbeitet werden"** (mit den Kommentaren als Arbeitsauftrag).

> Dieser Ordner ist **kein Teil der PWA**. Die App bleibt offline-fähig und backend-frei.
> `review/` wird – wie `deploy/` – **nicht** ins Release-ZIP gepackt, sondern separat per
> SFTP auf das Hosting geladen. So werden die Bewertungen nie von einem App-Update überschrieben.

## Wie es funktioniert

- Liest die Übungen direkt aus der App-Datenquelle `../data/poses.json` und zeigt die Bilder aus `../img/`.
- **Login per persönlichem Code** je Reviewer:in (keine öffentliche Registrierung).
- Pro Übung getrennte Sterne für **Bild** und **Beschreibung** + optionaler Kommentar.
- Eine Bewertung je Person und Übung (spätere Speicherung überschreibt die eigene).
- **Übersicht**: Zählt „muss gearbeitet werden" / „ok" / „noch offen", listet die schlechtesten
  zuerst mit Teil-Schnitten (Bild vs. Beschreibung) und Kommentaren. Admin kann CSV exportieren.

## Einrichtung auf dem Hosting (goneo)

1. **PHP muss laufen** (PHP 8, `pdo_sqlite`). Prüfen wie in `deploy/README.md` beschrieben.
2. Ordner `review/` per **SFTP** in den Webroot laden (neben `index.html`), sodass
   `https://DEINE-DOMAIN/review/` erreichbar ist. `../data` und `../img` liegen dann korrekt daneben.
3. **Ersten Admin-Zugang anlegen:** `config.sample.php` nach **`config.php`** kopieren und mindestens
   einen Admin-Code eintragen (Bootstrap-/Notzugang):
   ```php
   'reviewers' => [
     'a1b2c3d4e5f6a7b8' => ['name' => 'Praxis Leitung', 'admin' => true],
   ],
   ```
   Code zufällig erzeugen: `openssl rand -hex 8`. Weitere Reviewer:innen legst du danach bequem
   **in der App unter „Einstellungen"** an (siehe unten) – kein SFTP mehr nötig.

## Codes verwalten (Einstellungen)

Als Admin gibt es oben den Reiter **„Einstellungen"**:

- **Neue:n Reviewer:in anlegen** (Name + optional Admin) → ein Zugangscode wird erzeugt und
  **einmalig angezeigt** (danach nur noch verschlüsselt gespeichert – nicht wieder anzeigbar).
- Pro Zugang: **Neuer Code** (alten sofort ungültig), **Deaktivieren/Aktivieren**,
  **Admin geben/entziehen**, **Löschen** (bereits abgegebene Bewertungen bleiben erhalten).
- Die Codes aus `config.php` erscheinen als **Notzugang** und lassen sich hier bewusst nicht
  ändern – so kann man sich nie komplett aussperren.

Die in der App verwalteten Codes liegen (nur als Hash) in der SQLite-DB, nicht in `config.php`.
4. **Schreibrechte:** Der Ordner `review/data/` wird beim ersten Aufruf automatisch angelegt
   (dort liegt `reviews.sqlite`). Der Webserver-Nutzer braucht Schreibrecht im `review/`-Ordner.

## Sicherheit

- `config.php` (Codes) und `*.sqlite` (Daten) werden per `.htaccess` vom Web gesperrt; `data/`
  bekommt zusätzlich ein eigenes Deny-`.htaccess`.
- `X-Robots-Tag: noindex` – der Bereich soll nicht in Suchmaschinen auftauchen.
- Login-Cookies sind `HttpOnly`/`SameSite=Lax`, Formulare CSRF-geschützt.
- **`config.php` niemals committen** (steht in `.gitignore`). Codes rotieren, falls einer bekannt wird.
- Empfehlung: den Bereich zusätzlich per HTTPS und ggf. serverseitigem Basic-Auth absichern.

## Datenmodell (SQLite `reviews.sqlite`)

`ratings(pose_id, reviewer_code, reviewer_name, image_score, desc_score, comment, updated_at)`
mit `UNIQUE(pose_id, reviewer_code)` – ein aktueller Datensatz je Person und Übung.
