// script.js
// ================= FIREBASE SETUP =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase config (replace with your project’s config)
const firebaseConfig = {
    apiKey: "AIzaSyADxgFTvu0iycYC_ano36TFclPSh4YfqzE",
    authDomain: "gygames-fafcb.firebaseapp.com",
    databaseURL: "https://gygames-fafcb-default-rtdb.firebaseio.com",
    projectId: "gygames-fafcb",
    storageBucket: "gygames-fafcb.firebasestorage.app",
    messagingSenderId: "603231637988",
    appId: "1:603231637988:web:31ac4e91fcd58935ffb7f1",
    measurementId: "G-058J8NLC43"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);



// ================= VARIABLES =================
let scores = { Zack: 0, Ryan: 0, Kyle: 0 };
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval = null;
let answerTimerInterval = null;
let countdownInterval = null;
let timeLeft = 0;
let mode = "buzz"; // "buzz" or "answer"
let buzzTime = 10;
let answerTime = 20;
let stealUsed = false;

// snapshot unsubscribes
let buzzerUnsub = null;
let answersUnsub = null;
let buzzerListenerRegistered = false;

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

// ----------------- HELPERS FOR FIREBASE STATE -----------------
async function loadScores() {
    const docRef = doc(db, "game", "scores");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        scores = snap.data();
    } else {
        await setDoc(docRef, scores);
    }
}

async function saveScores() {
    const docRef = doc(db, "game", "scores");
    await setDoc(docRef, scores, { merge: true });
}

async function getOutTeams() {
    const docRef = doc(db, "game", "outTeams");
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data().teams : [];
}

async function setOutTeams(arr) {
    const docRef = doc(db, "game", "outTeams");
    await setDoc(docRef, { teams: arr }, { merge: true });
}

// unify buzzer state: enableBuzzer, buzzed, answeringTeam, stealMode
async function getBuzzerState() {
    const snap = await getDoc(doc(db, "game", "buzzer"));
    return snap.exists() ? snap.data() : {};
}

async function setBuzzerState(obj) {
    await setDoc(doc(db, "game", "buzzer"), obj, { merge: true });
}

// single resetTurnState (merged)
async function resetTurnState() {
    stealUsed = false;
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    // reset buzzer and outTeams
    await setBuzzerState({
        buzzed: "",
        enableBuzzer: false,
        answeringTeam: "",
        stealMode: false
    });
    await setOutTeams([]);

    // clear answers for safety (keeps doc but empties teams)
    await setDoc(doc(db, "game", "answers"), {
        Zack: "",
        Ryan: "",
        Kyle: "",
        submittedAnswer: ""
    }, { merge: true });

    // UI resets
    if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "⏳";
    if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").innerText = "None yet";
    if (document.getElementById("stealNotice")) document.getElementById("stealNotice").innerText = "";
}


function stopAllTimersAndSounds() {
    // stop timers
    clearInterval(countdownInterval);
    clearInterval(answerTimerInterval);
    countdownInterval = null;
    answerTimerInterval = null;

    // stop all sounds
    ["beepSound", "beepHighSound", "timesUpSound", "buzzSound", "correctSound", "wrongSound"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.pause();
            el.currentTime = 0;
        }
    });
}


// ================= ADMIN FUNCTIONS =================
let buzzerSnapshotCleanup = null;

async function startRound() {
    // stop existing countdown
    clearInterval(countdownInterval);
    timeLeft = buzzTime;
    mode = "buzz";

    await resetTurnState();
    await setBuzzerState({
        enableBuzzer: true,
        buzzed: "",
        answeringTeam: "",
        stealMode: false
    });

    updateCircle(buzzTime, "lime", buzzTime);
    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
    if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").textContent = "None yet";
    if (document.getElementById("stealNotice")) document.getElementById("stealNotice").textContent = "";

    // register a single buzzer snapshot listener (unsub first if already registered)
    if (buzzerUnsub) {
        buzzerUnsub();
        buzzerUnsub = null;
    }
    buzzerUnsub = onSnapshot(doc(db, "game", "buzzer"), (snap) => {
        const data = snap.exists() ? snap.data() : {};
        if (data.buzzed && data.buzzed !== "") {
            // buzz happened
            stopOnBuzz(data.buzzed).catch(console.error);
        }
    });

    countdownInterval = setInterval(runTimer, 1000);
}

function runTimer() {
    timeLeft--;
    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;

    if (mode === "buzz") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", buzzTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            setBuzzerState({ enableBuzzer: false }).catch(console.error);
            if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = "⏳ No Buzz";
            stopAllTimersAndSounds();
            playSound("timesUpSound");
            if (document.getElementById("stealNotice")) {
                document.getElementById("stealNotice").innerHTML =
                    `<button style="background:orange;padding:8px 16px;" onclick="startRound()">🔁 Repeat Buzz</button>`;
            }
        }
    } else if (mode === "answer") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "yellow", answerTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = "⏳ Time's up!";
            playSound("timesUpSound");
        }
    }
}

