<?php
declare(strict_types=1);

/* Gemeinsame Helfer für den Physio-Review-Bereich.
   Reine PHP-Datei ohne Ausgabe (wird von index.php eingebunden). */

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

const POSES_FILE = __DIR__ . '/../data/poses.json';
const DATA_DIR   = __DIR__ . '/data';

/** Konfiguration laden (einmalig). */
function cfg(): array
{
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/config.php';
        if (!is_file($f)) {
            http_response_code(500);
            exit('config.php fehlt – bitte config.sample.php nach config.php kopieren und ausfüllen.');
        }
        $c = require $f;
    }
    return $c;
}

/** SQLite-Verbindung (Datei wird bei Bedarf angelegt) + Schema. */
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        if (!is_dir(DATA_DIR)) {
            mkdir(DATA_DIR, 0775, true);
        }
        // Datenverzeichnis zusätzlich per .htaccess sperren (falls oberes .htaccess ignoriert wird).
        $ht = DATA_DIR . '/.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "Require all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
        }
        $pdo = new PDO('sqlite:' . DATA_DIR . '/reviews.sqlite');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('CREATE TABLE IF NOT EXISTS ratings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            pose_id       TEXT NOT NULL,
            reviewer_code TEXT NOT NULL,
            reviewer_name TEXT NOT NULL,
            image_score   INTEGER,
            desc_score    INTEGER,
            comment       TEXT,
            updated_at    TEXT NOT NULL,
            UNIQUE(pose_id, reviewer_code)
        )');
    }
    return $pdo;
}

/** Übungen aus der App-Datenquelle (poses.json). */
function poses(): array
{
    static $p = null;
    if ($p === null) {
        $raw = @file_get_contents(POSES_FILE);
        $p = $raw ? json_decode($raw, true) : [];
        if (!is_array($p)) {
            $p = [];
        }
    }
    return $p;
}

/** Übungen als id => Datensatz. */
function poses_by_id(): array
{
    static $m = null;
    if ($m === null) {
        $m = [];
        foreach (poses() as $p) {
            if (!empty($p['id'])) {
                $m[$p['id']] = $p;
            }
        }
    }
    return $m;
}

/** Aktuell eingeloggte Reviewer:in oder null. */
function current_reviewer(): ?array
{
    if (!empty($_SESSION['rev_code'])) {
        return [
            'code'  => $_SESSION['rev_code'],
            'name'  => $_SESSION['rev_name'] ?? '',
            'admin' => !empty($_SESSION['rev_admin']),
        ];
    }
    return null;
}

function require_login(): array
{
    $r = current_reviewer();
    if (!$r) {
        header('Location: index.php');
        exit;
    }
    return $r;
}

/** Login per persönlichem Code. Gibt true bei Erfolg. */
function try_login(string $code): bool
{
    $code = trim($code);
    $reviewers = cfg()['reviewers'] ?? [];
    // Konstante-Zeit-Vergleich gegen alle Codes (kein Timing-Leak über die Länge).
    $matchName = null;
    $matchAdmin = false;
    $matchCode = null;
    foreach ($reviewers as $c => $meta) {
        if (hash_equals((string) $c, $code)) {
            $matchName = is_array($meta) ? ($meta['name'] ?? 'Reviewer') : (string) $meta;
            $matchAdmin = is_array($meta) ? !empty($meta['admin']) : false;
            $matchCode = (string) $c;
        }
    }
    if ($matchCode === null) {
        return false;
    }
    session_regenerate_id(true);
    $_SESSION['rev_code']  = $matchCode;
    $_SESSION['rev_name']  = $matchName;
    $_SESSION['rev_admin'] = $matchAdmin;
    return true;
}

function logout(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function check_csrf(): void
{
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
        http_response_code(400);
        exit('Ungültiges Formular (CSRF-Token).');
    }
}

/** Score aus dem Formular normalisieren: 1..5 oder null. */
function norm_score($v): ?int
{
    if ($v === '' || $v === null) {
        return null;
    }
    $n = (int) $v;
    return ($n >= 1 && $n <= 5) ? $n : null;
}

