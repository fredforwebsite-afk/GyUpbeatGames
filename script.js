// ================= FIREBASE SETUP =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
    // If no scores exist yet, create them
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

// ✅ Load outTeams from Firestore
async function getOutTeams() {
  const docRef = doc(db, "gameData", "state");
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data().outTeams || [];
  } else {
    return [];
  }
}

// ✅ Save outTeams to Firestore
async function setOutTeams(arr) {
  const docRef = doc(db, "gameData", "state");
  await setDoc(docRef, { outTeams: arr }, { merge: true });
}

// ✅ Reset state between turns
async function resetTurnState() {
  clearInterval(answerTimerInterval);
  answerTimerInterval = null;

  const docRef = doc(db, "gameData", "state");

  // Clear Firestore state
  await updateDoc(docRef, {
    buzzed: deleteField(),
    stealMode: deleteField(),
    submittedAnswer: deleteField(),
    outTeams: []
  }).catch(async () => {
    // If state doc doesn't exist, create it fresh
    await setDoc(docRef, { outTeams: [] });
  });

  // ✅ Reset UI elements (same as before)
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

// ✅ Start a new round
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

  // ✅ Real-time Firestore listener instead of storage event
  onSnapshot(stateRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (data.buzzed) stopOnBuzz(data.buzzed);
    }
  });

  countdownInterval = setInterval(runTimer, 1000);
}

// ✅ Timer logic
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

