// script-updated.js
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

    // reset answers for safety (keeps doc but empties teams)
    await setDoc(doc(db, "game", "answers"), {
        Zack: "",
        Ryan: "",
        Kyle: "",
        submittedAnswer: ""
    }, { merge: true });

    // reset correctOrder for easy/medium flows
    await setDoc(doc(db, "game", "correctOrder"), { order: [] });

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

    // SPECIAL BEHAVIOR: easy/medium -> open simultaneous team-answer mode; hard -> original single-buzz + steal
    if (currentLevel === 'hard') {
        // old behaviour: single team buzz -> switch to answer
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
    } else {
        // EASY / MEDIUM: allow all teams to submit one answer each (no steal mode, no single-answer lock)
        await setBuzzerState({
            enableBuzzer: true,
            buzzed: "",
            answeringTeam: "",
            stealMode: false
        });

        // clear correctOrder
        await setDoc(doc(db, "game", "correctOrder"), { order: [] });

        // We will still show a countdown but we will not stop enabling buzzer on first buzz.
        updateCircle(buzzTime, "lime", buzzTime);
        if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
        if (document.getElementById("firstBuzz")) document.getElementById("firstBuzz").textContent = "Open to all teams";
        if (document.getElementById("stealNotice")) document.getElementById("stealNotice").textContent = "";

        // Ensure any previous buzzer listener is removed — team UI listens to buzzer state and will enable submit button
        if (buzzerUnsub) { buzzerUnsub(); buzzerUnsub = null; }

        // start a countdown for the whole open-answer window
        countdownInterval = setInterval(() => {
            timeLeft--;
            if (document.getElementById("circleTime")) document.getElementById("circleTime").textContent = timeLeft;
            updateCircle(timeLeft, timeLeft <= 5 ? "red" : "lime", buzzTime);

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                stopAllTimersAndSounds();
                playSound("timesUpSound");
                // when time ends, evaluate remaining: reveal correct or award based on submitted correctOrder
                finalizeEasyMediumRound().catch(console.error);
            }
        }, 1000);
    }
}

