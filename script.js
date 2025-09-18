// game-firebase.js
// ES module. Include in your HTML with: <script type="module" src="game-firebase.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
    getFirestore,
    doc,
    setDoc,
    updateDoc,
    getDoc,
    onSnapshot,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/*
  1) Replace the firebaseConfig below with your Firebase project's config
  2) Ensure Firestore is enabled in your project
  3) This script expects the same DOM elements/IDs used in your original app
*/

// ======= FIREBASE CONFIG - REPLACE WITH YOUR VALUES =======
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
// =========================================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Documents used:
// game/state     - main shared state
// game/scores    - scores object {Zack: 0, Ryan:0, Kyle:0}
// game/answers   - object mapping team => submittedAnswer

const stateDoc = doc(db, "game", "state");
const scoresDoc = doc(db, "game", "scores");
const answersDoc = doc(db, "game", "answers");

// ================= LOCAL ORIGINALS (kept for reference) =================
let currentLevel = "easy";
let currentQIndex = 0;
let countdownInterval;
let answerTimerInterval;
let timeLeft;
let mode = "buzz"; // "buzz" or "answer"

// default settings (will sync locally, and UI uses these)
let buzzTime = 10;
let answerTime = 20;

// questions constant (unchanged)
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

// ================= REMOTE MIRRORS =================
let remoteState = {
    enableBuzzer: false,
    buzzed: "",
    answeringTeam: "",
    currentQuestion: "",
    currentLevel: "easy",
    currentQIndex: 0,
    outTeams: [],
    stealMode: "",
    submittedAnswer: ""
};
let remoteScores = { Zack: 0, Ryan: 0, Kyle: 0 };
let remoteAnswers = {}; // team -> answer

// steal guard (per-question) - stored locally per tab
let stealUsed = false;

// ------------------ FIRESTORE INITIALIZATION ------------------
async function ensureDocsExist() {
    const sSnap = await getDoc(stateDoc);
    if (!sSnap.exists()) {
        await setDoc(stateDoc, {
            enableBuzzer: false,
            buzzed: "",
            answeringTeam: "",
            currentQuestion: "",
            currentLevel: "easy",
            currentQIndex: 0,
            outTeams: [],
            stealMode: "",
            submittedAnswer: ""
        });
    }

    const scSnap = await getDoc(scoresDoc);
    if (!scSnap.exists()) {
        await setDoc(scoresDoc, { Zack: 0, Ryan: 0, Kyle: 0 });
    }

    const aSnap = await getDoc(answersDoc);
    if (!aSnap.exists()) {
        await setDoc(answersDoc, {});
    }
}

function startFirestoreListeners() {
    onSnapshot(stateDoc, (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        remoteState = {
            enableBuzzer: !!d.enableBuzzer,
            buzzed: d.buzzed || "",
            answeringTeam: d.answeringTeam || "",
            currentQuestion: d.currentQuestion || "",
            currentLevel: d.currentLevel || "easy",
            currentQIndex: typeof d.currentQIndex === "number" ? d.currentQIndex : 0,
            outTeams: Array.isArray(d.outTeams) ? d.outTeams : [],
            stealMode: d.stealMode || "",
            submittedAnswer: d.submittedAnswer || ""
        };
        // reflect to UI / behavior
        onRemoteStateUpdated();
    });

    onSnapshot(scoresDoc, (snap) => {
        if (!snap.exists()) return;
        remoteScores = snap.data();
        updateScores(); // update UI
    });

    onSnapshot(answersDoc, (snap) => {
        if (!snap.exists()) return;
        remoteAnswers = snap.data();
    });
}

// small helper to update a single field in state doc
async function setStateField(field, value) {
    try {
        await updateDoc(stateDoc, {
            [field]: value
        });
    } catch (err) {
        // if update fails (e.g., doc missing), set with merge
        await setDoc(stateDoc, {
            [field]: value
        }, { merge: true });
    }
}

// scores helpers
async function setScores(obj) {
    await setDoc(scoresDoc, obj);
}

async function updateScoreForTeam(team, delta) {
    const newScore = (remoteScores[team] || 0) + delta;
    await updateDoc(scoresDoc, {
        [team]: newScore
    }).catch(async() => {
        // fallback to set
        await setDoc(scoresDoc, {...remoteScores, [team]: newScore });
    });
}

// answers helpers
async function setTeamAnswer(team, answer) {
    try {
        await updateDoc(answersDoc, {
            [team]: answer
        });
    } catch (err) {
        await setDoc(answersDoc, {
            [team]: answer
        }, { merge: true });
    }
}

