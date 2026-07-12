<?php
/**
 * flowbend Auto-Update via GitHub Releases
 * -----------------------------------------
 * Wird per Webcron regelmäßig aufgerufen. Vergleicht das jüngste GitHub-Release
 * mit der lokal installierten Version (version.txt) und spielt bei Unterschied
 * das Release-ZIP (flowbend.zip) in den Webroot ein.
 *
 * Rollback: defektes Release auf GitHub löschen -> beim nächsten Lauf ist ein
 * älteres Release wieder "latest" und wird automatisch reinstalliert.
 *
 * Voraussetzungen auf dem Host: PHP mit cURL- und ZipArchive-Erweiterung.
 * Diese Datei + version.txt liegen im Webroot (neben index.html).
 */

// ------------------------- KONFIGURATION -------------------------
$REPO       = 'leotomhal/flowbend';                 // GitHub owner/repo
$ASSET_NAME = 'flowbend.zip';                        // Asset-Name aus dem Workflow
$SECRET_KEY = 'fae6c9e121cfb3221f86b4a2e43bf0f5';    // Aufruf nur mit ?key=... erlaubt
$WEBROOT    = __DIR__;                               // Zielordner = Ordner dieser Datei

// WICHTIG gegen das GitHub-API-Rate-Limit auf Shared-Hosting (gemeinsame IP!):
// hier einen Read-only-Token eintragen. Ohne Token nur 60 Anfragen/Std. pro IP,
// mit Token 5.000/Std. pro Token. Reicht ein "fine-grained"-Token mit
// "Public Repositories (read-only)" bzw. ein klassischer Token ganz ohne Scopes.
$GITHUB_TOKEN = '';
// -----------------------------------------------------------------

header('Content-Type: text/plain; charset=utf-8');

// Zugriffsschutz: ohne korrekten Key kein Zugriff (Endpoint ist öffentlich erreichbar).
if (!hash_equals($SECRET_KEY, (string)($_GET['key'] ?? ''))) {
    http_response_code(403);
    exit("403 Forbidden\n");
}

$logFile     = $WEBROOT . '/update.log';
$versionFile = $WEBROOT . '/version.txt';
$lockFile    = $WEBROOT . '/update.lock';

function logmsg($file, $msg) {
    file_put_contents($file, '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n", FILE_APPEND);
}

// Lock gegen parallele Läufe (z. B. überlappende Webcrons).
$lock = fopen($lockFile, 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit("Läuft bereits – übersprungen.\n");
}

/** GitHub-API-GET (JSON). Liefert [httpCode, body, curlError, responseHeaders]. */
function api_get($url, $token) {
    $ch = curl_init($url);
    $headers = ['User-Agent: flowbend-updater', 'Accept: application/vnd.github+json'];
    if ($token) $headers[] = 'Authorization: Bearer ' . $token;
    $resp = [];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$resp) {
            $p = explode(':', $line, 2);
            if (count($p) === 2) $resp[strtolower(trim($p[0]))] = trim($p[1]);
            return strlen($line);
        },
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    return [$code, $body, $err, $resp];
}

/** Lädt eine URL direkt in eine Datei (streamt, ohne alles in den RAM zu laden).
 *  Kein Authorization-Header: der Asset-Download wird auf einen anderen Host
 *  (objects.githubusercontent.com) umgeleitet und braucht dort keinen Token. */
function download_to($url, $dest) {
    $fp = fopen($dest, 'w');
    if (!$fp) return [0, 'kann Zieldatei nicht schreiben'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_FILE           => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => ['User-Agent: flowbend-updater'],
        CURLOPT_TIMEOUT        => 180,
    ]);
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    fclose($fp);
    return [$code, $err];
}