// 🛑 Handle a buzz event
async function stopOnBuzz(team) {
  if (!team) return;

  document.getElementById("firstBuzz").textContent = team;

  const stateRef = doc(db, "gameData", "state");
  await updateDoc(stateRef, {
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

// ✅ Reset the whole game
async function resetGame() {
  scores = { Zack: 0, Ryan: 0, Kyle: 0 };

  const scoresRef = doc(db, "gameData", "scores");
  await setDoc(scoresRef, scores);

  const stateRef = doc(db, "gameData", "state");
  await setDoc(stateRef, {}); // clears state

  updateScores();
  location.reload();
}

// ✅ Update score UI
async function updateScores() {
  const scoresRef = doc(db, "gameData", "scores");
  const snap = await getDoc(scoresRef);

  if (snap.exists()) {
    scores = snap.data();
  }

  if (document.getElementById("scoreZack")) {
    document.getElementById("scoreZack").innerText = scores.Zack;
    document.getElementById("scoreRyan").innerText = scores.Ryan;
    document.getElementById("scoreKyle").innerText = scores.Kyle;
  }
}

// ✅ Highlight a team's score
function highlightScore(team) {
  let td = document.getElementById("score" + team);
  if (td) {
    td.classList.add("highlight");
    setTimeout(() => td.classList.remove("highlight"), 1000);
  }
}
// ================= TEAM FUNCTIONS =================
function selectTeam(team) {
  // ✅ SessionStorage is fine for local identity
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

    // ✅ Save answer into Firestore
    await updateDoc(stateRef, {
      ["teamAnswer_" + team]: ans,
      submittedAnswer: ans
    }).catch(async () => {
      // If state doc doesn't exist yet, create it
      await setDoc(stateRef, {
        ["teamAnswer_" + team]: ans,
        submittedAnswer: ans
      });
    });

    document.getElementById("answerArea").style.display = "none";

    // Stop the admin's countdown
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
    // ✅ check Firestore instead of localStorage
    const stateRef = doc(db, "gameData", "state");
    const snap = await getDoc(stateRef);
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

// ✅ Handle wrong / timeout
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
  if (document.getElementById("firstBuzz")) {
    document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
  }

  const outs = await getOutTeams();
  if (!outs.includes(team)) outs.push(team);
  await setOutTeams(outs);

  const stateRef = doc(db, "gameData", "state");
  await updateDoc(stateRef, {
    buzzed: deleteField(),
    ["teamAnswer_" + team]: deleteField()
  });

  if (outs.length >= 3) {
    // lahat mali → reveal
    revealCorrectAnswerAndLock();
  } else {
    // may natitira → enable buzzer ulit
    await updateDoc(stateRef, { enableBuzzer: true });

    document.getElementById("stealNotice").innerText =
      "🚨 STEAL MODE: " + team + " is OUT! Remaining teams may buzz.";

    clearInterval(countdownInterval);
    mode = "buzz";
    timeLeft = buzzTime;
    document.getElementById("circleTime").textContent = timeLeft;
    updateCircle(buzzTime, "lime", buzzTime);
    countdownInterval = setInterval(runTimer, 1000);

    // Firestore snapshot listener is already running → no need for window.addEventListener
  }
}

// ✅ Reveal correct answer + lock tile
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

import { doc, onSnapshot, updateDoc, deleteField, setDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ================= AUTO-CHECK BUZZ =================
if (document.getElementById("firstBuzz")) {
  const stateRef = doc(db, "gameData", "state");

  onSnapshot(stateRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    let buzzed = data.buzzed || "";
    if (!buzzed) return;

    // show who buzzed
    document.getElementById("firstBuzz").innerText = buzzed;

    // close buzzer
    await updateDoc(stateRef, { enableBuzzer: false });

    // start 20s answer window
    if (!answerTimerInterval) {
      startAnswerTimer(buzzed);
    }

    // check if they already submitted an answer
    let ans = data["teamAnswer_" + buzzed] || "";
    if (ans) {
      // reflect answer to Admin immediately
      if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "📝 " + ans;
      }

      clearInterval(answerTimerInterval);
      answerTimerInterval = null;

      // evaluate
      let correctAns = questions[currentLevel][currentQIndex].a.trim().toLowerCase();
      if (ans.trim().toLowerCase() === correctAns) {
        playSound("correctSound");
        let points =
          currentLevel === "easy" ? 100 :
          currentLevel === "medium" ? 300 : 500;

        scores[buzzed] += points;

        // save scores to Firestore
        const scoresRef = doc(db, "gameData", "scores");
        await setDoc(scoresRef, scores);

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
          document.getElementById("submittedAnswer").innerText =
            "✅ Correct: " + questions[currentLevel][currentQIndex].a;
        }

        // lock the question + reset state
        lockQuestion(currentLevel, currentQIndex);
        await updateDoc(stateRef, {
          buzzed: deleteField(),
          ["teamAnswer_" + buzzed]: deleteField(),
          stealMode: deleteField(),
          outTeams: []
        });

      } else {
        // wrong answer → handle steal
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

  // ✅ Real-time check of buzzer availability
  onSnapshot(stateRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    const enable     = !!data.enableBuzzer;
    const stealFrom  = data.stealMode || "";
    const alreadyBuzzed = !!data.buzzed;
    const outs       = await getOutTeams();

    const canSteal  = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
    const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

    document.getElementById("buzzerBtn").disabled = !(canNormal || canSteal);
  });

  // ✅ When player presses buzzer
  document.getElementById("buzzerBtn").onclick = async () => {
    if (!team) return;

    // set who buzzed in Firestore so all clients/admin see instantly
    await updateDoc(stateRef, { buzzed: team })
      .catch(async () => {
        // create doc if it doesn't exist yet
        await setDoc(stateRef, { buzzed: team });
      });

    document.getElementById("buzzerBtn").disabled = true;
    document.getElementById("answerArea").style.display = "block";
    playSound("buzzSound");
  };
}


// ================= QUESTION BOARD =================
async function showBoard(level, btn) {
  currentLevel = level;
  renderBoard(level);

  // disable buzzer until admin starts round
  const stateRef = doc(db, "gameData", "state");
  await updateDoc(stateRef, { enableBuzzer: false }).catch(async () => {
    await setDoc(stateRef, { enableBuzzer: false });
  });

  // button highlight
  document.querySelectorAll(".level-btn").forEach((b) =>
    b.classList.remove("selected")
  );
  if (btn) btn.classList.add("selected");

  await resetTurnState();
}

function renderBoard(level) {
  let container = document.getElementById("questionBox");
  container.innerHTML = "";
  container.classList.add("board");

  questions[level].forEach((q, idx) => {
    let item = document.createElement("div");
    item.className = "board-item";
    item.dataset.index = idx;
    item.innerText = idx + 1;

    item.onclick = () => revealQuestion(idx, q, item, level);

    container.appendChild(item);
  });
}

async function revealQuestion(index, question, element, level) {
  if (element.classList.contains("revealed")) return;

  if (level === "medium" && question.img) {
    element.innerHTML =
      question.q +
      "<br><img src='" +
      question.img +
      "' style='width:150px;margin-top:5px;'>";
  } else {
    element.innerText = question.q;
  }

  element.classList.add("revealed");

  const stateRef = doc(db, "gameData", "state");
  await updateDoc(stateRef, {
    currentQuestion: question.q
  }).catch(async () => {
    await setDoc(stateRef, { currentQuestion: question.q });
  });

  currentQIndex = index;
  await resetTurnState(); // reset per-question state when opening a fresh tile
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


// expose functions to global window for onclick usage
window.startRound = startRound;
window.resetGame = resetGame;
window.showBoard = showBoard;
window.revealQuestion = revealQuestion;
window.selectTeam = selectTeam;
window.submitAnswer = submitAnswer;