async function clearTeamAnswer(team) {
    try {
        // Firestore doesn't allow removing a single map key via updateDoc with undefined;
        // so we rewrite the answers object without that team.
        const snap = await getDoc(answersDoc);
        const data = snap.exists() ? snap.data() : {};
        if (data.hasOwnProperty(team)) {
            delete data[team];
            await setDoc(answersDoc, data);
        }
    } catch (e) {
        console.error("clearTeamAnswer error", e);
    }
}

// =================== UI, Timer, and Game Logic ===================
// These functions mirror your original app but use Firestore for shared state.
// They expect the same DOM elements to exist.

function openSettingsModal() {
    const el = document.getElementById("settingsModal");
    if (!el) return;
    el.style.display = "flex";
    const b = document.getElementById("buzzTimeInput");
    const a = document.getElementById("answerTimeInput");
    if (b) b.value = buzzTime;
    if (a) a.value = answerTime;
}

function closeSettingsModal() {
    const el = document.getElementById("settingsModal");
    if (el) el.style.display = "none";
}

function saveSettings() {
    const b = document.getElementById("buzzTimeInput");
    const a = document.getElementById("answerTimeInput");

    buzzTime = parseInt(b? .value || "") || 10;
    answerTime = parseInt(a? .value || "") || 20;

    alert("Settings saved! Buzz Time: " + buzzTime + "s, Answer Time: " + answerTime + "s");

    // If a round is currently running, update displayed circle/time
    if (mode === "buzz") {
        timeLeft = buzzTime;
        updateCircle(buzzTime, "lime", buzzTime);
        const ct = document.getElementById("circleTime");
        if (ct) ct.textContent = timeLeft;
    } else if (mode === "answer") {
        timeLeft = answerTime;
        updateCircle(answerTime, "yellow", answerTime);
        const ct = document.getElementById("circleTime");
        if (ct) ct.textContent = timeLeft;
    }

    closeSettingsModal();
}

// per-question state helpers (previously used localStorage)
async function getOutTeams() {
    return Array.isArray(remoteState.outTeams) ? [...remoteState.outTeams] : [];
}

async function setOutTeams(arr) {
    await setStateField("outTeams", arr);
}

async function resetTurnState() {
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
    await setStateField("buzzed", "");
    await setStateField("stealMode", "");
    await setStateField("submittedAnswer", "");
    await setStateField("answeringTeam", "");
    await setStateField("enableBuzzer", false);
    await setTeamAnswerClearAll();
    await setOutTeams([]);

    const sub = document.getElementById("submittedAnswer");
    if (sub) sub.innerText = "⏳";
    const first = document.getElementById("firstBuzz");
    if (first) first.innerText = "None yet";
    const steal = document.getElementById("stealNotice");
    if (steal) steal.innerText = "";
}

// clear all team answers (firestore map)
async function setTeamAnswerClearAll() {
    await setDoc(answersDoc, {}); // wipe
    remoteAnswers = {};
}

// ================== ADMIN: startRound / timer ==================
function startRound() {
    clearInterval(countdownInterval);
    timeLeft = buzzTime;
    mode = "buzz";

    resetTurnState(); // resets remote state too
    // enable buzzer globally
    setStateField("enableBuzzer", true);
    setStateField("buzzed", "");
    setStateField("answeringTeam", "");

    updateCircle(buzzTime, "lime", buzzTime);
    const ct = document.getElementById("circleTime");
    if (ct) ct.textContent = timeLeft;
    const first = document.getElementById("firstBuzz");
    if (first) first.textContent = "None yet";
    const sn = document.getElementById("stealNotice");
    if (sn) sn.textContent = "";

    // start countdown
    countdownInterval = setInterval(runTimer, 1000);
}

function runTimer() {
    timeLeft--;
    const ct = document.getElementById("circleTime");
    if (ct) ct.textContent = timeLeft;

    if (mode === "buzz") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", buzzTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            setStateField("enableBuzzer", false);
            // nobody buzzed
            if (ct) ct.textContent = "⏳ No Buzz";
            playSound("timesUpSound");
            const sn = document.getElementById("stealNotice");
            if (sn) {
                sn.innerHTML = `<button style="background:orange;padding:8px 16px;" onclick="startRound()">🔁 Repeat Buzz</button>`;
            }
        }
    } else if (mode === "answer") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "yellow", answerTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            const ct2 = document.getElementById("circleTime");
            if (ct2) ct2.textContent = "⏳ Time's up!";
            playSound("timesUpSound");
        }
    }
}

