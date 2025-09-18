/* ================== Firebase + App Init ================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, set, update, onValue, push, remove, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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

/* ================== Local copied state (cache) ==================
   We'll keep a live `dbState` object updated with onValue listeners so
   the rest of your code can read the current shared state synchronously.
   All writes must go through the provided helper functions below.
*/
let dbState = {
    state: {
        enableBuzzer: false,
        buzzed: "",
        stealMode: "",
        currentQuestion: ""
    },
    scores: { Zack: 0, Ryan: 0, Kyle: 0 },
    answers: {}, // answers/<team> => string
    outTeams: [], // stored under /outTeams as object or array
};

/* ================== Database refs ================== */
const rootRef = ref(db, '/');
const stateRef = ref(db, '/state'); // enableBuzzer, buzzed, stealMode, currentQuestion, answeringTeam
const scoresRef = ref(db, '/scores'); // {Zack:0,...}
const answersRef = ref(db, '/answers'); // team answer values
const outTeamsRef = ref(db, '/outTeams'); // array/object of out teams
const metaRef = ref(db, '/meta'); // optional meta values like currentLevel, currentQIndex

/* ================== Listen for realtime updates ================== */
onValue(stateRef, (snap) => {
    const val = snap.val() || {};
    dbState.state = {...dbState.state, ...val };
    // update UI dependent on buzzed / firstBuzz etc
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").textContent = dbState.state.buzzed || "None yet";
    }
    // If buzzed changed and someone buzzed -> trigger admin-side logic
    // NOTE: admin logic also polling (see below) to evaluate answers.
});

onValue(scoresRef, (snap) => {
    dbState.scores = snap.val() || { Zack: 0, Ryan: 0, Kyle: 0 };
    updateScores();
});

onValue(answersRef, (snap) => {
    dbState.answers = snap.val() || {};
    // reflect submitted answer on admin panel
    if (document.getElementById("submittedAnswer")) {
        // if there's a current answering team, show their answer
        const ansTeam = dbState.state.answeringTeam;
        if (ansTeam && dbState.answers[ansTeam]) {
            document.getElementById("submittedAnswer").innerText = "📝 " + dbState.answers[ansTeam];
        }
    }
});

onValue(outTeamsRef, (snap) => {
    const val = snap.val();
    if (Array.isArray(val)) dbState.outTeams = val;
    else if (val) dbState.outTeams = Object.values(val);
    else dbState.outTeams = [];
    // Update any UI showing out teams if needed
});

onValue(metaRef, (snap) => {
    const val = snap.val() || {};
    // keep currentLevel and currentQIndex
    if (val.currentLevel) currentLevel = val.currentLevel;
    if (typeof val.currentQIndex === 'number') currentQIndex = val.currentQIndex;
});

/* ================== DB helper wrappers ================== */
async function dbSetState(key, value) {
    // write single key under state
    await update(stateRef, {
        [key]: value });
}

async function dbSetScores(obj) {
    await set(scoresRef, obj);
}

async function dbSetAnswer(team, ans) {
    await update(answersRef, {
        [team]: ans });
}

async function dbRemoveAnswer(team) {
    // remove by setting null
    await update(answersRef, {
        [team]: null });
}

async function dbSetOutTeams(arr) {
    // write as array
    await set(outTeamsRef, arr);
}

async function dbClearStateForTurn() {
    // set buzzed/stealMode/answeringTeam/currentQuestion appropriately
    await update(stateRef, {
        buzzed: "",
        stealMode: "",
        answeringTeam: "",
        currentQuestion: dbState.state.currentQuestion || ""
    });
    // clear answers
    await set(answersRef, {});
    await set(outTeamsRef, []);
}

/* ================== YOUR EXISTING GAME LOGIC (modified) ================== */

/* ---------- constants, questions, defaults ---------- */
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10; // default
let answerTime = 20;

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

/* ---------- helper to get outTeams (reads cached dbState) ---------- */
function getOutTeams() {
    return dbState.outTeams || [];
}

async function setOutTeams(arr) {
    dbState.outTeams = arr;
    await dbSetOutTeams(arr);
}

