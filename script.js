// ================= FIREBASE SETUP =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================= VARIABLES =================
let scores = { Zack: 0, Ryan: 0, Kyle: 0 };
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10;   // ✅ default 10s
let answerTime = 20; // ✅ default 20s

// ✅ Load scores from Firestore
async function loadScores() {
  const docRef = doc(db, "gameData", "scores");
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    scores = docSnap.data();
  } else {
    await setDoc(docRef, scores);
  }
}
await loadScores();


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
async function getOutTeams() {
  const docRef = doc(db, "gameData", "state");
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().outTeams || [] : [];
}

async function setOutTeams(arr) {
  const docRef = doc(db, "gameData", "state");
  await setDoc(docRef, { outTeams: arr }, { merge: true });
}

async function resetTurnState() {
  clearInterval(answerTimerInterval);
  answerTimerInterval = null;

  const docRef = doc(db, "gameData", "state");
  await updateDoc(docRef, {
    buzzed: deleteField(),
    stealMode: deleteField(),
    submittedAnswer: deleteField(),
    outTeams: []
  }).catch(async () => {
    await setDoc(docRef, { outTeams: [] });
  });

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
let mode = "buzz";

async function startRound() {
  clearInterval(countdownInterval);
  timeLeft = buzzTime;
  mode = "buzz";

  await resetTurnState();

  const stateRef = doc(db, "gameData", "state");
  await setDoc(stateRef, {
    enableBuzzer: true,
    buzzed: "",
    answeringTeam: ""
  }, { merge: true });

  updateCircle(buzzTime, "lime", buzzTime);
  document.getElementById("circleTime").textContent = timeLeft;
  document.getElementById("firstBuzz").textContent = "None yet";
  document.getElementById("stealNotice").textContent = "";

  onSnapshot(stateRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (data.buzzed) stopOnBuzz(data.buzzed);
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
      clearInterval(countdownInterval);
      const stateRef = doc(db, "gameData", "state");
      updateDoc(stateRef, { enableBuzzer: false });
      document.getElementById("circleTime").textContent = "⏳ No Buzz";
      playSound("timesUpSound");
      document.getElementById("stealNotice").innerHTML =
        `<button style="background:orange;padding:8px 16px;" id="repeatBuzzBtn">🔁 Repeat Buzz</button>`;
      const btn = document.getElementById("repeatBuzzBtn");
      if (btn) btn.addEventListener("click", startRound);
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

async function stopOnBuzz(team) {
  if (!team) return;
  document.getElementById("firstBuzz").textContent = team;

  const stateRef = doc(db, "gameData", "state");
  await updateDoc(stateRef, { answeringTeam: team, enableBuzzer: false });
  switchToAnswer(team);
}

function switchToAnswer() {
  clearInterval(countdownInterval);
  mode = "answer";
  timeLeft = answerTime;
  updateCircle(answerTime, "yellow", answerTime);
  document.getElementById("circleTime").textContent = timeLeft;
  countdownInterval = setInterval(runTimer, 1000);
}

function updateCircle(time, color, max) {
  const circle = document.getElementById("circleProgress");
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
  await setDoc(doc(db, "gameData", "scores"), scores);
  await setDoc(doc(db, "gameData", "state"), {});
  updateScores();
  location.reload();
}

async function updateScores() {
  const snap = await getDoc(doc(db, "gameData", "scores"));
  if (snap.exists()) scores = snap.data();
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
  document.getElementById("teamSelect").style.display = "none";
  document.getElementById("buzzerArea").style.display = "block";
  document.getElementById("teamName").innerText = "You are " + team;
}

async function submitAnswer() {
  let team = sessionStorage.getItem("team");
  let ans = document.getElementById("teamAnswer").value;
  if (team && ans) {
    const stateRef = doc(db, "gameData", "state");
    await updateDoc(stateRef, { ["teamAnswer_" + team]: ans, submittedAnswer: ans })
      .catch(async () => {
        await setDoc(stateRef, { ["teamAnswer_" + team]: ans, submittedAnswer: ans });
      });
    document.getElementById("answerArea").style.display = "none";
    clearInterval(answerTimerInterval);
  }
}


// ================= ANSWER TIMER =================
async function startAnswerTimer(team) {
  let sec = answerTime;
  if (document.getElementById("submittedAnswer")) {
    document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";
  }
  clearInterval(answerTimerInterval);
  answerTimerInterval = setInterval(async () => {
    const snap = await getDoc(doc(db, "gameData", "state"));
    const data = snap.exists() ? snap.data() : {};
    let ans = data["teamAnswer_" + team] || "";
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

async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
  if (document.getElementById("firstBuzz")) {
    document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
  }
  const outs = await getOutTeams();
  if (!outs.includes(team)) outs.push(team);
  await setOutTeams(outs);
  const stateRef = doc(db, "gameData", "state");
  await updateDoc(stateRef, { buzzed: deleteField(), ["teamAnswer_" + team]: deleteField() });
  if (outs.length >= 3) {
    revealCorrectAnswerAndLock();
  } else {
    await updateDoc(stateRef, { enableBuzzer: true });
    document.getElementById("stealNotice").innerText =
      "🚨 STEAL MODE: " + team + " is OUT! Remaining teams may buzz.";
    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = buzzTime;
    document.getElementById("circleTime").textContent = timeLeft;
    updateCircle(buzzTime, "lime", buzzTime);
    countdownInterval = setInterval(runTimer, 1000);
  }
}

async function revealCorrectAnswerAndLock() {
  const correct = questions[currentLevel][currentQIndex].a;
  playSound("wrongSound");
  alert("No team answered correctly. Correct answer is: " + correct);
  if (document.getElementById("submittedAnswer")) {
    document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
  }
  lockQuestion(currentLevel, currentQIndex);
  const stateRef = doc(db, "gameData", "state");
  await updateDoc(stateRef, {
    enableBuzzer: false,
    buzzed: deleteField(),
    stealMode: deleteField(),
    outTeams: []
  });
  clearInterval(answerTimerInterval);
  answerTimerInterval = null;
}


// ================= AUTO-CHECK BUZZ =================
if (document.getElementById("firstBuzz")) {
  const stateRef = doc(db, "gameData", "state");
  onSnapshot(stateRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    let buzzed = data.buzzed || "";
    if (!buzzed) return;
    document.getElementById("firstBuzz").innerText = buzzed;
    await updateDoc(stateRef, { enableBuzzer: false });
    if (!answerTimerInterval) startAnswerTimer(buzzed);
    let ans = data["teamAnswer_" + buzzed] || "";
    if (ans) {
      if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "📝 " + ans;
      }
      clearInterval(answerTimerInterval);
      answerTimerInterval = null;
      let correctAns = questions[currentLevel][currentQIndex].a.trim().toLowerCase();
      if (ans.trim().toLowerCase() === correctAns) {
        playSound("correctSound");
        let points =
          currentLevel === "easy" ? 100 :
          currentLevel === "medium" ? 300 : 500;
        scores[buzzed] += points;
        await setDoc(doc(db, "gameData", "scores"), scores);
        updateScores();
        highlightScore(buzzed);
        alert(buzzed + " is CORRECT! +" + points + " pts");
        clearInterval(countdownInterval);
        timeLeft = 0;
        document.getElementById("circleTime").textContent = "0";
        updateCircle(0, "lime", answerTime);
        if (document.getElementById("submittedAnswer")) {
          document.getElementById("submittedAnswer").innerText =
            "✅ Correct: " + questions[currentLevel][currentQIndex].a;
        }
        lockQuestion(currentLevel, currentQIndex);
        await updateDoc(stateRef, {
          buzzed: deleteField(),
          ["teamAnswer_" + buzzed]: deleteField(),
          stealMode: deleteField(),
          outTeams: []
        });
      } else {
        playSound("wrongSound");
        handleTeamWrongOrTimeout(buzzed, "WRONG");
      }
    }
    updateScores();
  });
}


// ================= TEAM BUZZER =================
if (document.getElementById("buzzerBtn")) {
  const stateRef = doc(db, "gameData", "state");
  const team = sessionStorage.getItem("team");
  onSnapshot(stateRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const enable = !!data.enableBuzzer;
    const alreadyBuzzed = !!data.buzzed;
    const outs = await getOutTeams();
    const canBuzz = enable && !alreadyBuzzed && !outs.includes(team);
    document.getElementById("buzzerBtn").disabled = !canBuzz;
  });

  document.getElementById("buzzerBtn").addEventListener("click", async () => {
    playSound("buzzSound");
    const team = sessionStorage.getItem("team");
    if (!team) return;
    await updateDoc(stateRef, { buzzed: team }).catch(async () => {
      await setDoc(stateRef, { buzzed: team });
    });
    document.getElementById("answerArea").style.display = "block";
    document.getElementById("teamAnswer").value = "";
  });
}


// ================= QUESTION BOARD =================
function showBoard(level, btn) {
  currentLevel = level;
  let box = document.getElementById("questionBox");
  box.innerHTML = "";
  questions[level].forEach((q, i) => {
    let cell = document.createElement("div");
    cell.className = "q-cell";
    cell.innerText =
      level === "easy" ? "100" :
      level === "medium" ? "300" : "500";
    cell.addEventListener("click", () => showQuestion(level, i, cell));
    box.appendChild(cell);
  });
}

function showQuestion(level, index, cell) {
  currentQIndex = index;
  let qObj = questions[level][index];
  let content = qObj.q;
  if (qObj.img) {
    content += `<br><img src="${qObj.img}" style="width:150px;">`;
  }
  document.getElementById("revealAnswer").innerHTML = content;
}

function lockQuestion(level, index) {
  const box = document.getElementById("questionBox");
  if (box && box.children[index]) {
    box.children[index].classList.add("used");
    box.children[index].onclick = null;
  }
}


// ================= EVENT LISTENERS =================
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("startBtn")) {
    document.getElementById("startBtn").addEventListener("click", startRound);
  }
  if (document.getElementById("resetBtn")) {
    document.getElementById("resetBtn").addEventListener("click", resetGame);
  }
  document.querySelectorAll(".level-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const level = btn.dataset.level;
      showBoard(level, btn);
    });
  });
  document.querySelectorAll(".team-choice").forEach(btn => {
    btn.addEventListener("click", () => {
      const team = btn.dataset.team;
      selectTeam(team);
    });
  });
});


// ✅ Override handleTeamWrongOrTimeout para limit 1 steal
const originalHandleWrong = handleTeamWrongOrTimeout;
handleTeamWrongOrTimeout = async function (team, reasonLabel = "WRONG") {
  // call original to mark OUT
  await originalHandleWrong(team, reasonLabel);

  const outs = await getOutTeams();
  if (outs.length >= 3) {
    revealCorrectAnswerAndLock();
  } else {
    // only allow steal once
    startStealMode(team);
  }
};

// ✅ Reset steal flag per new round/question
const originalResetTurnState = resetTurnState;
resetTurnState = async function () {
  stealUsed = false;
  await originalResetTurnState();
};


