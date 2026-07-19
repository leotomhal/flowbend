const db = new Dexie("FlowbendDatabase");
db.version(1).stores({ poses: "id", routines: "id" });
db.version(2).stores({ poses: "id", routines: "id", workouts: "id" }); // Kraft-Zirkel

// --- Datenquelle (einzige Quelle der Wahrheit) ---
// Statisches Hosting: relative Dateien im data/-Ordner neben der index.html.
// Echte API: absolute URL eintragen, z. B. "https://example.com/api/poses.json".
const POSES_URL = "data/poses.json";
const ROUTINES_URL = "data/routines.json";
const WORKOUTS_URL = "data/workouts.json";
const HISTORY_KEY = "fb_history";

// Modus (Beweglichkeit / Kraft) + Intensität für generierte Zirkel.
let mode = localStorage.getItem("fb_mode") || "flow";              // "flow" | "strength"
let selectedIntensity = localStorage.getItem("fb_intensity") || "mittel";
let quietMode = localStorage.getItem("fb_quiet") === "1";          // "Nachbarn nicht ärgern": laute Übungen raus
const INTENSITY = { leicht: { work: 30, rest: 20 }, mittel: { work: 35, rest: 12 }, intensiv: { work: 40, rest: 10 } };

let currentRoutine = null, currentExIndex = 0, timeLeft = 0, timerId = null, isPaused = false;
let selectedMinutes = Number(localStorage.getItem("fb_minutes")) || 10;
let cuesOn = localStorage.getItem("fb_cues") !== "0"; // Ton + Vibration (Standard: an)

// Player-Zustand (zeitstempel-basiert, damit der Timer auch nach Bildschirm-Sleep stimmt).
const PREP_SECONDS = 5;    // "Bereit machen" vor jeder Übung
const SWITCH_SECONDS = 2;  // kürzere Vorbereitung beim Seitenwechsel (rechts -> links)
let phase = "hold";       // "prep" | "hold"
let phaseEndsAt = 0;      // Ziel-Endzeitpunkt der aktuellen Phase (ms)
let pausedRemaining = 0;  // Restzeit beim Pausieren (ms)
let currentEx = null;     // aktuell laufende (evtl. seiten-spezifische) Übung
let wakeLock = null;      // Screen Wake Lock
let breathId = null, breathBase = 0; // Atem-Pacing (Einatmen/Ausatmen)

// Einseitige Posen: im Ablauf automatisch beide Seiten (rechts + links), zweite gespiegelt.
const BILATERAL = new Set([
  "warrior1", "warrior2", "tree", "halfMoon", "quadStretch", "lateralLunge",
  "sideStretch", "standingSideReach", "standingTwist", "neckStretch", "lowLunge",
  "gatePose", "threadNeedle", "birdDog", "seatedTwist", "seatedSideStretch",
  "seatedNeckStretch", "headToKnee", "cowFaceArms", "eaglePrep", "lyingTwist", "sidePlank",
  "reverseLunge", "gluteKickback"
]);

// Auswahl der Bereiche fürs Dashboard (deutsches Label -> focus-Tag).
// Nur Bereiche mit ausreichender Posenzahl; dünne Tags (wrists, calves ...) bewusst weggelassen.
const AREAS = [
  { label: "Rücken", tag: "back" },
  { label: "Nacken", tag: "neck" },
  { label: "Schultern", tag: "shoulders" },
  { label: "Brust", tag: "chest" },
  { label: "Core", tag: "core" },
  { label: "Kraft", tag: "strength" },
  { label: "Hüften", tag: "hips" },
  { label: "Beine", tag: "legs" },
  { label: "Balance", tag: "balance" },
  { label: "Entspannung", tag: "relaxation" }
];
const POSITION_RANK = { standing: 0, kneeling: 1, seated: 2, lying: 3 };
const BASE_HOLD = 40; // Sekunden pro Übung (Zielwert)

// Tages-Challenge: datums-gesätes Mini-Programm – alle bekommen am selben Tag
// dieselbe Auswahl, komplett deterministisch (kein Server, keine Zufallszahl).
const CHALLENGE_KEY = "fb_challenge"; // erledigte Challenge-Tage (Midnight-Timestamps)
const CHALLENGE_SLOTS = 6;            // Übungen pro Challenge
const CHALLENGE_HOLD = 45;            // Haltezeit je Übung (~5 Min inkl. Prep)

async function initApp() {
  const statusEl = document.getElementById("db-status");
  try {
    statusEl.innerText = "Lade Daten...";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const [resPoses, resRoutines, resWorkouts] = await Promise.all([
      fetch(POSES_URL, { signal: controller.signal }),
      fetch(ROUTINES_URL, { signal: controller.signal }),
      fetch(WORKOUTS_URL, { signal: controller.signal })
    ]);
    clearTimeout(timeoutId);
    if (!resPoses.ok || !resRoutines.ok || !resWorkouts.ok) throw new Error("HTTP " + resPoses.status + "/" + resRoutines.status + "/" + resWorkouts.status);
    await db.poses.clear(); await db.routines.clear(); await db.workouts.clear();
    await db.poses.bulkAdd(await resPoses.json());
    await db.routines.bulkAdd(await resRoutines.json());
    await db.workouts.bulkAdd(await resWorkouts.json());
    statusEl.innerText = "Aktualisiert (Online)";
  } catch (e) {
    // Server nicht erreichbar: vorhandenen Offline-Cache (IndexedDB) nutzen, falls vorhanden.
    const cached = (await db.poses.count() > 0) && (await db.routines.count() > 0);
    statusEl.innerText = cached
      ? "Offline-Modus (lokaler Cache)"
      : "Keine Daten verfuegbar – bitte einmal online laden";
  }
  renderDashboardFromDB(); buildAreaUI(); updateStreak(); updateCueButton(); renderChallenge();
  document.getElementById("app-version").innerText = "v" + APP_VERSION;
  wireModeUI(); setMode(mode); // Sektion (Beweglichkeit/Kraft) + Vorschlag
}

