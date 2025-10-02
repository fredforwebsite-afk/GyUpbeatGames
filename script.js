// ================= FIREBASE SETUP =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase config (replace with your project’s config)
const firebaseConfig = {
    apiKey: "AIzaSyADxgFTvu0iycYC_ano36TFclPSh4YfqE",
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

// ================= DEVICE + TEAM JOIN LOGIC =================
// Each browser/device gets a persistent deviceId in sessionStorage
function getOrCreateDeviceId() {
    let id = sessionStorage.getItem("deviceId");
    if (!id) {
        // Use crypto.randomUUID if available, otherwise fallback
        id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : 'dev-' + Date.now() + '-' + Math.floor(Math.random()*1e6);
        sessionStorage.setItem("deviceId", id);
    }
    return id;
}
const deviceId = getOrCreateDeviceId();

// Join limit per team
const MAX_DEVICES_PER_TEAM = 15;

async function getTeamDevicesDoc() {
    const snap = await getDoc(doc(db, "game", "teamDevices"));
    return snap.exists() ? snap.data() : {};
}

async function joinTeamDevices(team) {
    const ref = doc(db, "game", "teamDevices");
    const data = await getTeamDevicesDoc();
    const arr = Array.isArray(data[team]) ? data[team] : [];
    if (arr.includes(deviceId)) return true; // already joined
    if (arr.length >= MAX_DEVICES_PER_TEAM) {
        return false; // cannot join, limit reached
    }
    // merge: append deviceId
    await setDoc(ref, { [team]: [...arr, deviceId] }, { merge: true });
    return true;
}

async function leaveTeamDevices(team) {
    const ref = doc(db, "game", "teamDevices");
    const data = await getTeamDevicesDoc();
    const arr = Array.isArray(data[team]) ? data[team] : [];
    const filtered = arr.filter(d => d !== deviceId);
    await setDoc(ref, { [team]: filtered }, { merge: true });
}

// Ensure we remove on unload
window.addEventListener("beforeunload", async () => {
    const team = sessionStorage.getItem("team");
    if (team) {
        try { await leaveTeamDevices(team); } catch(_) {}
    }
});

// ================= VARIABLES (unchanged mostly) =================
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

// ----------------- HELPERS FOR FIREBASE STATE (adjusted) -----------------
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

// unify buzzer state -> now uses device fields like buzzedDevice and answeringDevice
async function getBuzzerState() {
    const snap = await getDoc(doc(db, "game", "buzzer"));
    return snap.exists() ? snap.data() : {};
}

async function setBuzzerState(obj) {
    await setDoc(doc(db, "game", "buzzer"), obj, { merge: true });
}

// Updated resetTurnState to clear device-specific answers too
async function resetTurnState() {
    stealUsed = false;
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    // reset buzzer and outTeams
    await setBuzzerState({
        buzzedDevice: "",
        buzzedTeam: "",
        enableBuzzer: false,
        answeringDevice: "",
        answeringTeam: "",
        stealMode: false
    });
    await setOutTeams([]);

    // clear answers for safety (we keep doc but reset submitted fields)
    await setDoc(doc(db, "game", "answers"), {
        submittedDevice: "",
        submittedTeam: "",
        // NOTE: device-specific answers will be removed by admin flow if desired
    }, { merge: true });

    // UI resets
    if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "⏳";
    if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").innerText = "None yet";
    if (document.getElementById("stealNotice")) document.getElementById("stealNotice").innerText = "";
}

function stopAllTimersAndSounds() {
    clearInterval(countdownInterval);
    clearInterval(answerTimerInterval);
    countdownInterval = null;
    answerTimerInterval = null;

    ["beepSound", "beepHighSound", "timesUpSound", "buzzSound", "correctSound", "wrongSound"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.pause();
            el.currentTime = 0;
        }
    });
}

// ================= ADMIN FUNCTIONS (startRound unchanged except uses new buzzer fields) =================
async function startRound() {
    clearInterval(countdownInterval);
    timeLeft = buzzTime;
    mode = "buzz";

    await resetTurnState();
    await setBuzzerState({
        enableBuzzer: true,
        buzzedDevice: "",
        buzzedTeam: "",
        answeringDevice: "",
        answeringTeam: "",
        stealMode: false
    });

    updateCircle(buzzTime, "lime", buzzTime);
    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
    if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").textContent = "None yet";
    if (document.getElementById("stealNotice")) document.getElementById("stealNotice").textContent = "";

    if (buzzerUnsub) { buzzerUnsub(); buzzerUnsub = null; }
    buzzerUnsub = onSnapshot(doc(db, "game", "buzzer"), (snap) => {
        const data = snap.exists() ? snap.data() : {};
        if (data.buzzedDevice && data.buzzedDevice !== "") {
            stopOnBuzzDevice(data.buzzedDevice, data.buzzedTeam).catch(console.error);
        }
    });

    countdownInterval = setInterval(runTimer, 1000);
}

