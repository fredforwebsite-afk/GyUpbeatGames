/* ================== Firebase + App Init ================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  remove,
  get,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyADxgFTvu0iyYC_ano36TfClPsH4YfqzE",
  authDomain: "gygames-fafcb.firebaseapp.com",
  databaseURL: "https://gygames-fafcb-default-rtdb.firebaseio.com/",
  projectId: "gygames-fafcb",
  storageBucket: "gygames-fafcb.firebasestorage.app",
  messagingSenderId: "603231637988",
  appId: "1:603231637988:web:31ac4e91fcd58935ffb7f1",
  measurementId: "G-058J8NLC43"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ================== GLOBAL VARS ================== */
let teamName = null;
let answerInterval;
let answerTimer = 20;

/* ================== TEAM SELECT ================== */
function selectTeam(name) {
  teamName = name;
  sessionStorage.setItem("team", teamName);

  document.getElementById("teamSelect").style.display = "none";
  document.getElementById("buzzerArea").style.display = "block";
  document.getElementById("teamName").innerText = "You are Team " + teamName;
}

/* ================== BUZZER ENABLE LISTENER ================== */
setInterval(async () => {
  let enableSnap = await get(ref(db, "game/enableBuzzer"));
  let stealSnap = await get(ref(db, "game/stealMode"));
  let buzzedSnap = await get(ref(db, "game/buzzed"));

  let enable = enableSnap.exists() ? enableSnap.val() === "true" : false;
  let steal = stealSnap.exists() ? stealSnap.val() : null;
  let alreadyBuzzed = buzzedSnap.exists() ? buzzedSnap.val() : null;

  if (teamName) {
    if ((enable && !alreadyBuzzed) || (steal && steal !== teamName && !alreadyBuzzed)) {
      document.getElementById("buzzerBtn").disabled = false;
    } else {
      document.getElementById("buzzerBtn").disabled = true;
    }
  }
}, 300);

/* ================== BUZZER BUTTON ================== */
document.getElementById("buzzerBtn").onclick = async () => {
  if (!teamName) return;

  await set(ref(db, "game/buzzed"), teamName);

  document.getElementById("buzzerBtn").disabled = true;
  document.getElementById("answerArea").style.display = "block";

  startAnswerTimer();
  document.getElementById("buzzSound").play();
};

/* ================== ANSWER TIMER ================== */
function startAnswerTimer() {
  clearInterval(answerInterval);
  answerTimer = 20;
  document.getElementById("answerTimer").innerText = "Answer Time: " + answerTimer;

  answerInterval = setInterval(() => {
    answerTimer--;
    document.getElementById("answerTimer").innerText = "Answer Time: " + answerTimer;

    if (answerTimer <= 0) {
      clearInterval(answerInterval);
      document.getElementById("answerTimer").innerText = "⏳ Time's up!";
      document.getElementById("answerArea").style.display = "none";
    }
  }, 1000);
}

/* ================== SUBMIT ANSWER ================== */
async function submitAnswer() {
  let ans = document.getElementById("teamAnswer").value;
  if (ans.trim() === "") return;

  await set(ref(db, "game/teamAnswer_" + teamName), ans);
  await set(ref(db, "game/submittedAnswer"), teamName + ": " + ans);

  document.getElementById("answerArea").style.display = "none";
  clearInterval(answerInterval);
}


// ================= FIREBASE-BACKED KEY/VALUE CACHE =================
// Purpose: provide a drop-in replacement for localStorage.getItem/setItem/removeItem
// while keeping the rest of your code synchronous (it reads strings).
const fbRootPath = 'game'; // root path in RTDB to store keys
const fbCache = {};        // in-memory cache mirroring firebase values
const fbUnsubs = {};       // holds unsubscribe functions for listeners

// Helpers to form refs
const nodeRef = (key) => ref(db, `${fbRootPath}/${key}`);

