/* ================== Firebase + App Init ================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  push,
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

/* ================== Realtime state mirror ==================
 We'll keep a local snapshot of the DB at /game/... so the rest of
 your code can use synchronous reads from this snapshot while
 writes go to firebase.
===========================================================*/

const stateRefRoot = ref(db, 'game');
const state = {
  scores: { Zack: 0, Ryan: 0, Kyle: 0 },
  outTeams: [],
  buzzed: "",
  enableBuzzer: false,
  answeringTeam: "",
  stealMode: "",
  submittedAnswer: "",
  teamAnswers: {}, // team -> answer
  currentQuestion: "",
  stealUsed: false,
  settings: { buzzTime: 10, answerTime: 20 }
};

// Write helper: updates a path in /game
function dbSet(path, value) {
  return set(ref(db, `game/${path}`), value);
}

function dbRemove(path) {
  return remove(ref(db, `game/${path}`));
}

function dbUpdate(obj) {
  // obj is relative keys under /game
  return update(ref(db, 'game'), obj);
}

// initialize default DB values if missing (one-time)
async function ensureInitialState() {
  try {
    const snap = await get(stateRefRoot);
    if (!snap.exists()) {
      await set(stateRefRoot, {
        scores: state.scores,
        outTeams: state.outTeams,
        buzzed: "",
        enableBuzzer: false,
        answeringTeam: "",
        stealMode: "",
        submittedAnswer: "",
        teamAnswers: {},
        currentQuestion: "",
        stealUsed: false,
        settings: { buzzTime: buzzTime, answerTime: answerTime }
      });
    } else {
      // fill local state with returned values (so UI starts with proper state)
      const val = snap.val();
      if (val.scores) state.scores = val.scores;
      if (val.outTeams) state.outTeams = val.outTeams;
      if (typeof val.buzzed !== 'undefined') state.buzzed = val.buzzed;
      if (typeof val.enableBuzzer !== 'undefined') state.enableBuzzer = val.enableBuzzer;
      if (val.answeringTeam) state.answeringTeam = val.answeringTeam;
      if (val.stealMode) state.stealMode = val.stealMode;
      if (typeof val.submittedAnswer !== 'undefined') state.submittedAnswer = val.submittedAnswer;
      if (val.teamAnswers) state.teamAnswers = val.teamAnswers;
      if (val.currentQuestion) state.currentQuestion = val.currentQuestion;
      if (typeof val.stealUsed !== 'undefined') state.stealUsed = val.stealUsed;
      if (val.settings) state.settings = val.settings;
    }
  } catch (err) {
    console.error("Error ensuring initial state:", err);
  }
}

// Setup realtime listeners to update our local state mirror
onValue(stateRefRoot, (snapshot) => {
  const val = snapshot.val() || {};
  // Update local snapshot for keys if present
  if (val.scores) state.scores = val.scores;
  if (val.outTeams) state.outTeams = val.outTeams;
  if (typeof val.buzzed !== 'undefined') state.buzzed = val.buzzed;
  if (typeof val.enableBuzzer !== 'undefined') state.enableBuzzer = val.enableBuzzer;
  if (typeof val.answeringTeam !== 'undefined') state.answeringTeam = val.answeringTeam;
  if (typeof val.stealMode !== 'undefined') state.stealMode = val.stealMode;
  if (typeof val.submittedAnswer !== 'undefined') state.submittedAnswer = val.submittedAnswer;
  if (val.teamAnswers) state.teamAnswers = val.teamAnswers;
  if (typeof val.currentQuestion !== 'undefined') state.currentQuestion = val.currentQuestion;
  if (typeof val.stealUsed !== 'undefined') state.stealUsed = val.stealUsed;
  if (val.settings) state.settings = val.settings;

  // Whenever the DB updates, reflect to UI where needed
  updateScores();
  reflectBuzzToAdmin();
  reflectSubmittedAnswerToAdmin();
  reflectOutTeamsUI();
});

// small convenience getters (synchronous reads from local snapshot)
function getState(key) {
  return state[key];
}