function runTimer() {
    timeLeft--;
    if (document.getElementById("circleTime")) {
        document.getElementById("circleTime").textContent = timeLeft;
    }

    if (mode === "buzz") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", buzzTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            setBuzzerState({ enableBuzzer: false }).catch(console.error);
            if (document.getElementById("circleTime")) {
                document.getElementById("circleTime").textContent = "⏳ No Buzz";
            }
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
            if (document.getElementById("circleTime")) {
                document.getElementById("circleTime").textContent = "⏳ Time's up!";
            }
            playSound("timesUpSound");

            getBuzzerState().then(state => {
                const team = state.answeringTeam;
                const device = state.answeringDevice;
                if (team && device) {
                    handleTeamWrongOrTimeout(team, "TIME UP").catch(console.error);
                }
            });
        }
    }
}

// When a device buzzes: set answeringDevice + answeringTeam; only that device sees answer box
async function stopOnBuzzDevice(device, team) {
    if (!device) return;

    if (document.getElementById("firstBuzz"))
        document.getElementById("firstBuzz").textContent = team + " (" + device + ")";

    await setBuzzerState({
        answeringDevice: device,
        answeringTeam: team,
        enableBuzzer: false
    });

    switchToAnswer(device, team);
}

function switchToAnswer(device, team) {
    clearInterval(countdownInterval);
    mode = "answer";
    timeLeft = answerTime;

    updateCircle(answerTime, "yellow", answerTime);
    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;

    // start answer countdown
    countdownInterval = setInterval(runTimer, 1000);

    // start admin answer timer as well
    startAnswerTimerForDevice(device, team);
}

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
        buzzedDevice: "",
        buzzedTeam: "",
        answeringDevice: "",
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

// ================= TEAM SELECT / JOIN =================
async function selectTeam(team) {
    // Attempt to join teamDevices list (enforce limit)
    const ok = await joinTeamDevices(team);
    if (!ok) {
        alert(`${team} already has maximum (${MAX_DEVICES_PER_TEAM}) devices joined. Try another team or ask admin to increase limit.`);
        return;
    }

    sessionStorage.setItem("team", team);
    if (document.getElementById("teamSelect")) document.getElementById("teamSelect").style.display = "none";
    if (document.getElementById("buzzerArea")) document.getElementById("buzzerArea").style.display = "block";
    if (document.getElementById("teamName")) document.getElementById("teamName").innerText = "You are " + team + " (" + deviceId + ")";
}

// call leave on explicit leave (optional)
async function leaveTeam() {
    const team = sessionStorage.getItem("team");
    if (team) {
        await leaveTeamDevices(team);
        sessionStorage.removeItem("team");
        if (document.getElementById("teamSelect")) document.getElementById("teamSelect").style.display = "block";
        if (document.getElementById("buzzerArea")) document.getElementById("buzzerArea").style.display = "none";
    }
}

// ================= SUBMIT ANSWER (device-level) =================
async function submitAnswer() {
    let team = sessionStorage.getItem("team");
    let ansEl = document.getElementById("teamAnswer");
    let ans = ansEl ? ansEl.value : "";
    if (team && ans) {
        // Save answer keyed by deviceId and also mark submittedDevice and submittedTeam
        await setDoc(doc(db, "game", "answers"), {
            [deviceId]: ans,
            submittedDevice: deviceId,
            submittedTeam: team,
            level: currentLevel,
            index: currentQIndex
        }, { merge: true });

        if (document.getElementById("answerArea")) {
            document.getElementById("answerArea").style.display = "none";
        }
        clearInterval(answerTimerInterval);
    }
}

