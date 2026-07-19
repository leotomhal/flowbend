<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

/* ---- Aktionen (POST/GET) ---------------------------------------------- */

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$flash  = '';
$flashType = 'ok';

if ($action === 'logout') {
    logout();
    header('Location: index.php');
    exit;
}

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    if (try_login($_POST['code'] ?? '')) {
        header('Location: index.php');
        exit;
    }
    $flash = 'Code nicht erkannt. Bitte prüfen.';
    $flashType = 'err';
}

if ($action === 'rate' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rev = require_login();
    check_csrf();
    $pid = (string) ($_POST['pose_id'] ?? '');
    if (isset(poses_by_id()[$pid])) {
        save_rating(
            $pid,
            $rev,
            norm_score($_POST['image_score'] ?? ''),
            norm_score($_POST['desc_score'] ?? ''),
            (string) ($_POST['comment'] ?? '')
        );
        flash_set('Bewertung gespeichert.');
    } else {
        flash_set('Unbekannte Übung.', 'err');
    }
    // Zurück zur Bewerten-Ansicht, Anker auf die Übung.
    header('Location: index.php?view=rate#pose-' . rawurlencode($pid));
    exit;
}

$reviewer = current_reviewer();

/* ---- Reviewer-Verwaltung (nur Admin) ---- */
if (str_starts_with($action, 'rev_') && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_login();
    if (!$reviewer || !$reviewer['admin']) {
        http_response_code(403);
        exit('Nur für Admins.');
    }
    check_csrf();
    $id = (int) ($_POST['id'] ?? 0);
    switch ($action) {
        case 'rev_add':
            $code = add_reviewer((string) ($_POST['name'] ?? ''), !empty($_POST['is_admin']));
            flash_set('Neuer Code für „' . trim((string) ($_POST['name'] ?? 'Reviewer')) . '": ' . $code, 'code');
            break;
        case 'rev_regen':
            $code = regen_reviewer_code($id);
            flash_set($code ? ('Neuer Code: ' . $code) : 'Reviewer nicht gefunden.', $code ? 'code' : 'err');
            break;
        case 'rev_toggle_active':
            set_reviewer_active($id, (string) ($_POST['to'] ?? '') === '1');
            flash_set('Status aktualisiert.');
            break;
        case 'rev_toggle_admin':
            set_reviewer_admin($id, (string) ($_POST['to'] ?? '') === '1');
            flash_set('Admin-Recht aktualisiert.');
            break;
        case 'rev_delete':
            delete_reviewer($id);
            flash_set('Reviewer:in gelöscht.');
            break;
    }
    header('Location: index.php?view=settings');
    exit;
}

/* Flash aus vorherigem Redirect übernehmen. */
if ($sf = flash_get()) {
    $flash = $sf['m'];
    $flashType = $sf['t'];
}

/* CSV-Export (nur Admin) */
if ($action === 'export' && $reviewer && $reviewer['admin']) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="flowbend-reviews.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['pose_id', 'reviewer_name', 'image_score', 'desc_score', 'comment', 'updated_at']);
    foreach (db()->query('SELECT pose_id, reviewer_name, image_score, desc_score, comment, updated_at FROM ratings ORDER BY pose_id') as $r) {
        fputcsv($out, $r);
    }
    fclose($out);
    exit;
}

$view = $_GET['view'] ?? 'rate';
?>
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>flowbend · Physio-Review</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>

<?php if (!$reviewer): ?>
<!-- ============ Login ============ -->
<main class="login">
    <div class="card login-card">
        <h1>flowbend · Review</h1>
        <p class="sub">Fachliche Prüfung der Übungen für Physiotherapeut:innen.</p>
        <?php if ($flash): ?><p class="flash <?= h($flashType) ?>"><?= h($flash) ?></p><?php endif; ?>
        <form method="post" action="index.php">
            <input type="hidden" name="action" value="login">
            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
            <label for="code">Persönlicher Zugangscode</label>
            <input type="password" id="code" name="code" autocomplete="off" autofocus required>
            <button type="submit" class="btn">Anmelden</button>
        </form>
    </div>