/* ---------- reset per-turn state ---------- */
async function resetTurnState() {
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    // clear DB-side per-turn keys
    await dbSetState('buzzed', "");
    await dbSetState('stealMode', "");
    await set(answersRef, {}); // clear answers
    await set(outTeamsRef, []);
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

/* =========== Admin / Timer / Round control =========== */
let countdownInterval;
let timeLeft = buzzTime;
let mode = "buzz"; // "buzz" or "answer"

/* Start a new round: sets enableBuzzer true in DB, clears turn state, starts timer */
async function startRound() {
    clearInterval(countdownInterval);
    timeLeft = buzzTime;
    mode = "buzz";

    await resetTurnState();
    await dbSetState('enableBuzzer', true);
    await dbSetState('buzzed', "");
    await dbSetState('answeringTeam', "");

    updateCircle(buzzTime, "lime", buzzTime);
    document.getElementById("circleTime").textContent = timeLeft;
    if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").textContent = "None yet";
    if (document.getElementById("stealNotice")) document.getElementById("stealNotice").textContent = "";

    // Listen for buzz via onValue already set above; admin logic also uses polling loop below
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
            dbSetState('enableBuzzer', false);
            document.getElementById("circleTime").textContent = "⏳ No Buzz";
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

/* When someone buzzes (dbState.state.buzzed changes), admin should react.
   We'll also have a periodic loop (every 300ms like original) to process answers.
*/

/* Switch to answer mode for a team */
function switchToAnswer(team) {
    clearInterval(countdownInterval);
    mode = "answer";
    timeLeft = answerTime;

    updateCircle(answerTime, "yellow", answerTime);
    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;

    // set answeringTeam in DB
    dbSetState('answeringTeam', team);
    countdownInterval = setInterval(runTimer, 1000);
}

/* playSound helper (unchanged) */
function playSound(id) {
    const el = document.getElementById(id);
    if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
    }
}

/* resetGame: clear scores from DB and reload */
async function resetGame() {
    const initScores = { Zack: 0, Ryan: 0, Kyle: 0 };
    dbState.scores = initScores;
    await dbSetScores(initScores);
    await set(stateRef, {}); // clear state
    await set(answersRef, {});
    await set(outTeamsRef, []);
    updateScores();
    location.reload();
}

/* updateScores uses dbState.scores */
function updateScores() {
    if (!dbState.scores) return;
    if (document.getElementById("scoreZack")) document.getElementById("scoreZack").innerText = dbState.scores.Zack || 0;
    if (document.getElementById("scoreRyan")) document.getElementById("scoreRyan").innerText = dbState.scores.Ryan || 0;
    if (document.getElementById("scoreKyle")) document.getElementById("scoreKyle").innerText = dbState.scores.Kyle || 0;
}

/* highlight score (visual) */
function highlightScore(team) {
    let td = document.getElementById("score" + team);
    if (td) {
        td.classList.add("highlight");
        setTimeout(() => td.classList.remove("highlight"), 1000);
    }
}

/* ========== Team functions (client-side) ========== */
function selectTeam(team) {
    sessionStorage.setItem("team", team);
    document.getElementById("teamSelect").style.display = "none";
    document.getElementById("buzzerArea").style.display = "block";
    document.getElementById("teamName").innerText = "You are " + team;
}

/* Team clicks the buzzer -> write to DB if allowed */
async function teamBuzz() {
    let team = sessionStorage.getItem("team");
    if (!team) {
    console.log("⚠ Please select a team first.");
    return;
}

    // check if allowed
    const enable = dbState.state.enableBuzzer === true;
    const alreadyBuzzed = dbState.state.buzzed;
    const outs = getOutTeams();
    const stealFrom = dbState.state.stealMode;
    const canSteal = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
    const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

    if (canNormal || canSteal) {
        await dbSetState('buzzed', team); // global notification
        await dbSetState('enableBuzzer', false); // close buzzer
        document.getElementById("buzzerBtn").disabled = true;
        if (document.getElementById("answerArea")) document.getElementById("answerArea").style.display = "block";
        playSound("buzzSound");
    } else {
        // not allowed
    }
}

/* Team submits answer: write to /answers/<team> */
async function submitAnswer() {
    let team = sessionStorage.getItem("team");
    let ansInput = document.getElementById("teamAnswer");
    let ans = ansInput ? ansInput.value : "";
    if (team && ans) {
        await dbSetAnswer(team, ans);
        await dbSetState('submittedAnswer', ans); // optional meta field
        if (document.getElementById("answerArea")) document.getElementById("answerArea").style.display = "none";
        clearInterval(answerTimerInterval);
        answerTimerInterval = null;
    }
}

/* Answer timer for admin side (uses DB answers to check submission) */
function startAnswerTimer(team) {
    let sec = answerTime;
    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";
    }
    clearInterval(answerTimerInterval);
    answerTimerInterval = setInterval(async() => {
        // stop if that team already submitted (check DB cache)
        let ans = (dbState.answers && dbState.answers[team]) || "";
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

/* ========== Wrong / Steal / Reveal logic ========== */
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
    }

    const outs = getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    await setOutTeams(outs);

    // clear that team's pending answer in DB
    await dbRemoveAnswer(team);
    await dbSetState('buzzed', "");

    if (outs.length >= 3) {
        revealCorrectAnswerAndLock();
    } else {
        await dbSetState('stealMode', team);
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 STEAL MODE: " + team + " is OUT! Other teams can buzz.";
        }
        // keep buzzer open for steal (admin should call startStealMode to begin timer)
    }
}

