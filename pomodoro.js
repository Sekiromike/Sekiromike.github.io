/**
 * Pomodoro Timer - Zen Mode
 */

const CONFIG = {
    // Default durations in minutes
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    colors: {
        focus: '#e0e0e0',
        short: '#38bdf8',
        long: '#34d399'
    }
};

const STATE = {
    mode: 'focus', // 'focus', 'short', 'long'
    timeLeft: CONFIG.focusDuration * 60,
    isRunning: false,
    sessionCount: 0,
    settings: {
        focus: CONFIG.focusDuration,
        short: CONFIG.shortBreakDuration,
        long: CONFIG.longBreakDuration,
        interval: CONFIG.longBreakInterval,
        sound: false,
        notifications: false,
        theme: 'dark' // Not used yet but stored
    },
    timerId: null,
    endTime: null
};

// DOM Elements
const elements = {
    timeDisplay: document.getElementById('time-display'),
    modeLabel: document.getElementById('mode-label'),
    sessionCounter: document.getElementById('session-counter'),
    toggleBtn: document.getElementById('toggle-btn'),
    resetBtn: document.getElementById('reset-btn'),
    progressCircle: document.querySelector('.progress-ring__circle'),
    settingsToggle: document.getElementById('settings-toggle'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettings: document.getElementById('close-settings'),
    inputs: {
        focus: document.getElementById('setting-focus'),
        short: document.getElementById('setting-short'),
        long: document.getElementById('setting-long'),
        interval: document.getElementById('setting-interval'),
        sound: document.getElementById('setting-sound'),
        notifications: document.getElementById('setting-notifications')
    }
};

// Progress Ring Setup
const radius = elements.progressCircle.r.baseVal.value;
const circumference = radius * 2 * Math.PI;
elements.progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
elements.progressCircle.style.strokeDashoffset = circumference;

function setProgress(percent) {
    const offset = circumference - (percent / 100) * circumference;
    elements.progressCircle.style.strokeDashoffset = offset;
}

// Initialization
function init() {
    loadSettings();
    updateDisplay();
    setupEventListeners();
    // Removed requestNotificationPermission from here to avoid browser blocking
}

function loadSettings() {
    const saved = localStorage.getItem('pomodoroItems');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            STATE.settings = { ...STATE.settings, ...parsed };
            STATE.sessionCount = parseInt(localStorage.getItem('pomodoroSessionCount') || '0', 10);
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }

    // Apply settings to inputs
    elements.inputs.focus.value = STATE.settings.focus;
    elements.inputs.short.value = STATE.settings.short;
    elements.inputs.long.value = STATE.settings.long;
    elements.inputs.interval.value = STATE.settings.interval;
    elements.inputs.sound.checked = STATE.settings.sound;
    elements.inputs.notifications.checked = STATE.settings.notifications;

    // Reset timer to current settings if not running
    if (!STATE.isRunning) {
        resetTimer(false);
    }
}

function saveSettings() {
    STATE.settings.focus = parseInt(elements.inputs.focus.value);
    STATE.settings.short = parseInt(elements.inputs.short.value);
    STATE.settings.long = parseInt(elements.inputs.long.value);
    STATE.settings.interval = parseInt(elements.inputs.interval.value);
    STATE.settings.sound = elements.inputs.sound.checked;
    STATE.settings.notifications = elements.inputs.notifications.checked;

    localStorage.setItem('pomodoroItems', JSON.stringify(STATE.settings));
    localStorage.setItem('pomodoroSessionCount', STATE.sessionCount);
}

// Timer Logic
function startTimer() {
    if (STATE.isRunning) return;

    // If starting from pause, calculate new end time
    // If starting fresh, set end time based on duration
    const now = Date.now();
    STATE.endTime = now + (STATE.timeLeft * 1000);

    STATE.isRunning = true;
    STATE.timerId = setInterval(tick, 100); // Check every 100ms for smoothness

    updateControls();
}

function pauseTimer() {
    if (!STATE.isRunning) return;

    clearInterval(STATE.timerId);
    STATE.isRunning = false;
    updateControls();
}

function resetTimer(autoStart = false) {
    clearInterval(STATE.timerId);
    STATE.isRunning = false;

    // Determine duration based on mode
    let duration;
    if (STATE.mode === 'focus') duration = STATE.settings.focus;
    else if (STATE.mode === 'short') duration = STATE.settings.short;
    else if (STATE.mode === 'long') duration = STATE.settings.long;

    STATE.timeLeft = duration * 60;

    updateDisplay();
    updateControls();
    setProgress(0); // Start full
    elements.progressCircle.style.strokeDashoffset = 0;

    if (autoStart) startTimer();
}