try {
    if (!class_exists('ZipArchive')) { logmsg($logFile, 'ZipArchive fehlt (PHP-Erweiterung).'); exit("ZipArchive-Erweiterung fehlt.\n"); }

    $localVersion = is_file($versionFile) ? trim(file_get_contents($versionFile)) : '0.0.0';

    // 1) Jüngstes Release abfragen.
    [$code, $body, $err, $resp] = api_get("https://api.github.com/repos/$REPO/releases/latest", $GITHUB_TOKEN);
    if ($code !== 200) {
        $remain  = $resp['x-ratelimit-remaining'] ?? '?';
        $snippet = substr(preg_replace('/\s+/', ' ', (string)$body), 0, 200);
        $hint = ($code === 403 && $remain === '0')
            ? ' -> GitHub-Rate-Limit erschöpft. Bitte $GITHUB_TOKEN setzen.'
            : '';
        logmsg($logFile, "API-Fehler ($code), ratelimit-remaining=$remain, curl='$err': $snippet$hint");
        http_response_code(502);
        exit("API-Fehler: $code (Rate-Limit übrig: $remain)$hint\n$snippet\n");
    }
    $rel = json_decode($body, true);
    $tag = $rel['tag_name'] ?? '';
    if ($tag === '') { logmsg($logFile, 'Kein tag_name im Release.'); exit("Kein Release.\n"); }

    if ($tag === $localVersion) {
        exit("Aktuell ($localVersion) – nichts zu tun.\n");
    }

    // 2) Passendes Asset (flowbend.zip) finden.
    $assetUrl = '';
    foreach (($rel['assets'] ?? []) as $a) {
        if (($a['name'] ?? '') === $ASSET_NAME) { $assetUrl = $a['browser_download_url']; break; }
    }
    if ($assetUrl === '') { logmsg($logFile, "Asset $ASSET_NAME fehlt in $tag."); exit("Asset fehlt.\n"); }

    // 3) ZIP streamen.
    $tmpZip = tempnam(sys_get_temp_dir(), 'fb_') . '.zip';
    [$dcode, $derr] = download_to($assetUrl, $tmpZip);
    if ($dcode !== 200 || !is_file($tmpZip) || filesize($tmpZip) < 100) {
        logmsg($logFile, "Download-Fehler ($dcode) curl='$derr'"); @unlink($tmpZip);
        http_response_code(502); exit("Download-Fehler: $dcode\n");
    }

    // 4) Entpacken – mit Zip-Slip-Schutz (keine Pfade außerhalb des Webroots).
    $zip = new ZipArchive();
    if ($zip->open($tmpZip) !== true) { logmsg($logFile, 'ZIP nicht lesbar.'); @unlink($tmpZip); exit("ZIP defekt.\n"); }

    $rootReal = realpath($WEBROOT);
    $written  = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if ($name === false || strpos($name, '..') !== false) continue; // unsichere Einträge überspringen
        $target = $WEBROOT . '/' . $name;
        if (substr($name, -1) === '/') { @mkdir($target, 0755, true); continue; }
        @mkdir(dirname($target), 0755, true);
        $safe = realpath(dirname($target));
        if ($safe === false || strpos($safe, $rootReal) !== 0) continue; // liegt außerhalb -> ablehnen
        $stream = $zip->getStream($name);
        if ($stream) { file_put_contents($target, stream_get_contents($stream)); fclose($stream); $written++; }
    }
    $zip->close();
    @unlink($tmpZip);

    if ($written === 0) { logmsg($logFile, "Nichts entpackt (0 Dateien) für $tag."); http_response_code(500); exit("Nichts entpackt.\n"); }

    // 5) Neue Version erst nach erfolgreichem Entpacken festschreiben.
    file_put_contents($versionFile, $tag);
    logmsg($logFile, "Update $localVersion -> $tag erfolgreich ($written Dateien).");
    echo "Update auf $tag installiert ($written Dateien).\n";

} catch (Throwable $e) {
    logmsg($logFile, 'Ausnahme: ' . $e->getMessage());
    http_response_code(500);
    echo "Fehler: " . $e->getMessage() . "\n";
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}