// 🛑 If a team buzzes early
async function stopOnBuzz(team) {
    if (!team) return;

    if (document.getElementById("firstBuzz"))
        document.getElementById("firstBuzz").textContent = team;

    await setBuzzerState({
        answeringTeam: team,
        enableBuzzer: false
    });

    switchToAnswer(team);
}

// 🔄 Switch from buzz mode to answer mode
function switchToAnswer(team) {
    clearInterval(countdownInterval);
    mode = "answer";
    timeLeft = answerTime;

    updateCircle(answerTime, "yellow", answerTime);
    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;

    // start answer countdown
    countdownInterval = setInterval(runTimer, 1000);
}

// 🎨 Update circle progress (SVG circle expected)
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

// 🔊 Sound helper
function playSound(id) {
    const el = document.getElementById(id);
    if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
    }
}

async function resetGame() {
    scores = { Zack: 0, Ryan: 0, Kyle: 0 };
    await setDoc(doc(db, "game", "scores"), scores);
    updateScores();
    await setBuzzerState({
        enableBuzzer: false,
        buzzed: "",
        answeringTeam: "",
        stealMode: false
    });
    await resetTurnState();
    location.reload();
}

function updateScores() {
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
    sessionStorage.setItem("team", team);
    if (document.getElementById("teamSelect")) document.getElementById("teamSelect").style.display = "none";
    if (document.getElementById("buzzerArea")) document.getElementById("buzzerArea").style.display = "block";
    if (document.getElementById("teamName")) document.getElementById("teamName").innerText = "You are " + team;
}

async function submitAnswer() {
    let team = sessionStorage.getItem("team");
    let ansEl = document.getElementById("teamAnswer");
    let ans = ansEl ? ansEl.value : "";
    if (team && ans) {
        await setDoc(doc(db, "game", "answers"), {
            [team]: ans,
            submittedAnswer: ans
        }, { merge: true });

        if (document.getElementById("answerArea")) document.getElementById("answerArea").style.display = "none";
        clearInterval(answerTimerInterval); // stop admin answer timer loop if running
    }
}

// ================= ANSWER TIMER & EVALUATION =================
function startAnswerTimer(team) {
    // will show on admin UI
    let sec = answerTime;
    if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";

    clearInterval(answerTimerInterval);
    answerTimerInterval = setInterval(async() => {
        // Check answers doc for this team's submission
        const snap = await getDoc(doc(db, "game", "answers"));
        const data = snap.exists() ? snap.data() : {};
        const ans = data[team] || "";

        if (ans && ans.trim() !== "") {
            // admin will evaluate via evaluateAnswer flow (answers snapshot handled below)
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
            if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "❌ No answer submitted";
            stopAllTimersAndSounds();
            await handleTeamWrongOrTimeout(team, "TIME UP");
        }
    }, 1000);
}

// central answer evaluation (called when answers doc changes)
async function evaluateAnswer(team, ans) {
    if (!team || !ans) return;

    if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "📝 " + ans;
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    const correctAns = (questions[currentLevel][currentQIndex].a || "").trim().toLowerCase();
    if (ans.trim().toLowerCase() === correctAns) {
        stopAllTimersAndSounds();
        playSound("correctSound");
        let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;
        scores[team] = (scores[team] || 0) + points;
        await saveScores();
        updateScores();
        highlightScore(team);
        alert(team + " is CORRECT! +" + points + " pts");

        // stop countdown & update UI
        clearInterval(countdownInterval);
        timeLeft = 0;
        if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = "0";
        updateCircle(0, "lime", answerTime);

        if (document.getElementById("submittedAnswer")) {
            document.getElementById("submittedAnswer").innerText = "✅ Correct: " + questions[currentLevel][currentQIndex].a;
        }

        // lock question and cleanup
        lockQuestion(currentLevel, currentQIndex);
        await setBuzzerState({ buzzed: "" });
        await setDoc(doc(db, "game", "answers"), {
            [team]: ""
        }, { merge: true });
        await setBuzzerState({ stealMode: false });
        await setOutTeams([]);
    } else {
        // wrong
        playSound("wrongSound");
        await handleTeamWrongOrTimeout(team, "WRONG");
    }
}

// ================= WRONG / TIMEOUT / STEAL =================
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";

    const outs = await getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    await setOutTeams(outs);

    // clear the buzz and that team's answer
    await setBuzzerState({ buzzed: "" });
    await setDoc(doc(db, "game", "answers"), {
        [team]: ""
    }, { merge: true });

    if (outs.length >= 3) {
        stopAllTimersAndSounds();
        await revealCorrectAnswerAndLock();
    } 
    else {
        // allow remaining teams to buzz (steal)
        await setBuzzerState({ enableBuzzer: true });
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText = "🚨 STEAL MODE: " + team + " is OUT! Remaining teams may buzz.";
        }

        // reset countdown for steal (buzz mode)
        clearInterval(countdownInterval);
        mode = "buzz";
        timeLeft = buzzTime;
        if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
        updateCircle(buzzTime, "lime", buzzTime);
        countdownInterval = setInterval(runTimer, 1000);
    }
}