// Initialize: load initial keys we care about and attach listeners that keep cache updated.
// We'll listen to: scores, buzzed, enableBuzzer, answeringTeam, stealMode, outTeams, teamAnswer_<team>, submittedAnswer
async function initFirebaseKV(keysToWatch = []) {
    // attach onValue listeners for keysToWatch so cache stays up to date
    keysToWatch.forEach(key => {
        // avoid double-subscribe
        if (fbUnsubs[key]) return;
        const r = nodeRef(key);
        const unsub = onValue(r, (snap) => {
            const val = snap.exists() ? snap.val() : null;
            // We'll store string values in cache (like localStorage) — null means "no key"
            fbCache[key] = (val === null || val === undefined) ? null : val;
            // Special behavior: emulate the previous storage event for "buzzed"
            if (key === 'buzzed' && fbCache['buzzed']) {
                // call stopOnBuzz with a storage-like event object so your existing stopOnBuzz works unchanged
                try {
                    stopOnBuzz({ key: 'buzzed', newValue: fbCache['buzzed'] });
                } catch (err) {
                    // if stopOnBuzz doesn't exist yet (early init), ignore
                }
            }
        });
        fbUnsubs[key] = unsub;
    });
}

// Basic "localStorage-like" API (synchronous reads from in-memory cache)
function fbSetItem(key, value) {
    // store exactly what localStorage would store: strings (but allow null to remove)
    const r = nodeRef(key);
    if (value === null || value === undefined) {
        remove(r).catch(() => {}); // remove from firebase
        fbCache[key] = null;
    } else {
        // if value is object, convert to JSON string? To mimic localStorage behavior, only strings should be passed.
        // We'll store as-is (string or primitive) because your code usually passes strings (JSON stringified where needed).
        set(r, value).catch(() => {});
        fbCache[key] = value;
    }
}

function fbGetItem(key) {
    // synchronous read from cache; returns string or null like localStorage.getItem
    return (fbCache.hasOwnProperty(key) && fbCache[key] !== null) ? fbCache[key] : null;
}

function fbRemoveItem(key) {
    const r = nodeRef(key);
    remove(r).catch(() => {});
    fbCache[key] = null;
}

function fbClearAll() {
    // remove the whole root node (be careful); to mimic localStorage.clear
    const r = ref(db, fbRootPath);
    remove(r).catch(() => {});
    // clear local cache
    Object.keys(fbCache).forEach(k => fbCache[k] = null);
}

// Start listening to the commonly used keys right away
initFirebaseKV([
    "scores",
    "buzzed",
    "enableBuzzer",
    "answeringTeam",
    "stealMode",
    "outTeams",
    "submittedAnswer",
    // teamAnswer_<team> keys will be created on demand; we can optionally add listeners when needed
]);

// convenience: ensure team-specific answer listener subscription when needed
function ensureTeamAnswerWatch(team) {
    const key = `teamAnswer_${team}`;
    if (!fbUnsubs[key]) {
        const r = nodeRef(key);
        fbUnsubs[key] = onValue(r, (snap) => {
            fbCache[key] = snap.exists() ? snap.val() : null;
        });
    }
}

// ================= VARIABLES ================= 
// Keep scores in-memory same as before, but populate from firebase cache (stringified JSON) if present
let scores = { Zack: 0, Ryan: 0, Kyle: 0 };
const initialScoresVal = fbGetItem("scores");
if (initialScoresVal) {
    try {
        scores = JSON.parse(initialScoresVal);
    } catch (err) {
        // fallback to defaults
    }
}

let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10; // ✅ default 10s
let answerTime = 20; // ✅ default 20s

// ================= SETTINGS =================
function openSettingsModal() {
    document.getElementById("settingsModal").style.display = "flex";
    document.getElementById("buzzTimeInput").value = buzzTime;
    document.getElementById("answerTimeInput").value = answerTime;
}

function closeSettingsModal() {
    document.getElementById("settingsModal").style.display = "none";
}

function saveSettings() {
    buzzTime = parseInt(document.getElementById("buzzTimeInput").value) || 10;
    answerTime = parseInt(document.getElementById("answerTimeInput").value) || 20;

    alert("Settings saved! Buzz Time: " + buzzTime + "s, Answer Time: " + answerTime + "s");

    // ✅ Update circle immediately if a round is running
    if (mode === "buzz") {
        timeLeft = buzzTime;
        updateCircle(buzzTime, "lime", buzzTime);
        document.getElementById("circleTime").textContent = timeLeft;
    } else if (mode === "answer") {
        timeLeft = answerTime;
        updateCircle(answerTime, "yellow", answerTime);
        document.getElementById("circleTime").textContent = timeLeft;
    }

    closeSettingsModal();
}