// Genau eine Vollbild-Ansicht sichtbar schalten.
const VIEWS = ["dashboard-view", "player-view", "disclaimer-view", "done-view", "stats-view", "breath-view"];
function showView(id) {
  VIEWS.forEach(v => { document.getElementById(v).style.display = (v === id) ? "flex" : "none"; });
  updateBannerVisibility(); // Update-Hinweis nur auf dem Dashboard zeigen
}

// Medizinischer Hinweis / Disclaimer – nur über den Footer-Link erreichbar, kein Zwangshinweis.
function showDisclaimer() { showView("disclaimer-view"); }
function hideDisclaimer() { showView("dashboard-view"); }

async function renderDashboardFromDB() {
  const container = document.querySelector(".routine-list"); container.innerHTML = "";
  (await db.routines.toArray()).forEach(r => {
    const mins = Math.round(r.exercises.reduce((sum, ex) => sum + ex.duration, 0) / 60);
    const title = r.meta.replace(/^\s*\S+\s+/, ""); // Emoji-Praefix robust entfernen
    const card = document.createElement("div"); card.className = "routine-card";
    card.setAttribute("onclick", `startRoutine('${r.id}')`);
    card.innerHTML = `<div class="routine-info"><h3>${title}</h3><p>${r.exercises.length} Uebungen • ca. ${mins} Min</p></div><div style="color:var(--accent-warm);">➔</div>`;
    container.appendChild(card);
  });
}

async function buildAreaUI() {
  const poses = await db.poses.toArray();
  const grid = document.getElementById("area-grid"); grid.innerHTML = "";
  AREAS.forEach(a => {
    const n = poses.filter(p => !p.circuitOnly && Array.isArray(p.focus) && p.focus.includes(a.tag)).length;
    if (!n) return;
    const b = document.createElement("button");
    b.className = "area-btn";
    b.innerHTML = `${a.label}<small>${n} Posen</small>`;
    b.onclick = () => startArea(a.tag, a.label, selectedMinutes);
    grid.appendChild(b);
  });
  document.querySelectorAll("#duration-toggle button").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.min) === selectedMinutes); // gespeicherte Dauer markieren
    btn.onclick = () => {
      selectedMinutes = Number(btn.dataset.min);
      localStorage.setItem("fb_minutes", selectedMinutes);
      document.querySelectorAll("#duration-toggle button").forEach(x => x.classList.toggle("active", x === btn));
      updateGenSub();
    };
  });
}

// Baut on demand ein Programm aus allen Posen eines Bereichs und startet es.
async function startArea(tag, label, minutes) {
  const poses = await db.poses.toArray();
  const pool = poses.filter(p => !p.circuitOnly && Array.isArray(p.focus) && p.focus.includes(tag));
  if (!pool.length) { alert("Für diesen Bereich sind keine Posen vorhanden."); return; }
  // Reihenfolge: stehend -> knien -> sitzen -> liegen (Aufwärm- zu Ausklang-Bogen).
  // Innerhalb jeder Positionsgruppe mischen -> jede Session variiert, der Bogen bleibt.
  const groups = {};
  pool.forEach(p => { const r = POSITION_RANK[p.position] ?? 9; (groups[r] ||= []).push(p); });
  const ordered = Object.keys(groups).sort((a, b) => a - b).flatMap(k => shuffle(groups[k]));
  pool.length = 0; pool.push(...ordered);

  const target = minutes * 60;
  const slots = Math.max(3, Math.round(target / BASE_HOLD));
  // Prep-Zeit aus dem Ziel herausrechnen, damit Halten + Vorbereitung ~ Zielzeit ergibt.
  const holdBudget = Math.max(slots * 10, target - slots * PREP_SECONDS);
  const per = Math.floor(holdBudget / slots);
  const durations = Array(slots).fill(per);
  for (let i = 0; i < holdBudget - per * slots; i++) durations[i] += 1; // Rest exakt verteilen

  const exercises = [];
  for (let i = 0; i < slots; i++) {
    const p = pool[i % pool.length]; // bei kleinem Pool zyklisch wiederholen
    exercises.push({ title: p.nameDe || p.name || p.id, desc: p.cue || "Ruhig halten und tief atmen.", duration: durations[i], poseId: p.id });
  }
  playRoutine({ id: `gen-${tag}-${minutes}`, meta: `🎯 ${label} · ${minutes} Min`, exercises });
}

// --- Tages-Challenge (datums-gesät, deterministisch) ---
// Der Tages-Seed (lokale Mitternacht) bestimmt die Auswahl: gleiches Datum ⇒
// gleiche Challenge. Auswahl per hash(id+seed) gemischt, dann in den
// Positions-Bogen (stehend → liegen) sortiert – wie der Bereichs-Generator.
function challengeSeed() { return new Date().setHours(0, 0, 0, 0); }

async function startDailyChallenge() {
  const poses = (await db.poses.toArray()).filter(p => !p.circuitOnly && Array.isArray(p.focus));
  if (poses.length < 3) { alert("Für die Challenge sind keine Übungen verfügbar."); return; }
  const seed = challengeSeed();
  const picked = [...poses]
    .sort((a, b) => (hash(a.id + seed) % 10007) - (hash(b.id + seed) % 10007)) // Tagesauswahl
    .slice(0, CHALLENGE_SLOTS)
    .sort((a, b) => (POSITION_RANK[a.position] ?? 9) - (POSITION_RANK[b.position] ?? 9)); // Bogen
  const exercises = picked.map(p => ({
    title: p.nameDe || p.name || p.id,
    desc: p.cue || "Ruhig halten und tief atmen.",
    duration: CHALLENGE_HOLD,
    poseId: p.id
  }));
  playRoutine({ id: "daily-" + seed, meta: "🗓️ Tages-Challenge", exercises, isChallenge: true });
}