// When remote state changes, react accordingly
function onRemoteStateUpdated() {
    // If someone buzzed
    if (remoteState.buzzed) {
        const first = document.getElementById("firstBuzz");
        if (first) first.innerText = remoteState.buzzed;
        setStateField("enableBuzzer", false);
        if (!answerTimerInterval) {
            startAnswerTimer(remoteState.buzzed);
        }
        // If team already submitted, reflect immediately (handled elsewhere)
        const submitted = remoteAnswers[remoteState.buzzed] || "";
        if (submitted) {
            const sub = document.getElementById("submittedAnswer");
            if (sub) sub.innerText = "📝 " + submitted;
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;
            evaluateAnswer(remoteState.buzzed, submitted);
        }
    }

    // sync enable buzzer to buzzer button enable state (handled in setInterval UI poll)
    // Update other UI pieces
    updateScores();
}

// Evaluate an answer submitted by a team
async function evaluateAnswer(team, answerText) {
    const correctAns = (questions[currentLevel][currentQIndex].a || "").trim().toLowerCase();
    if ((answerText || "").trim().toLowerCase() === correctAns) {
        playSound("correctSound");
        const points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;
        await updateScoreForTeam(team, points);
        updateScores();
        highlightScore(team);
        alert(team + " is CORRECT! +" + points + " pts");

        clearInterval(countdownInterval);
        timeLeft = 0;
        const ct = document.getElementById("circleTime");
        if (ct) ct.textContent = "0";
        updateCircle(0, "lime", answerTime);

        const sub = document.getElementById("submittedAnswer");
        if (sub) sub.innerText = "✅ Correct: " + questions[currentLevel][currentQIndex].a;

        await lockQuestion(currentLevel, currentQIndex);
        await setStateField("buzzed", "");
        await clearTeamAnswer(team);
        await setStateField("stealMode", "");
        await setOutTeams([]);
    } else {
        // wrong answer
        playSound("wrongSound");
        await handleTeamWrongOrTimeout(team, "WRONG");
    }
}

// If a team buzzes (client-side buzzer button code sets remoteState.buzzed)
function stopOnBuzzRemote(team) {
    // Called when remote updates buzzed -> handled in onRemoteStateUpdated
    // Kept for compatibility with original naming
}

// Switch to answer mode (admin)
function switchToAnswer(team) {
    clearInterval(countdownInterval);
    mode = "answer";
    timeLeft = answerTime;
    updateCircle(answerTime, "yellow", answerTime);
    const ct = document.getElementById("circleTime");
    if (ct) ct.textContent = timeLeft;
    countdownInterval = setInterval(runTimer, 1000);
}

// Progress circle visual (same logic)
function updateCircle(time, color, max) {
    const circle = document.getElementById("circleProgress");
    if (!circle) return;
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(time, 0) / max;
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = circumference - progress * circumference;
    circle.style.stroke = color;
}

// ---- Sound helper ----
function playSound(id) {
    const el = document.getElementById(id);
    if (el) {
        el.currentTime = 0;
        el.play ? .().catch(() => {});
    }
}

// Reset game
async function resetGame() {
    remoteScores = { Zack: 0, Ryan: 0, Kyle: 0 };
    await setScores(remoteScores);
    updateScores();
    // clear state and answers
    await setDoc(stateDoc, {
        enableBuzzer: false,
        buzzed: "",
        answeringTeam: "",
        currentQuestion: "",
        currentLevel: "easy",
        currentQIndex: 0,
        outTeams: [],
        stealMode: "",
        submittedAnswer: ""
    });
    await setDoc(answersDoc, {});
    // reload page to reset UI (optional)
    location.reload();
}

// Update UI scores
function updateScores() {
    const z = document.getElementById("scoreZack");
    const r = document.getElementById("scoreRyan");
    const k = document.getElementById("scoreKyle");
    if (z) z.innerText = remoteScores.Zack ? ? 0;
    if (r) r.innerText = remoteScores.Ryan ? ? 0;
    if (k) k.innerText = remoteScores.Kyle ? ? 0;
}

function highlightScore(team) {
    const td = document.getElementById("score" + team);
    if (!td) return;
    td.classList.add("highlight");
    setTimeout(() => td.classList.remove("highlight"), 1000);
}