// ================= QUESTIONS =================
const questions = {
    easy: [
        { q: "Who was the first President of the United States?", a: "George Washington" },
        { q: "Who is known as the Father of the Philippine Revolution?", a: "Andres Bonifacio" },
        { q: "In what year did the Philippines gain independence from Spain?", a: "1898" },
        { q: "Who wrote the Declaration of Independence?", a: "Thomas Jefferson" },
        { q: "What event started the American Revolution?", a: "Battles of Lexington and Concord" },
        { q: "Who is the national hero of the Philippines?", a: "Jose Rizal" },
        { q: "What was the first capital of the United States?", a: "Philadelphia" },
        { q: "Who led the Katipunan during the Philippine Revolution?", a: "Andres Bonifacio" }
    ],
    medium: [
        { q: "Guess the country flag:", a: "japan", img: "https://upload.wikimedia.org/wikipedia/en/9/9e/Flag_of_Japan.svg" },
        { q: "Guess the country flag:", a: "france", img: "https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg" },
        { q: "Guess the country flag:", a: "germany", img: "https://upload.wikimedia.org/wikipedia/en/b/ba/Flag_of_Germany.svg" },
        { q: "Guess the country flag:", a: "italy", img: "https://upload.wikimedia.org/wikipedia/en/0/03/Flag_of_Italy.svg" },
        { q: "Guess the country flag:", a: "brazil", img: "https://upload.wikimedia.org/wikipedia/en/0/05/Flag_of_Brazil.svg" },
        { q: "Guess the country flag:", a: "canada", img: "https://upload.wikimedia.org/wikipedia/commons/c/cf/Flag_of_Canada.svg" },
        { q: "Guess the country flag:", a: "india", img: "https://upload.wikimedia.org/wikipedia/en/4/41/Flag_of_India.svg" },
        { q: "Guess the country flag:", a: "south korea", img: "https://upload.wikimedia.org/wikipedia/commons/0/09/Flag_of_South_Korea.svg" }
    ],
    hard: [
        { q: "What particle carries a negative electric charge?", a: "Electron" },
        { q: "What is the most abundant gas in Earth's atmosphere?", a: "Nitrogen" },
        { q: "What force keeps planets in orbit around the Sun?", a: "Gravity" },
        { q: "Which part of the atom has no electric charge?", a: "Neutron" },
        { q: "Which blood type is known as the universal donor?", a: "O negative" },
        { q: "Which organ in the human body produces insulin?", a: "Pancreas" },
        { q: "What is the largest planet in our solar system?", a: "Jupiter" },
        { q: "Who proposed the three laws of motion?", a: "Isaac Newton" }
    ]
};

// ----------------- helpers for per-question state -----------------
function getOutTeams() {
    try {
        const raw = fbGetItem("outTeams");
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function setOutTeams(arr) {
    fbSetItem("outTeams", JSON.stringify(arr));
}

function resetTurnState() {
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
    fbRemoveItem("buzzed");
    fbRemoveItem("stealMode");
    fbRemoveItem("submittedAnswer");
    setOutTeams([]);
    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "⏳";
    }
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").innerText = "None yet";
    }
    if (document.getElementById("stealNotice")) {
        document.getElementById("stealNotice").innerText = "";
    }
}

// ================= ADMIN FUNCTIONS =================
let countdownInterval;
let timeLeft = buzzTime;
let mode = "buzz"; // "buzz" or "answer"

// We'll keep a reference to the buzzer firebase unsubscribe so we can remove it (mimics removeEventListener)
let buzzedUnsub = null;

function startRound() {
    clearInterval(countdownInterval);
    timeLeft = buzzTime;
    mode = "buzz";

    resetTurnState();
    fbSetItem("enableBuzzer", "true");
    fbSetItem("buzzed", ""); // empty string means no one yet
    fbSetItem("answeringTeam", "");

    updateCircle(buzzTime, "lime", buzzTime);
    document.getElementById("circleTime").textContent = timeLeft;
    document.getElementById("firstBuzz").textContent = "None yet";
    document.getElementById("stealNotice").textContent = ""; // clear message

    // Subscribe to firebase "buzzed" changes and call stopOnBuzz with storage-like event
    if (buzzedUnsub) {
        try { buzzedUnsub(); } catch (e) {}
        buzzedUnsub = null;
    }
    buzzedUnsub = onValue(nodeRef("buzzed"), (snap) => {
        const val = snap.exists() ? snap.val() : null;
        if (val) {
            // call your existing stopOnBuzz handler with event-like object
            stopOnBuzz({ key: "buzzed", newValue: val });
        }
    });

    countdownInterval = setInterval(runTimer, 1000);
}