function revealCorrectAnswerAndLock() {
    const correct = questions[currentLevel][currentQIndex].a;
    playSound("wrongSound"); // cue
    // alert("No team answered correctly. Correct answer is: " + correct);
if (document.getElementById("submittedAnswer")) {
    document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
}
console.log("No team answered correctly. Correct: " + correct);


    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
    }

    // lock question UI
    lockQuestion(currentLevel, currentQIndex);

    // reset DB state for the turn
    dbSetState('enableBuzzer', false);
    dbSetState('buzzed', "");
    dbSetState('stealMode', "");
    setOutTeams([]);
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
}

/* ========== Polling/Processing loop (replaces localStorage polling) ==========
   We run a periodic loop similar to your original setInterval(300) that checks
   the `dbState` for buzzed value and answers, then evaluates correctness.
*/
setInterval(async() => {
    const buzzed = dbState.state.buzzed || "";
    if (buzzed) {
        // show who buzzed
        if (document.getElementById("firstBuzz")) {
            document.getElementById("firstBuzz").innerText = buzzed;
        }
        // close buzzer while this team answers
        await dbSetState('enableBuzzer', false);

        // start the 20s answer window for this buzzing team
        if (!answerTimerInterval) {
            startAnswerTimer(buzzed);
        }

        // check if they already submitted an answer (cached)
        let ans = (dbState.answers && dbState.answers[buzzed]) || "";
        if (ans) {
            // reflect to Admin immediately
            if (document.getElementById("submittedAnswer")) {
                document.getElementById("submittedAnswer").innerText = "📝 " + ans;
            }
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;

            // evaluate correctness
            let correctAns = (questions[currentLevel][currentQIndex].a || "").trim().toLowerCase();
            if (ans.trim().toLowerCase() === correctAns) {
                playSound("correctSound");
                let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;

                // update scores in DB
                const newScores = {...(dbState.scores || { Zack: 0, Ryan: 0, Kyle: 0 }) };
                newScores[buzzed] = (newScores[buzzed] || 0) + points;
                dbState.scores = newScores;
                await dbSetScores(newScores);

                updateScores();
                highlightScore(buzzed);
                // alert(buzzed + " is CORRECT! +" + points + " pts");
                console.log(`${buzzed} is CORRECT! +${points} pts`);


                // stop timers and lock the question
                clearInterval(countdownInterval);
                timeLeft = 0;
                if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = "0";
                updateCircle(0, "lime", answerTime);

                if (document.getElementById("submittedAnswer")) {
                    document.getElementById("submittedAnswer").innerText = "✅ Correct: " + questions[currentLevel][currentQIndex].a;
                }

                lockQuestion(currentLevel, currentQIndex);

                // clear buzz/answer/steal in DB for next turn
                await dbSetState('buzzed', "");
                await dbRemoveAnswer(buzzed);
                await dbSetState('stealMode', "");
                await setOutTeams([]);
            } else {
                playSound("wrongSound");
                await handleTeamWrongOrTimeout(buzzed, "WRONG");
            }
        }
    }

    updateScores();
}, 300);