/** Bewertung speichern/aktualisieren (ein Datensatz je Reviewer:in und Übung). */
function save_rating(string $poseId, array $rev, ?int $img, ?int $desc, string $comment): void
{
    $comment = trim(mb_substr($comment, 0, 1000));
    $stmt = db()->prepare(
        'INSERT INTO ratings (pose_id, reviewer_code, reviewer_name, image_score, desc_score, comment, updated_at)
         VALUES (:pid, :code, :name, :img, :desc, :comment, :ts)
         ON CONFLICT(pose_id, reviewer_code) DO UPDATE SET
            image_score   = excluded.image_score,
            desc_score    = excluded.desc_score,
            comment       = excluded.comment,
            reviewer_name = excluded.reviewer_name,
            updated_at    = excluded.updated_at'
    );
    $stmt->execute([
        ':pid'     => $poseId,
        ':code'    => $rev['code'],
        ':name'    => $rev['name'],
        ':img'     => $img,
        ':desc'    => $desc,
        ':comment' => $comment,
        ':ts'      => date('c'),
    ]);
}

/** Bewertung dieser Reviewer:in für eine Übung (oder null). */
function my_rating(string $poseId, string $code): ?array
{
    $stmt = db()->prepare('SELECT image_score, desc_score, comment FROM ratings WHERE pose_id = :p AND reviewer_code = :c');
    $stmt->execute([':p' => $poseId, ':c' => $code]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Aggregierte Statistik je Übung.
 * overall = Mittel aller einzelnen Sterne (Bild + Beschreibung zusammen).
 * status  = 'todo' (bewertet, overall < Schwelle) | 'ok' (>= Schwelle) | 'open' (noch keine Bewertung)
 */
function pose_stats(): array
{
    $threshold = (float) (cfg()['threshold'] ?? 3.5);
    $rows = db()->query(
        'SELECT pose_id,
                AVG(image_score) AS ai, COUNT(image_score) AS ni,
                AVG(desc_score)  AS ad, COUNT(desc_score)  AS nd,
                COUNT(*)         AS nrev
         FROM ratings GROUP BY pose_id'
    )->fetchAll();

    $agg = [];
    foreach ($rows as $r) {
        $ni = (int) $r['ni'];
        $nd = (int) $r['nd'];
        $sumScores = ($r['ai'] ?? 0) * $ni + ($r['ad'] ?? 0) * $nd;
        $cntScores = $ni + $nd;
        $overall = $cntScores > 0 ? $sumScores / $cntScores : null;
        $agg[$r['pose_id']] = [
            'avg_image' => $ni > 0 ? (float) $r['ai'] : null,
            'n_image'   => $ni,
            'avg_desc'  => $nd > 0 ? (float) $r['ad'] : null,
            'n_desc'    => $nd,
            'overall'   => $overall,
            'reviewers' => (int) $r['nrev'],
            'status'    => $overall === null ? 'open' : ($overall >= $threshold ? 'ok' : 'todo'),
        ];
    }
    // Übungen ganz ohne Bewertung ergänzen.
    foreach (poses() as $p) {
        $id = $p['id'] ?? null;
        if ($id && !isset($agg[$id])) {
            $agg[$id] = ['avg_image' => null, 'n_image' => 0, 'avg_desc' => null, 'n_desc' => 0, 'overall' => null, 'reviewers' => 0, 'status' => 'open'];
        }
    }
    return $agg;
}

/** Kommentare zu einer Übung (neueste zuerst). */
function comments_for(string $poseId): array
{
    $stmt = db()->prepare(
        "SELECT reviewer_name, image_score, desc_score, comment, updated_at
         FROM ratings WHERE pose_id = :p AND comment <> '' ORDER BY updated_at DESC"
    );
    $stmt->execute([':p' => $poseId]);
    return $stmt->fetchAll();
}

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

/** Sterne-Auswahl (Radio-Buttons 1..5 + „keine Angabe").
    $uid macht die Element-ids dokumentweit eindeutig (eine Karte je Übung). */
function star_input(string $field, ?int $current, string $uid): string
{
    $safe = preg_replace('/[^A-Za-z0-9_-]/', '', $uid);
    $out = '<div class="stars" role="radiogroup">';
    for ($i = 5; $i >= 1; $i--) {
        $id = $field . '_' . $safe . '_' . $i;
        $checked = ($current === $i) ? ' checked' : '';
        $out .= "<input type=\"radio\" id=\"{$id}\" name=\"{$field}\" value=\"{$i}\"{$checked}>";
        $out .= "<label for=\"{$id}\" title=\"{$i} von 5\">★</label>";
    }
    $naChecked = ($current === null) ? ' checked' : '';
    $out .= "<label class=\"na\"><input type=\"radio\" name=\"{$field}\" value=\"\"{$naChecked}> k. A.</label>";
    $out .= '</div>';
    return $out;
}
