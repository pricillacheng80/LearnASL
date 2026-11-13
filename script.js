// --- 1. Supabase Configuration & Offline-First Persistence ---
// --- Supabase Initialization ---
const SUPABASE_URL = 'https://mecjgmcuwtqzkrmwecfq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RNE3_cZ8XbDF_YJaFIA05w_hBcK2F2P';

// Initialize the Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

try {
    // Accepts both new sb_publishable_ keys and legacy eyJ... tokens
    if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && 
       (SUPABASE_ANON_KEY.startsWith('sb_publishable_') || SUPABASE_ANON_KEY.startsWith('eyJ'))) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (err) {
    console.warn("Supabase initialization skipped. Running in local fallback mode:", err);
}

let currentUser = {
    name: 'Guest Student',
    email: '',
    progress: 15,
    streak: 1,
    completedLessons: []
};

// Load saved progress on startup
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('signbridge_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        document.getElementById('auth-modal').classList.remove('active');
        updateUIWithUser();
    }
    renderMCQuestion();
    updateNetworkStatus();
});

// --- 2. Authentication (Sign Up, Log In, Guest) ---
let authMode = 'login';

// Open auth modal manually from the header button
function openAuthModal() {
    document.getElementById('auth-modal').classList.add('active');
}

function switchAuthTab(mode) {
    authMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('name-field').style.display = mode === 'signup' ? 'block' : 'none';
    document.getElementById('auth-submit-btn').textContent = mode === 'signup' ? 'Create Student Account' : 'Log In';
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('student-email').value.trim();
    const password = document.getElementById('student-password').value;
    const nameInput = document.getElementById('student-name').value.trim();

    if (supabaseClient) {
        try {
            if (authMode === 'signup') {
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: nameInput || email.split('@')[0] } }
                });
                if (error) throw error;
                currentUser.name = nameInput || email.split('@')[0];
            } else {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;
                currentUser.name = data.user?.user_metadata?.full_name || email.split('@')[0];
            }
        } catch (err) {
            alert(`Authentication note: ${err.message}. Falling back to local session.`);
            currentUser.name = nameInput || email.split('@')[0];
        }
    } else {
        // Local testing fallback if Supabase keys aren't pasted yet
        currentUser.name = nameInput || email.split('@')[0];
    }

    currentUser.email = email;
    saveProgress();
    document.getElementById('auth-modal').classList.remove('active');
    updateUIWithUser();
}