// Kachel-Zustand: Datum-Badge, Erledigt-Status heute und Challenge-Streak.
function renderChallenge() {
  const el = document.getElementById("challenge-entry");
  if (!el) return;
  const done = JSON.parse(localStorage.getItem(CHALLENGE_KEY) || "[]");
  const today = challengeSeed();
  const d = new Date(today);
  document.getElementById("ch-day").innerText = d.getDate();
  document.getElementById("ch-mon").innerText = d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "").toUpperCase();
  const doneToday = done.includes(today);
  const streak = challengeStreak(done);
  const streakTxt = streak > 1 ? ` · 🔥 ${streak} Tage` : "";
  el.classList.toggle("done", doneToday);
  document.getElementById("ch-title").innerText = doneToday ? "Tages-Challenge geschafft ✓" : "Tages-Challenge";
  document.getElementById("ch-sub").innerText = doneToday
    ? `Stark! Morgen wartet die nächste${streakTxt}`
    : `${CHALLENGE_SLOTS} Übungen · ~5 Min · jeden Tag neu${streakTxt}`;
}

// Zusammenhängende Challenge-Tage bis heute (oder gestern) – wie die Trainings-Streak.
function challengeStreak(done) {
  const DAY = 86400000;
  const days = [...new Set(done)].sort((a, b) => b - a);
  if (!days.length) return 0;
  const today = challengeSeed();
  if (days[0] !== today && days[0] !== today - DAY) return 0;
  let streak = 0, expected = days[0];
  for (const d of days) { if (d === expected) { streak++; expected -= DAY; } else if (d < expected) break; }
  return streak;
}

function markChallengeDone() {
  const done = JSON.parse(localStorage.getItem(CHALLENGE_KEY) || "[]");
  const today = challengeSeed();
  if (!done.includes(today)) { done.push(today); localStorage.setItem(CHALLENGE_KEY, JSON.stringify(done)); }
}

// Spielt eine fertige Routine ab (egal ob aus DB oder generiert).
function playRoutine(routine) {
  if (!routine) { alert("Routine nicht gefunden."); return; }
  currentRoutine = { ...routine, exercises: expandBilateral(routine.exercises), isCircuit: false };
  currentExIndex = 0; isPaused = false;
  showView("player-view");
  document.getElementById("routine-meta-title").innerText = currentRoutine.meta;
  requestWakeLock();
  loadExercise();
}

async function startRoutine(id) {
  playRoutine(await db.routines.get(id));
}

async function loadExercise() {
  const ex = currentRoutine.exercises[currentExIndex];
  currentEx = ex;
  const stage = document.getElementById("stage");
  const player = document.getElementById("player-view");
  document.getElementById("ex-counter").innerText = `${currentExIndex + 1} / ${currentRoutine.exercises.length}`;
  document.getElementById("progress").style.width = (currentExIndex / currentRoutine.exercises.length) * 100 + "%";
  document.getElementById("pause-btn").innerText = "Pause";
  stage.classList.remove("paused-state");

  if (ex.kind === "rest") {
    player.classList.add("resting");
    document.getElementById("ex-title").innerText = "Pause";
    document.getElementById("ex-desc").innerText = ex.desc || "";
    document.getElementById("pose-image").style.display = "none";
    document.getElementById("pose-svg").style.display = "none";
    stage.classList.remove("has-image", "mirror"); // nur der ruhige Ring
  } else {
    player.classList.remove("resting");
    document.getElementById("ex-title").innerText = ex.title;
    document.getElementById("ex-desc").innerText = ex.desc;
    const pose = ex.poseId ? await db.poses.get(ex.poseId) : null;
    showPose(pose);
    stage.classList.toggle("mirror", ex.side === "left"); // linke Seite gespiegelt
  }

  // Prep: Flows vor jeder Übung; Zirkel nur ganz am Anfang (die Pausen sind die Übergänge).
  const doPrep = currentRoutine.isCircuit ? (currentExIndex === 0) : true;
  startPhase(doPrep ? "prep" : "hold");
}

// Startet eine Phase (Vorbereitung oder Halten) mit fester Ziel-Endzeit.
function startPhase(newPhase) {
  phase = newPhase;
  const banner = document.getElementById("prep-banner");
  if (phase === "prep") {
    const secs = currentEx.prepSecs ?? (currentRoutine.isCircuit ? 3 : PREP_SECONDS);
    banner.innerText = currentRoutine.isCircuit
      ? "Los geht's!"
      : (currentEx.side === "left" ? "Seite wechseln · " + currentEx.title : "Bereit machen · als Nächstes: " + currentEx.title);
    banner.style.display = "block";
    phaseEndsAt = Date.now() + secs * 1000;
    tone(300, 0.08); vibrate(30);
    hideBreath();
  } else if (currentEx.kind === "rest") {
    banner.style.display = "none";
    phaseEndsAt = Date.now() + currentEx.duration * 1000;
    tone(340, 0.08); hideBreath();
  } else {
    banner.style.display = "none";
    phaseEndsAt = Date.now() + currentEx.duration * 1000;
    tone(440, 0.1); vibrate(80);
    if (currentRoutine.isCircuit) hideBreath(); else startBreath(); // Atem-Pacing nur im Flow
  }
  updateTimeFromClock();
  clearInterval(timerId); timerId = setInterval(tick, 250);
}

function tick() {
  if (isPaused) return;
  updateTimeFromClock();
}