function runTimer() {
    timeLeft--;
    document.getElementById("circleTime").textContent = timeLeft;

    if (mode === "buzz") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", buzzTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            // nobody buzzed
            clearInterval(countdownInterval);
            fbSetItem("enableBuzzer", "false");
            if (buzzedUnsub) {
                try { buzzedUnsub(); } catch (e) {}
                buzzedUnsub = null;
            }

            document.getElementById("circleTime").textContent = "⏳ No Buzz";
            playSound("timesUpSound");

            // ✅ show admin option to retry
            document.getElementById("stealNotice").innerHTML =
                `<button style="background:orange;padding:8px 16px;" onclick="startRound()">🔁 Repeat Buzz</button>`;
        }
    } else if (mode === "answer") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "yellow", answerTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            document.getElementById("circleTime").textContent = "⏳ Time's up!";
            playSound("timesUpSound");
        }
    }
}

// 🛑 If a team buzzes early
function stopOnBuzz(e) {
    if (e.key === "buzzed" && e.newValue) {
        const team = e.newValue;
        document.getElementById("firstBuzz").textContent = team;
        fbSetItem("answeringTeam", team);
        fbSetItem("enableBuzzer", "false");
        switchToAnswer(team);
    }
}


// 🔄 Switch from buzz mode to answer mode
function switchToAnswer(team) {
    clearInterval(countdownInterval);
    mode = "answer";
    timeLeft = answerTime;

    updateCircle(answerTime, "yellow", answerTime);
    document.getElementById("circleTime").textContent = timeLeft;

    countdownInterval = setInterval(runTimer, 1000);
    // stop listening for firebase buzz updates (we only want it during buzz mode)
    if (buzzedUnsub) {
        try { buzzedUnsub(); } catch (e) {}
        buzzedUnsub = null;
    }
}

// 🎨 Update circle progress
function updateCircle(time, color, max) {
    const circle = document.getElementById("circleProgress");
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(time, 0) / max;

    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = circumference - progress * circumference;
    circle.style.stroke = color;
}

// 🔊 Sound helper
function playSound(id) {
    const el = document.getElementById(id);
    if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
    }
}

function resetGame() {
    scores = { Zack: 0, Ryan: 0, Kyle: 0 };
    fbSetItem("scores", JSON.stringify(scores));
    updateScores();
    fbClearAll();
    location.reload();
}

function updateScores() {
    // Try to pull latest from firebase cache first
    const raw = fbGetItem("scores");
    if (raw) {
        try {
            scores = JSON.parse(raw);
        } catch (e) {}
    }
    if (document.getElementById("scoreZack")) {
        document.getElementById("scoreZack").innerText = scores.Zack;
        document.getElementById("scoreRyan").innerText = scores.Ryan;
        document.getElementById("scoreKyle").innerText = scores.Kyle;
    }
}

function highlightScore(team) {
    let td = document.getElementById("score" + team);
    if (td) {
        td.classList.add("highlight");
        setTimeout(() => td.classList.remove("highlight"), 1000);
    }
}

// ================= TEAM FUNCTIONS =================
function selectTeam(team) {
    // sessionStorage is client-local and identifies which team this browser is
    sessionStorage.setItem("team", team);
    document.getElementById("teamSelect").style.display = "none";
    document.getElementById("buzzerArea").style.display = "block";
    document.getElementById("teamName").innerText = "You are " + team;
}

function submitAnswer() {
    let team = sessionStorage.getItem("team");
    let ans = document.getElementById("teamAnswer").value;
    if (team && ans) {
        // persist team answer into firebase
        fbSetItem("teamAnswer_" + team, ans);
        fbSetItem("submittedAnswer", ans);
        document.getElementById("answerArea").style.display = "none";
        clearInterval(answerTimerInterval); // stop countdown on Admin when someone submits
    }
}

// ================= ANSWER TIMER =================
function startAnswerTimer(team) {
    let sec = answerTime;

    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";
    }

    clearInterval(answerTimerInterval);
    answerTimerInterval = setInterval(() => {
        // stop if that team already submitted
        let ans = fbGetItem("teamAnswer_" + team) || "";
        if (ans) {
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;
            return;
        }

        sec--;
        if (sec >= 0 && document.getElementById("submittedAnswer")) {
            document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";
        }

        if (sec < 0) {
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;

            if (document.getElementById("submittedAnswer")) {
                document.getElementById("submittedAnswer").innerText = "❌ No answer submitted";
            }
            handleTeamWrongOrTimeout(team, "TIME UP");
        }
    }, 1000);
}

