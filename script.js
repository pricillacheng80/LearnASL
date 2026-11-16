// --- 1. Supabase Initialization (Supports sb_publishable_ and legacy eyJ keys) ---
const SUPABASE_URL = 'https://mecjgmcuwtqzkrmwecfq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RNE3_cZ8XbDF_YJaFIA05w_hBcK2F2P';
const ADMIN_EMAILS = ['pricilla.cheng123@gmail.com']; // Add your admin email(s) here

let supabaseClient = null;
try {
    if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY &&
       (SUPABASE_ANON_KEY.startsWith('sb_publishable_') || SUPABASE_ANON_KEY.startsWith('eyJ'))) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (err) {
    console.warn("Supabase initialization skipped. Running in local fallback mode:", err);
}

// --- Forgot Password Handling ---
async function handleForgotPassword(event) {
    event.preventDefault();
    const emailInput = document.getElementById('student-email').value.trim();

    if (!emailInput) {
        alert("Please enter your email address in the email field above first, then click 'Forgot password?'.");
        return;
    }

    if (!supabaseClient) {
        alert("Supabase client is not initialized.");
        return;
    }

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(emailInput, {
            redirectTo: window.location.origin + window.location.pathname
        });

        if (error) {
            throw error;
        }

        alert("Password reset instructions have been sent to " + emailInput + ". Please check your inbox!");
    } catch (err) {
        alert("Error sending password reset email: " + err.message);
    }
}

// --- 2. User State (Strictly Authenticated vs Guest) ---
const defaultGuestUser = {
    isAuthenticated: false,
    name: 'Guest',
    email: '',
    progress: 0,
    streak: 1,
    signsPracticed: 0,
    quizzesPassed: 0
};

let currentUser = { ...defaultGuestUser };

window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('signbridge_authenticated_user');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.isAuthenticated) {
            currentUser = parsed;
            document.getElementById('auth-modal').classList.remove('active');
        }
    }
    updateUIWithUser();
    renderMCQuestion();
    updateNetworkStatus();
});

// --- 3. Smart Authentication & Password Validation ---
let authMode = 'login';

function openAuthModal() {
    document.getElementById('auth-modal').classList.add('active');
}

function switchAuthTab(mode) {
    authMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('name-field').style.display = mode === 'signup' ? 'block' : 'none';
    
    const hint = document.getElementById('password-rules-hint');
    if (hint) {
        hint.style.display = mode === 'signup' ? 'block' : 'none';
    }

    document.getElementById('auth-submit-btn').textContent = mode === 'signup' ? 'Sign Up' : 'Login';
}

function validateStrongPassword(password) {
    const hasMinLength = password.length >= 9;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);

    if (!hasMinLength) {
        return "Password must be at least 9 characters long.";
    }
    if (!hasUpperCase) {
        return "Password must include at least one capital letter (A–Z).";
    }
    if (!hasSpecialChar) {
        return "Password must include at least one special character (e.g., !, @, #, $, %).";
    }
    return null;
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('student-email').value.trim();
    const password = document.getElementById('student-password').value;
    const chosenUsername = document.getElementById('student-name').value.trim();

    if (!supabaseClient) {
        alert("Supabase client unavailable. Please check your internet connection.");
        return;
    }

    try {
        if (authMode === 'signup') {
            // Enforce strong password rules before creating the account
            const passwordError = validateStrongPassword(password);
            if (passwordError) {
                alert(passwordError);
                return;
            }

            // Sign Up Flow: Verifies active email & checks if already registered
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: chosenUsername || email.split('@')[0] },
                    emailRedirectTo: window.location.origin + window.location.pathname
                }
            });

            if (error) {
                alert(`Sign-up issue: ${error.message}`);
                return;
            }

            // Supabase returns an empty identities array if the email already exists in the database
            const emailExists = data.user && data.user.identities && data.user.identities.length === 0;
            if (emailExists) {
                alert("This email already exists in our database! Please log in using the Log In tab.");
                switchAuthTab('login');
                return;
            }

            alert("Account created! Please check your inbox for an active sign-up confirmation email to verify your account.");
            if (data.session) {
                completeUserLogin(email, chosenUsername || email.split('@')[0]);
            } else {
                switchAuthTab('login');
            }
        } else {
            // Log In Flow
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

            if (error) {
                alert("Account not found or invalid credentials. If you haven't registered yet, please switch to 'Sign Up' to create an account.");
                return;
            }

            const username = data.user?.user_metadata?.full_name || chosenUsername || email.split('@')[0];
            completeUserLogin(email, username);
        }
    } catch (err) {
        alert(`Authentication error: ${err.message}`);
    }
}