// Restzeit aus der Ziel-Endzeit ableiten -> selbstkorrigierend nach Hintergrund/Sleep.
function updateTimeFromClock() {
  const remaining = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
  const prev = timeLeft;
  timeLeft = remaining; formatTimeDisplay(remaining);
  if (phase === "hold" && remaining <= 3 && remaining > 0 && remaining !== prev) tone(380, 0.05);
  if (remaining <= 0) { if (phase === "prep") startPhase("hold"); else nextExercise(); }
}

function skipExercise() { nextExercise(); }
function prevExercise() {
  clearInterval(timerId);
  if (currentExIndex > 0) currentExIndex--; // sonst aktuelle Übung neu starten
  loadExercise();
}
function nextExercise() {
  clearInterval(timerId); currentExIndex++;
  if (currentExIndex < currentRoutine.exercises.length) loadExercise();
  else finishRoutine();
}

function finishRoutine() {
  clearInterval(timerId); releaseWakeLock();
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  history.push(new Date().setHours(0, 0, 0, 0)); localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  const totalMin = Math.round(currentRoutine.exercises.reduce((s, e) => s + e.duration, 0) / 60);
  localStorage.setItem("fb_min", Number(localStorage.getItem("fb_min") || 0) + totalMin); // Gesamtminuten
  recordFocus(currentRoutine); // trainierte Bereiche merken (für "Was heute?")
  if (currentRoutine.isChallenge) markChallengeDone(); // Tages-Challenge abgehakt
  updateStreak();
  document.getElementById("done-ex").innerText = currentRoutine.exercises.length;
  document.getElementById("done-min").innerText = totalMin;
  document.getElementById("done-streak").innerText = document.getElementById("streak-count").innerText;
  document.getElementById("stage").classList.remove("mirror");
  hideBreath();
  tone(660, 0.15); vibrate([60, 40, 120]);
  showView("done-view");
}

// Fortschritts-Karte: rendert die Session-Kennzahlen als teilbares Bild.
// Rein clientseitig (Canvas), kein Backend. Werte kommen aus der done-view,
// stimmen also genau mit dem Bildschirm ueberein.
function renderCard() {
  const S = 1080, c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d");

  // Hintergrund: warmer Verlauf im flowbend-Look
  const bg = g.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#fdf6f0"); bg.addColorStop(1, "#f6ede4");
  g.fillStyle = bg; g.fillRect(0, 0, S, S);

  const warm = "#d97736", main = "#2c2a29", sub = "#96918e";
  const cx = S / 2;
  g.textAlign = "center";

  // Wordmark + Tagline
  g.fillStyle = main;
  g.font = "700 76px -apple-system, 'Segoe UI', Roboto, sans-serif";
  g.fillText("flowbend", cx, 190);
  g.fillStyle = sub;
  g.font = "500 26px -apple-system, 'Segoe UI', Roboto, sans-serif";
  g.fillText((mode === "strength" ? "KRAFT" : "BEWEGLICHKEIT") + "  ·  GESCHAFFT", cx, 240);

  // Streak-Emoji gross
  const streak = document.getElementById("done-streak").innerText;
  g.font = "160px -apple-system, 'Segoe UI', Roboto, sans-serif";
  g.fillText("🔥", cx, 470);

  // Kennzahlen: Uebungen | Minuten | Streak
  const stats = [
    [document.getElementById("done-ex").innerText, "Übungen"],
    [document.getElementById("done-min").innerText, "Minuten"],
    [streak, "Tage Streak"],
  ];
  const colW = S / 3;
  stats.forEach((s, i) => {
    const x = colW * i + colW / 2;
    g.fillStyle = warm;
    g.font = "700 96px -apple-system, 'Segoe UI', Roboto, sans-serif";
    g.fillText(s[0], x, 680);
    g.fillStyle = sub;
    g.font = "500 30px -apple-system, 'Segoe UI', Roboto, sans-serif";
    g.fillText(s[1], x, 730);
  });

  // Datum
  g.fillStyle = main;
  g.font = "500 34px -apple-system, 'Segoe UI', Roboto, sans-serif";
  g.fillText(new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }), cx, 900);

  // Footer-URL
  g.fillStyle = sub;
  g.font = "500 28px -apple-system, 'Segoe UI', Roboto, sans-serif";
  g.fillText("bend.fitmitbauch.de", cx, 990);

  return c;
}

async function shareCard() {
  const btn = document.getElementById("share-card-btn");
  const canvas = renderCard();
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  if (!blob) return;
  const file = new File([blob], "flowbend.png", { type: "image/png" });

  // Web Share API (mobil/PWA) mit Datei, wenn moeglich – sonst Download-Fallback.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "flowbend", text: "Session geschafft 🔥" });
      return;
    } catch (e) { if (e && e.name === "AbortError") return; } // Nutzer hat abgebrochen
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "flowbend.png";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  if (btn) { const t = btn.innerText; btn.innerText = "Gespeichert ✓"; setTimeout(() => (btn.innerText = t), 1800); }
}

// Trainierte Bereiche (focus-Tags) mit Zeitstempel merken.
async function recordFocus(routine) {
  const ids = [...new Set(routine.exercises.map(e => e.poseId))];
  const poses = await Promise.all(ids.map(id => db.poses.get(id)));
  const tags = new Set();
  poses.forEach(p => (p && p.focus || []).forEach(f => tags.add(f)));
  const now = Date.now();
  const focus = JSON.parse(localStorage.getItem("fb_focus") || "{}");
  AREAS.forEach(a => { if (tags.has(a.tag)) focus[a.tag] = now; });
  localStorage.setItem("fb_focus", JSON.stringify(focus));
}

