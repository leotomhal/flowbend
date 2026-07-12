<?php
// Mini-Test: läuft PHP auf dieser Domain?
// In den Webroot laden und https://DEINE-DOMAIN/phptest.php aufrufen.
// Erwartung: eine Zeile "PHP läuft: 8.x". Wird stattdessen QUELLTEXT angezeigt
// oder die Datei heruntergeladen, ist PHP für die Domain/den Ordner NICHT aktiv.
header('Content-Type: text/html; charset=utf-8');
header('Content-Disposition: inline');
echo "PHP läuft: " . PHP_VERSION . "\n";
echo "cURL: "       . (function_exists('curl_init') ? "ja" : "NEIN") . "\n";
echo "ZipArchive: " . (class_exists('ZipArchive') ? "ja" : "NEIN") . "\n";