// helpers that were using localStorage before:
/* - scores => state.scores
   - getOutTeams/setOutTeams => state.outTeams + db
   - buzzed => state.buzzed
   - enableBuzzer => state.enableBuzzer
   - teamAnswer_<team> => state.teamAnswers[team]
   - submittedAnswer => state.submittedAnswer
   - stealMode => state.stealMode
   - currentQuestion => state.currentQuestion
*/

function getOutTeamsLocal() {
  return state.outTeams || [];
}
function setOutTeamsDB(arr) {
  state.outTeams = arr;
  return dbSet('outTeams', arr);
}

/* ================ Keep your app variables ================ */
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10; // defaults (will be synced from DB if set)
let answerTime = 20;

let countdownInterval;
let timeLeft = buzzTime;
let mode = "buzz"; // "buzz" or "answer"

/* ================ SETTINGS (modal) ================ */
function openSettingsModal() {
    document.getElementById("settingsModal").style.display = "flex";
    // use state.settings if present
    const s = getState('settings') || {buzzTime, answerTime};
    document.getElementById("buzzTimeInput").value = s.buzzTime ?? buzzTime;
    document.getElementById("answerTimeInput").value = s.answerTime ?? answerTime;
}

function closeSettingsModal() {
    document.getElementById("settingsModal").style.display = "none";
}

async function saveSettings() {
    buzzTime = parseInt(document.getElementById("buzzTimeInput").value) || 10;
    answerTime = parseInt(document.getElementById("answerTimeInput").value) || 20;

    // persist to DB
    await dbSet('settings', { buzzTime, answerTime });

    alert("Settings saved! Buzz Time: " + buzzTime + "s, Answer Time: " + answerTime + "s");

    // Update circle immediately if a round is running
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

/* ================= QUESTIONS =================
   (kept identical to your original questions)
*/
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

/* ================= helpers for per-question state (replaced localStorage functions) ================= */

// getOutTeams now uses local state mirror
function getOutTeams() {
    return getOutTeamsLocal();
}

// resetTurnState: clear per-question DB keys and local flags
async function resetTurnState() {
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    // clear DB keys that were previously in localStorage
    await dbUpdate({
      buzzed: "",
      stealMode: "",
      submittedAnswer: "",
      answeringTeam: ""
    });

    await setOutTeamsDB([]);
    stealUsed = false;

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

/* ================= ADMIN FUNCTIONS ================= */

function updateScores() {
    if (document.getElementById("scoreZack")) {
        const s = getState('scores') || {Zack:0,Ryan:0,Kyle:0};
        document.getElementById("scoreZack").innerText = s.Zack ?? 0;
        document.getElementById("scoreRyan").innerText = s.Ryan ?? 0;
        document.getElementById("scoreKyle").innerText = s.Kyle ?? 0;
    }
}

function highlightScore(team) {
    let td = document.getElementById("score" + team);
    if (td) {
        td.classList.add("highlight");
        setTimeout(() => td.classList.remove("highlight"), 1000);
    }
}

// reflect outTeams to UI (if you have some visual)
function reflectOutTeamsUI() {
  // implement as desired; placeholder to keep parity with previous UI updates
  // e.g. show which teams are out in an element with id outTeamsList
  const outs = getOutTeams();
  const el = document.getElementById('outTeamsList');
  if (el) {
    el.innerText = outs.join(', ');
  }
}

async function startRound() {
    clearInterval(countdownInterval);
    timeLeft = getState('settings')?.buzzTime ?? buzzTime;
    mode = "buzz";

    await resetTurnState();

    // enable buzzer in DB
    await dbSet('enableBuzzer', true);
    await dbSet('buzzed', "");
    await dbSet('answeringTeam', "");

    updateCircle(timeLeft, "lime", timeLeft);
    document.getElementById("circleTime").textContent = timeLeft;
    if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").textContent = "None yet";
    if (document.getElementById("stealNotice")) document.getElementById("stealNotice").textContent = ""; // clear message

    // start timer
    countdownInterval = setInterval(runTimer, 1000);
}

function runTimer() {
    timeLeft--;
    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;

    if (mode === "buzz") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", getState('settings')?.buzzTime ?? buzzTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            dbSet('enableBuzzer', false);
            document.getElementById("circleTime").textContent = "⏳ No Buzz";
            playSound("timesUpSound");

            // show admin option to retry
            if (document.getElementById("stealNotice")) {
                document.getElementById("stealNotice").innerHTML =
                    `<button style="background:orange;padding:8px 16px;" onclick="startRound()">🔁 Repeat Buzz</button>`;
            }
        }
    } else if (mode === "answer") {
        updateCircle(timeLeft, timeLeft <= 5 ? "red" : "yellow", getState('settings')?.answerTime ?? answerTime);

        if (timeLeft > 5) playSound("beepSound");
        else if (timeLeft > 0) playSound("beepHighSound");

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            document.getElementById("circleTime").textContent = "⏳ Time's up!";
            playSound("timesUpSound");
        }
    }
}