function showPose(pose) {
  const img = document.getElementById("pose-image");
  const svg = document.getElementById("pose-svg");
  const stage = document.getElementById("stage");
  const useStick = () => { img.style.display = "none"; svg.style.display = "block"; stage.classList.remove("has-image"); if (pose) applyPose(pose); };
  if (pose && pose.image) {
    img.onerror = useStick;            // defektes/fehlendes Bild -> Strichmaennchen
    img.alt = pose.id || "";
    img.src = pose.image;
    img.style.display = "block";
    svg.style.display = "none";
    stage.classList.add("has-image"); // Bild: volle Breite, Ring aus
  } else {
    useStick();                        // kein Bild hinterlegt -> Strichmaennchen
  }
}

function applyPose(pose) {
  const setLines = (id, c) => { const el = document.getElementById(id); if (el) { el.setAttribute("x1", c[0]); el.setAttribute("y1", c[1]); el.setAttribute("x2", c[2]); el.setAttribute("y2", c[3]); } };
  setLines("spine", pose.spine); setLines("left-leg", pose.lLeg); setLines("right-leg", pose.rLeg); setLines("left-arm", pose.lArm); setLines("right-arm", pose.rArm);
  const head = document.getElementById("head"); if (head) { head.setAttribute("cx", pose.head[0]); head.setAttribute("cy", pose.head[1]); }
}

function formatTimeDisplay(secs) {
  document.getElementById("time-display").innerText = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function togglePause() {
  isPaused = !isPaused;
  if (isPaused) {
    pausedRemaining = Math.max(0, phaseEndsAt - Date.now());
    stopBreath();
  } else {
    phaseEndsAt = Date.now() + pausedRemaining; // Ziel-Endzeit um die Pausendauer verschieben
    requestWakeLock();
    updateTimeFromClock();
    if (phase === "hold") startBreath();
  }
  document.getElementById("stage").classList.toggle("paused-state", isPaused);
  document.getElementById("pause-btn").innerText = isPaused ? "Weiter" : "Pause";
}

function quitRoutine() {
  clearInterval(timerId);
  releaseWakeLock();
  hideBreath();
  document.getElementById("stage").classList.remove("mirror");
  document.getElementById("player-view").classList.remove("resting");
  showView("dashboard-view");
  renderSuggestion(); // Vorschlag nach jeder Session auffrischen
  renderChallenge(); // Challenge-Kachel (Erledigt/Streak) aktualisieren
}

// --- Modus Beweglichkeit / Kraft ---
function setMode(m) {
  mode = m; localStorage.setItem("fb_mode", m);
  suggestIdx = 0;
  document.querySelectorAll("#mode-toggle button").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
  document.getElementById("flow-sections").style.display = (m === "flow") ? "block" : "none";
  document.getElementById("strength-sections").style.display = (m === "strength") ? "block" : "none";
  if (m === "strength") { renderWorkouts(); updateGenSub(); }
  renderSuggestion();
}
function wireModeUI() {
  document.querySelectorAll("#mode-toggle button").forEach(b => b.onclick = () => setMode(b.dataset.mode));
  document.querySelectorAll("#intensity-toggle button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.int === selectedIntensity);
    btn.onclick = () => {
      selectedIntensity = btn.dataset.int; localStorage.setItem("fb_intensity", selectedIntensity);
      document.querySelectorAll("#intensity-toggle button").forEach(x => x.classList.toggle("active", x === btn));
      updateGenSub();
    };
  });
  updateQuietButton();
}
function updateGenSub() {
  const el = document.getElementById("gen-sub");
  if (el) el.innerText = `≈ ${selectedMinutes} Min · ${selectedIntensity}${quietMode ? " · 🤫 leise" : ""}`;
}

// "Nachbarn nicht ärgern": laute Übungen (loud) aus Zirkeln ausblenden.
function toggleQuiet() {
  quietMode = !quietMode;
  localStorage.setItem("fb_quiet", quietMode ? "1" : "0");
  updateQuietButton(); renderWorkouts(); updateGenSub();
}
function updateQuietButton() {
  const b = document.getElementById("quiet-toggle");
  if (b) { b.classList.toggle("active", quietMode); b.innerText = quietMode ? "🤫 Leise-Modus: an" : "🤫 Leise-Modus"; }
}
function quietFilter(exercises, map) {
  if (!quietMode) return exercises;
  const q = exercises.filter(e => !(map[e.poseId] && map[e.poseId].loud));
  return q.length ? q : exercises; // nie ganz leeren Zirkel erzeugen
}

// Grobe Gesamtdauer eines Zirkels (inkl. Pausen), für die Anzeige.
function estimateWorkoutSecs(w) {
  const n = w.exercises.length, rounds = w.rounds || 1;
  return rounds * (n * (w.work || 30) + n * (w.rest || 10));
}
async function renderWorkouts() {
  const list = document.getElementById("workout-list"); if (!list) return; list.innerHTML = "";
  const loudIds = new Set((await db.poses.toArray()).filter(p => p.loud).map(p => p.id));
  (await db.workouts.toArray()).forEach(w => {
    const mins = Math.round(estimateWorkoutSecs(w) / 60);
    const title = w.meta.replace(/^\s*\S+\s+/, "");
    const hasLoud = w.exercises.some(e => loudIds.has(e.poseId));
    const badge = hasLoud ? (quietMode ? " • 🤫 leise Version" : " • 🔊 laut") : "";
    const card = document.createElement("div"); card.className = "routine-card";
    card.setAttribute("onclick", `startWorkout('${w.id}')`);
    card.innerHTML = `<div class="routine-info"><h3>${title}</h3><p>${w.rounds || 1} Runde(n) • ${w.work}s/${w.rest}s • ca. ${mins} Min${badge}</p></div><div style="color:var(--accent-warm);">➔</div>`;
    list.appendChild(card);
  });
}

async function startWorkout(id) {
  const w = await db.workouts.get(id);
  playCircuit(w);
}

