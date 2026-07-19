<?php
/**
 * Konfiguration des Physio-Review-Bereichs.
 *
 * SETUP: Diese Datei nach `config.php` kopieren und echte Werte eintragen.
 *        `config.php` wird NICHT versioniert (siehe .gitignore) und enthält die Zugangscodes.
 *
 * Codes zufällig & lang wählen, z. B. auf der Shell:  openssl rand -hex 8
 * Genau eine Person darf 'admin' => true haben (sieht Export/Zurücksetzen).
 */
return [
    // Persönliche Zugangscodes je Physiotherapeut:in.
    //   'CODE' => ['name' => 'Anzeigename', 'admin' => false]
    'reviewers' => [
        'CHANGE-ME-admincode' => ['name' => 'Praxisleitung', 'admin' => true],
        // 'a1b2c3d4e5f6a7b8' => ['name' => 'Physio Muster',    'admin' => false],
    ],

    // Durchschnitt ab diesem Wert (über Bild- und Beschreibungs-Sterne) gilt als „ok".
    'threshold' => 3.5,
];