// ================= TEAM CLIENT FUNCTIONS =================
function selectTeam(team) {
    sessionStorage.setItem("team", team);
    const ts = document.getElementById("teamSelect");
    const ba = document.getElementById("buzzerArea");
    const tn = document.getElementById("teamName");
    if (ts) ts.style.display = "none";
    if (ba) ba.style.display = "block";
    if (tn) tn.innerText = "You are " + team;
}

// Called by team client to submit an answer
async function submitAnswer() {
    const team = sessionStorage.getItem("team");
    const ansEl = document.getElementById("teamAnswer");
    const ans = ansEl ? .value || "";
    if (team && ans) {
        await setTeamAnswer(team, ans);
        await setStateField("submittedAnswer", ans);
        // hide answer UI on client
        const aa = document.getElementById("answerArea");
        if (aa) aa.style.display = "none";
        clearInterval(answerTimerInterval);
        answerTimerInterval = null;
    }
}

// Start answer timer on admin when a team buzzes
function startAnswerTimer(team) {
    let sec = answerTime;
    const submittedEl = document.getElementById("submittedAnswer");
    if (submittedEl) submittedEl.innerText = "⏳ " + sec + "s left...";

    clearInterval(answerTimerInterval);
    answerTimerInterval = setInterval(async() => {
        // stop if that team already submitted
        const snap = await getDoc(answersDoc);
        const answers = snap.exists() ? snap.data() : {};
        const ans = answers[team] || "";
        if (ans) {
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;
            return;
        }

        sec--;
        if (sec >= 0 && submittedEl) {
            submittedEl.innerText = "⏳ " + sec + "s left...";
        }

        if (sec < 0) {
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;
            if (submittedEl) submittedEl.innerText = "❌ No answer submitted";
            await handleTeamWrongOrTimeout(team, "TIME UP");
        }
    }, 1000);
}

// ================= Steal / Wrong / Reveal flow =================
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    const first = document.getElementById("firstBuzz");
    if (first) first.innerText = team + " (" + reasonLabel + ")";

    // add to outTeams
    const outs = await getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    await setOutTeams(outs);

    // clear that team's pending state
    await setStateField("buzzed", "");
    await clearTeamAnswer(team);

    if (outs.length >= 3) {
        // reveal correct answer
        await revealCorrectAnswerAndLock();
    } else {
        // Enable steal for remaining teams
        await setStateField("stealMode", team);
        const sn = document.getElementById("stealNotice");
        if (sn) sn.innerText = "🚨 STEAL MODE: " + team + " is OUT! Other teams can buzz.";
        // Keep buzzer closed until a new team buzzes (client logic enables buzzer)
    }
}

async function revealCorrectAnswerAndLock() {
    const correct = (questions[currentLevel][currentQIndex].a || "");
    playSound("wrongSound");
    alert("No team answered correctly. Correct answer is: " + correct);

    const sub = document.getElementById("submittedAnswer");
    if (sub) sub.innerText = "💡 Correct Answer: " + correct;

    await lockQuestion(currentLevel, currentQIndex);

    await setStateField("enableBuzzer", false);
    await setStateField("buzzed", "");
    await setStateField("stealMode", "");
    await setOutTeams([]);
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
}

// ================= QUESTION BOARD =================
function showBoard(level, btn) {
    currentLevel = level;
    renderBoard(level);
    setStateField("enableBuzzer", false);

    document.querySelectorAll(".level-btn").forEach(b => b.classList.remove("selected"));
    if (btn) btn.classList.add("selected");

    resetTurnState();
}

function renderBoard(level) {
    const container = document.getElementById("questionBox");
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("board");

    questions[level].forEach((q, idx) => {
        const item = document.createElement("div");
        item.className = "board-item";
        item.dataset.index = idx;
        item.innerText = (idx + 1);
        item.onclick = () => revealQuestion(idx, q, item, level);
        container.appendChild(item);
    });
}

async function revealQuestion(index, question, element, level) {
    if (element.classList.contains("revealed")) return;

    if (level === "medium" && question.img) {
        element.innerHTML = question.q + "<br><img src='" + question.img + "' style='width:150px;margin-top:5px;'>";
    } else {
        element.innerText = question.q;
    }

    element.classList.add("revealed");
    await setStateField("currentQuestion", question.q);
    currentQIndex = index;
    currentLevel = level;
    await resetTurnState(); // reset per-question state when opening a fresh tile
}

async function lockQuestion(level, index) {
    const container = document.getElementById("questionBox");
    if (!container) return;
    const items = container.querySelectorAll(".board-item");
    if (items[index]) {
        items[index].classList.add("revealed");
        items[index].onclick = null;
    }
}

