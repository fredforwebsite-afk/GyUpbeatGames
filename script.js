this code is used local storage. can you convert this using firebase version? 

Note: don't modify my code or logic og my code.

import {
      initializeApp
    } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

import {
      getDatabase,
      ref,
      set,
      get,
      remove,
      onValue
    } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

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

    // Init
    const app = initializeApp(firebaseConfig);
    window.db = getDatabase(app);


// ================= VARIABLES =================
let scores = JSON.parse(localStorage.getItem("scores")) || { Zack: 0, Ryan: 0, Kyle: 0 };
let currentLevel = "easy";
let currentQIndex = 0;
let timerInterval;
let answerTimerInterval;

let buzzTime = 10; // ✅ default 10s
let answerTime = 20; // ✅ default 20s

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

    // ✅ Update circle immediately if a round is running
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
function getOutTeams() {
    try { return JSON.parse(localStorage.getItem("outTeams")) || []; } catch { return []; }
}

function setOutTeams(arr) {
    localStorage.setItem("outTeams", JSON.stringify(arr));
}

function resetTurnState() {
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
    localStorage.removeItem("buzzed");
    localStorage.removeItem("stealMode");
    localStorage.removeItem("submittedAnswer");
    setOutTeams([]);
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

function startRound() {
    clearInterval(countdownInterval);
    timeLeft = buzzTime;
    mode = "buzz";

    resetTurnState();
    localStorage.setItem("enableBuzzer", "true");
    localStorage.setItem("buzzed", "");
    localStorage.setItem("answeringTeam", "");

    updateCircle(buzzTime, "lime", buzzTime);
    document.getElementById("circleTime").textContent = timeLeft;
    document.getElementById("firstBuzz").textContent = "None yet";
    document.getElementById("stealNotice").textContent = ""; // clear message

    window.addEventListener("storage", stopOnBuzz);

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
            // nobody buzzed
            clearInterval(countdownInterval);
            localStorage.setItem("enableBuzzer", "false");
            window.removeEventListener("storage", stopOnBuzz);

            document.getElementById("circleTime").textContent = "⏳ No Buzz";
            playSound("timesUpSound");

            // ✅ show admin option to retry
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

// 🛑 If a team buzzes early
function stopOnBuzz(e) {
    if (e.key === "buzzed" && e.newValue) {
        const team = e.newValue;
        document.getElementById("firstBuzz").textContent = team;
        localStorage.setItem("answeringTeam", team);
        localStorage.setItem("enableBuzzer", "false");
        switchToAnswer(team);
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
    window.removeEventListener("storage", stopOnBuzz);
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

function resetGame() {
    scores = { Zack: 0, Ryan: 0, Kyle: 0 };
    localStorage.setItem("scores", JSON.stringify(scores));
    updateScores();
    localStorage.clear();
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

function submitAnswer() {
    let team = sessionStorage.getItem("team");
    let ans = document.getElementById("teamAnswer").value;
    if (team && ans) {
        localStorage.setItem("teamAnswer_" + team, ans);
        localStorage.setItem("submittedAnswer", ans);
        document.getElementById("answerArea").style.display = "none";
        clearInterval(answerTimerInterval); // stop countdown on Admin when someone submits
    }
}

// ================= ANSWER TIMER =================
function startAnswerTimer(team) {
    answerTime = 20;

    // Update both Admin (submittedAnswer) and Team (answerTime)
    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "⏳ " + answerTime + "s left...";
    }
    if (document.getElementById("answerTime")) {
        document.getElementById("answerTime").innerText = "Answer Time: " + answerTime + "s";
    }

    clearInterval(answerTimerInterval);
    answerTimerInterval = setInterval(() => {
        let ans = localStorage.getItem("teamAnswer_" + team) || "";
        if (ans) {
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;
            return;
        }

        answerTime--;

        if (answerTime >= 0) {
            if (document.getElementById("submittedAnswer")) {
                document.getElementById("submittedAnswer").innerText = "⏳ " + answerTime + "s left...";
            }
            if (document.getElementById("answerTime")) {
                document.getElementById("answerTime").innerText = "Answer Time: " + answerTime + "s";
            }
        }

        if (answerTime < 0) {
            clearInterval(answerTimerInterval);
            answerTimerInterval = null;

            if (document.getElementById("submittedAnswer")) {
                document.getElementById("submittedAnswer").innerText = "❌ No answer submitted";
            }
            if (document.getElementById("answerTime")) {
                document.getElementById("answerTime").innerText = "❌ Time’s up!";
            }

            handleTeamWrongOrTimeout(team, "TIME UP");
        }
    }, 1000);

}



// ============== Steal / Wrong / Reveal flow ==============
function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    // show status beside "First to Buzz"
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
    }

    // add to outTeams
    const outs = getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    setOutTeams(outs);

    // clear that team's pending state
    localStorage.removeItem("buzzed");
    localStorage.removeItem("teamAnswer_" + team);

    // Decide: still allow steal or reveal
    if (outs.length >= 3) {
        // All three teams are out -> reveal correct answer
        revealCorrectAnswerAndLock();
    } else {
        // Enable steal for remaining teams
        localStorage.setItem("stealMode", team);
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 STEAL MODE: " + team + " is OUT! Other teams can buzz.";
        }
        // Keep buzzer closed until a new team buzzes (handled by TEAM BUZZER watcher)
    }
}

function revealCorrectAnswerAndLock() {
    const correct = questions[currentLevel][currentQIndex].a;
    playSound("wrongSound"); // short cue before reveal (optional)
    alert("No team answered correctly. Correct answer is: " + correct);

    // display on Admin panel
    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
    }

    // lock question tile
    lockQuestion(currentLevel, currentQIndex);

    // fully stop/clear turn
    localStorage.setItem("enableBuzzer", "false");
    localStorage.removeItem("buzzed");
    localStorage.removeItem("stealMode");
    setOutTeams([]);
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;
}

