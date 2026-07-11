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
$GITHUB_TOKEN = '';                                  // optional: erhöht das API-Limit (leer lassen ist ok)
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

/** HTTP-GET via cURL; folgt Redirects, setzt User-Agent (von GitHub verlangt). */
function http_get($url, $token, $binary = false) {
    $ch = curl_init($url);
    $headers = ['User-Agent: flowbend-updater'];
    if ($token) $headers[] = 'Authorization: Bearer ' . $token;
    if (!$binary) $headers[] = 'Accept: application/vnd.github+json';
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 60,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    return [$code, $body, $err];
}

try {
    $localVersion = is_file($versionFile) ? trim(file_get_contents($versionFile)) : '0.0.0';

    // 1) Jüngstes Release abfragen (Drafts/Prereleases werden ignoriert).
    [$code, $body, $err] = http_get("https://api.github.com/repos/$REPO/releases/latest", $GITHUB_TOKEN);
    if ($code !== 200) {
        logmsg($logFile, "API-Fehler ($code): $err");
        exit("API-Fehler: $code\n");
    }
    $rel = json_decode($body, true);
    $tag = $rel['tag_name'] ?? '';
    if ($tag === '') { logmsg($logFile, 'Kein tag_name im Release.'); exit("Kein Release.\n"); }

    if ($tag === $localVersion) {
        exit("Aktuell ($localVersion) – nichts zu tun.\n");
    }

    // 2) Passendes Asset (flowbend.zip) im Release finden.
    $assetUrl = '';
    foreach (($rel['assets'] ?? []) as $a) {
        if (($a['name'] ?? '') === $ASSET_NAME) { $assetUrl = $a['browser_download_url']; break; }
    }
    if ($assetUrl === '') { logmsg($logFile, "Asset $ASSET_NAME fehlt in $tag."); exit("Asset fehlt.\n"); }

    // 3) ZIP herunterladen.
    [$code, $zipData, $err] = http_get($assetUrl, $GITHUB_TOKEN, true);
    if ($code !== 200 || $zipData === '') { logmsg($logFile, "Download-Fehler ($code): $err"); exit("Download-Fehler.\n"); }

    $tmpZip = tempnam(sys_get_temp_dir(), 'fb_') . '.zip';
    file_put_contents($tmpZip, $zipData);

    // 4) Entpacken – mit Zip-Slip-Schutz (keine Pfade außerhalb des Webroots).
    $zip = new ZipArchive();
    if ($zip->open($tmpZip) !== true) { logmsg($logFile, 'ZIP nicht lesbar.'); @unlink($tmpZip); exit("ZIP defekt.\n"); }

    $rootReal = realpath($WEBROOT);
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if ($name === false || strpos($name, '..') !== false) continue; // unsichere Einträge überspringen
        $target = $WEBROOT . '/' . $name;
        if (substr($name, -1) === '/') { @mkdir($target, 0755, true); continue; }
        @mkdir(dirname($target), 0755, true);
        $safe = realpath(dirname($target));
        if ($safe === false || strpos($safe, $rootReal) !== 0) continue; // liegt außerhalb -> ablehnen
        $stream = $zip->getStream($name);
        if ($stream) { file_put_contents($target, stream_get_contents($stream)); fclose($stream); }
    }
    $zip->close();
    @unlink($tmpZip);

    // 5) Neue Version festschreiben.
    file_put_contents($versionFile, $tag);
    logmsg($logFile, "Update $localVersion -> $tag erfolgreich.");
    echo "Update auf $tag installiert.\n";

} catch (Throwable $e) {
    logmsg($logFile, 'Ausnahme: ' . $e->getMessage());
    http_response_code(500);
    echo "Fehler.\n";
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}
