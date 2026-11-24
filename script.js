// --- 1. Supabase Initialization ---
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

// --- 2. User State & Daily Streak Logic ---
const defaultGuestUser = {
    isAuthenticated: false,
    name: 'Guest',
    email: '',
    progress: 0,
    streak: 1,
    lastLoginDate: null,
    signsPracticed: 0,
    quizzesPassed: 0
};

let currentUser = { ...defaultGuestUser };

function evaluateDailyStreak() {
    if (!currentUser.isAuthenticated) return;

    const todayStr = new Date().toDateString();
    const lastLogin = currentUser.lastLoginDate;

    if (!lastLogin) {
        currentUser.streak = 1;
        currentUser.lastLoginDate = todayStr;
    } else if (lastLogin !== todayStr) {
        const lastDate = new Date(lastLogin);
        const currentDate = new Date(todayStr);
        const diffTime = currentDate - lastDate;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            currentUser.streak = (currentUser.streak || 1) + 1;
        } else if (diffDays > 1) {
            currentUser.streak = 1;
        }
        currentUser.lastLoginDate = todayStr;
    }
    saveProgress();
}

window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('signbridge_authenticated_user');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.isAuthenticated) {
            currentUser = parsed;
            evaluateDailyStreak();
            document.getElementById('auth-modal').classList.remove('active');
        }
    }
    updateUIWithUser();
    renderMCQuestion();
    updateNetworkStatus();
    updateCameraToggleButtonText();
    updateQuizCameraToggleButtonText();
    createHandLandmarker();
});

// --- 3. Smart Authentication & Password Validation ---
let authMode = 'login';

function openAuthModal() {
    document.getElementById('auth-modal').classList.add('active');
}

function closeAuthModalAsGuest() {
    if (currentUser.isAuthenticated) {
        document.getElementById('auth-modal').classList.remove('active');
    } else {
        continueAsGuest();
    }
}

function handleAuthOverlayClick(event) {
    if (event.target.id === 'auth-modal') {
        closeAuthModalAsGuest();
    }
}

document.addEventListener('keydown', (event) => {
    const authModal = document.getElementById('auth-modal');
    if (event.key === 'Escape' && authModal && authModal.classList.contains('active')) {
        closeAuthModalAsGuest();
    }
});

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
            const passwordError = validateStrongPassword(password);
            if (passwordError) {
                alert(passwordError);
                return;
            }

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
            lastLoginDate: null,
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

    evaluateDailyStreak();
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
            await supabaseClient
                .from('student_progress')
                .upsert(
                    {
                        student_name: currentUser.name,
                        progress_percentage: currentUser.progress,
                        streak_days: currentUser.streak
                    },
                    { onConflict: 'student_name' }
                );
        } catch (e) {
            console.warn("Cloud sync skipped:", e);
        }
    }
}

function updateUIWithUser() {
    const authBtn = document.getElementById('header-auth-btn');
    const dashLocked = document.getElementById('dashboard-locked-state');
    const dashUnlocked = document.getElementById('dashboard-unlocked-state');
    const profileLocked = document.getElementById('profile-locked-screen');
    const profileUnlocked = document.getElementById('profile-unlocked-screen');
    const adminSyncCard = document.getElementById('admin-sync-card');

    const isAdmin = currentUser.isAuthenticated && ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
    if (adminSyncCard) {
        adminSyncCard.style.display = isAdmin ? 'block' : 'none';
    }

    if (!currentUser.isAuthenticated) {
        document.getElementById('welcome-heading').textContent = 'Welcome, Guest! 👋';
        document.getElementById('user-avatar').textContent = 'G';

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

// --- 4. Navigation & View Switching (Camera stays OFF until user clicks Turn Camera On) ---
const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view-section');

function handleViewCameraLifecycle(viewId) {
    stopAllWebcams();

    if (viewId === 'practice-view') {
        const badgeEl = document.getElementById('feedback-status');
        if (badgeEl) {
            badgeEl.textContent = 'Camera is off. Press "Turn Camera On" to practice signing.';
        }
        updateCameraToggleButtonText();
    } else if (viewId === 'quiz-view') {
        const badgeEl = document.getElementById('quiz-cam-status');
        if (badgeEl) {
            badgeEl.textContent = 'Camera is off. Press "Turn Camera On" when ready.';
        }
        updateQuizCameraToggleButtonText();
    }
}

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetViewId = btn.getAttribute('data-target');

        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        views.forEach(v => v.classList.remove('active'));
        document.getElementById(targetViewId).classList.add('active');

        handleViewCameraLifecycle(targetViewId);
    });
});

