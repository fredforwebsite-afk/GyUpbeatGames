// script.js (module)
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
} from "firebase/firestore";

// ---------------- FIREBASE CONFIG ----------------
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const gameRef = doc(db, "game", "state");

// ---------------- VARIABLES ----------------
let scores = { Zack: 0, Ryan: 0, Kyle: 0 };
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10;
let answerTime = 20;

// steal flag
let stealUsed = false;

// ---------------- QUESTIONS ----------------
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

// ---------------- SAFE FIRESTORE HELPERS ----------------
async function ensureGameDoc() {
  const snap = await getDoc(gameRef);
  if (!snap.exists()) {
    await setDoc(gameRef, {
      scores,
      buzzed: "",
      answeringTeam: "",
      submittedAnswer: "",
      outTeams: [],
      enableBuzzer: false,
      teamAnswers: {}
    });
  } else {
    const data = snap.data();
    if (data.scores) scores = data.scores;
  }
}

async function safeUpdate(updates) {
  try {
    await updateDoc(gameRef, updates);
  } catch (err) {
    // if update fails (doc may not exist), create/merge
    await setDoc(gameRef, updates, { merge: true });
  }
}

// ---------------- HELPERS ----------------
async function getOutTeams() {
  const snap = await getDoc(gameRef);
  return snap.exists() ? (snap.data().outTeams || []) : [];
}

async function setOutTeams(arr) {
  await safeUpdate({ outTeams: arr });
}

async function resetTurnState() {
  clearInterval(answerTimerInterval);
  answerTimerInterval = null;
  stealUsed = false;

  await safeUpdate({
    buzzed: "",
    answeringTeam: "",
    submittedAnswer: "",
    stealMode: "",
    outTeams: []
  });

  const elSubmitted = document.getElementById("submittedAnswer");
  if (elSubmitted) elSubmitted.innerText = "⏳";
  const elFirst = document.getElementById("firstBuzz");
  if (elFirst) elFirst.innerText = "None yet";
  const elSteal = document.getElementById("stealNotice");
  if (elSteal) elSteal.innerText = "";
}

// ---------------- ADMIN FUNCTIONS ----------------
let countdownInterval;
let timeLeft = buzzTime;
let mode = "buzz"; // "buzz" or "answer"

async function startRound() {
  clearInterval(countdownInterval);
  timeLeft = buzzTime;
  mode = "buzz";

  await resetTurnState();
  await safeUpdate({ enableBuzzer: true });

  updateCircle(buzzTime, "lime", buzzTime);
  const circleTime = document.getElementById("circleTime");
  if (circleTime) circleTime.textContent = timeLeft;
  const firstBuzz = document.getElementById("firstBuzz");
  if (firstBuzz) firstBuzz.textContent = "None yet";
  const stealNotice = document.getElementById("stealNotice");
  if (stealNotice) stealNotice.textContent = "";

  countdownInterval = setInterval(runTimer, 1000);
}

function runTimer() {
  timeLeft--;
  const circleTime = document.getElementById("circleTime");
  if (circleTime) circleTime.textContent = timeLeft;

  if (mode === "buzz") {
    updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", buzzTime);
    if (timeLeft > 5) playSound("beepSound");
    else if (timeLeft > 0) playSound("beepHighSound");

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      safeUpdate({ enableBuzzer: false });
      if (circleTime) circleTime.textContent = "⏳ No Buzz";
      playSound("timesUpSound");
      const stealNotice = document.getElementById("stealNotice");
      if (stealNotice) {
        stealNotice.innerHTML = `<button style="background:orange;padding:8px 16px;" id="repeatBuzzBtn">🔁 Repeat Buzz</button>`;
        const btn = document.getElementById("repeatBuzzBtn");
        if (btn) btn.onclick = () => startRound();
      }
    }
  } else if (mode === "answer") {
    updateCircle(timeLeft, timeLeft <= 5 ? "red" : "yellow", answerTime);
    if (timeLeft > 5) playSound("beepSound");
    else if (timeLeft > 0) playSound("beepHighSound");
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      if (circleTime) circleTime.textContent = "⏳ Time's up!";
      playSound("timesUpSound");
    }
  }
}