async function finalizeEasyMediumRound() {
    // award any teams that have answered correctly but not yet awarded (evaluateAnswer handles awarding as they submit)
    // after awarding, lock question and cleanup
    const correctSnap = await getDoc(doc(db, "game", "correctOrder"));
    const order = correctSnap.exists() ? (correctSnap.data().order || []) : [];

    // if at least one correct occurred we keep scores as-is. If none correct and all teams either submitted or time ended, reveal answer.
    if (order.length === 0) {
        await revealCorrectAnswerAndLock();
        return;
    }

    // lock question
    lockQuestion(currentLevel, currentQIndex);
    await setBuzzerState({ enableBuzzer: false, buzzed: "", answeringTeam: "", stealMode: false });
    await setOutTeams([]);
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

            // 🟢 FIX: mark answering team as OUT and enable buzzer for remaining teams
            getBuzzerState().then(state => {
                const team = state.answeringTeam;
                if (team) {
                    handleTeamWrongOrTimeout(team, "TIME UP").catch(console.error);
                }
            });
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
    if (!team || !ans) return;

    // For easy & medium: accept only first submission per team (multiple members can't overwrite). Save timestamp.
    if (currentLevel === 'easy' || currentLevel === 'medium') {
        const snap = await getDoc(doc(db, "game", "answers"));
        const data = snap.exists() ? snap.data() : {};
        if (data[team] && data[team].trim() !== "") {
            // team already submitted — ignore further submits
            if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "⚠️ You already submitted";
            return;
        }

        // Write team answer with timestamp and level/index for evaluation
        await setDoc(doc(db, "game", "answers"), {
            [team]: ans,
            submittedAnswer: ans,
            level: currentLevel,
            index: currentQIndex,
            [`${team}_ts`]: Date.now()
        }, { merge: true });

        if (document.getElementById("answerArea")) {
            document.getElementById("answerArea").style.display = "none";
        }
        // no countdown interruption here; evaluateAnswer will handle awarding in real-time
        return;
    }

    // For hard: original behavior (only answeringTeam can submit when switched to answer)
    let buzzerSnap = await getDoc(doc(db, "game", "buzzer"));
    const buzzerData = buzzerSnap.exists() ? buzzerSnap.data() : {};
    if (buzzerData.answeringTeam !== team) {
        if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "❌ Not your turn to answer";
        return;
    }

    await setDoc(doc(db, "game", "answers"), {
        [team]: ans,
        submittedAnswer: ans,
        level: currentLevel,
        index: currentQIndex
    }, { merge: true });

    if (document.getElementById("answerArea")) {
        document.getElementById("answerArea").style.display = "none";
    }
    clearInterval(answerTimerInterval); // stop admin answer timer loop if running
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

    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "📝 " + ans;
    }
    clearInterval(answerTimerInterval);
    answerTimerInterval = null;

    const snap = await getDoc(doc(db, "game", "answers"));
    const answersData = snap.exists() ? snap.data() : {};
    const lvl = answersData.level || currentLevel;
    const idx = answersData.index ?? currentQIndex;

    const correctAns = (questions[lvl][idx].a || "").trim().toLowerCase();

    // EASY / MEDIUM: multiple teams may answer; award based on order of correct submissions
    if (lvl === 'easy' || lvl === 'medium') {
        const teamAnswer = (ans || "").trim().toLowerCase();
        const correct = teamAnswer === correctAns;

        // record correct order (if correct and not recorded yet)
        const orderDoc = doc(db, "game", "correctOrder");
        const orderSnap = await getDoc(orderDoc);
        const orderData = orderSnap.exists() ? (orderSnap.data().order || []) : [];

        if (correct) {
            // if already in order, ignore duplicate
            if (!orderData.includes(team)) {
                orderData.push(team);
                await setDoc(orderDoc, { order: orderData }, { merge: true });
            }

            // award points based on position
            let position = orderData.indexOf(team); // 0-based
            let basePoints = (lvl === "easy") ? 100 : 300;
            let awarded = 0;
            if (position === 0) awarded = basePoints; // first -> full points
            else if (position === 1) awarded = Math.round(basePoints * 0.25); // second -> reduce 75% => 25% awarded
            else if (position === 2) awarded = Math.round(basePoints * 0.5); // third -> reduce 50% => 50% awarded

            scores[team] = (scores[team] || 0) + awarded;
            await saveScores();
            updateScores();
            highlightScore(team);

            // show feedback
            stopAllTimersAndSounds();
            playSound("correctSound");
            if (document.getElementById("submittedAnswer")) {
                document.getElementById("submittedAnswer").innerText = `✅ ${team} is CORRECT! (+${awarded})`;
            }

            // if all teams have either answered or order length == 3 or all teams submitted, lock question and cleanup
            const allTeams = ["Zack", "Ryan", "Kyle"];
            const answersSnap = await getDoc(doc(db, "game", "answers"));
            const ad = answersSnap.exists() ? answersSnap.data() : {};
            const submittedCount = allTeams.filter(t => (ad[t] && ad[t].trim() !== "")).length;

            // If everyone submitted OR all three correct positions filled OR time ended elsewhere, finalize
            if (submittedCount === allTeams.length || orderData.length === allTeams.length) {
                lockQuestion(lvl, idx);
                await setBuzzerState({ enableBuzzer: false, buzzed: "", answeringTeam: "", stealMode: false });
                await setOutTeams([]);
                return;
            }

            return;
        } else {
            // wrong answer -> no points & mark team as OUT; no steal mode in easy/medium
            playSound("wrongSound");
            await handleTeamWrongOrTimeout(team, "WRONG");
            return;
        }
    }

    // HARD: original single-team behaviour
    if (ans.trim().toLowerCase() === correctAns) {
        stopAllTimersAndSounds();
        playSound("correctSound");

        let points = (lvl === "hard") ? 500 : 0;
        scores[team] = (scores[team] || 0) + points;

        await saveScores();
        updateScores();
        highlightScore(team);

        // stop countdown
        clearInterval(countdownInterval);
        timeLeft = 0;
        if (document.getElementById("circleTime")) {
            document.getElementById("circleTime").textContent = "0";
        }
        updateCircle(0, "lime", answerTime);

        if (document.getElementById("submittedAnswer")) {
            document.getElementById("submittedAnswer").innerText = "✅ " + team + " is CORRECT!";
        }

        // lock question and cleanup
        lockQuestion(lvl, idx);
        await setBuzzerState({ buzzed: "" });
        await setDoc(doc(db, "game", "answers"), {
            [team]: ""
        }, { merge: true });
        await setBuzzerState({ stealMode: false });
        await setOutTeams([]);
    }

    // HARD Wrong
    else {
        playSound("wrongSound");
        await handleTeamWrongOrTimeout(team, "WRONG");
    }
}