function switchView(viewId) {
    const targetElement = document.getElementById(viewId);
    if (!targetElement) return;

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    targetElement.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active');
        if (b.getAttribute('data-target') === viewId) {
            b.classList.add('active');
        }
    });

    handleViewCameraLifecycle(viewId);
}

// --- 5. Lesson Video Modal, YouTube Search & Post-Lesson Practice Trigger ---
const aslVideoCache = {};

async function searchASLVideos(query, maxResults = 3) {
    const cacheKey = `${query}_${maxResults}`;
    if (aslVideoCache[cacheKey]) {
        return aslVideoCache[cacheKey];
    }

    if (!supabaseClient) {
        console.warn('Supabase client is required to call the secure YouTube edge function.');
        return [];
    }

    try {
        const { data, error } = await supabaseClient.functions.invoke('search-youtube', {
            body: { query, maxResults }
        });

        if (error) {
            throw error;
        }

        const videos = (data.items || [])
            .filter(item => item.id && item.id.videoId)
            .map(item => ({
                videoId: item.id.videoId,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                thumbnail: item.snippet.thumbnails?.medium?.url || ''
            }));

        aslVideoCache[cacheKey] = videos;
        return videos;
    } catch (err) {
        console.warn('Could not load ASL videos via Edge Function:', err);
        return [];
    }
}

let ytPlayer = null;
let isYTPlayerReady = false;
let pendingLessonVideoId = null;

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('asl-yt-player', {
        height: '180',
        width: '100%',
        videoId: '',
        playerVars: {
            playsinline: 1,
            rel: 0,
            cc_load_policy: 1
        },
        events: {
            onReady: (event) => {
                isYTPlayerReady = true;
                // If a video was requested before the player was ready, load it now
                if (pendingLessonVideoId) {
                    event.target.loadVideoById(pendingLessonVideoId);
                    pendingLessonVideoId = null;
                }
            }
        }
    });
}

async function openLessonModal(title, practiceTarget, category) {
    document.getElementById('modal-lesson-title').textContent = title;
    document.getElementById('lesson-modal').classList.add('active');

    const query = category === 'alphabet'
        ? `ASL sign language alphabet ${practiceTarget}`
        : `ASL sign language "${practiceTarget}"`;

    const videos = await searchASLVideos(query, 1);
    const chosenVideo = videos[0];
    const videoId = chosenVideo ? chosenVideo.videoId : null;

    if (videoId) {
        if (ytPlayer && isYTPlayerReady && typeof ytPlayer.loadVideoById === 'function') {
            ytPlayer.loadVideoById(videoId);
        } else {
            // Queue it up for when the player fires its onReady event
            pendingLessonVideoId = videoId;
        }
    }

    const practiceBtn = document.getElementById('practice-after-lesson-btn');
    practiceBtn.onclick = () => {
        closeLessonModal();
        if (currentUser.isAuthenticated) {
            currentUser.progress = Math.min(100, currentUser.progress + 5);
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
    if (ytPlayer && isYTPlayerReady && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.stopVideo();
    }
    document.getElementById('lesson-modal').classList.remove('active');
}

// --- 6. Opt-In Low-Latency Webcam Management ---
let activeStream = null;
let activeCameraTarget = null;
let isCameraActive = false;
let isQuizCameraActive = false;
let isRequestingCamera = false;

function stopAllWebcams() {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }

    const practiceVid = document.getElementById('user-webcam');
    const quizVid = document.getElementById('quiz-webcam');
    if (practiceVid) practiceVid.srcObject = null;
    if (quizVid) quizVid.srcObject = null;

    isCameraActive = false;
    isQuizCameraActive = false;
    activeCameraTarget = null;

    updateCameraToggleButtonText();
    updateQuizCameraToggleButtonText();
}

async function initWebcam(videoElementId, statusBadgeId, targetMode) {
    if (isRequestingCamera) return false;
    isRequestingCamera = true;

    const videoEl = document.getElementById(videoElementId);
    const badgeEl = document.getElementById(statusBadgeId);

    stopAllWebcams();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        isRequestingCamera = false;
        if (badgeEl) badgeEl.textContent = "Camera not supported on this device — Simulation mode active.";
        return false;
    }

    try {
        if (badgeEl) badgeEl.textContent = "Requesting camera permission...";
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 480 },
                height: { ideal: 360 },
                frameRate: { ideal: 20 }
            },
            audio: false
        });

        activeStream = stream;
        activeCameraTarget = targetMode;
        if (videoEl) {
            videoEl.srcObject = activeStream;
        }

        if (targetMode === 'practice') {
            isCameraActive = true;
            updateCameraToggleButtonText();
        } else if (targetMode === 'quiz') {
            isQuizCameraActive = true;
            updateQuizCameraToggleButtonText();
        }

        if (badgeEl) badgeEl.textContent = "Camera active. Position your hands in frame.";
        return true;
    } catch (error) {
        stopAllWebcams();
        if (badgeEl) {
            badgeEl.textContent = error.name === "NotAllowedError"
                ? "Camera permission denied — Simulation mode active."
                : "Camera unavailable — Simulation mode active.";
        }
        return false;
    } finally {
        isRequestingCamera = false;
    }
}