function switchToAnswer(team) {
  clearInterval(countdownInterval);
  mode = "answer";
  timeLeft = answerTime;

  updateCircle(answerTime, "yellow", answerTime);
  const circleTime = document.getElementById("circleTime");
  if (circleTime) circleTime.textContent = timeLeft;
  countdownInterval = setInterval(runTimer, 1000);
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

// ---------------- GAME STATE MANAGEMENT ----------------
async function resetGame() {
  scores = { Zack: 0, Ryan: 0, Kyle: 0 };
  await setDoc(gameRef, {
    scores,
    buzzed: "",
    answeringTeam: "",
    submittedAnswer: "",
    outTeams: [],
    enableBuzzer: false,
    teamAnswers: {}
  }, { merge: true });
  updateScores();
  location.reload();
}

function updateScores() {
  const sZ = document.getElementById("scoreZack");
  const sR = document.getElementById("scoreRyan");
  const sK = document.getElementById("scoreKyle");
  if (sZ) sZ.innerText = scores.Zack;
  if (sR) sR.innerText = scores.Ryan;
  if (sK) sK.innerText = scores.Kyle;
}

function highlightScore(team) {
  let td = document.getElementById("score" + team);
  if (td) {
    td.classList.add("highlight");
    setTimeout(() => td.classList.remove("highlight"), 1000);
  }
}

// ---------------- TEAM FUNCTIONS ----------------
function selectTeam(team) {
  sessionStorage.setItem("team", team);
  const sel = document.getElementById("teamSelect");
  const buz = document.getElementById("buzzerArea");
  const tn = document.getElementById("teamName");
  if (sel) sel.style.display = "none";
  if (buz) buz.style.display = "block";
  if (tn) tn.innerText = "You are " + team;
}

async function submitAnswer() {
  let team = sessionStorage.getItem("team");
  const input = document.getElementById("teamAnswer");
  let ans = input ? input.value : "";
  if (team && ans) {
    await safeUpdate({
      ["teamAnswers." + team]: ans,
      submittedAnswer: ans
    });
    const answerArea = document.getElementById("answerArea");
    if (answerArea) answerArea.style.display = "none";
    clearInterval(answerTimerInterval);
  }
}

// ---------------- ANSWER TIMER ----------------
function startAnswerTimer(team) {
  let sec = answerTime;
  const submittedEl = document.getElementById("submittedAnswer");
  if (submittedEl) submittedEl.innerText = "⏳ " + sec + "s left...";

  clearInterval(answerTimerInterval);
  answerTimerInterval = setInterval(async () => {
    const snap = await getDoc(gameRef);
    let ans = snap.exists() ? (snap.data().teamAnswers?.[team] || "") : "";
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
      handleTeamWrongOrTimeout(team, "TIME UP");
    }
  }, 1000);
}

// ---------------- WRONG/TIMEOUT ----------------
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
  const first = document.getElementById("firstBuzz");
  if (first) first.innerText = team + " (" + reasonLabel + ")";

  let outs = await getOutTeams();
  if (!outs.includes(team)) outs.push(team);
  await setOutTeams(outs);

  if (outs.length >= 3) {
    revealCorrectAnswerAndLock();
  } else {
    await safeUpdate({ enableBuzzer: true });
    const stealNotice = document.getElementById("stealNotice");
    if (stealNotice) stealNotice.innerText = "🚨 STEAL MODE: " + team + " is OUT! Remaining teams may buzz.";

    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = buzzTime;
    const circleTime = document.getElementById("circleTime");
    if (circleTime) circleTime.textContent = timeLeft;
    updateCircle(buzzTime, "lime", buzzTime);
    countdownInterval = setInterval(runTimer, 1000);
  }
}

function revealCorrectAnswerAndLock() {
  const correct = questions[currentLevel][currentQIndex].a;
  playSound("wrongSound");
  alert("No team answered correctly. Correct answer is: " + correct);

  const submittedEl = document.getElementById("submittedAnswer");
  if (submittedEl) submittedEl.innerText = "💡 Correct Answer: " + correct;
  lockQuestion(currentLevel, currentQIndex);
}