// When buzzed is changed in DB, admin should notice and switchToAnswer
function reflectBuzzToAdmin() {
  const buzzer = getState('buzzed') || "";
  if (buzzer && document.getElementById("firstBuzz")) {
    document.getElementById("firstBuzz").textContent = buzzer;
    dbSet('answeringTeam', buzzer);
    dbSet('enableBuzzer', false);
    switchToAnswer(buzzer);
  }
}

// When submittedAnswer is changed, reflect
function reflectSubmittedAnswerToAdmin() {
  const submitted = getState('submittedAnswer') || "";
  if (submitted && document.getElementById("submittedAnswer")) {
    document.getElementById("submittedAnswer").innerText = submitted;
  }
}

// If a client writes buzzed in DB, the admin's onValue will call reflectBuzzToAdmin -> switchToAnswer
function switchToAnswer(team) {
    clearInterval(countdownInterval);
    mode = "answer";
    timeLeft = getState('settings')?.answerTime ?? answerTime;

    updateCircle(timeLeft, "yellow", timeLeft);
    document.getElementById("circleTime").textContent = timeLeft;

    countdownInterval = setInterval(runTimer, 1000);
}

// playSound kept same
function playSound(id) {
    const el = document.getElementById(id);
    if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
    }
}

// resetGame - reset DB and local UI
async function resetGame() {
    state.scores = { Zack: 0, Ryan: 0, Kyle: 0 };
    await dbSet('scores', state.scores);
    updateScores();
    // clear game root
    await set(stateRefRoot, {
      scores: state.scores,
      outTeams: [],
      buzzed: "",
      enableBuzzer: false,
      answeringTeam: "",
      stealMode: "",
      submittedAnswer: "",
      teamAnswers: {},
      currentQuestion: "",
      stealUsed: false,
      settings: { buzzTime: buzzTime, answerTime: answerTime }
    });

    // reload the page to ensure clean state (optional)
    location.reload();
}

/* ================= TEAM FUNCTIONS (client side) ================= */

function selectTeam(team) {
    sessionStorage.setItem("team", team);
    document.getElementById("teamSelect").style.display = "none";
    document.getElementById("buzzerArea").style.display = "block";
    document.getElementById("teamName").innerText = "You are " + team;
}

async function submitAnswer() {
    let team = sessionStorage.getItem("team");
    let ans = document.getElementById("teamAnswer").value;
    if (team && ans) {
        // write to DB under teamAnswers and also set submittedAnswer for Admin display
        const updates = {};
        updates[`teamAnswers/${team}`] = ans;
        updates['submittedAnswer'] = ans;
        await dbUpdate(updates);

        if (document.getElementById("answerArea")) {
          document.getElementById("answerArea").style.display = "none";
        }
        clearInterval(answerTimerInterval); // stop admin countdown locally if present
    }
}

/* ================= ANSWER TIMER (admin-side) ================= */
function startAnswerTimer(team) {
    let sec = getState('settings')?.answerTime ?? answerTime;

    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";
    }

    clearInterval(answerTimerInterval);
    answerTimerInterval = setInterval(() => {
        // stop if that team already submitted in DB
        const ans = (getState('teamAnswers') || {})[team] || "";
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

/* ============== Steal / Wrong / Reveal flow ============== */
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
    }

    // add to outTeams in DB
    const outs = getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    await setOutTeamsDB(outs);

    // clear that team's pending state
    await dbSet(`teamAnswers/${team}`, "");
    await dbSet('buzzed', "");

    // Decide: still allow steal or reveal
    if (outs.length >= 3) {
        // All three teams are out -> reveal correct answer
        revealCorrectAnswerAndLock();
    } else {
        // Enable steal for remaining teams
        await dbSet('stealMode', team);
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 STEAL MODE: " + team + " is OUT! Other teams can buzz.";
        }
        // keep buzzer closed until new team buzzes; teams can still buzz if stealMode allows (client code handles)
    }
}