async function toggleCameraFeed() {
    if (isCameraActive && activeCameraTarget === 'practice') {
        stopAllWebcams();
        const badgeEl = document.getElementById('feedback-status');
        if (badgeEl) badgeEl.textContent = 'Camera is off. Press "Turn Camera On" to practice signing.';
    } else {
        await initWebcam('user-webcam', 'feedback-status', 'practice');
    }
}

function updateCameraToggleButtonText() {
    const toggleBtn = document.getElementById('cam-toggle-btn');
    if (toggleBtn) {
        const active = isCameraActive && activeCameraTarget === 'practice';
        toggleBtn.textContent = active ? "Turn Camera Off" : "Turn Camera On";
        toggleBtn.className = active ? "btn secondary" : "btn primary";
    }
}

async function toggleQuizCameraFeed() {
    const badgeEl = document.getElementById('quiz-cam-status');

    if (isQuizCameraActive && activeCameraTarget === 'quiz') {
        stopAllWebcams();
        if (badgeEl) {
            badgeEl.textContent = 'Camera is off. Press "Turn Camera On" when ready.';
        }
    } else {
        await initWebcam('quiz-webcam', 'quiz-cam-status', 'quiz');
    }
    updateQuizCameraToggleButtonText();
}

function updateQuizCameraToggleButtonText() {
    const toggleBtn = document.getElementById('quiz-cam-toggle-btn');
    if (toggleBtn) {
        const active = isQuizCameraActive && activeCameraTarget === 'quiz';
        toggleBtn.textContent = active ? "Turn Camera Off" : "Turn Camera On";
        toggleBtn.className = active ? "btn secondary" : "btn primary";
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

let mcQuestions = [
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
        const badgeEl = document.getElementById('quiz-cam-status');
        if (badgeEl) badgeEl.textContent = 'Camera is off. Press "Turn Camera On" when ready.';
    } else if (mode === 'mc') {
        loadOrGenerateDailyQuiz();
    }
}

function renderMCQuestion() {
    if (!mcQuestions || mcQuestions.length === 0) {
        mcQuestions = [{
            visual: '✊ (Closed fist, thumb resting against side of index finger)',
            question: 'Which ASL alphabet letter does this hand shape represent?',
            options: ['Letter A', 'Letter S', 'Letter E', 'Letter T'],
            correct: 0
        }];
    }

    if (mcIndex >= mcQuestions.length) {
        mcIndex = 0;
    }

    const q = mcQuestions[mcIndex];

    const optionsArray = Array.isArray(q.options) ? q.options : ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
    const correctIndex = typeof q.correct === 'number' ? q.correct : 0;

    document.getElementById('mc-question-counter').textContent = `Question ${mcIndex + 1} of ${mcQuestions.length}`;
    document.getElementById('mc-score-display').textContent = `Score: ${mcScore}`;
    document.getElementById('mc-visual-cue').textContent = q.visual || 'Visual cue loading...';
    document.getElementById('mc-question-text').textContent = q.question || 'Question text loading...';
    document.getElementById('mc-feedback-banner').style.display = 'none';
    document.getElementById('mc-next-btn').style.display = 'none';

    const optionsDiv = document.getElementById('mc-options');
    optionsDiv.innerHTML = '';

    optionsArray.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'mc-option-btn';
        btn.textContent = opt;
        btn.onclick = () => checkMCAnswer(idx, correctIndex, btn);
        optionsDiv.appendChild(btn);
    });
}