// ============== Steal / Wrong / Reveal flow ==============
function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    // show status beside "First to Buzz"
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
    }

    // add to outTeams
    const outs = getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    setOutTeams(outs);

    // clear that team's pending state
    fbRemoveItem("buzzed");
    fbRemoveItem("teamAnswer_" + team);

    // Decide: still allow steal or reveal
    if (outs.length >= 3) {
        // All three teams are out -> reveal correct answer
        revealCorrectAnswerAndLock();
    } else {
        // Enable steal for remaining teams
        fbSetItem("stealMode", team);
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 STEAL MODE: " + team + " is OUT! Other teams can buzz.";
        }
        // Keep buzzer closed until a new team buzzes (handled by TEAM BUZZER watcher)
    }
}

function revealCorrectAnswerAndLock() {
    const correct = questions[currentLevel][currentQIndex].a;
    playSound("wrongSound"); // short cue before reveal (optional)
    alert("No team answered correctly. Correct answer is: " + correct);

    // display on Admin panel
    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
    }

    // lock question tile
    lockQuestion(currentLevel, currentQIndex);

    // fully stop/clear turn
    fbSetItem("enableBuzzer", "false");
    fbRemoveItem("buzzed");
    fbRemoveItem("stealMode");
    setOutTeams([]);
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
}

// ================= AUTO-CHECK BUZZ =================
// We'll emulate the original polling behavior but use fbGetItem instead of localStorage
if (document.getElementById("firstBuzz")) {
    setInterval(() => {
        let buzzed = fbGetItem("buzzed");

        if (buzzed) {
            // show who buzzed
            document.getElementById("firstBuzz").innerText = buzzed;
            // close buzzer while this team answers
            fbSetItem("enableBuzzer", "false");

            // start 20s answer window for this buzzing team
            if (!answerTimerInterval) {
                startAnswerTimer(buzzed);
            }

            // ensure we watch that team's answer key for changes
            ensureTeamAnswerWatch(buzzed);

            // check if they already submitted an answer
            let ans = fbGetItem("teamAnswer_" + buzzed) || "";
            if (ans) {
                // reflect to Admin immediately
                if (document.getElementById("submittedAnswer")) {
                    document.getElementById("submittedAnswer").innerText = "📝 " + ans;
                }
                clearInterval(answerTimerInterval);
                answerTimerInterval = null;

                // evaluate
                let correctAns = questions[currentLevel][currentQIndex].a.trim().toLowerCase();
                if (ans.trim().toLowerCase() === correctAns) {
                    playSound("correctSound");
                    let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;
                    scores[buzzed] += points;
                    fbSetItem("scores", JSON.stringify(scores));
                    updateScores();
                    highlightScore(buzzed);
                    alert(buzzed + " is CORRECT! +" + points + " pts");

                    // ✅ Stop at tama ang sagot
                    clearInterval(countdownInterval);
                    timeLeft = 0;
                    document.getElementById("circleTime").textContent = "0";
                    updateCircle(0, "lime", answerTime);

                    // show correct on Admin
                    if (document.getElementById("submittedAnswer")) {
                        document.getElementById("submittedAnswer").innerText = "✅ Correct: " + questions[currentLevel][currentQIndex].a;
                    }

                    // lock the question and reset turn state
                    lockQuestion(currentLevel, currentQIndex);
                    fbRemoveItem("buzzed");
                    fbRemoveItem("teamAnswer_" + buzzed);
                    fbRemoveItem("stealMode");
                    setOutTeams([]);
                } else {
                    // wrong answer -> mark OUT, allow steal or reveal
                    playSound("wrongSound");
                    handleTeamWrongOrTimeout(buzzed, "WRONG");
                }
            }
        }

        updateScores();
    }, 300);
}