// ================= WRONG / TIMEOUT / STEAL =================
async function handleTeamWrongOrTimeout(team, reasonLabel = "WRONG") {
    if (document.getElementById("firstBuzz")) {
        document.getElementById("firstBuzz").innerText = team + " (" + reasonLabel + ")";
    }

    const outs = await getOutTeams();
    if (!outs.includes(team)) outs.push(team);
    await setOutTeams(outs);

    // clear that team's answer (but keep record of submission timestamp if needed)
    await setDoc(doc(db, "game", "answers"), {
        [team]: ""
    }, { merge: true });

    const allTeams = ["Zack", "Ryan", "Kyle"];
    const remaining = allTeams.filter(t => !outs.includes(t));

    // EASY / MEDIUM: do NOT engage steal mode. If some teams remain, keep open for them until they submit or time ends.
    if (currentLevel === 'easy' || currentLevel === 'medium') {
        // if no remaining teams -> reveal answer
        if (remaining.length === 0) {
            stopAllTimersAndSounds();
            await revealCorrectAnswerAndLock();
            return;
        }

        // otherwise simply keep buzzer enabled for remaining teams (no steal notice)
        await setBuzzerState({ enableBuzzer: true, buzzed: "", answeringTeam: "", stealMode: false });
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText = `Remaining teams: ${remaining.join(', ')}`;
        }

        return;
    }

    // HARD: original steal logic remains
    // 🛑 Case 1: lahat ng 3 teams OUT → reveal answer
    if (remaining.length === 0) {
        stopAllTimersAndSounds();
        await revealCorrectAnswerAndLock();
        return;
    }

    // 🟡 Case 2: isa na lang natira → siya lang ang naka-enable buzzer
    if (remaining.length === 1) {
        const lastTeam = remaining[0];
        await setBuzzerState({
            enableBuzzer: true, // siya lang ang pwede mag-buzz
            buzzed: "",
            answeringTeam: "",
            stealMode: true
        });

        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 FINAL CHANCE: " + lastTeam + " must buzz to answer!";
        }

        // reset countdown for STEAL buzz
        clearInterval(countdownInterval);
        mode = "buzz";
        timeLeft = buzzTime;
        if (document.getElementById("circleTime"))
            document.getElementById("circleTime").textContent = timeLeft;
        updateCircle(buzzTime, "lime", buzzTime);
        countdownInterval = setInterval(runTimer, 1000);

        return;
    }

    // 🟢 Case 3: dalawa pa natitira → STEAL MODE normal
    else if (remaining.length === 2) {
        await setBuzzerState({
            enableBuzzer: true,
            buzzed: "",
            answeringTeam: "",
            stealMode: true
        });
        if (document.getElementById("stealNotice")) {
            document.getElementById("stealNotice").innerText =
                "🚨 STEAL MODE: " + team + " is OUT! Remaining teams: " + remaining.join(", ");
        }
    }

    // reset countdown for STEAL buzz (2 remaining teams)
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

    // ✅ Alert pa rin para sure admin makakita
    alert("No team answered correctly. Correct answer is: " + correct);

    // ✅ Player-side submitted answer box
    if (document.getElementById("submittedAnswer")) {
        document.getElementById("submittedAnswer").innerText = "💡 Correct Answer: " + correct;
    }

    // ✅ Admin-side reveal box
    if (document.getElementById("revealAnswer")) {
        document.getElementById("revealAnswer").innerText = "✔ Correct Answer: " + correct;
    }

    // Lock question at reset states
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
    onSnapshot(doc(db, "game", "buzzer"), async (snap) => {
        const data = snap.exists() ? snap.data() : {};
        let enable = data.enableBuzzer;
        let stealMode = !!data.stealMode;
        let alreadyBuzzed = data.buzzed;
        let team = sessionStorage.getItem("team");
        const outs = await getOutTeams();

        // normal buzz: buzzer enabled, no one buzzed yet, and team not out
        const canNormal = enable && !alreadyBuzzed && !outs.includes(team);

        // steal: same rules, but only active if stealMode is true
        const canSteal = stealMode && !alreadyBuzzed && !outs.includes(team);

        const btn = document.getElementById("buzzerBtn");
        if (btn) btn.disabled = !(canNormal || canSteal);

        // ✅ Always show answer box if this team is the answering team OR (easy/medium they can open answer directly)
        const area = document.getElementById("answerArea");
        if (area) {
            if (data.answeringTeam === team) {
                area.style.display = "block";
            } else {
                // For easy/medium allow submit area if buzzer enabled and team not out
                if ((currentLevel === 'easy' || currentLevel === 'medium') && enable && !outs.includes(team)) {
                    area.style.display = "block";
                } else {
                    area.style.display = "none";
                }
            }
        }
    });
}



// attach team buzzer click handler
if (document.getElementById("buzzerBtn")) {
    document.getElementById("buzzerBtn").onclick = async () => {
        let team = sessionStorage.getItem("team");
        if (!team) return;

        // For easy/medium we don't use buzzer single-lock; team can press to indicate they are submitting
        if (currentLevel === 'easy' || currentLevel === 'medium') {
            // just visual/audio feedback; actual submission happens via submitAnswer
            playSound("buzzSound");
            if (document.getElementById("submittedAnswer")) document.getElementById("submittedAnswer").innerText = "🔊 Ready to submit...";
            return;
        }

        await setBuzzerState({ buzzed: team });

        const btn = document.getElementById("buzzerBtn");
        if (btn) btn.disabled = true;

        playSound("buzzSound");
    };
}



// ================= QUESTION BOARD =================
async function showBoard(level, btn) {
    currentLevel = level;

    let container = document.getElementById("questionBox");
    if (container) container.style.display = "grid"; // show board kapag pinili na

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

// ================= SYNC CURRENT QUESTION =================
function registerCurrentQuestionListener() {
    onSnapshot(doc(db, "game", "currentQuestion"), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        currentLevel = data.level;
        currentQIndex = data.index;

        // UI update (optional)
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
    registerCurrentQuestionListener(); // ✅ ADD THIS

    await setBuzzerState({
        enableBuzzer: false,
        buzzed: "",
        answeringTeam: "",
        stealMode: false
    });
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