async function revealCorrectAnswerAndLock() {
    const correct = questions[currentLevel][currentQIndex].a;
    playSound("wrongSound");
    stopAllTimersAndSounds();
    alert("No team answered correctly. Correct answer is: " + correct);

    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
    }

    lockQuestion(currentLevel, currentQIndex);
    stopAllTimersAndSounds();
    await setBuzzerState({
        enableBuzzer: false,
        buzzed: "",
        answeringTeam: "",
        stealMode: false
    });
    stopAllTimersAndSounds();
    await setOutTeams([]);
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
}

// single-use steal mode starter
async function startStealMode(team) {
    if (stealUsed) return;
    stealUsed = true;
    await setBuzzerState({ stealMode: true });
    if (document.getElementById("stealNotice")) {
        document.getElementById("stealNotice").innerText = "🚨 STEAL MODE activated! Other teams may buzz.";
    }
}

// ================= AUTO LISTENER FOR ANSWERS (real-time) =================
// Listen to answers doc changes to instantly evaluate answers when submitted
function registerAnswersListener() {
    if (answersUnsub) answersUnsub();
    answersUnsub = onSnapshot(doc(db, "game", "answers"), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        // find which team has a non-empty answer recently
        ["Zack", "Ryan", "Kyle"].forEach(team => {
            const ans = (data[team] || "").trim();
            if (ans) {
                evaluateAnswer(team, ans).catch(console.error);
            }
        });
    });
}

// ================= TEAM BUZZER UI (real-time enable/disable) =================
function registerTeamBuzzerUI() {
    onSnapshot(doc(db, "game", "buzzer"), async(snap) => {
        const data = snap.exists() ? snap.data() : {};
        let enable = data.enableBuzzer;
        let stealMode = !!data.stealMode; // true/false only
        let alreadyBuzzed = data.buzzed;
        let team = sessionStorage.getItem("team");
        const outs = await getOutTeams();

        // normal buzz: buzzer enabled, no one buzzed yet, and team not out
        const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

        // steal: same rules, but only active if stealMode is true
        const canSteal = stealMode && !alreadyBuzzed && !outs.includes(team);

        const btn = document.getElementById("buzzerBtn");
        if (btn) btn.disabled = !(canNormal || canSteal);
    });
}


// attach team buzzer click handler
if (document.getElementById("buzzerBtn")) {
    document.getElementById("buzzerBtn").onclick = async() => {
        let team = sessionStorage.getItem("team");
        if (!team) return;
        await setBuzzerState({ buzzed: team });
        const btn = document.getElementById("buzzerBtn");
        if (btn) btn.disabled = true;
        const area = document.getElementById("answerArea");
        if (area) area.style.display = "block";
        playSound("buzzSound");
    };
}

// ================= QUESTION BOARD =================
async function showBoard(level, btn) {
    currentLevel = level;
    renderBoard(level);
    await setBuzzerState({ enableBuzzer: false });

    document.querySelectorAll(".level-btn").forEach(b => b.classList.remove("selected"));
    if (btn) btn.classList.add("selected");

    await resetTurnState();
}

function renderBoard(level) {
    let container = document.getElementById("questionBox");
    if (!container) return;
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

async function revealQuestion(index, question, element, level) {
    if (element.classList.contains("revealed")) return;

    if (level === "medium" && question.img) {
        element.innerHTML = question.q + "<br><img src='" + question.img + "' style='width:150px;margin-top:5px;'>";
    } else {
        element.innerText = question.q;
    }

    element.classList.add("revealed");

    await setDoc(doc(db, "game", "currentQuestion"), {
        q: question.q,
        index,
        level
    });

    currentQIndex = index;
    await resetTurnState();
}

// Lock box after answered (UI only)
function lockQuestion(level, index) {
    let container = document.getElementById("questionBox");
    if (!container) return;
    let items = container.querySelectorAll(".board-item");
    if (items[index]) {
        items[index].classList.add("revealed");
        items[index].onclick = null;
    }
}

// ================= OVERRIDES / STARTUP =================
// Original handleTeamWrong override behavior is inherent in the single handleTeamWrongOrTimeout implemented above.
// Ensure listeners and state are initialized on load:
window.addEventListener("load", async() => {
    await loadScores();
    updateScores();

    // register answer listener and team UI listener
    registerAnswersListener();
    registerTeamBuzzerUI();

    // make sure buzzer doc exists
    await setBuzzerState({
        enableBuzzer: false,
        buzzed: "",
        answeringTeam: "",
        stealMode: false
    });

    // initially render easy board (if questionBox exists)
    if (document.getElementById("questionBox")) renderBoard("easy");
});

// Unsubscribe listeners on unload
window.addEventListener("beforeunload", () => {
    if (buzzerUnsub) buzzerUnsub();
    if (answersUnsub) answersUnsub();
});


// expose admin functions to global scope so HTML buttons work
window.startRound = startRound;
window.showBoard = showBoard;
window.resetGame = resetGame;
window.submitAnswer = submitAnswer;
window.selectTeam = selectTeam;
window.startStealMode = startStealMode;