// Baut aus Kraft-Posen einen Zufalls-Zirkel (Dauer aus selectedMinutes, Tempo aus Intensität).
async function startGeneratedCircuit() {
  const poses = await db.poses.toArray();
  const pool = poses.filter(p => (p.circuitOnly || (Array.isArray(p.focus) && p.focus.includes("strength"))) && !(quietMode && p.loud));
  if (!pool.length) { alert("Keine Kraft-Übungen vorhanden."); return; }
  const seed = new Date().setHours(0, 0, 0, 0);
  pool.sort((a, b) => (hash(a.id + seed) % 1000) - (hash(b.id + seed) % 1000)); // deterministisch je Tag
  const { work, rest } = INTENSITY[selectedIntensity] || INTENSITY.mittel;
  const stations = Math.min(pool.length, 6);
  const rounds = Math.max(1, Math.round((selectedMinutes * 60) / (stations * (work + rest))));
  const exercises = pool.slice(0, stations).map(p => ({ poseId: p.id }));
  playCircuit({ id: "gen", meta: `🎯 Zirkel · ${selectedMinutes} Min · ${selectedIntensity}`, rounds, work, rest, exercises });
}
function hash(s) { s = String(s); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
// Fisher-Yates: mischt ein Array in-place und gibt es zurück.
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function playCircuit(w) {
  if (!w) { alert("Zirkel nicht gefunden."); return; }
  const ids = [...new Set(w.exercises.map(e => e.poseId))];
  const map = {};
  (await Promise.all(ids.map(id => db.poses.get(id)))).forEach(p => { if (p) map[p.id] = p; });
  const exs = quietFilter(w.exercises, map); // im Leise-Modus laute Übungen weglassen
  currentRoutine = { id: "circuit-" + w.id, meta: w.meta, exercises: expandCircuit({ ...w, exercises: exs }, map), isCircuit: true };
  currentExIndex = 0; isPaused = false;
  showView("player-view");
  document.getElementById("routine-meta-title").innerText = w.meta;
  requestWakeLock();
  loadExercise();
}

// Zirkel in Segmente auflösen: Arbeit (evtl. rechts/links) + Pause dazwischen, über alle Runden.
function expandCircuit(w, map) {
  const out = [], rounds = w.rounds || 1;
  for (let r = 0; r < rounds; r++) {
    w.exercises.forEach((ex, i) => {
      const p = map[ex.poseId] || {};
      const workSecs = ex.work || w.work || 30;
      const title = ex.title || p.nameDe || p.name || ex.poseId;
      const desc = p.cue || "Kraftvoll und sauber ausführen.";
      if (BILATERAL.has(ex.poseId)) {
        const right = Math.max(8, Math.round(workSecs / 2));
        out.push({ kind: "work", title: title + " (rechts)", desc, duration: right, poseId: ex.poseId, side: "right" });
        out.push({ kind: "work", title: title + " (links)", desc, duration: Math.max(8, workSecs - right), poseId: ex.poseId, side: "left" });
      } else {
        out.push({ kind: "work", title, desc, duration: workSecs, poseId: ex.poseId });
      }
      const isLast = (r === rounds - 1) && (i === w.exercises.length - 1);
      if (!isLast) {
        const nx = w.exercises[(i + 1) % w.exercises.length];
        const nxTitle = nx.title || (map[nx.poseId] && map[nx.poseId].nameDe) || nx.poseId;
        out.push({ kind: "rest", title: "Pause", desc: "Gleich: " + nxTitle, duration: ex.rest || w.rest || 10, poseId: null });
      }
    });
  }
  return out;
}

// --- "Was heute?" – adaptiver Vorschlag ---
let suggestIdx = 0, suggestCands = [];

function timeBucket(h) {
  if (h >= 5 && h < 11)  return { routine: "wakeup",   label: "Guten Morgen – sanft wach werden" };
  if (h >= 11 && h < 17) return { routine: "desk",     label: "Kurzer Reset für zwischendurch" };
  if (h >= 17 && h < 22) return { routine: "backcare", label: "Abends den Rücken lockern" };
  return { routine: "sleep", label: "Runterkommen für die Nacht" };
}

function buildCandidates() {
  const DAY = 86400000, now = Date.now();
  const focus = JSON.parse(localStorage.getItem("fb_focus") || "{}");
  const ranked = AREAS.map(a => ({ ...a, stale: focus[a.tag] ? now - focus[a.tag] : Infinity }))
                      .sort((x, y) => y.stale - x.stale);
  const areaCands = ranked.map(a => ({
    type: "area", tag: a.tag, label: a.label,
    reason: a.stale === Infinity
      ? `${a.label} · noch nie dran`
      : `${a.label} · zuletzt vor ${Math.max(1, Math.floor(a.stale / DAY))} Tag(en)`
  }));
  const bucket = timeBucket(new Date().getHours());
  const routineCand = { type: "routine", id: bucket.routine, reason: bucket.label };
  const trained = Object.keys(focus).length;
  // Wenig Daten -> Tageszeit führt; sonst der am stärksten vernachlässigte Bereich.
  return trained < 3 ? [routineCand, ...areaCands] : [areaCands[0], routineCand, ...areaCands.slice(1)];
}

async function renderSuggestion() {
  const card = document.getElementById("suggest-card");
  if (mode === "strength") {
    const ws = await db.workouts.toArray();
    if (!ws.length) { card.style.display = "none"; return; }
    suggestCands = ws.map(w => ({ type: "workout", id: w.id }));
    if (suggestIdx >= suggestCands.length) suggestIdx = 0;
    const w = ws[suggestIdx];
    document.getElementById("sug-title").innerText = `${w.meta.replace(/^\s*\S+\s+/, "")} · ${w.rounds || 1} Runde(n)`;
    document.getElementById("sug-reason").innerText = "Kraft-Zirkel für heute";
    card.style.display = "flex";
    return;
  }
  suggestCands = buildCandidates();
  if (suggestIdx >= suggestCands.length) suggestIdx = 0;
  const c = suggestCands[suggestIdx];
  let title;
  if (c.type === "area") {
    title = `${c.label} · ${selectedMinutes} Min`;
  } else {
    const r = await db.routines.get(c.id);
    const name = r ? r.meta.replace(/^\s*\S+\s+/, "") : c.id;
    const mins = r ? Math.round(r.exercises.reduce((s, e) => s + e.duration, 0) / 60) : "";
    title = `${name} · ${mins} Min`;
  }
  document.getElementById("sug-title").innerText = title;
  document.getElementById("sug-reason").innerText = c.reason;
  document.getElementById("suggest-card").style.display = "flex";
}

function startSuggestion() {
  const c = suggestCands[suggestIdx];
  if (!c) return;
  if (c.type === "workout") startWorkout(c.id);
  else if (c.type === "area") startArea(c.tag, c.label, selectedMinutes);
  else startRoutine(c.id);
}

function shuffleSuggestion(ev) {
  if (ev) ev.stopPropagation();
  if (!suggestCands.length) return;
  suggestIdx = (suggestIdx + 1) % suggestCands.length;
  renderSuggestion();
}

// --- Verlauf / Statistik ---
function showStats() {
  const DAY = 86400000;
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  const days = [...new Set(history.map(ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }))];
  document.getElementById("st-sessions").innerText = history.length;
  document.getElementById("st-min").innerText = Number(localStorage.getItem("fb_min") || 0);
  document.getElementById("st-streak").innerText = document.getElementById("streak-count").innerText;
  document.getElementById("st-longest").innerText = longestStreak(days);
  buildHeatmap(history);
  showView("stats-view");
}