async function revealCorrectAnswerAndLock() {
    const correct = questions[currentLevel][currentQIndex].a;
    playSound("wrongSound"); // short cue
    alert("No team answered correctly. Correct answer is: " + correct);

    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
    }

    // lock question tile visually
    lockQuestion(currentLevel, currentQIndex);

    // fully stop/clear turn in DB
    await dbUpdate({
      enableBuzzer: false,
      buzzed: "",
      stealMode: "",
      currentQuestion: ""
    });
    await setOutTeamsDB([]);
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
}

/* ================= AUTO-CHECK BUZZ =================
   We'll use the realtime snapshot to act when buzzed/teamAnswers change
*/

// On DB update (onValue above) we reflect to admin. To maintain the previous
// behavior of periodic check and evaluation, wire a small check loop that
// checks for a buzz + teamAnswers and evaluates correctness.
setInterval(async () => {
    const buzzed = getState('buzzed') || "";

    if (buzzed) {
        // show who buzzed
        if (document.getElementById("firstBuzz")) {
            document.getElementById("firstBuzz").innerText = buzzed;
        }
        // close buzzer while this team answers
        await dbSet('enableBuzzer', false);

        // start answer timer for this buzzing team (if not already)
        if (!answerTimerInterval) {
            startAnswerTimer(buzzed);
        }

        // check if they already submitted an answer
        const ans = (getState('teamAnswers') || {})[buzzed] || "";
        if (ans) {
            // reflect to Admin immediately
            if (document.getElementById("submittedAnswer")) {
                document.getElementById("submittedAnswer").innerText = "📝 " + ans;
            }
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;

            // evaluate
            let correctAns = (questions[currentLevel][currentQIndex].a || "").trim().toLowerCase();
            if (ans.trim().toLowerCase() === correctAns) {
                playSound("correctSound");
                let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;

                // update scores in DB
                const newScores = Object.assign({}, getState('scores') || {Zack:0,Ryan:0,Kyle:0});
                newScores[buzzed] = (newScores[buzzed] || 0) + points;
                await dbSet('scores', newScores);

                updateScores();
                highlightScore(buzzed);
                alert(buzzed + " is CORRECT! +" + points + " pts");

                // Stop at correct
                clearInterval(countdownInterval);
                timeLeft = 0;
                if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = "0";
                updateCircle(0, "lime", answerTime);

                if (document.getElementById("submittedAnswer")) {
                    document.getElementById("submittedAnswer").innerText = "✅ Correct: " + questions[currentLevel][currentQIndex].a;
                }

                // lock the question and reset turn state
                lockQuestion(currentLevel, currentQIndex);
                await dbSet('buzzed', "");
                await dbSet(`teamAnswers/${buzzed}`, "");
                await dbSet('stealMode', "");
                await setOutTeamsDB([]);
            } else {
                // wrong answer -> mark OUT, allow steal or reveal
                playSound("wrongSound");
                handleTeamWrongOrTimeout(buzzed, "WRONG");
            }
        }
    }

    updateScores();
}, 300);

/* ================= TEAM BUZZER (client) =================
   The team button enabled/disabled logic now reads from state.enableBuzzer and
   state.stealMode and state.outTeams.
*/