async function completeUserLogin(email, username) {
    const userStorageKey = `signbridge_progress_${email}`;
    const storedAccountData = localStorage.getItem(userStorageKey);

    if (storedAccountData) {
        currentUser = JSON.parse(storedAccountData);
        currentUser.isAuthenticated = true;
        currentUser.name = username || currentUser.name;
    } else {
        currentUser = {
            isAuthenticated: true,
            name: username,
            email: email,
            progress: 10,
            streak: 1,
            signsPracticed: 0,
            quizzesPassed: 0
        };
    }

    if (supabaseClient) {
        try {
            const { data } = await supabaseClient
                .from('student_progress')
                .select('*')
                .eq('student_name', currentUser.name)
                .maybeSingle();

            if (data) {
                currentUser.progress = Math.max(currentUser.progress, data.progress_percentage || 0);
                currentUser.streak = Math.max(currentUser.streak, data.streak_days || 1);
            }
        } catch (e) {
            console.warn("Could not fetch remote progress, using local profile:", e);
        }
    }

    saveProgress();
    document.getElementById('auth-modal').classList.remove('active');
    updateUIWithUser();
}

function continueAsGuest() {
    currentUser = { ...defaultGuestUser };
    localStorage.removeItem('signbridge_authenticated_user');
    document.getElementById('auth-modal').classList.remove('active');
    updateUIWithUser();
}

async function logoutUser() {
    if (confirm('Sign out of your account? Your progress is saved.')) {
        if (supabaseClient) {
            await supabaseClient.auth.signOut().catch(() => {});
        }
        localStorage.removeItem('signbridge_authenticated_user');
        currentUser = { ...defaultGuestUser };
        
        switchView('dashboard-view');
        updateUIWithUser();
        openAuthModal();
    }
}

async function saveProgress() {
    if (!currentUser.isAuthenticated || !currentUser.email) return;

    localStorage.setItem('signbridge_authenticated_user', JSON.stringify(currentUser));
    localStorage.setItem(`signbridge_progress_${currentUser.email}`, JSON.stringify(currentUser));

    if (supabaseClient) {
        try {
            await supabaseClient.from('student_progress').upsert({
                student_name: currentUser.name,
                progress_percentage: currentUser.progress,
                streak_days: currentUser.streak
            });
        } catch (e) {
            console.warn("Cloud sync skipped:", e);
        }
    }
}