function longestStreak(days) {
  const DAY = 86400000;
  const s = [...days].sort((a, b) => a - b);
  let best = 0, cur = 0, prev = null;
  for (const d of s) { cur = (prev !== null && d - prev === DAY) ? cur + 1 : 1; prev = d; if (cur > best) best = cur; }
  return best;
}

function buildHeatmap(history) {
  const DAY = 86400000;
  const el = document.getElementById("heatmap"); el.innerHTML = "";
  const counts = {};
  history.forEach(ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); const k = d.getTime(); counts[k] = (counts[k] || 0) + 1; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7; // Montag = 0
  const startMonday = today.getTime() - dow * DAY - 11 * 7 * DAY; // 12 Wochen inkl. aktueller
  for (let w = 0; w < 12; w++) {
    for (let d = 0; d < 7; d++) {
      const c = counts[startMonday + (w * 7 + d) * DAY] || 0;
      const level = c === 0 ? 0 : (c === 1 ? 1 : (c === 2 ? 2 : 3));
      const cell = document.createElement("div");
      cell.className = "hm-cell hm-l" + level;
      el.appendChild(cell);
    }
  }
}

function quitStats() { showView("dashboard-view"); }

// Einseitige Übungen in zwei Seiten aufteilen (rechts + links), Haltezeit hälftig.
function expandBilateral(exercises) {
  const out = [];
  for (const ex of exercises) {
    if (BILATERAL.has(ex.poseId)) {
      const right = Math.max(8, Math.round(ex.duration / 2));
      const left = Math.max(8, ex.duration - right);
      out.push({ ...ex, duration: right, title: ex.title + " (rechts)", side: "right" });
      out.push({ ...ex, duration: left, title: ex.title + " (links)", side: "left", prepSecs: SWITCH_SECONDS });
    } else {
      out.push({ ...ex, side: null });
    }
  }
  return out;
}

function playerActive() { return document.getElementById("player-view").style.display === "flex"; }

// Screen Wake Lock: Bildschirm während der Routine an halten.
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch (e) { /* z. B. Energiesparmodus – Routine läuft trotzdem weiter. */ }
}
async function releaseWakeLock() {
  try { if (wakeLock) await wakeLock.release(); } catch (e) {}
  wakeLock = null;
}

// Nach Rückkehr in den Vordergrund: Wake Lock neu holen + Timer sofort korrigieren.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && playerActive() && !isPaused) {
    requestWakeLock();
    updateTimeFromClock();
  }
});

// Einen einzigen AudioContext wiederverwenden – ein neuer pro Ton stösst schnell
// an das Browser-Limit (~6 Contexts) und der Ton bricht ab.
let audioCtx = null;
function tone(f, d) {
  if (!cuesOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = f;
    g.gain.setValueAtTime(0.04, audioCtx.currentTime);
    o.start();
    o.stop(audioCtx.currentTime + d);
  } catch (e) { /* Audio nicht verfügbar – Übung läuft trotzdem weiter. */ }
}