// ================= EXTRA: Single Steal logic (1 steal only) =================
function startStealMode(outTeam) {
    if (stealUsed) {
        revealCorrectAnswerAndLock();
        return;
    }
    stealUsed = true;

    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = buzzTime;

    // disable out team
    (async() => {
        const outs = await getOutTeams();
        if (!outs.includes(outTeam)) outs.push(outTeam);
        await setOutTeams(outs);

        await setStateField("buzzed", "");
        await setStateField("enableBuzzer", true);

        const ct = document.getElementById("circleTime");
        if (ct) ct.textContent = timeLeft;
        updateCircle(buzzTime, "lime", buzzTime);
        const sn = document.getElementById("stealNotice");
        if (sn) sn.innerText = "🚨 STEAL MODE BEGIN! Other teams may buzz.";
        playSound("stealBeginSound");
        countdownInterval = setInterval(runTimer, 1000);
    })();
}

// override to allow only one steal per question
const originalHandleTeamWrongOrTimeout = handleTeamWrongOrTimeout;
handleTeamWrongOrTimeout = async function(team, reasonLabel = "WRONG") {
    await originalHandleTeamWrongOrTimeout(team, reasonLabel);
    const outs = await getOutTeams();
    if (outs.length >= 3) {
        await revealCorrectAnswerAndLock();
    } else {
        startStealMode(team);
    }
};

// reset steal flag per new round/question
const originalResetTurnState = resetTurnState;
resetTurnState = async function() {
    stealUsed = false;
    await originalResetTurnState();
};

// ================= TEAM BUZZER POLLING & BUTTON HOOKS (client-side) ================
// A lightweight poll updates buzzer button enable/disable state and auto-handles
// team buzz actions. Keep the same IDs: buzzerBtn

function setupBuzzerButtonBehavior() {
    const buzzerBtn = document.getElementById("buzzerBtn");
    if (!buzzerBtn) return;

    // Update enabled state periodically
    setInterval(async() => {
        const enable = remoteState.enableBuzzer === true;
        const stealFrom = remoteState.stealMode;
        const team = sessionStorage.getItem("team");
        const alreadyBuzzed = !!remoteState.buzzed;
        const outs = remoteState.outTeams || [];

        const canSteal = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
        const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

        buzzerBtn.disabled = !(canNormal || canSteal);
    }, 200);

    // When user presses buzzer, write to shared state
    buzzerBtn.onclick = async() => {
        const team = sessionStorage.getItem("team");
        if (!team) {
            alert("Please select a team first.");
            return;
        }
        // set buzzed team globally
        await setStateField("buzzed", team);
        buzzerBtn.disabled = true;
        const aa = document.getElementById("answerArea");
        if (aa) aa.style.display = "block";
        playSound("buzzSound");
    };
}

// AUTO-CHECK: Periodically examine remote answers and apply evaluation (serverless)
setInterval(async() => {
    if (!document.getElementById("firstBuzz")) return;
    const buzzed = remoteState.buzzed;
    if (buzzed) {
        document.getElementById("firstBuzz").innerText = buzzed;
        await setStateField("enableBuzzer", false);

        if (!answerTimerInterval) {
            startAnswerTimer(buzzed);
        }

        // check if they already submitted an answer
        const ans = (remoteAnswers[buzzed] || "").toString();
        if (ans) {
            if (document.getElementById("submittedAnswer")) {
                document.getElementById("submittedAnswer").innerText = "📝 " + ans;
            }
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;
            evaluateAnswer(buzzed, ans);
        }
    }
    updateScores();
}, 300);

// ================= Initialization =================
(async function init() {
    await ensureDocsExist();
    startFirestoreListeners();
    setupBuzzerButtonBehavior();

    // wire up global functions that other HTML buttons may call
    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;
    window.saveSettings = saveSettings;
    window.startRound = startRound;
    window.resetGame = resetGame;
    window.selectTeam = selectTeam;
    window.submitAnswer = submitAnswer;
    window.showBoard = showBoard;
    window.revealQuestion = revealQuestion;
    window.lockQuestion = lockQuestion;
    window.startStealMode = startStealMode;
    // for compatibility, expose some internals
    window.playSound = playSound;
    window.updateCircle = updateCircle;

    // initial UI population
    updateScores();
    renderBoard(currentLevel);

    // expose a helper to clear all answers if needed (admin)
    window.clearAllAnswers = async() => {
        await setDoc(answersDoc, {});
    };

    console.log("Firebase quiz module initialized.");
})();