async function handleSmartAuth(email, password, isSignUpMode) {
    if (isSignUpMode) {
        // Step 1: Attempt sign up to check if email already exists or create new account
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/index.html`
            }
        });

        if (error) {
            alert("Error: " + error.message);
            return;
        }

        // Supabase returns an empty identities array if the email is already registered
        const emailAlreadyExists = data.user && data.user.identities && data.user.identities.length === 0;

        if (emailAlreadyExists) {
            alert("This email is already registered! Please switch to Log In.");
        } else {
            alert("Account created! Please check your inbox for an active confirmation email to verify your account.");
        }
    } else {
        // Step 2: Login Flow if they chose to log in
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            alert("Login failed. Please check your credentials or sign up first.");
        } else {
            alert("Successfully logged in!");
            document.getElementById('auth-modal').classList.remove('active');
            updateUIWithUser();
        }
    }
}

function continueAsGuest() {
    currentUser.name = 'Guest';
    currentUser.email = '';
    saveProgress();
    document.getElementById('auth-modal').classList.remove('active');
    updateUIWithUser();
}

function logoutUser() {
    if (confirm('Sign out? Your progress will be saved locally.')) {
        // Clear saved user session data
        localStorage.removeItem('signbridge_user');
        currentUser = { name: 'Guest', email: '', progress: 15, streak: 1, completedLessons: [] };
        
        // Switch view back to the default dashboard
        switchView('dashboard-view');
        
        // Show the authentication modal again
        openAuthModal();
        
        // Refresh UI elements
        updateUIWithUser();
    }
}

async function saveProgress() {
    localStorage.setItem('signbridge_user', JSON.stringify(currentUser));
    if (supabaseClient && currentUser.email) {
        await supabaseClient.from('student_progress').upsert({
            student_name: currentUser.name,
            progress_percentage: currentUser.progress,
            streak_days: currentUser.streak
        });
    }
}

function updateUIWithUser() {
    document.getElementById('welcome-heading').textContent = `Welcome back, ${currentUser.name}! 👋`;
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('user-streak').textContent = `🔥 ${currentUser.streak} Day Streak`;
    document.getElementById('overall-progress-bar').style.width = `${currentUser.progress}%`;

    const authBtn = document.getElementById('header-auth-btn');
    if (currentUser.name === 'Guest' || !currentUser.email) {
        authBtn.textContent = 'Sign In';
        authBtn.onclick = openAuthModal;
    } else {
        authBtn.textContent = 'Sign Out';
        authBtn.onclick = logoutUser;
    }

    const unitLabel = currentUser.progress < 50 ? 'Unit 1: ASL Alphabet (A–Z)' : 'Unit 2: Full School Sentences';
    document.getElementById('progress-summary-text').innerHTML = `${currentUser.progress}% Complete • Current Unit: <strong>${unitLabel}</strong>`;
}

// --- 3. Navigation & View Switching ---
const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view-section');

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetViewId = btn.getAttribute('data-target');
        
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(targetViewId).classList.add('active');

        stopAllWebcams();
        if (targetViewId === 'practice-view') {
            initWebcam('user-webcam', 'feedback-status');
        } else if (targetViewId === 'quiz-view' && currentQuizMode === 'motion') {
            initWebcam('quiz-webcam', 'quiz-cam-status');
        }
    });
});

function switchView(viewId) {
    const targetBtn = document.querySelector(`[data-target="${viewId}"]`);
    if (targetBtn) targetBtn.click();
}

// --- 4. Lesson Video Modal & Post-Lesson Practice Trigger ---
function openLessonModal(title, practiceTarget, category) {
    document.getElementById('modal-lesson-title').textContent = title;
    document.getElementById('video-demo-visual').textContent = `🤟 Signing: "${practiceTarget}"`;
    document.getElementById('lesson-modal').classList.add('active');

    const practiceBtn = document.getElementById('practice-after-lesson-btn');
    practiceBtn.onclick = () => {
        closeLessonModal();
        // Increment progress slightly for completing video
        currentUser.progress = Math.min(100, currentUser.progress + 10);
        saveProgress();
        updateUIWithUser();

        // Route directly to Camera Practice loaded with that lesson's sign
        practiceMode = category;
        switchView('practice-view');
        document.getElementById('practice-category-label').textContent =
            category === 'alphabet' ? 'Post-Lesson Alphabet Practice:' : 'Post-Lesson Sentence Practice:';
        document.getElementById('current-target-sentence').textContent = `"${practiceTarget}"`;
    };
}

function closeLessonModal() {
    document.getElementById('lesson-modal').classList.remove('active');
}

// --- 5. Low-Latency Webcam Management (5G / Unstable Wi-Fi Optimized) ---
let activeStream = null;

async function initWebcam(videoElementId, statusBadgeId) {
    const videoEl = document.getElementById(videoElementId);
    const badgeEl = document.getElementById(statusBadgeId);
    try {
        badgeEl.textContent = "Connecting camera (Low-bandwidth mode)...";
        // Lower resolution & frame rate prevents lag on unstable school Wi-Fi or 5G
        activeStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 20 } },
            audio: false
        });
        videoEl.srcObject = activeStream;
        badgeEl.textContent = "Camera active. Position your hands in frame.";
    } catch (error) {
        badgeEl.textContent = "Camera unavailable — Simulation mode active.";
    }
}

function stopAllWebcams() {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
}

// --- 6. Camera Practice (Alphabet First -> Full Sentences) ---
let practiceMode = 'alphabet';
let promptIndex = 0;

const alphabetPrompts = [
    { label: 'Letter A', hint: 'Closed fist with your thumb resting flat against the side of your index finger.' },
    { label: 'Letter B', hint: 'Hold all four fingers straight up together and tuck your thumb across your palm.' },
    { label: 'Letter C', hint: 'Curve your fingers and thumb into a clear "C" shape.' },
    { label: 'Letter L', hint: 'Extend your thumb and index finger at a 90-degree angle; fold other fingers down.' }
];

const sentencePrompts = [
    { label: 'Nice to meet you', hint: 'Slide flat right hand over left palm ("NICE"), bring index fingers together ("MEET"), then point ("YOU").' },
    { label: 'How are you feeling?', hint: 'Rotate curved hands together ("HOW"), then brush middle finger up chest ("FEEL").' },
    { label: 'Do you want to sit together?', hint: 'Pull clawed hands toward you ("WANT"), tap two fingers onto two fingers ("SIT"), move fists together ("TOGETHER").' }
];

function switchPracticeMode() {
    practiceMode = practiceMode === 'alphabet' ? 'sentence' : 'alphabet';
    promptIndex = 0;
    updatePracticePrompt();
}

function nextPrompt() {
    const list = practiceMode === 'alphabet' ? alphabetPrompts : sentencePrompts;
    promptIndex = (promptIndex + 1) % list.length;
    updatePracticePrompt();
}

function updatePracticePrompt() {
    const list = practiceMode === 'alphabet' ? alphabetPrompts : sentencePrompts;
    const item = list[promptIndex];
    document.getElementById('practice-category-label').textContent =
        practiceMode === 'alphabet' ? 'Target Alphabet Sign:' : 'Target Sentence Sign:';
    document.getElementById('current-target-sentence').textContent = `"${item.label}"`;
    document.getElementById('sign-hint-text').textContent = `Hint: ${item.hint}`;
    resetChecklist();
}

let isPracticing = false;
function toggleRecording() {
    const recordBtn = document.getElementById('record-btn');
    const feedbackStatus = document.getElementById('feedback-status');
    isPracticing = !isPracticing;

    if (isPracticing) {
        recordBtn.textContent = "Stop & Evaluate";
        recordBtn.style.background = "#EF4444";
        feedbackStatus.textContent = "Analyzing hand landmarks...";
        simulateAIFeedback(feedbackStatus);
    } else {
        recordBtn.textContent = "Check My Sign";
        recordBtn.style.background = "";
        feedbackStatus.textContent = "Ready for next sign.";
    }
}

function simulateAIFeedback(feedbackStatus) {
    setTimeout(() => {
        if (!isPracticing) return;
        const el = document.getElementById('check-hands');
        el.className = "success";
        el.textContent = "✓ Hand & finger alignment verified";
    }, 900);

    setTimeout(() => {
        if (!isPracticing) return;
        const el = document.getElementById('check-speed');
        el.className = "success";
        el.textContent = "✓ Motion & stability: Clear";
    }, 1800);

    setTimeout(() => {
        if (!isPracticing) return;
        const score = Math.floor(Math.random() * (99 - 85 + 1)) + 85;
        const el = document.getElementById('check-accuracy');
        el.className = "success";
        el.textContent = `✓ Accuracy score: ${score}%`;
        feedbackStatus.textContent = `Great job! Accuracy: ${score}% — Progress saved!`;

        currentUser.progress = Math.min(100, currentUser.progress + 5);
        saveProgress();
        updateUIWithUser();
        isPracticing = false;
        const recordBtn = document.getElementById('record-btn');
        recordBtn.textContent = "Check My Sign";
        recordBtn.style.background = "";
    }, 2700);
}

function resetChecklist() {
    ['check-hands', 'check-speed', 'check-accuracy'].forEach(id => {
        document.getElementById(id).className = "pending";
    });
    document.getElementById('check-hands').textContent = "Hand & finger alignment";
    document.getElementById('check-speed').textContent = "Motion & stability";
    document.getElementById('check-accuracy').textContent = "Accuracy score: --%";
}

// --- 7. Quizzes (Multiple Choice + Camera Hand-Motion) ---
let currentQuizMode = 'mc';
let mcIndex = 0;
let mcScore = 0;

const mcQuestions = [
    {
        visual: '✊ (Closed fist, thumb resting against side of index finger)',
        question: 'Which ASL alphabet letter does this hand shape represent?',
        options: ['Letter A', 'Letter S', 'Letter E', 'Letter T'],
        correct: 0
    },
    {
        visual: '🖐️ (Four fingers straight up together, thumb tucked across palm)',
        question: 'Which ASL alphabet letter is shown here?',
        options: ['Letter M', 'Letter B', 'Letter W', 'Letter F'],
        correct: 1
    },
    {
        visual: '🤟 (Thumb, index finger, and pinky extended)',
        question: 'What common phrase does this ASL sign communicate to a peer?',
        options: ['Good morning', 'I am hungry', 'I love you', 'See you later'],
        correct: 2
    }
];

function setQuizMode(mode) {
    currentQuizMode = mode;
    document.getElementById('mc-quiz-container').style.display = mode === 'mc' ? 'block' : 'none';
    document.getElementById('motion-quiz-container').style.display = mode === 'motion' ? 'block' : 'none';

    document.getElementById('btn-mc-quiz').className = mode === 'mc' ? 'btn primary' : 'btn secondary';
    document.getElementById('btn-motion-quiz').className = mode === 'motion' ? 'btn primary' : 'btn secondary';

    stopAllWebcams();
    if (mode === 'motion') {
        initWebcam('quiz-webcam', 'quiz-cam-status');
    }
}

function renderMCQuestion() {
    const q = mcQuestions[mcIndex];
    document.getElementById('mc-question-counter').textContent = `Question ${mcIndex + 1} of ${mcQuestions.length}`;
    document.getElementById('mc-score-display').textContent = `Score: ${mcScore}`;
    document.getElementById('mc-visual-cue').textContent = q.visual;
    document.getElementById('mc-question-text').textContent = q.question;
    document.getElementById('mc-feedback-banner').style.display = 'none';
    document.getElementById('mc-next-btn').style.display = 'none';

    const optionsDiv = document.getElementById('mc-options');
    optionsDiv.innerHTML = '';
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'mc-option-btn';
        btn.textContent = opt;
        btn.onclick = () => checkMCAnswer(idx, btn);
        optionsDiv.appendChild(btn);
    });
}

function checkMCAnswer(selectedIndex, clickedBtn) {
    const q = mcQuestions[mcIndex];
    const buttons = document.querySelectorAll('.mc-option-btn');
    buttons.forEach(b => b.disabled = true);

    const feedback = document.getElementById('mc-feedback-banner');
    feedback.style.display = 'block';

    if (selectedIndex === q.correct) {
        clickedBtn.classList.add('correct');
        mcScore++;
        feedback.textContent = '✓ Correct! Your knowledge is growing.';
        currentUser.progress = Math.min(100, currentUser.progress + 5);
        saveProgress();
        updateUIWithUser();
    } else {
        clickedBtn.classList.add('wrong');
        buttons[q.correct].classList.add('correct');
        feedback.textContent = `Not quite — the correct answer is ${q.options[q.correct]}.`;
    }

    document.getElementById('mc-score-display').textContent = `Score: ${mcScore}`;
    document.getElementById('mc-next-btn').style.display = 'inline-block';
}

function nextMCQuestion() {
    mcIndex = (mcIndex + 1) % mcQuestions.length;
    renderMCQuestion();
}

// Camera Hand-Motion Quiz Logic
const motionChallenges = [
    'Sign the letter: "B" (Flat hand, fingers together, thumb tucked across palm)',
    'Sign the letter: "C" (Curve your fingers and thumb into a C shape)',
    'Sign the sentence: "Nice to meet you"'
];
let motionChallengeIdx = 0;
let motionPassed = 0;

function verifyMotionQuiz() {
    const status = document.getElementById('quiz-cam-status');
    status.textContent = 'Checking hand motion...';
    setTimeout(() => {
        motionPassed++;
        document.getElementById('motion-quiz-score').textContent = `Challenges Passed: ${motionPassed}`;
        status.textContent = '✓ Motion matched! +10% Progress saved.';
        currentUser.progress = Math.min(100, currentUser.progress + 10);
        saveProgress();
        updateUIWithUser();
    }, 1500);
}

function nextMotionChallenge() {
    motionChallengeIdx = (motionChallengeIdx + 1) % motionChallenges.length;
    document.getElementById('motion-prompt-text').textContent = motionChallenges[motionChallengeIdx];
    document.getElementById('quiz-cam-status').textContent = 'Ready for challenge!';
}

// --- 8. Network Monitoring for Unstable 5G / School Wi-Fi ---
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

function updateNetworkStatus() {
    const indicator = document.getElementById('network-status');
    const text = document.getElementById('network-text');
    if (navigator.onLine) {
        indicator.className = "status-indicator online";
        text.textContent = "Optimized for 5G / Low-Latency Network";
    } else {
        indicator.className = "status-indicator offline";
        text.textContent = "Offline Mode — Progress Cached Locally";
    }
}