function vibrate(pattern) {
  if (cuesOn && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}

// Atem-Pacing: 4 s einatmen, 6 s ausatmen – nur während des Haltens.
function startBreath() {
  stopBreath();
  const cue = document.getElementById("breath-cue");
  cue.style.display = "block";
  const IN = 4000, CYCLE = 10000;
  breathBase = Date.now();
  const upd = () => { cue.innerText = (Date.now() - breathBase) % CYCLE < IN ? "Einatmen" : "Ausatmen"; };
  upd();
  breathId = setInterval(upd, 250);
}
function stopBreath() { clearInterval(breathId); breathId = null; }
function hideBreath() { stopBreath(); document.getElementById("breath-cue").style.display = "none"; }

// --- Vollbild-Atem-Modus ("Breath Orb") ------------------------------------
// Eigenständiger Zen-Modus: animierte Atemkugel (4 s ein / 6 s aus), optionaler
// generativer Ambient-Klang (WebAudio, keine Audiodateien), Wake Lock.
let orbId = null, orbTimerId = null, orbEndsAt = 0, ambientWanted = false;

function openBreath(sec) {
  showView("breath-view");
  requestWakeLock();
  document.querySelectorAll("#breath-durs button").forEach(b => b.classList.toggle("active", Number(b.dataset.sec) === sec));

  // Atemkugel-Animation frisch starten, damit Wort & Skalierung synchron laufen.
  const orb = document.getElementById("breath-orb");
  orb.style.animation = "none"; void orb.offsetWidth; orb.style.animation = "";
  const word = document.getElementById("breath-word");
  const IN = 4000, CYCLE = 10000;
  breathBase = Date.now();
  const upd = () => { word.innerText = (Date.now() - breathBase) % CYCLE < IN ? "Einatmen" : "Ausatmen"; };
  upd(); clearInterval(orbId); orbId = setInterval(upd, 200);

  // Restzeit / Countdown (0 = unendlich, bis „Fertig").
  const info = document.getElementById("breath-timeleft");
  clearInterval(orbTimerId); orbTimerId = null;
  if (sec > 0) {
    orbEndsAt = Date.now() + sec * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((orbEndsAt - Date.now()) / 1000));
      info.innerText = `noch ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
      if (left <= 0) { tone(660, 0.2); vibrate([60, 40, 120]); closeBreath(); }
    };
    tick(); orbTimerId = setInterval(tick, 250);
  } else {
    info.innerText = 'läuft · beende mit „Fertig"';
  }

  if (ambientWanted) startAmbient(); // Klang beibehalten, wenn zuvor aktiviert
}

function closeBreath() {
  clearInterval(orbId); orbId = null;
  clearInterval(orbTimerId); orbTimerId = null;
  stopAmbient();
  releaseWakeLock();
  showView("dashboard-view");
}

function toggleAmbient() {
  ambientWanted = !ambientWanted;
  document.getElementById("breath-sound").innerText = ambientWanted ? "🔊 Klang an" : "🔈 Klang aus";
  if (ambientWanted) startAmbient(); else stopAmbient();
}

// Generativer Ambient-Drone, dessen Lautstärke im Atemrhythmus schwillt.
let ambient = null;
function startAmbient() {
  if (ambient) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const master = audioCtx.createGain(); master.gain.value = 0.0001; master.connect(audioCtx.destination);
    const lp = audioCtx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.connect(master);
    const osc = [55, 110, 110.6].map(f => { const o = audioCtx.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    ambient = { master, osc, env: null };
    ambientEnvelope();                       // sofort erste Atemwelle
    ambient.env = setInterval(ambientEnvelope, 10000); // pro 10-s-Zyklus
  } catch (e) { ambient = null; /* Audio nicht verfügbar – Modus läuft trotzdem */ }
}
function ambientEnvelope() {
  if (!ambient) return;
  const t = audioCtx.currentTime, g = ambient.master.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(g.value, 0.0001), t);
  g.linearRampToValueAtTime(0.05, t + 4);    // Einatmen: anschwellen
  g.linearRampToValueAtTime(0.012, t + 10);  // Ausatmen: abklingen
}
function stopAmbient() {
  if (!ambient) return;
  const a = ambient; ambient = null;
  clearInterval(a.env);
  try {
    const t = audioCtx.currentTime;
    a.master.gain.cancelScheduledValues(t);
    a.master.gain.setValueAtTime(Math.max(a.master.gain.value, 0.0001), t);
    a.master.gain.linearRampToValueAtTime(0.0001, t + 0.4); // sanft ausblenden, kein Knacken
  } catch (e) {}
  setTimeout(() => a.osc.forEach(o => { try { o.stop(); } catch (e) {} }), 500);
}

// Ton + Vibration gemeinsam an/aus (im Player, oben rechts).
function toggleCues() {
  cuesOn = !cuesOn;
  localStorage.setItem("fb_cues", cuesOn ? "1" : "0");
  updateCueButton();
}
function updateCueButton() {
  const b = document.getElementById("cue-btn");
  if (b) b.innerText = cuesOn ? "🔔" : "🔕";
}

// Echte Streak: zusammenhängende Trainingstage bis heute (oder gestern).
function updateStreak() {
  const DAY = 86400000;
  const days = [...new Set(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"))].sort((a, b) => b - a);
  let streak = 0;
  if (days.length) {
    const today = new Date().setHours(0, 0, 0, 0);
    // Streak lebt nur, wenn heute oder gestern trainiert wurde.
    if (days[0] === today || days[0] === today - DAY) {
      let expected = days[0];
      for (const d of days) {
        if (d === expected) { streak++; expected -= DAY; }
        else if (d < expected) break;
      }
    }
  }
  document.getElementById("streak-count").innerText = streak;
}

// --- App-Version + Update-Fluss (PWA, mit Nachfrage) ---
const APP_VERSION = "1.5.0"; // wird beim Release automatisch auf den Tag gesetzt
let pendingReg = null, updateInitiated = false;

function showUpdateBanner(reg) { pendingReg = reg; updateBannerVisibility(); }
function updateBannerVisibility() {
  const el = document.getElementById("update-banner");
  if (!el) return;
  const onDash = document.getElementById("dashboard-view").style.display !== "none";
  el.style.display = (pendingReg && onDash) ? "flex" : "none";
}
function applyUpdate() {
  if (pendingReg && pendingReg.waiting) { updateInitiated = true; pendingReg.waiting.postMessage("SKIP_WAITING"); }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      // Schon ein wartender Worker (Update bereit)?
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(reg);
        });
      });
      // Proaktiv auf Updates prüfen: beim Start und bei Rückkehr in den Vordergrund.
      const check = () => reg.update().catch(() => {});
      check();
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    } catch (e) { /* Offline-Cache optional. */ }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateInitiated) return; // kein Reload bei Erstinstallation
    updateInitiated = false;
    location.reload();
  });
}

initApp();