function tick() {
    const now = Date.now();
    const remaining = Math.ceil((STATE.endTime - now) / 1000);

    if (remaining !== STATE.timeLeft) {
        STATE.timeLeft = remaining;
        updateDisplay();

        // Update Progress
        const totalTime = (STATE.mode === 'focus' ? STATE.settings.focus :
            STATE.mode === 'short' ? STATE.settings.short :
                STATE.settings.long) * 60;

        // Calculate percentage remaining to show depletion
        const percentRemaining = (STATE.timeLeft / totalTime) * 100;
        setProgress(percentRemaining);
    }

    if (STATE.timeLeft <= 0) {
        completeTimer();
    }
}

function completeTimer() {
    clearInterval(STATE.timerId);
    STATE.isRunning = false;
    STATE.timeLeft = 0;
    updateDisplay();
    setProgress(0); // Empty

    playNotification();

    // Handle Mode Switch
    if (STATE.mode === 'focus') {
        STATE.sessionCount++;
        localStorage.setItem('pomodoroSessionCount', STATE.sessionCount);

        if (STATE.sessionCount % STATE.settings.interval === 0) {
            switchMode('long');
        } else {
            switchMode('short');
        }
    } else {
        switchMode('focus');
    }

    updateControls();
}

function switchMode(mode) {
    STATE.mode = mode;
    // Update colors
    let color;
    if (mode === 'focus') color = CONFIG.colors.focus;
    else if (mode === 'short') color = CONFIG.colors.short;
    else color = CONFIG.colors.long;

    elements.progressCircle.style.stroke = color;
    // Reset timer for new mode
    resetTimer(false);
}

function updateDisplay() {
    const m = Math.floor(STATE.timeLeft / 60);
    const s = STATE.timeLeft % 60;
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

    elements.timeDisplay.textContent = timeStr;
    document.title = `${timeStr} • ${STATE.mode.charAt(0).toUpperCase() + STATE.mode.slice(1)}`;

    elements.modeLabel.textContent = STATE.mode === 'focus' ? 'Focus' :
        STATE.mode === 'short' ? 'Short Break' : 'Long Break';

    elements.sessionCounter.textContent = `Session ${STATE.sessionCount + 1}/${STATE.settings.interval}`;
}

function updateControls() {
    elements.toggleBtn.textContent = STATE.isRunning ? 'Pause' : 'Start';
}

function playNotification() {
    if (STATE.settings.sound) {
        // Simple Beep using Audiocontext
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    }

    if (STATE.settings.notifications && Notification.permission === 'granted') {
        new Notification('Timer Complete', {
            body: `${STATE.mode === 'focus' ? 'Focus session' : 'Break'} finished!`,
            icon: 'favicon.png'
        });
    }
}

function requestNotificationPermission() {
    if (STATE.settings.notifications && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Event Listeners
function setupEventListeners() {
    elements.toggleBtn.addEventListener('click', () => {
        if (STATE.isRunning) pauseTimer();
        else {
            // Request permissions on user interaction
            if (STATE.settings.notifications && Notification.permission === 'default') {
                Notification.requestPermission();
            }

            // Resume/Start AudioContext (browser requirement for autoplay)
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                ctx.close(); // Dummy call to unlock audio
            }

            startTimer();
        }
    });

    elements.resetBtn.addEventListener('click', () => resetTimer(false));

    // Settings Logic
    elements.settingsToggle.addEventListener('click', () => {
        elements.settingsModal.classList.remove('hidden');
    });

    elements.closeSettings.addEventListener('click', () => {
        saveSettings();
        elements.settingsModal.classList.add('hidden');
        resetTimer(false); // Apply changes
    });

    // Close modal on outside click
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            saveSettings();
            elements.settingsModal.classList.add('hidden');
            resetTimer(false);
        }
    });

    // Sound Test on Toggle
    elements.inputs.sound.addEventListener('change', (e) => {
        if (e.target.checked) {
            playNotification(); // Test beep
        }
    });

    // Notification Permission on Toggle
    elements.inputs.notifications.addEventListener('change', (e) => {
        if (e.target.checked && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault(); // Prevent scrolling
            if (STATE.isRunning) pauseTimer();
            else startTimer();
        } else if (e.code === 'KeyR') {
            resetTimer(false);
        }
    });
}

// Start
init();