</main>

<?php else: ?>
<!-- ============ Eingeloggt ============ -->
<header class="topbar">
    <div class="brand">flowbend · Review</div>
    <nav>
        <a href="?view=rate" class="<?= $view === 'rate' ? 'active' : '' ?>">Bewerten</a>
        <a href="?view=board" class="<?= $view === 'board' ? 'active' : '' ?>">Übersicht</a>
        <?php if ($reviewer['admin']): ?>
            <a href="?view=settings" class="<?= $view === 'settings' ? 'active' : '' ?>">Einstellungen</a>
        <?php endif; ?>
    </nav>
    <div class="who">
        <span><?= h($reviewer['name']) ?><?= $reviewer['admin'] ? ' · Admin' : '' ?></span>
        <form method="post" action="index.php" class="inline">
            <input type="hidden" name="action" value="logout">
            <button class="link">Abmelden</button>
        </form>
    </div>
</header>

<?php if ($flash): ?><p class="flash <?= h($flashType) ?>"><?= h($flash) ?></p><?php endif; ?>

<?php if ($view === 'settings' && $reviewer['admin']):
    /* ---------- Einstellungen: Codes verwalten ---------- */
    $revs = list_reviewers();
    $cfgReviewers = cfg()['reviewers'] ?? [];
    ?>
    <main class="wrap">
        <section>
            <h2>Neue:n Reviewer:in anlegen</h2>
            <form method="post" action="index.php" class="addrev">
                <input type="hidden" name="action" value="rev_add">
                <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                <input type="text" name="name" placeholder="Name (z. B. Physio Müller)" required>
                <label class="chk"><input type="checkbox" name="is_admin" value="1"> Admin</label>
                <button type="submit" class="btn">Code erzeugen</button>
            </form>
            <p class="hint">Der Zugangscode wird <b>nur einmal</b> nach dem Anlegen angezeigt — gleich kopieren und weitergeben. Er wird nur verschlüsselt gespeichert und lässt sich nicht wieder anzeigen (nur neu erzeugen).</p>
        </section>

        <section>
            <h2>Verwaltete Zugänge (<?= count($revs) ?>)</h2>
            <?php if (!$revs): ?><p class="muted">Noch keine in der App angelegten Reviewer:innen.</p><?php endif; ?>
            <?php foreach ($revs as $r): ?>
                <div class="revrow <?= $r['active'] ? '' : 'inactive' ?>">
                    <div class="revinfo">
                        <b><?= h($r['name']) ?></b>
                        <?php if ($r['is_admin']): ?><span class="tag admin">Admin</span><?php endif; ?>
                        <?php if (!$r['active']): ?><span class="tag off">deaktiviert</span><?php endif; ?>
                        <small>angelegt <?= h(substr((string) $r['created_at'], 0, 10)) ?><?= $r['last_login'] ? ' · zuletzt aktiv ' . h(substr((string) $r['last_login'], 0, 10)) : ' · noch nie angemeldet' ?></small>
                    </div>
                    <div class="revactions">
                        <form method="post" action="index.php" onsubmit="return confirm('Neuen Code erzeugen? Der alte wird sofort ungültig.')">
                            <input type="hidden" name="action" value="rev_regen">
                            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                            <input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
                            <button class="link">Neuer Code</button>
                        </form>
                        <form method="post" action="index.php">
                            <input type="hidden" name="action" value="rev_toggle_active">
                            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                            <input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
                            <input type="hidden" name="to" value="<?= $r['active'] ? '0' : '1' ?>">
                            <button class="link"><?= $r['active'] ? 'Deaktivieren' : 'Aktivieren' ?></button>
                        </form>
                        <form method="post" action="index.php">
                            <input type="hidden" name="action" value="rev_toggle_admin">
                            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                            <input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
                            <input type="hidden" name="to" value="<?= $r['is_admin'] ? '0' : '1' ?>">
                            <button class="link"><?= $r['is_admin'] ? 'Admin entziehen' : 'Zu Admin' ?></button>
                        </form>
                        <form method="post" action="index.php" onsubmit="return confirm('Reviewer:in wirklich löschen? Bereits abgegebene Bewertungen bleiben erhalten.')">
                            <input type="hidden" name="action" value="rev_delete">
                            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                            <input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
                            <button class="link danger">Löschen</button>
                        </form>
                    </div>
                </div>
            <?php endforeach; ?>
        </section>

        <section>
            <h2>Notzugang aus <code>config.php</code></h2>
            <p class="hint">Diese Codes sind fest in der Datei hinterlegt und dienen als Bootstrap/Notzugang. Sie lassen sich hier <b>nicht</b> ändern (nur per SFTP in <code>config.php</code>) — so sperrst du dich nie komplett aus.</p>
            <div class="chips">
                <?php foreach ($cfgReviewers as $meta): $nm = is_array($meta) ? ($meta['name'] ?? 'Reviewer') : (string) $meta; $ad = is_array($meta) ? !empty($meta['admin']) : false; ?>
                    <span class="chip"><?= h($nm) ?><?= $ad ? ' · Admin' : '' ?></span>
                <?php endforeach; ?>
            </div>
        </section>
    </main>

