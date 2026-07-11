# Auto-Update via GitHub Releases + Webcron (goneo)

Dieser Ordner ist **kein** Teil der Web-App – er enthält das Deploy-Werkzeug.
Der Release-Workflow (`.github/workflows/release.yml`) packt bewusst nur die
lauffähigen Dateien; `deploy/` landet nicht im Release-ZIP.

## Wie es funktioniert

```
git tag vX.Y.Z  ─►  GitHub Actions baut flowbend.zip  ─►  Release
                                                            │
Webcron (alle 15 min) ─► update-check-*.php ─► vergleicht mit version.txt
                                             └─► bei Unterschied: ZIP in den Webroot entpacken
```

Das Script installiert immer das **jüngste** Release. **Rollback:** defektes
Release auf GitHub löschen – beim nächsten Webcron-Lauf wird automatisch das
vorherige wieder eingespielt.

## Was du auf dem Hosting einrichten musst

1. **Beide Dateien in den Webroot laden** (per SFTP – nicht unverschlüsseltes FTP):
   - `update-check-0559d28e.php`
   - `version.txt`  (Startinhalt `0.0.0`)

   Sie müssen **neben** `index.html` liegen. `$WEBROOT = __DIR__` im Script
   sorgt dafür, dass in genau diesen Ordner entpackt wird.

2. **Schreibrechte:** Der PHP-Prozess muss in den Webroot schreiben dürfen
   (auf goneo i. d. R. gegeben). Test: einmal die URL aufrufen (siehe unten) und
   prüfen, ob `update.log` entsteht.

3. **Webcron anlegen** (goneo-Kundencenter → Webserver → Webcrons):
   - URL: `https://DEINE-DOMAIN/update-check-0559d28e.php?key=fae6c9e121cfb3221f86b4a2e43bf0f5`
   - Intervall: z. B. alle 15 Minuten
   - Der **`?key=`-Parameter ist Pflicht** – ohne ihn antwortet das Script mit 403.

## Sicherheit

- **Dateiname + Key sind Zufallswerte.** Willst du eigene setzen: den Wert von
  `$SECRET_KEY` im Script ändern und die Datei entsprechend umbenennen, dann die
  Webcron-URL anpassen.
- Ändere den Key **nicht** in etwas Erratbares – der Endpoint ist öffentlich erreichbar.
- Optional gegen GitHub-API-Limit (60 Anfragen/h pro IP; bei 15-min-Cron unkritisch):
  ein Read-only-Token in `$GITHUB_TOKEN` eintragen.

## Manuell testen

Im Browser die Webcron-URL (inkl. `?key=...`) aufrufen. Erwartete Ausgaben:
- `Aktuell (vX.Y.Z) – nichts zu tun.`
- `Update auf vX.Y.Z installiert.`
- `403 Forbidden` (falls Key fehlt/falsch)

Details landen in `update.log` im Webroot.

## Voraussetzungen

PHP mit **cURL**- und **ZipArchive**-Erweiterung (auf goneo Standard).