// ================= ANSWER TIMER & EVALUATION (admin) =================
function startAnswerTimerForDevice(device, team) {
    let sec = answerTime;
    if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";

    clearInterval(answerTimerInterval);
    answerTimerInterval = setInterval(async() => {
        const snap = await getDoc(doc(db, "game", "answers"));
        const data = snap.exists() ? snap.data() : {};
        const ans = data[device] || "";

        if (ans && ans.trim() !== "") {
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;
            // evaluate will be triggered by answers listener
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

async function evaluateAnswer(device, ans) {
    if (!device || !ans) return;

    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "📝 " + ans;
    }
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    const snap = await getDoc(doc(db, "game", "answers"));
    const answersData = snap.exists() ? snap.data() : {};
    const lvl = answersData.level || currentLevel;
    const idx = answersData.index ?? currentQIndex;
    const team = answersData.submittedTeam || (await getBuzzerState()).answeringTeam;

    const correctAns = (questions[lvl][idx].a || "").trim().toLowerCase();

    if (ans.trim().toLowerCase() === correctAns) {
        stopAllTimersAndSounds();
        playSound("correctSound");

        let points = (lvl === "easy") ? 100 : (lvl === "medium") ? 300 : 500;
        scores[team] = (scores[team] || 0) + points;

        await saveScores();
        updateScores();
        highlightScore(team);

        clearInterval(countdownInterval);
        timeLeft = 0;
        if (document.getElementById("circleTime")) {
            document.getElementById("circleTime").textContent = "0";
        }
        updateCircle(0, "lime", answerTime);

        if (document.getElementById("submittedAnswer")) {
            document.getElementById("submittedAnswer").innerText = "✅ " + team + " is CORRECT!";
        }

        lockQuestion(lvl, idx);
        await setBuzzerState({ buzzedDevice: "", answeringDevice: "", stealMode: false, answeringTeam: "" });
        // clear device answer
        await setDoc(doc(db, "game", "answers"), {
            [device]: ""
        }, { merge: true });
        await setOutTeams([]);
    } else {
        playSound("wrongSound");
        await handleTeamWrongOrTimeout(team, "WRONG");
    }
}

// ================= WRONG / TIMEOUT / STEAL (use team-level logic unchanged mostly) =================
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
    }

    const outs = await getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    await setOutTeams(outs);

    // clear buzzer and device answers
    await setBuzzerState({ buzzedDevice: "", answeringDevice: "", answeringTeam: "" });
    // clear any device answers for that team (optional admin cleanup)
    // NOTE: our answers doc keys are deviceIds; no easy reverse lookup here, admin may clear specific fields if needed

    const allTeams = ["Zack", "Ryan", "Kyle"];
    const remaining = allTeams.filter(t => !outs.includes(t));

    if (remaining.length === 0) {
        stopAllTimersAndSounds();
        await revealCorrectAnswerAndLock();
        return;
    }

    if (remaining.length === 1) {
        const lastTeam = remaining[0];
        await setBuzzerState({
            enableBuzzer: true,
            buzzedDevice: "",
            buzzedTeam: "",
            answeringDevice: "",
            answeringTeam: "",
            stealMode: true
        });

        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 FINAL CHANCE: " + lastTeam + " must buzz to answer!";
        }

        clearInterval(countdownInterval);
        mode = "buzz";
        timeLeft = buzzTime;
        if (document.getElementById("circleTime"))
            document.getElementById("circleTime").textContent = timeLeft;
        updateCircle(buzzTime, "lime", buzzTime);
        countdownInterval = setInterval(runTimer, 1000);

        return;
    } else if (remaining.length === 2) {
        await setBuzzerState({
            enableBuzzer: true,
            buzzedDevice: "",
            buzzedTeam: "",
            answeringDevice: "",
            answeringTeam: "",
            stealMode: true
        });
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 STEAL MODE: " + team + " is OUT! Remaining teams: " + remaining.join(", ");
        }
    }

    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = buzzTime;
    if (document.getElementById("circleTime"))
        document.getElementById("circleTime").textContent = timeLeft;
    updateCircle(buzzTime, "lime", buzzTime);
    countdownInterval = setInterval(runTimer, 1000);
}

async function revealCorrectAnswerAndLock() {
    const correct = questions[currentLevel][currentQIndex].a;
    playSound("wrongSound");
    stopAllTimersAndSounds();

    alert("No team answered correctly. Correct answer is: " + correct);

    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
    }
    if (document.getElementById("revealAnswer")) {
        document.getElementById("revealAnswer").innerText = "✔ Correct Answer: " + correct;
    }

    lockQuestion(currentLevel, currentQIndex);
    stopAllTimersAndSounds();
    await setBuzzerState({
        enableBuzzer: false,
        buzzedDevice: "",
        buzzedTeam: "",
        answeringDevice: "",
        answeringTeam: "",
        stealMode: false
    });
    await setOutTeams([]);
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
}