<?php elseif ($view === 'board'):
    /* ---------- Übersichts-Board ---------- */
    $stats = pose_stats();
    $byId  = poses_by_id();
    $buckets = ['todo' => [], 'ok' => [], 'open' => []];
    foreach ($stats as $pid => $s) {
        $buckets[$s['status']][] = $pid;
    }
    // „todo" nach schlechtestem Schnitt zuerst.
    usort($buckets['todo'], fn($a, $b) => ($stats[$a]['overall'] <=> $stats[$b]['overall']));
    $threshold = (float) (cfg()['threshold'] ?? 3.5);
    ?>
    <main class="wrap">
        <div class="summary">
            <div class="sbox todo"><b><?= count($buckets['todo']) ?></b><span>muss gearbeitet werden</span></div>
            <div class="sbox ok"><b><?= count($buckets['ok']) ?></b><span>ok (≥ <?= rtrim(rtrim(number_format($threshold, 1, ',', ''), '0'), ',') ?>)</span></div>
            <div class="sbox open"><b><?= count($buckets['open']) ?></b><span>noch offen</span></div>
        </div>

        <section>
            <h2>🛠️ Muss gearbeitet werden</h2>
            <?php if (!$buckets['todo']): ?>
                <p class="muted">Nichts unter der Schwelle — alles Bewertete ist ok. 👍</p>
            <?php endif; ?>
            <?php foreach ($buckets['todo'] as $pid): $s = $stats[$pid]; $p = $byId[$pid] ?? []; ?>
                <div class="row">
                    <div class="thumb"><?php if (!empty($p['image'])): ?><img src="../<?= h($p['image']) ?>" alt=""><?php else: ?><span class="noimg">kein Foto</span><?php endif; ?></div>
                    <div class="rowmain">
                        <div class="rowtop">
                            <b><?= h($p['nameDe'] ?? $p['name'] ?? $pid) ?></b>
                            <span class="score bad"><?= number_format((float) $s['overall'], 1, ',', '') ?> ★</span>
                        </div>
                        <div class="metrics">
                            Bild: <?= $s['avg_image'] !== null ? number_format($s['avg_image'], 1, ',', '') . ' ★' : '–' ?>
                            · Beschreibung: <?= $s['avg_desc'] !== null ? number_format($s['avg_desc'], 1, ',', '') . ' ★' : '–' ?>
                            · <?= (int) $s['reviewers'] ?> Bewertung(en)
                        </div>
                        <?php foreach (comments_for($pid) as $c): ?>
                            <div class="comment">„<?= h($c['comment']) ?>" <span class="cby">— <?= h($c['reviewer_name']) ?></span></div>
                        <?php endforeach; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        </section>

        <section>
            <h2>✅ Ok</h2>
            <?php if (!$buckets['ok']): ?><p class="muted">Noch nichts über der Schwelle.</p><?php endif; ?>
            <div class="chips">
                <?php foreach ($buckets['ok'] as $pid): $s = $stats[$pid]; $p = $byId[$pid] ?? []; ?>
                    <span class="chip ok"><?= h($p['nameDe'] ?? $pid) ?> · <?= number_format((float) $s['overall'], 1, ',', '') ?>★</span>
                <?php endforeach; ?>
            </div>
        </section>

        <section>
            <h2>⏳ Noch nicht bewertet (<?= count($buckets['open']) ?>)</h2>
            <div class="chips">
                <?php foreach ($buckets['open'] as $pid): $p = $byId[$pid] ?? []; ?>
                    <span class="chip open"><?= h($p['nameDe'] ?? $pid) ?></span>
                <?php endforeach; ?>
            </div>
        </section>

        <?php if ($reviewer['admin']): ?>
            <section><a class="btn ghost" href="?action=export">CSV exportieren</a></section>
        <?php endif; ?>
    </main>

