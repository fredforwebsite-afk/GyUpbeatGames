
// ================= FIREBASE INIT =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, get, child, onValue, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

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

// Helpers
const dbRef = (path) => ref(db, path);
const dbSet = (path, val) => set(dbRef(path), val);
const dbRemove = (path) => remove(dbRef(path));
const dbGet = (path) => get(path);
const dbChild = (parent, key) => child(parent, key);
const dbOnValue = (path, cb) => onValue(dbRef(path), cb);

// ================= VARIABLES =================
let scores = { Zack: 0, Ryan: 0, Kyle: 0 };
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10;
let answerTime = 20;

let countdownInterval;
let timeLeft = buzzTime;
let mode = "buzz"; // "buzz" or "answer"

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
async function getOutTeams() {
  const snapshot = await dbGet(dbRef("outTeams"));
  return snapshot.exists() ? snapshot.val() : [];
}

function setOutTeams(arr) {
  dbSet("outTeams", arr);
}

async function resetTurnState() {
  clearInterval(answerTimerInterval);
  answerTimerInterval = null;

  await Promise.all([
    dbRemove("buzzed"),
    dbRemove("stealMode"),
    dbRemove("submittedAnswer"),
    dbSet("outTeams", [])
  ]);

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
function startRound() {
  clearInterval(countdownInterval);
  timeLeft = buzzTime;
  mode = "buzz";

  resetTurnState();
  dbSet("enableBuzzer", true);
  dbSet("buzzed", "");
  dbSet("answeringTeam", "");

  updateCircle(buzzTime, "lime", buzzTime);
  document.getElementById("circleTime").textContent = timeLeft;
  document.getElementById("firstBuzz").textContent = "None yet";
  document.getElementById("stealNotice").textContent = "";

  countdownInterval = setInterval(runTimer, 1000);
}

function runTimer() {
  timeLeft--;
  document.getElementById("circleTime").textContent = timeLeft;

  if (mode === "buzz") {
    updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", buzzTime);

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      dbSet("enableBuzzer", false);

      document.getElementById("circleTime").textContent = "⏳ No Buzz";
      playSound("timesUpSound");

      document.getElementById("stealNotice").innerHTML =
        `<button style="background:orange;padding:8px 16px;" onclick="startRound()">🔁 Repeat Buzz</button>`;
    }
  } else if (mode === "answer") {
    updateCircle(timeLeft, timeLeft <= 5 ? "red" : "yellow", answerTime);

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      document.getElementById("circleTime").textContent = "⏳ Time's up!";
      playSound("timesUpSound");
    }
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

async function resetGame() {
  scores = { Zack: 0, Ryan: 0, Kyle: 0 };
  await dbSet("scores", scores);
  updateScores();
  await dbRemove(""); // clear root
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
  sessionStorage.setItem("team", team); // stays local
  document.getElementById("teamSelect").style.display = "none";
  document.getElementById("buzzerArea").style.display = "block";
  document.getElementById("teamName").innerText = "You are " + team;
}

function submitAnswer() {
  let team = sessionStorage.getItem("team");
  let ans = document.getElementById("teamAnswer").value;
  if (team && ans) {
    dbSet("teamAnswer_" + team, ans);
    dbSet("submittedAnswer", ans);
    document.getElementById("answerArea").style.display = "none";
    clearInterval(answerTimerInterval);
  }
}

// ================= BUZZ LISTENER =================
dbOnValue("buzzed", (snapshot) => {
  const team = snapshot.val();
  if (team) {
    document.getElementById("firstBuzz").textContent = team;
    dbSet("answeringTeam", team);
    dbSet("enableBuzzer", false);
    switchToAnswer(team);
  }
});

// ================= AUTO-CHECK BUZZ =================
dbOnValue("buzzed", async (snapshot) => {
  const buzzed = snapshot.val();
  if (!buzzed) return;

  document.getElementById("firstBuzz").innerText = buzzed;
  dbSet("enableBuzzer", false);

  if (!answerTimerInterval) {
    startAnswerTimer(buzzed);
  }

  const ansSnap = await dbGet(dbRef("teamAnswer_" + buzzed));
  let ans = ansSnap.exists() ? ansSnap.val() : "";

  if (ans) {
    if (document.getElementById("submittedAnswer")) {
      document.getElementById("submittedAnswer").innerText = "📝 " + ans;
    }
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    let correctAns = questions[currentLevel][currentQIndex].a.trim().toLowerCase();
    if (ans.trim().toLowerCase() === correctAns) {
      playSound("correctSound");
      let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;
      scores[buzzed] += points;
      dbSet("scores", scores);
      updateScores();
      highlightScore(buzzed);
      alert(buzzed + " is CORRECT! +" + points + " pts");

      clearInterval(countdownInterval);
      timeLeft = 0;
      document.getElementById("circleTime").textContent = "0";
      updateCircle(0, "lime", answerTime);

      if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "✅ Correct: " + questions[currentLevel][currentQIndex].a;
      }

      lockQuestion(currentLevel, currentQIndex);
      dbRemove("buzzed");
      dbRemove("teamAnswer_" + buzzed);
      dbRemove("stealMode");
      setOutTeams([]);
    } else {
      playSound("wrongSound");
      handleTeamWrongOrTimeout(buzzed, "WRONG");
    }
  }

  updateScores();
});

// ================= TEAM BUZZER =================
if (document.getElementById("buzzerBtn")) {
  dbOnValue("enableBuzzer", async (snapshot) => {
    let enable = snapshot.val() === true;
    let stealFromSnap = await dbGet(dbRef("stealMode"));
    let stealFrom = stealFromSnap.exists() ? stealFromSnap.val() : null;
    let team = sessionStorage.getItem("team");
    let buzzedSnap = await dbGet(dbRef("buzzed"));
    let alreadyBuzzed = buzzedSnap.exists() ? buzzedSnap.val() : "";
    const outs = await getOutTeams();

    const canSteal = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
    const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

    document.getElementById("buzzerBtn").disabled = !(canNormal || canSteal);
  });

  document.getElementById("buzzerBtn").onclick = () => {
    let team = sessionStorage.getItem("team");
    if (team) {
      dbSet("buzzed", team);
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
  dbSet("enableBuzzer", false);

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

  dbSet("currentQuestion", question.q);
  currentQIndex = index;
  resetTurnState();
}

function lockQuestion(level, index) {
  let container = document.getElementById("questionBox");
  let items = container.querySelectorAll(".board-item");
  if (items[index]) {
    items[index].classList.add("revealed");
    items[index].onclick = null;
  }
}

window.startRound = startRound;
window.resetGame = resetGame;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.showBoard = showBoard;