/* ========== Team buzzer UI enabling loop (client) ========== */
if (document.getElementById("buzzerBtn")) {
    setInterval(() => {
        const enable = dbState.state.enableBuzzer === true;
        const stealFrom = dbState.state.stealMode;
        const team = sessionStorage.getItem("team");
        const alreadyBuzzed = dbState.state.buzzed;
        const outs = getOutTeams();

        const canSteal = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
        const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

        if (canNormal || canSteal) {
            document.getElementById("buzzerBtn").disabled = false;
        } else {
            document.getElementById("buzzerBtn").disabled = true;
        }
    }, 200);

    document.getElementById("buzzerBtn").onclick = teamBuzz;
}

/* ========== Question board rendering (mostly unchanged except DB meta write) ========== */
function showBoard(level, btn) {
    currentLevel = level;
    renderBoard(level);
    dbSetState('enableBuzzer', false);

    document.querySelectorAll(".level-btn").forEach(b => b.classList.remove("selected"));
    if (btn) btn.classList.add("selected");

    resetTurnState();
    // write meta currentLevel
    set(metaRef, { currentLevel, currentQIndex });
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

    dbSetState('currentQuestion', question.q);
    currentQIndex = index;
    // write meta currentLevel/currentQIndex
    set(metaRef, { currentLevel: level, currentQIndex: index });

    resetTurnState();
}

/* Lock box after answered */
function lockQuestion(level, index) {
    let container = document.getElementById("questionBox");
    let items = container.querySelectorAll(".board-item");
    if (items[index]) {
        items[index].classList.add("revealed");
        items[index].onclick = null;
    }
}

/* ========== Single-steal helpers (converted to DB flows) ========== */
let stealUsed = false;

function startStealMode(outTeam) {
    if (stealUsed) {
        revealCorrectAnswerAndLock();
        return;
    }
    stealUsed = true;

    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = buzzTime;

    // mark outTeam in outTeams
    const outs = getOutTeams();
    if (!outs.includes(outTeam)) outs.push(outTeam);
    setOutTeams(outs);

    dbSetState('buzzed', "");
    dbSetState('enableBuzzer', true);

    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
    updateCircle(buzzTime, "lime", buzzTime);

    if (document.getElementById("stealNotice")) {
        document.getElementById("stealNotice").innerText = "🚨 STEAL MODE BEGIN! Other teams may buzz.";
    }

    playSound("stealBeginSound");
    countdownInterval = setInterval(runTimer, 1000);
}

/* Override function to ensure only one steal */
const originalHandleWrong = handleTeamWrongOrTimeout;
handleTeamWrongOrTimeout = async function(team, reasonLabel = "WRONG") {
    await originalHandleWrong(team, reasonLabel);
    const outs = getOutTeams();
    if (outs.length >= 3) {
        revealCorrectAnswerAndLock();
    } else {
        startStealMode(team);
    }
};

/* Reset per-turn state wrapper to clear stealUsed flag */
const origResetTurnState = resetTurnState;
resetTurnState = async function() {
    stealUsed = false;
    await origResetTurnState();
};

/* ========== UI helpers (unchanged) ========== */
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

/* settings modal functions kept same but now they just update local values */
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
    // alert("Settings saved! Buzz Time: " + buzzTime + "s, Answer Time: " + answerTime + "s");
console.log(`Settings saved! Buzz: ${buzzTime}s, Answer: ${answerTime}s`);

    if (mode === "buzz") {
        timeLeft = buzzTime;
        updateCircle(buzzTime, "lime", buzzTime);
        if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
    } else if (mode === "answer") {
        timeLeft = answerTime;
        updateCircle(answerTime, "yellow", answerTime);
        if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
    }
    closeSettingsModal();
}

/* Expose some functions to global window so inline HTML buttons can call them */
window.startRound = startRound;
window.resetGame = resetGame;
window.selectTeam = selectTeam;
window.submitAnswer = submitAnswer;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.showBoard = showBoard;
window.teamBuzz = teamBuzz;

