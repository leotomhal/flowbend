# Auto-Update via GitHub Releases + Webcron (goneo)

Dieser Ordner ist **kein** Teil der Web-App – er enthält das Deploy-Werkzeug.
Der Release-Workflow (`.github/workflows/release.yml`) packt bewusst nur die
lauffähigen Dateien; `deploy/` landet nicht im Release-ZIP.

## Wie es funktioniert

```
Release auslösen  ─►  GitHub Actions baut flowbend.zip  ─►  Release
                                                            │
Webcron (alle 15 min) ─► update-check-*.php ─► vergleicht mit version.txt
                                             └─► bei Unterschied: ZIP in den Webroot entpacken
```

Das Script installiert immer das **jüngste** Release. **Rollback:** defektes
Release auf GitHub löschen – beim nächsten Webcron-Lauf wird das vorherige wieder eingespielt.

## Einrichtung auf dem Hosting

1. **Läuft PHP überhaupt?** Zuerst `phptest.php` in den Webroot laden und
   `https://DEINE-DOMAIN/phptest.php` aufrufen. Erwartung: `PHP läuft: 8.x` und
   `cURL: ja`, `ZipArchive: ja`. **Wird stattdessen Quelltext angezeigt oder die
   Datei heruntergeladen, ist PHP für die Domain nicht aktiv** – dann im
   goneo-Kundencenter dem Webspace/der Domain eine **PHP-Version zuweisen** und auf
   eine erzwingende `.htaccess` prüfen. Ohne laufendes PHP kann nichts aktualisiert
   werden. (`phptest.php` nach dem Test wieder löschen.)

2. **Update-Script + version.txt** per **SFTP** in den Webroot laden (neben `index.html`):
   - `update-check-caf55cf9.php`
   - `version.txt` (Startinhalt `0.0.0` – oder leer lassen, dann gilt `0.0.0`)

3. **Webcron anlegen** (goneo-Kundencenter → Webserver → Webcrons):
   - URL: `https://DEINE-DOMAIN/update-check-caf55cf9.php?key=25e4cb46d58e181c1e3f1ca9a6bee0c5`
   - Intervall: z. B. alle 15 Minuten. Der **`?key=` ist Pflicht** (sonst 403).

4. **GitHub-Token setzen** (empfohlen, gegen das Rate-Limit): ohne Token nur
   **60 API-Anfragen/Std. pro IP** – auf Shared-Hosting mit vielen Kunden schnell
   erschöpft (→ 403, Update bleibt stehen). Ein Read-only-Token (fine-grained:
   „Public Repositories (read-only)") in `$GITHUB_TOKEN` hebt das Limit auf 5.000/Std.

## Manuell testen / Diagnose

Die Webcron-URL (inkl. `?key=…`) im Browser aufrufen. Das Script sagt die Ursache:
- `Aktuell (vX.Y.Z) – nichts zu tun.`
- `Update auf vX.Y.Z installiert (N Dateien).`
- `API-Fehler: 403 (Rate-Limit übrig: 0) …` → Token setzen (Schritt 4).
- `403 Forbidden` → Key fehlt/falsch.

Verlauf steht in `update.log` im Webroot.

## Sicherheit

- Dateiname + Key sind Zufallswerte. **War die PHP je als Quelltext abrufbar
  (Download statt Ausführung), ist der Key kompromittiert → Datei umbenennen und
  `$SECRET_KEY` neu setzen**, dann die Webcron-URL anpassen und die alte Datei löschen.
- Key nie in etwas Erratbares ändern – der Endpoint ist öffentlich erreichbar.

## Voraussetzungen

PHP (Version im goneo-Panel zugewiesen) mit **cURL**- und **ZipArchive**-Erweiterung.
