// --- Navigation & View Switching ---
const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view-section');

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetViewId = btn.getAttribute('data-target');
        
        // Update active nav button
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update active view section
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(targetViewId).classList.add('active');

        // Initialize webcam if switching to practice view
        if (targetViewId === 'practice-view') {
            initWebcam();
        } else {
            stopWebcam();
        }
    });
});

function switchView(viewId) {
    const targetBtn = document.querySelector(`[data-target="${viewId}"]`);
    if (targetBtn) targetBtn.click();
}

// --- Webcam Management & Low-Latency Network Handling ---
let videoStream = null;
const webcamElement = document.getElementById('user-webcam');
const feedbackStatus = document.getElementById('feedback-status');

async function initWebcam() {
    try {
        feedbackStatus.textContent = "Connecting to camera...";
        // Request low-resolution stream to support unstable networks / 5G smoothly
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
            audio: false
        });
        webcamElement.srcObject = videoStream;
        feedbackStatus.textContent = "Camera active. Ready to practice!";
    } catch (error) {
        console.warn("Webcam access denied or unavailable:", error);
        feedbackStatus.textContent = "Camera unavailable. Simulation mode active.";
    }
}

function stopWebcam() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

// --- Practice Session & Simulated AI Feedback ---
let isPracticing = false;
const targetSentences = [
    "Nice to meet you",
    "How are you feeling today?",
    "Do you want to study together?",
    "Thank you for your help"
];
let currentSentenceIndex = 0;

function nextSentence() {
    currentSentenceIndex = (currentSentenceIndex + 1) % targetSentences.length;
    document.getElementById('current-target-sentence').textContent = `"${targetSentences[currentSentenceIndex]}"`;
    resetChecklist();
}

function toggleRecording() {
    const recordBtn = document.getElementById('record-btn');
    isPracticing = !isPracticing;

    if (isPracticing) {
        recordBtn.textContent = "Stop & Check Sign";
        recordBtn.style.background = "#EF4444"; // Red stop button
        feedbackStatus.textContent = "Analyzing hand gestures...";
        simulateAIFeedback();
    } else {
        recordBtn.textContent = "Start Practice Session";
        recordBtn.style.background = "";
        feedbackStatus.textContent = "Session completed. Great job!";
    }
}

function simulateAIFeedback() {
    if (!isPracticing) return;

    setTimeout(() => {
        if (!isPracticing) return;
        document.getElementById('check-hands').className = "success";
        document.getElementById('check-hands').textContent = "✓ Hand placement recognized";
    }, 1200);

    setTimeout(() => {
        if (!isPracticing) return;
        document.getElementById('check-speed').className = "success";
        document.getElementById('check-speed').textContent = "✓ Signing speed: Optimal";
    }, 2500);

    setTimeout(() => {
        if (!isPracticing) return;
        const randomAccuracy = Math.floor(Math.random() * (98 - 82 + 1)) + 82;
        const accuracyItem = document.getElementById('check-accuracy');
        accuracyItem.className = "success";
        accuracyItem.textContent = `✓ Accuracy score: ${randomAccuracy}%`;
        feedbackStatus.textContent = `Wonderful! Match score: ${randomAccuracy}%`;
    }, 3800);
}

function resetChecklist() {
    const items = ['check-hands', 'check-speed', 'check-accuracy'];
    items.forEach(id => {
        const el = document.getElementById(id);
        el.className = "pending";
    });
    if(id === 'check-hands') el.textContent = "Hand placement detected";
    document.getElementById('check-hands').textContent = "Hand placement detected";
    document.getElementById('check-speed').textContent = "Signing speed: Normal";
    document.getElementById('check-accuracy').textContent = "Accuracy score: --%";
    feedbackStatus.textContent = "Ready for next sign.";
}

// --- Video Player Modal Placeholder ---
function openVideoPlayer(title) {
    alert(`Opening video lesson: "${title}". (Connected to low-latency video streaming CDN)`);
}

// --- Network Monitoring for Unstable Networks ---
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
        text.textContent = "Offline Mode - Cached Lessons Available";
    }
}