// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const gameRef = doc(db, "game", "state");

// ================= VARIABLES =================
let scores = { Zack: 0, Ryan: 0, Kyle: 0 };
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10; 
let answerTime = 20; 

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
// ================= HELPERS =================
async function getOutTeams() {
  const snap = await getDoc(gameRef);
  return snap.exists() ? (snap.data().outTeams || []) : [];
}

async function setOutTeams(arr) {
  await updateDoc(gameRef, { outTeams: arr });
}

async function resetTurnState() {
  clearInterval(answerTimerInterval);
  answerTimerInterval = null;
  await updateDoc(gameRef, {
    buzzed: "",
    answeringTeam: "",
    submittedAnswer: "",
    stealMode: "",
    outTeams: []
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
let mode = "buzz"; // "buzz" or "answer"

async function startRound() {
  clearInterval(countdownInterval);
  timeLeft = buzzTime;
  mode = "buzz";

  await resetTurnState();
  await updateDoc(gameRef, { enableBuzzer: true });

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
    if (timeLeft > 5) playSound("beepSound");
    else if (timeLeft > 0) playSound("beepHighSound");

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      updateDoc(gameRef, { enableBuzzer: false });
      document.getElementById("circleTime").textContent = "⏳ No Buzz";
      playSound("timesUpSound");
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

function switchToAnswer(team) {
  clearInterval(countdownInterval);
  mode = "answer";
  timeLeft = answerTime;

  updateCircle(answerTime, "yellow", answerTime);
  document.getElementById("circleTime").textContent = timeLeft;
  countdownInterval = setInterval(runTimer, 1000);
}

// 🎨 Circle
function updateCircle(time, color, max) {
  const circle = document.getElementById("circleProgress");
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(time, 0) / max;

  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference - progress * circumference;
  circle.style.stroke = color;
}

// 🔊 Sound
function playSound(id) {
  const el = document.getElementById(id);
  if (el) {
    el.currentTime = 0;
    el.play().catch(() => {});
  }
}

// ================= GAME STATE MANAGEMENT =================
async function resetGame() {
  scores = { Zack: 0, Ryan: 0, Kyle: 0 };
  await setDoc(gameRef, {
    scores,
    buzzed: "",
    answeringTeam: "",
    submittedAnswer: "",
    outTeams: [],
    enableBuzzer: false
  });
  updateScores();
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
  document.getElementById("teamSelect").style.display = "none";
  document.getElementById("buzzerArea").style.display = "block";
  document.getElementById("teamName").innerText = "You are " + team;
}

async function submitAnswer() {
  let team = sessionStorage.getItem("team");
  let ans = document.getElementById("teamAnswer").value;
  if (team && ans) {
    await updateDoc(gameRef, {
      ["teamAnswers." + team]: ans,
      submittedAnswer: ans
    });
    document.getElementById("answerArea").style.display = "none";
    clearInterval(answerTimerInterval);
  }
}

// ================= ANSWER TIMER =================
function startAnswerTimer(team) {
  let sec = answerTime;

  if (document.getElementById("submittedAnswer")) {
    document.getElementById("submittedAnswer").innerText = "⏳ " + sec + "s left...";
  }

  clearInterval(answerTimerInterval);
  answerTimerInterval = setInterval(async () => {
    const snap = await getDoc(gameRef);
    let ans = snap.data().teamAnswers?.[team] || "";
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

// ================= WRONG/TIMEOUT =================
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
  if (document.getElementById("firstBuzz")) {
    document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
  }

  let outs = await getOutTeams();
  if (!outs.includes(team)) outs.push(team);
  await setOutTeams(outs);

  if (outs.length >= 3) {
    revealCorrectAnswerAndLock();
  } else {
    await updateDoc(gameRef, { enableBuzzer: true });
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

function revealCorrectAnswerAndLock() {
  const correct = questions[currentLevel][currentQIndex].a;
  playSound("wrongSound");
  alert("No team answered correctly. Correct answer is: " + correct);

  if (document.getElementById("submittedAnswer")) {
    document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
  }
  lockQuestion(currentLevel, currentQIndex);
}

// ================= FIRESTORE REALTIME LISTENERS =================
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
    document.getElementById("firstBuzz").textContent = state.buzzed;
    if (!answerTimerInterval) startAnswerTimer(state.buzzed);
    if (state.submittedAnswer) {
      document.getElementById("submittedAnswer").innerText = "📝 " + state.submittedAnswer;
      // check correctness
      let correctAns = questions[currentLevel][currentQIndex].a.trim().toLowerCase();
      if (state.submittedAnswer.trim().toLowerCase() === correctAns) {
        playSound("correctSound");
        let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;
        scores[state.buzzed] += points;
        updateDoc(gameRef, { scores });
        updateScores();
        highlightScore(state.buzzed);
        alert(state.buzzed + " is CORRECT! +" + points + " pts");
        lockQuestion(currentLevel, currentQIndex);
      } else {
        playSound("wrongSound");
        handleTeamWrongOrTimeout(state.buzzed, "WRONG");
      }
    }
  }
});

// ================= TEAM BUZZER =================
if (document.getElementById("buzzerBtn")) {
  setInterval(async () => {
    const snap = await getDoc(gameRef);
    const state = snap.data();
    let team = sessionStorage.getItem("team");
    let alreadyBuzzed = state.buzzed;
    const outs = state.outTeams || [];

    const canBuzz = state.enableBuzzer && !alreadyBuzzed && !outs.includes(team);
    document.getElementById("buzzerBtn").disabled = !canBuzz;
  }, 200);

  document.getElementById("buzzerBtn").onclick = async () => {
    let team = sessionStorage.getItem("team");
    if (team) {
      await updateDoc(gameRef, { buzzed: team });
      document.getElementById("buzzerBtn").disabled = true;
      document.getElementById("answerArea").style.display = "block";
      playSound("buzzSound");
    }
  };
}

// ================= QUESTION BOARD =================
function showBoard(level, btn) {
  currentLevel = level;
  renderBoard(level);
  updateDoc(gameRef, { enableBuzzer: false });

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