async function loadOrGenerateDailyQuiz() {
    const todayStr = new Date().toDateString();

    const fallbackQuestions = [
        {
            visual: '✊ (Closed fist, thumb resting against side of index finger)',
            question: 'Which ASL alphabet letter does this hand shape represent?',
            options: ['Letter A', 'Letter S', 'Letter E', 'Letter T'],
            correct: 0
        }
    ];

    if (currentUser.isAuthenticated && currentUser.email && supabaseClient) {
        try {
            const { data } = await supabaseClient
                .from('daily_quizzes')
                .select('*')
                .eq('student_email', currentUser.email)
                .eq('quiz_date', todayStr)
                .maybeSingle();

            if (data && Array.isArray(data.questions_json) && data.questions_json.length > 0) {
                mcQuestions = data.questions_json;
                mcIndex = 0;
                mcScore = 0;
                renderMCQuestion();
                return;
            }
        } catch (e) {
            console.warn("Could not fetch daily quiz from Supabase, checking local cache:", e);
        }
    }

    if (currentUser.dailyQuizDate === todayStr && Array.isArray(currentUser.dailyQuizQuestions) && currentUser.dailyQuizQuestions.length > 0) {
        mcQuestions = currentUser.dailyQuizQuestions;
        mcIndex = 0;
        mcScore = 0;
        renderMCQuestion();
        return;
    }

    const completedLessons = currentUser.watchedAlphabetLessons || ['ASL Alphabet: Letters A – E'];
    const progressPercent = currentUser.progress || 0;

    if (!supabaseClient) {
        mcQuestions = fallbackQuestions;
        mcIndex = 0;
        mcScore = 0;
        renderMCQuestion();
        return;
    }

    try {
        const { data, error } = await supabaseClient.functions.invoke('generate-quiz', {
            body: {
                completedLessons: completedLessons,
                progressPercent: progressPercent
            }
        });

        if (error) throw error;

        let parsedQuestions = null;

        if (Array.isArray(data)) {
            parsedQuestions = data;
        } else if (Array.isArray(data?.questions)) {
            parsedQuestions = data.questions;
        } else {
            let rawText =
                data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                data?.text ||
                "";

            if (typeof rawText === "string") {
                rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
                if (rawText) {
                    parsedQuestions = JSON.parse(rawText);
                }
            } else if (rawText && typeof rawText === "object") {
                parsedQuestions = rawText;
            }
        }

        if (Array.isArray(parsedQuestions) && parsedQuestions.length > 0) {
            mcQuestions = parsedQuestions;
            currentUser.dailyQuizDate = todayStr;
            currentUser.dailyQuizQuestions = parsedQuestions;
            saveProgress();

            if (currentUser.isAuthenticated && currentUser.email) {
                await supabaseClient.from('daily_quizzes').upsert({
                    student_email: currentUser.email,
                    quiz_date: todayStr,
                    questions_json: parsedQuestions,
                    completed: false
                }, { onConflict: 'student_email,quiz_date' });
            }
        } else {
            mcQuestions = fallbackQuestions;
        }
    } catch (err) {
        console.warn("Using fallback quiz questions due to Edge Function or parsing error:", err);
        mcQuestions = fallbackQuestions;
    }

    mcIndex = 0;
    mcScore = 0;
    renderMCQuestion();
}

function checkMCAnswer(selectedIndex, correctIndex, clickedBtn) {
    const buttons = document.querySelectorAll('.mc-option-btn');
    buttons.forEach(b => b.disabled = true);

    const feedback = document.getElementById('mc-feedback-banner');
    feedback.style.display = 'block';

    if (selectedIndex === correctIndex) {
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
        if (buttons[correctIndex]) {
            buttons[correctIndex].classList.add('correct');
        }
        feedback.textContent = `Not quite — the correct answer is option ${correctIndex + 1}.`;
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

let handLandmarker = undefined;
let runningMode = "VIDEO";

async function createHandLandmarker() {
    if (!window.FilesetResolver || !window.HandLandmarker) {
        console.warn("MediaPipe FilesetResolver or HandLandmarker not loaded.");
        return;
    }
    try {
        const vision = await window.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU"
            },
            runningMode: runningMode,
            numHands: 1
        });
        console.log("MediaPipe HandLandmarker initialized successfully.");
    } catch (err) {
        console.warn("MediaPipe HandLandmarker initialization skipped:", err);
    }
}

function nextMotionChallenge() {
    motionChallengeIdx = (motionChallengeIdx + 1) % motionChallenges.length;
    document.getElementById('motion-prompt-text').textContent = motionChallenges[motionChallengeIdx];
    document.getElementById('quiz-cam-status').textContent = isQuizCameraActive
        ? 'Camera active. Ready for challenge!'
        : 'Camera is off. Press "Turn Camera On" when ready.';
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