if (document.getElementById("buzzerBtn")) {
    setInterval(() => {
        const enable = getState('enableBuzzer') === true;
        const stealFrom = getState('stealMode') || "";
        const team = sessionStorage.getItem("team");
        const alreadyBuzzed = getState('buzzed') || "";
        const outs = getOutTeams();

        const canSteal = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
        const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

        if (canNormal || canSteal) {
            document.getElementById("buzzerBtn").disabled = false;
        } else {
            document.getElementById("buzzerBtn").disabled = true;
        }
    }, 200);

    document.getElementById("buzzerBtn").onclick = async () => {
        let team = sessionStorage.getItem("team");
        if (team) {
            // write to shared DB so admin + other clients know
            await dbSet('buzzed', team);
            if (document.getElementById("buzzerBtn")) document.getElementById("buzzerBtn").disabled = true;
            if (document.getElementById("answerArea")) document.getElementById("answerArea").style.display = "block";
            playSound("buzzSound");
        }
    }
}

/* ================= QUESTION BOARD ================= */

function showBoard(level, btn) {
    currentLevel = level;
    renderBoard(level);
    // disable buzzer while browsing board
    dbSet('enableBuzzer', false);

    // button highlight
    document.querySelectorAll(".level-btn").forEach(b => b.classList.remove("selected"));
    if (btn) btn.classList.add("selected");

    resetTurnState();
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

function revealQuestion(index, question, element, level) {
    if (element.classList.contains("revealed")) return;

    if (level === "medium" && question.img) {
        element.innerHTML = question.q + "<br><img src='" + question.img + "' style='width:150px;margin-top:5px;'>";
    } else {
        element.innerText = question.q;
    }

    element.classList.add("revealed");

    // persist current question to DB
    dbSet('currentQuestion', question.q);
    currentQIndex = index;
    resetTurnState(); // reset per-question state when opening a fresh tile
}

// Lock box after answered
function lockQuestion(level, index) {
    let container = document.getElementById("questionBox");
    if (!container) return;
    let items = container.querySelectorAll(".board-item");
    if (items[index]) {
        items[index].classList.add("revealed");
        items[index].onclick = null;
    }
}

/* ================= EXTRA FUNCTIONS FOR SINGLE STEAL ================= */
let stealUsed = false; // track per question

async function startStealMode(outTeam) {
    if (stealUsed) {
        revealCorrectAnswerAndLock();
        return;
    }
    stealUsed = true;

    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = getState('settings')?.buzzTime ?? buzzTime;

    // disable out team
    const outs = getOutTeams();
    if (!outs.includes(outTeam)) outs.push(outTeam);
    await setOutTeamsDB(outs);

    // reset buzz state but keep outs
    await dbSet('buzzed', "");
    await dbSet('enableBuzzer', true);

    if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
    updateCircle(timeLeft, "lime", timeLeft);

    if (document.getElementById("stealNotice")) {
        document.getElementById("stealNotice").innerText = "🚨 STEAL MODE BEGIN! Other teams may buzz.";
    }

    playSound("stealBeginSound");

    countdownInterval = setInterval(runTimer, 1000);
}

// override handleTeamWrongOrTimeout to allow single steal
const originalHandleWrong = handleTeamWrongOrTimeout;
handleTeamWrongOrTimeout = async function(team, reasonLabel = "WRONG") {
    await originalHandleWrong(team, reasonLabel);

    const outs = getOutTeams();
    if (outs.length >= 3) {
        revealCorrectAnswerAndLock();
    } else {
        // only allow steal once
        startStealMode(team);
    }
};

// Reset steal flag per new round/question
const originalResetTurnState = resetTurnState;
resetTurnState = async function() {
    stealUsed = false;
    await originalResetTurnState();
};

/* ================= Utility: circle progress update (unchanged) ================= */
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

/* ================= Initialization ================= */

// ensure DB has basic keys and populate local snapshot, then update UI
(async function init() {
  // adopt settings defaults into local buzzTime/answerTime if DB has them
  await ensureInitialState();

  // if DB has settings, use them
  const s = getState('settings');
  if (s) {
    buzzTime = s.buzzTime ?? buzzTime;
    answerTime = s.answerTime ?? answerTime;
  }

  // initial UI updates
  updateScores();
  reflectOutTeamsUI();

  // if an admin page, you might want to render the default board
  if (document.getElementById("questionBox")) {
    renderBoard(currentLevel);
  }

  // optional: hook up startRound button if present
  const startBtn = document.getElementById('startRoundBtn');
  if (startBtn) startBtn.onclick = startRound;
})();