// ---------------- STEAL MODE (simple single-steal impl) ----------------
function startStealMode(team) {
  // only allow once per question
  if (stealUsed) return;
  stealUsed = true;
  // mark who was stolen from, useful if you want to limit
  safeUpdate({ stealMode: team });
}

// ---------------- FIRESTORE REALTIME LISTENER ----------------
async function attachRealtimeListener() {
  await ensureGameDoc();

  onSnapshot(gameRef, (snap) => {
    if (!snap.exists()) return;
    const state = snap.data();

    // update scores
    if (state.scores) {
      scores = state.scores;
      updateScores();
    }

    // buzz detection
    if (state.buzzed) {
      const first = document.getElementById("firstBuzz");
      if (first) first.textContent = state.buzzed;

      if (!answerTimerInterval) startAnswerTimer(state.buzzed);

      if (state.submittedAnswer) {
        const sub = document.getElementById("submittedAnswer");
        if (sub) sub.innerText = "📝 " + state.submittedAnswer;

        // check correctness only if current question exists
        const q = questions[currentLevel]?.[currentQIndex];
        if (q) {
          let correctAns = q.a.trim().toLowerCase();
          if (state.submittedAnswer.trim().toLowerCase() === correctAns) {
            playSound("correctSound");
            let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;
            scores[state.buzzed] = (scores[state.buzzed] || 0) + points;
            safeUpdate({ scores });
            updateScores();
            highlightScore(state.buzzed);
            alert(state.buzzed + " is CORRECT! +" + points + " pts");
            lockQuestion(currentLevel, currentQIndex);
            // clear turn
            safeUpdate({ buzzed: "", submittedAnswer: "", teamAnswers: {} });
          } else {
            playSound("wrongSound");
            handleTeamWrongOrTimeout(state.buzzed, "WRONG");
          }
        }
      }
    }
  });
}

// ---------------- TEAM BUZZER INIT (attach after DOM ready) ----------------
function initTeamBuzzer() {
  const buzBtn = document.getElementById("buzzerBtn");
  if (!buzBtn) return;

  // small interval to update enabled/disabled state (could be optimized)
  setInterval(async () => {
    const snap = await getDoc(gameRef);
    const state = snap.exists() ? snap.data() : {};
    let team = sessionStorage.getItem("team");
    let alreadyBuzzed = state.buzzed;
    const outs = state.outTeams || [];

    const canBuzz = state.enableBuzzer && !alreadyBuzzed && !outs.includes(team);
    buzBtn.disabled = !canBuzz;
  }, 250);

  buzBtn.onclick = async () => {
    let team = sessionStorage.getItem("team");
    if (team) {
      await safeUpdate({ buzzed: team, enableBuzzer: false });
      buzBtn.disabled = true;
      const answerArea = document.getElementById("answerArea");
      if (answerArea) answerArea.style.display = "block";
      playSound("buzzSound");
      switchToAnswer(team);
      safeUpdate({ answeringTeam: team });
    }
  };
}

// ---------------- QUESTION BOARD ----------------
function showBoard(level, btn) {
  currentLevel = level;
  renderBoard(level);
  safeUpdate({ enableBuzzer: false });

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
  currentQIndex = index;
  resetTurnState();
}

function lockQuestion(level, index) {
  const container = document.getElementById("questionBox");
  if (!container) return;
  let items = container.querySelectorAll(".board-item");
  if (items[index]) {
    items[index].classList.add("revealed");
    items[index].onclick = null;
  }
}

// ---------------- STARTUP ----------------
document.addEventListener("DOMContentLoaded", async () => {
  await ensureGameDoc();
  await attachRealtimeListener();

  // safe attach admin buttons (if present)
  const startBtn = document.getElementById("startRoundBtn");
  if (startBtn) startBtn.onclick = () => startRound();

  const resetBtn = document.getElementById("resetGameBtn");
  if (resetBtn) resetBtn.onclick = () => resetGame();

  // team buzzer
  initTeamBuzzer();

  // submit answer button
  const submitBtn = document.getElementById("submitAnswerBtn");
  if (submitBtn) submitBtn.onclick = () => submitAnswer();

  // optional: render default board if questionBox exists
  if (document.getElementById("questionBox")) renderBoard(currentLevel);
});
            
              

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


