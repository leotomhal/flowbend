const db = new Dexie("FlowbendDatabase");
db.version(1).stores({ poses: "id", routines: "id" });

// --- Datenquelle (einzige Quelle der Wahrheit) ---
// Statisches Hosting: relative Dateien im data/-Ordner neben der index.html.
// Echte API: absolute URL eintragen, z. B. "https://example.com/api/poses.json".
const POSES_URL = "data/poses.json";
const ROUTINES_URL = "data/routines.json";
const HISTORY_KEY = "fb_history";

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
  "seatedNeckStretch", "headToKnee", "cowFaceArms", "eaglePrep", "lyingTwist", "sidePlank"
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

async function initApp() {
  const statusEl = document.getElementById("db-status");
  try {
    statusEl.innerText = "Lade Daten...";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const [resPoses, resRoutines] = await Promise.all([
      fetch(POSES_URL, { signal: controller.signal }),
      fetch(ROUTINES_URL, { signal: controller.signal })
    ]);
    clearTimeout(timeoutId);
    if (!resPoses.ok || !resRoutines.ok) throw new Error("HTTP " + resPoses.status + "/" + resRoutines.status);
    await db.poses.clear(); await db.routines.clear();
    await db.poses.bulkAdd(await resPoses.json());
    await db.routines.bulkAdd(await resRoutines.json());
    statusEl.innerText = "Aktualisiert (Online)";
  } catch (e) {
    // Server nicht erreichbar: vorhandenen Offline-Cache (IndexedDB) nutzen, falls vorhanden.
    const cached = (await db.poses.count() > 0) && (await db.routines.count() > 0);
    statusEl.innerText = cached
      ? "Offline-Modus (lokaler Cache)"
      : "Keine Daten verfuegbar – bitte einmal online laden";
  }
  renderDashboardFromDB(); buildAreaUI(); updateStreak(); updateCueButton();
}

// Genau eine Vollbild-Ansicht sichtbar schalten.
const VIEWS = ["dashboard-view", "player-view", "disclaimer-view", "done-view"];
function showView(id) {
  VIEWS.forEach(v => { document.getElementById(v).style.display = (v === id) ? "flex" : "none"; });
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
    const n = poses.filter(p => Array.isArray(p.focus) && p.focus.includes(a.tag)).length;
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
    };
  });
}

// Baut on demand ein Programm aus allen Posen eines Bereichs und startet es.
async function startArea(tag, label, minutes) {
  const poses = await db.poses.toArray();
  const pool = poses.filter(p => Array.isArray(p.focus) && p.focus.includes(tag));
  if (!pool.length) { alert("Für diesen Bereich sind keine Posen vorhanden."); return; }
  // Reihenfolge: stehend -> knien -> sitzen -> liegen (Aufwärm- zu Ausklang-Bogen).
  pool.sort((x, y) => (POSITION_RANK[x.position] ?? 9) - (POSITION_RANK[y.position] ?? 9));

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
    exercises.push({ title: p.name || p.id, desc: "Ruhig halten und tief atmen.", duration: durations[i], poseId: p.id });
  }
  playRoutine({ id: `gen-${tag}-${minutes}`, meta: `🎯 ${label} · ${minutes} Min`, exercises });
}

// Spielt eine fertige Routine ab (egal ob aus DB oder generiert).
function playRoutine(routine) {
  if (!routine) { alert("Routine nicht gefunden."); return; }
  currentRoutine = { ...routine, exercises: expandBilateral(routine.exercises) };
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
  document.getElementById("ex-title").innerText = ex.title;
  document.getElementById("ex-desc").innerText = ex.desc;
  const pose = await db.poses.get(ex.poseId); showPose(pose);
  document.getElementById("stage").classList.toggle("mirror", ex.side === "left"); // linke Seite gespiegelt
  document.getElementById("ex-counter").innerText = `Übung ${currentExIndex + 1} / ${currentRoutine.exercises.length}`;
  document.getElementById("progress").style.width = (currentExIndex / currentRoutine.exercises.length) * 100 + "%";
  document.getElementById("stage").classList.remove("paused-state");
  document.getElementById("pause-btn").innerText = "Pause";
  startPhase("prep");
}

// Startet eine Phase (Vorbereitung oder Halten) mit fester Ziel-Endzeit.
function startPhase(newPhase) {
  phase = newPhase;
  const banner = document.getElementById("prep-banner");
  if (phase === "prep") {
    const secs = currentEx.prepSecs ?? PREP_SECONDS;
    banner.innerText = currentEx.side === "left"
      ? "Seite wechseln · " + currentEx.title
      : "Bereit machen · als Nächstes: " + currentEx.title;
    banner.style.display = "block";
    phaseEndsAt = Date.now() + secs * 1000;
    tone(300, 0.08); vibrate(30);
    hideBreath();
  } else {
    banner.style.display = "none";
    phaseEndsAt = Date.now() + currentEx.duration * 1000;
    tone(440, 0.1); vibrate(80);
    speak(currentEx.title);
    startBreath();
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
  const remaining = Math.max(0, Math.round((phaseEndsAt - Date.now()) / 1000));
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
  updateStreak();
  document.getElementById("done-ex").innerText = currentRoutine.exercises.length;
  document.getElementById("done-min").innerText =
    Math.round(currentRoutine.exercises.reduce((s, e) => s + e.duration, 0) / 60);
  document.getElementById("done-streak").innerText = document.getElementById("streak-count").innerText;
  document.getElementById("stage").classList.remove("mirror");
  hideBreath();
  tone(660, 0.15); vibrate([60, 40, 120]);
  showView("done-view");
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
  showView("dashboard-view");
}

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

// Sprachansage der aktuellen Übung (folgt dem Ton/Vibration-Schalter).
function speak(text) {
  if (!cuesOn || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/\(([^)]+)\)/, "$1")); // "(rechts)" -> "rechts"
    u.lang = "de-DE"; u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) { /* Sprachausgabe nicht verfügbar. */ }
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

// Service Worker registrieren (echte Offline-Fähigkeit inkl. App-Runtime).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* Offline-Cache optional. */ });
  });
}

initApp();