// ================= TEAM BUZZER =================
if (document.getElementById("buzzerBtn")) {
    setInterval(() => {
        let enable = fbGetItem("enableBuzzer") === "true";
        let stealFrom = fbGetItem("stealMode");
        let team = sessionStorage.getItem("team");
        let alreadyBuzzed = fbGetItem("buzzed");
        const outs = getOutTeams();

        const canSteal = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
        const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

        if (canNormal || canSteal) {
            document.getElementById("buzzerBtn").disabled = false;
        } else {
            document.getElementById("buzzerBtn").disabled = true;
        }
    }, 200);

    document.getElementById("buzzerBtn").onclick = () => {
        let team = sessionStorage.getItem("team");
        if (team) {
            fbSetItem("buzzed", team);
            document.getElementById("buzzerBtn").disabled = true;
            document.getElementById("answerArea").style.display = "block";
            playSound("buzzSound");
        }
    }
}

// ================= QUESTION BOARD =================
function showBoard(level, btn) {
    currentLevel = level;
    renderBoard(level);
    fbSetItem("enableBuzzer", "false");

    // button highlight
    document.querySelectorAll(".level-btn").forEach(b => b.classList.remove("selected"));
    if (btn) btn.classList.add("selected");

    resetTurnState();
}

function renderBoard(level) {
    let container = document.getElementById("questionBox");
    container.innerHTML = "";
    container.classList.add("board");

    questions[level].forEach((q, idx) => {
        let item = document.createElement("div");
        item.className = "board-item";
        item.dataset.index = idx;
        item.innerText = (idx + 1);

        item.onclick = () => revealQuestion(idx, q, item, level);

        container.appendChild(item);
    });
}

function revealQuestion(index, question, element, level) {
    if (element.classList.contains("revealed")) return;

    if (level === "medium" && question.img) {
        element.innerHTML = question.q + "<br><img src='" + question.img + "' style='width:150px;margin-top:5px;'>";
    } else {
        element.innerText = question.q;
    }

    element.classList.add("revealed");

    // persist currentQuestion to firebase-backed storage
    fbSetItem("currentQuestion", question.q);
    currentQIndex = index;
    resetTurnState(); // reset per-question state when opening a fresh tile
}

// Lock box after answered
function lockQuestion(level, index) {
    let container = document.getElementById("questionBox");
    let items = container.querySelectorAll(".board-item");
    if (items[index]) {
        items[index].classList.add("revealed");
        items[index].onclick = null;
    }
}

// ================= EXTRA FUNCTIONS FOR SINGLE STEAL =================
let stealUsed = false; // ✅ track kung nagamit na ang steal

// ✅ Start Steal Mode countdown (10s buzz again)
function startStealMode(outTeam) {
    if (stealUsed) {
        revealCorrectAnswerAndLock();
        return;
    }
    stealUsed = true; // mark steal as already used

    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = buzzTime;

    // disable out team
    const outs = getOutTeams();
    if (!outs.includes(outTeam)) outs.push(outTeam);
    setOutTeams(outs);

    // reset buzz state but keep OUTS
    fbRemoveItem("buzzed");
    fbSetItem("enableBuzzer", "true");

    document.getElementById("circleTime").textContent = timeLeft;
    updateCircle(buzzTime, "lime", buzzTime);

    if (document.getElementById("stealNotice")) {
        document.getElementById("stealNotice").innerText = "🚨 STEAL MODE BEGIN! Other teams may buzz.";
    }

    playSound("stealBeginSound"); // optional sound

    // re-subscribe to firebase buzzed updates for new buzzes
    if (buzzedUnsub) {
        try { buzzedUnsub(); } catch (e) {}
        buzzedUnsub = null;
    }
    buzzedUnsub = onValue(nodeRef("buzzed"), (snap) => {
        const val = snap.exists() ? snap.val() : null;
        if (val) {
            stopOnBuzz({ key: "buzzed", newValue: val });
        }
    });

    countdownInterval = setInterval(runTimer, 1000);
}

// ✅ Override handleTeamWrongOrTimeout para limit 1 steal
const originalHandleWrong = handleTeamWrongOrTimeout;
handleTeamWrongOrTimeout = function(team, reasonLabel = "WRONG") {
    // call original to mark OUT
    originalHandleWrong(team, reasonLabel);

    const outs = getOutTeams();
    if (outs.length >= 3) {
        revealCorrectAnswerAndLock();
    } else {
        // only allow steal once
        startStealMode(team);
    }
};

// ✅ Reset steal flag per new round/question
const originalResetTurnState = resetTurnState;
resetTurnState = function() {
    stealUsed = false;
    originalResetTurnState();
};


function closeSettingsModal() {
  document.getElementById("settingsModal").style.display = "none";
}


window.startRound = startRound;
window.showBoard = showBoard;
window.resetGame = resetGame;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;