async function startStealMode(team) {
    if (stealUsed) return;
    stealUsed = true;
    await setBuzzerState({ stealMode: true });
    if (document.getElementById("stealNotice")) {
        document.getElementById("stealNotice").innerText = "🚨 STEAL MODE activated! Other teams may buzz.";
    }
}

// ================= AUTO LISTENER FOR ANSWERS (real-time) =================
function registerAnswersListener() {
    if (answersUnsub) answersUnsub();
    answersUnsub = onSnapshot(doc(db, "game", "answers"), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        // If admin saved submittedDevice, evaluate that device's answer
        const submittedDevice = data.submittedDevice || "";
        if (submittedDevice && (data[submittedDevice] || "").trim() !== "") {
            const ans = data[submittedDevice];
            evaluateAnswer(submittedDevice, ans).catch(console.error);
        } else {
            // Fallback: look for any deviceId key with non-empty value and evaluate (useful in some flows)
            Object.keys(data).forEach(key => {
                if (key === "submittedDevice" || key === "submittedTeam" || key === "level" || key === "index") return;
                const ans = (data[key] || "").trim();
                if (ans) {
                    evaluateAnswer(key, ans).catch(console.error);
                }
            });
        }
    });
}

// ================= TEAM BUZZER UI (device-level) =================
async function registerTeamBuzzerUI() {
    onSnapshot(doc(db, "game", "buzzer"), async (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const enable = !!data.enableBuzzer;
        const stealMode = !!data.stealMode;
        const alreadyBuzzedDevice = data.buzzedDevice || "";
        const answeringDevice = data.answeringDevice || "";
        const answeringTeam = data.answeringTeam || "";
        const team = sessionStorage.getItem("team");
        const outs = await getOutTeams();

        // device can buzz when: buzzer enabled, no buzzedDevice yet, this device's team is not out, and (if stealMode false then normal)
        const canBuzz = enable && !alreadyBuzzedDevice && !outs.includes(team) && !!team;

        const btn = document.getElementById("buzzerBtn");
        if (btn) btn.disabled = !canBuzz;

        // Show answerArea only if this device is the answeringDevice
        const area = document.getElementById("answerArea");
        if (area) {
            if (answeringDevice === deviceId) {
                area.style.display = "block";
            } else {
                area.style.display = "none";
            }
        }
    });
}

// attach team buzzer click handler (device-level)
if (document.getElementById("buzzerBtn")) {
    document.getElementById("buzzerBtn").onclick = async () => {
        let team = sessionStorage.getItem("team");
        if (!team) {
            alert("Please select a team first.");
            return;
        }

        // write buzzedDevice and buzzedTeam; snapshot listener will call stopOnBuzzDevice
        await setBuzzerState({
            buzzedDevice: deviceId,
            buzzedTeam: team,
            // Optionally set answeringDevice here as immediate claim
            answeringDevice: deviceId,
            answeringTeam: team
        });

        const btn = document.getElementById("buzzerBtn");
        if (btn) btn.disabled = true;

        playSound("buzzSound");
    };
}

// ================= QUESTION BOARD (unchanged most of it) =================
async function showBoard(level, btn) {
    currentLevel = level;

    let container = document.getElementById("questionBox");
    if (container) container.style.display = "grid";

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

function lockQuestion(level, index) {
    let container = document.getElementById("questionBox");
    if (!container) return;
    let items = container.querySelectorAll(".board-item");
    if (items[index]) {
        items[index].classList.add("revealed");
        items[index].onclick = null;
    }
}

function registerCurrentQuestionListener() {
    onSnapshot(doc(db, "game", "currentQuestion"), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        currentLevel = data.level;
        currentQIndex = data.index;

        if (document.getElementById("submittedAnswer")) {
            document.getElementById("submittedAnswer").innerText =
                "⏳ Waiting for answer (" + currentLevel.toUpperCase() + ")";
        }
    });
}

// ================= OVERRIDES / STARTUP =================
window.addEventListener("load", async() => {
    await loadScores();
    updateScores();

    registerAnswersListener();
    registerTeamBuzzerUI();
    registerCurrentQuestionListener();

    await setBuzzerState({
        enableBuzzer: false,
        buzzedDevice: "",
        buzzedTeam: "",
        answeringDevice: "",
        answeringTeam: "",
        stealMode: false
    });
});

// Unsubscribe listeners on unload (already handled above)
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
window.leaveTeam = leaveTeam;
window.startStealMode = startStealMode;