function updateUIWithUser() {
    const authBtn = document.getElementById('header-auth-btn');
    const streakBadge = document.getElementById('user-streak');
    const dashLocked = document.getElementById('dashboard-locked-state');
    const dashUnlocked = document.getElementById('dashboard-unlocked-state');
    const profileLocked = document.getElementById('profile-locked-screen');
    const profileUnlocked = document.getElementById('profile-unlocked-screen');
    const adminSyncCard = document.getElementById('admin-sync-card');

    // Check if the currently logged-in user is an admin
    const isAdmin = currentUser.isAuthenticated && ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
    if (adminSyncCard) {
        adminSyncCard.style.display = isAdmin ? 'block' : 'none';
    }

    if (!currentUser.isAuthenticated) {
        document.getElementById('welcome-heading').textContent = 'Welcome, Guest! 👋';
        document.getElementById('user-avatar').textContent = 'G';
        streakBadge.style.display = 'none';

        authBtn.textContent = 'Sign In';
        authBtn.onclick = openAuthModal;

        dashLocked.style.display = 'block';
        dashUnlocked.style.display = 'none';
        profileLocked.style.display = 'block';
        profileUnlocked.style.display = 'none';
        return;
    }

    document.getElementById('welcome-heading').textContent = `Welcome back, ${currentUser.name}! 👋`;
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    streakBadge.style.display = 'inline';
    streakBadge.textContent = `🔥 ${currentUser.streak} Day Streak`;

    authBtn.textContent = 'Sign Out';
    authBtn.onclick = logoutUser;

    dashLocked.style.display = 'none';
    dashUnlocked.style.display = 'flex';
    profileLocked.style.display = 'none';
    profileUnlocked.style.display = 'block';

    document.getElementById('overall-progress-bar').style.width = `${currentUser.progress}%`;
    const unitLabel = currentUser.progress < 50 ? 'Unit 1: ASL Alphabet (A–Z)' : 'Unit 2: Full School Sentences';
    document.getElementById('progress-summary-text').innerHTML = `${currentUser.progress}% Complete • Current Unit: <strong>${unitLabel}</strong>`;

    document.getElementById('profile-avatar-large').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('profile-username-display').textContent = currentUser.name;
    document.getElementById('profile-email-display').textContent = currentUser.email;
    document.getElementById('profile-streak-val').textContent = `🔥 ${currentUser.streak} Day${currentUser.streak > 1 ? 's' : ''}`;
    document.getElementById('profile-session-val').textContent = `${currentUser.signsPracticed} Sign${currentUser.signsPracticed === 1 ? '' : 's'} Practiced`;
    document.getElementById('profile-unit-status').textContent = `Current Unit: ${unitLabel}`;
    document.getElementById('profile-mastery-val').textContent = `${currentUser.progress}%`;
    document.getElementById('profile-progress-bar').style.width = `${currentUser.progress}%`;

    toggleAward('award-first-step', 'status-award-1', currentUser.signsPracticed >= 1 || currentUser.progress > 10);
    toggleAward('award-alphabet-ace', 'status-award-2', currentUser.progress >= 25);
    toggleAward('award-sentence-builder', 'status-award-3', currentUser.progress >= 50);
    toggleAward('award-quiz-master', 'status-award-4', currentUser.quizzesPassed >= 3);
}

function toggleAward(cardId, statusId, isUnlocked) {
    const card = document.getElementById(cardId);
    const badge = document.getElementById(statusId);
    if (isUnlocked) {
        card.classList.add('unlocked');
        badge.className = 'award-status unlocked';
        badge.textContent = 'Unlocked!';
    } else {
        card.classList.remove('unlocked');
        badge.className = 'award-status locked';
        badge.textContent = 'Locked';
    }
}

// --- 4. Navigation & View Switching ---
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

// --- 5. Lesson Video Modal & Post-Lesson Practice Trigger ---
function openLessonModal(title, practiceTarget, category) {
    document.getElementById('modal-lesson-title').textContent = title;
    document.getElementById('video-demo-visual').textContent = `🤟 Signing: "${practiceTarget}"`;
    document.getElementById('lesson-modal').classList.add('active');

    const practiceBtn = document.getElementById('practice-after-lesson-btn');
    practiceBtn.onclick = () => {
        closeLessonModal();
        if (currentUser.isAuthenticated) {
            currentUser.progress = Math.min(100, currentUser.progress + 10);
            saveProgress();
            updateUIWithUser();
        }

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

// --- 6. Low-Latency Webcam Management ---
let activeStream = null;
let isCameraActive = true;
let isQuizCameraActive = true;

function stopAllWebcams() {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
    const practiceVid = document.getElementById('user-webcam');
    const quizVid = document.getElementById('quiz-webcam');
    if (practiceVid) practiceVid.srcObject = null;
    if (quizVid) quizVid.srcObject = null;
}

async function initWebcam(videoElementId, statusBadgeId) {
    const videoEl = document.getElementById(videoElementId);
    const badgeEl = document.getElementById(statusBadgeId);
    try {
        badgeEl.textContent = "Connecting camera...";
        activeStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 20 } },
            audio: false
        });
        videoEl.srcObject = activeStream;
        isCameraActive = true;
        isQuizCameraActive = true;
        updateCameraToggleButtonText();
        badgeEl.textContent = "Camera active. Position your hands in frame.";
    } catch (error) {
        badgeEl.textContent = "Camera unavailable — Simulation mode active.";
        isCameraActive = false;
        isQuizCameraActive = false;
        updateCameraToggleButtonText();
    }
}