// ================= AUTO-CHECK BUZZ =================
if (document.getElementById("firstBuzz")) {
    setInterval(() => {
        let buzzed = localStorage.getItem("buzzed");

        if (buzzed) {
            // show who buzzed
            document.getElementById("firstBuzz").innerText = buzzed;
            // close buzzer while this team answers
            localStorage.setItem("enableBuzzer", "false");

            // start 20s answer window for this buzzing team
            if (!answerTimerInterval) {
                startAnswerTimer(buzzed);
            }

            // check if they already submitted an answer
            let ans = localStorage.getItem("teamAnswer_" + buzzed) || "";
            if (ans) {
                // reflect to Admin immediately
                if (document.getElementById("submittedAnswer")) {
                    document.getElementById("submittedAnswer").innerText = "📝 " + ans;
                }
                clearInterval(answerTimerInterval);
                answerTimerInterval = null;

                // evaluate
                let correctAns = questions[currentLevel][currentQIndex].a.trim().toLowerCase();
                if (ans.trim().toLowerCase() === correctAns) {
                    playSound("correctSound");
                    let points = (currentLevel === "easy") ? 100 : (currentLevel === "medium") ? 300 : 500;
                    scores[buzzed] += points;
                    localStorage.setItem("scores", JSON.stringify(scores));
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
                        document.getElementById("submittedAnswer").innerText = "✅ Correct: " + questions[currentLevel][currentQIndex].a;
                    }

                    // lock the question and reset turn state
                    lockQuestion(currentLevel, currentQIndex);
                    localStorage.removeItem("buzzed");
                    localStorage.removeItem("teamAnswer_" + buzzed);
                    localStorage.removeItem("stealMode");
                    setOutTeams([]);
                } else {
                    // wrong answer -> mark OUT, allow steal or reveal
                    playSound("wrongSound");
                    handleTeamWrongOrTimeout(buzzed, "WRONG");
                }
            }
        }

        updateScores();
    }, 300);
}

// ================= TEAM BUZZER =================
if (document.getElementById("buzzerBtn")) {
    setInterval(() => {
        let enable = localStorage.getItem("enableBuzzer") === "true";
        let stealFrom = localStorage.getItem("stealMode");
        let team = sessionStorage.getItem("team");
        let alreadyBuzzed = localStorage.getItem("buzzed");
        const outs = getOutTeams();

        const canSteal = stealFrom && stealFrom !== team && !alreadyBuzzed && !outs.includes(team);
        const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

        if (canNormal || canSteal) {
            document.getElementById("buzzerBtn").disabled = false;
        } else {
            document.getElementById("buzzerBtn").disabled = true;
        }
    }, 200);

    document.getElementById("buzzerBtn").onclick = () => {
        let team = sessionStorage.getItem("team");
        if (team) {
            localStorage.setItem("buzzed", team);
            document.getElementById("buzzerBtn").disabled = true;
            document.getElementById("answerArea").style.display = "block";
            playSound("buzzSound");

            // ✅ Start the answer timer for THIS team only
            startAnswerTimer(team);
        }
    };

}

// ================= QUESTION BOARD =================
function showBoard(level, btn) {
    currentLevel = level;
    renderBoard(level);
    localStorage.setItem("enableBuzzer", "false");

    // button highlight
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

    localStorage.setItem("currentQuestion", question.q);
    currentQIndex = index;
    resetTurnState(); // reset per-question state when opening a fresh tile
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