<?php else:
    /* ---------- Bewerten ---------- */
    $stats = pose_stats();
    ?>
    <main class="wrap">
        <p class="intro">Bitte je Übung <b>Bild</b> und <b>Beschreibung</b> auf fachliche Genauigkeit bewerten (1–5 Sterne). „k. A." lässt den Wert offen. Kommentar hilft bei niedrigen Wertungen.</p>
        <?php foreach (poses() as $p):
            $pid = $p['id'];
            $mine = my_rating($pid, $reviewer['code']);
            $s = $stats[$pid] ?? null;
            ?>
            <div class="card pose" id="pose-<?= h($pid) ?>">
                <div class="pose-head">
                    <div class="thumb big"><?php if (!empty($p['image'])): ?><img src="../<?= h($p['image']) ?>" alt="" loading="lazy"><?php else: ?><span class="noimg">kein Foto<br>(Strichmännchen<br>in der App)</span><?php endif; ?></div>
                    <div>
                        <h3><?= h($p['nameDe'] ?? $p['name'] ?? $pid) ?> <small><?= h($p['name'] ?? '') ?></small></h3>
                        <p class="cue"><?= h($p['cue'] ?? '—') ?></p>
                        <p class="meta"><?= h($p['position'] ?? '') ?><?= !empty($p['circuitOnly']) ? ' · Kraft' : '' ?>
                            <?php if ($s && $s['overall'] !== null): ?>
                                · Schnitt <b class="<?= $s['status'] === 'todo' ? 'bad' : 'good' ?>"><?= number_format((float) $s['overall'], 1, ',', '') ?>★</b> (<?= (int) $s['reviewers'] ?>)
                            <?php endif; ?>
                            <?php if ($mine): ?><span class="mine">· von dir bewertet</span><?php endif; ?>
                        </p>
                    </div>
                </div>
                <form method="post" action="index.php" class="rateform">
                    <input type="hidden" name="action" value="rate">
                    <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                    <input type="hidden" name="pose_id" value="<?= h($pid) ?>">
                    <div class="fields">
                        <div class="field"><span class="flabel">Bild</span><?= star_input('image_score', $mine['image_score'] ?? null, $pid) ?></div>
                        <div class="field"><span class="flabel">Beschreibung</span><?= star_input('desc_score', $mine['desc_score'] ?? null, $pid) ?></div>
                    </div>
                    <textarea name="comment" rows="2" placeholder="Kommentar (optional): was ist ungenau?"><?= h($mine['comment'] ?? '') ?></textarea>
                    <button type="submit" class="btn">Speichern</button>
                </form>
            </div>
        <?php endforeach; ?>
    </main>
<?php endif; ?>

<?php endif; ?>
</body>
</html>