function toggleCameraFeed() {
    const videoEl = document.getElementById('user-webcam');
    const badgeEl = document.getElementById('feedback-status');

    if (isCameraActive) {
        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
            activeStream = null;
        }
        videoEl.srcObject = null;
        isCameraActive = false;
        badgeEl.textContent = "Camera is turned off.";
    } else {
        initWebcam('user-webcam', 'feedback-status');
    }
    updateCameraToggleButtonText();
}

function updateCameraToggleButtonText() {
    const toggleBtn = document.getElementById('cam-toggle-btn');
    if (toggleBtn) {
        toggleBtn.textContent = isCameraActive ? "Turn Camera Off" : "Turn Camera On";
        toggleBtn.className = isCameraActive ? "btn secondary" : "btn primary";
    }
}

function toggleQuizCameraFeed() {
    const videoEl = document.getElementById('quiz-webcam');
    const badgeEl = document.getElementById('quiz-cam-status');
    const toggleBtn = document.getElementById('quiz-cam-toggle-btn');

    if (isQuizCameraActive) {
        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
            activeStream = null;
        }
        videoEl.srcObject = null;
        isQuizCameraActive = false;
        toggleBtn.textContent = "Turn Camera On";
        toggleBtn.className = "btn primary";
        badgeEl.textContent = "Camera is turned off.";
    } else {
        initWebcam('quiz-webcam', 'quiz-cam-status');
        isQuizCameraActive = true;
        toggleBtn.textContent = "Turn Camera Off";
        toggleBtn.className = "btn secondary";
    }
}

// --- 7. Camera Practice ---
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

        if (currentUser.isAuthenticated) {
            feedbackStatus.textContent = `Great job! Accuracy: ${score}% — Progress saved to Profile!`;
            currentUser.progress = Math.min(100, currentUser.progress + 5);
            currentUser.signsPracticed += 1;
            saveProgress();
            updateUIWithUser();
        } else {
            feedbackStatus.textContent = `Great job! Accuracy: ${score}% (Sign in to save progress)`;
        }

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

// --- 8. Quizzes (Multiple Choice + Camera Hand-Motion) ---
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
        if (currentUser.isAuthenticated) {
            feedback.textContent = '✓ Correct! Progress saved to your Profile.';
            currentUser.progress = Math.min(100, currentUser.progress + 5);
            currentUser.quizzesPassed += 1;
            saveProgress();
            updateUIWithUser();
        } else {
            feedback.textContent = '✓ Correct! (Sign in to save quiz progress)';
        }
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
        if (currentUser.isAuthenticated) {
            status.textContent = '✓ Motion matched! +10% Progress saved.';
            currentUser.progress = Math.min(100, currentUser.progress + 10);
            currentUser.quizzesPassed += 1;
            saveProgress();
            updateUIWithUser();
        } else {
            status.textContent = '✓ Motion matched! (Sign in to save progress)';
        }
    }, 1500);
}

function nextMotionChallenge() {
    motionChallengeIdx = (motionChallengeIdx + 1) % motionChallenges.length;
    document.getElementById('motion-prompt-text').textContent = motionChallenges[motionChallengeIdx];
    document.getElementById('quiz-cam-status').textContent = 'Ready for challenge!';
}

// --- 9. Network Monitoring ---
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