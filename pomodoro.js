/**
 * Focus timer: a Pomodoro clock with focus, short-break and long-break modes.
 * Time is measured against a fixed end time, so the count stays correct even
 * when the browser throttles timers in a background tab.
 */

const MODES = {
    focus: 'Focus',
    short: 'Short break',
    long: 'Long break'
};

// [min, max] for each numeric setting, matching the inputs in pomodoro.html
const LIMITS = {
    focus: [1, 90],
    short: [1, 30],
    long: [1, 60],
    interval: [1, 10]
};

const STATE = {
    mode: 'focus',
    timeLeft: 25 * 60,
    isRunning: false,
    sessionCount: 0, // completed focus sessions
    endTime: null,
    timerId: null,
    settings: {
        focus: 25,
        short: 5,
        long: 15,
        interval: 4,
        sound: false,
        notifications: false
    }
};

const hasNotifications = 'Notification' in window;

const storage = {
    get(key) {
        try { return localStorage.getItem(key); } catch (error) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); } catch (error) { /* storage blocked */ }
    }
};

const elements = {
    page: document.body,
    timeDisplay: document.getElementById('time-display'),
    modeLabel: document.getElementById('mode-label'),
    sessionCounter: document.getElementById('session-counter'),
    toggleBtn: document.getElementById('toggle-btn'),
    resetBtn: document.getElementById('reset-btn'),
    progress: document.querySelector('.ring-progress'),
    modeButtons: [...document.querySelectorAll('.mode-switch button')],
    settingsToggle: document.getElementById('settings-toggle'),
    settingsModal: document.getElementById('settings-modal'),
    inputs: {
        focus: document.getElementById('setting-focus'),
        short: document.getElementById('setting-short'),
        long: document.getElementById('setting-long'),
        interval: document.getElementById('setting-interval'),
        sound: document.getElementById('setting-sound'),
        notifications: document.getElementById('setting-notifications')
    }
};

// Progress ring. The SVG scales through its viewBox, so the radius in user
// units never changes and the circumference only needs computing once.
const circumference = 2 * Math.PI * elements.progress.r.baseVal.value;
elements.progress.style.strokeDasharray = `${circumference} ${circumference}`;

function setProgress(fraction) {
    const clamped = Math.min(1, Math.max(0, fraction));
    elements.progress.style.strokeDashoffset = String(circumference * (1 - clamped));
}

function durationOf(mode) {
    return STATE.settings[mode] * 60;
}

function clampSetting(key, value) {
    const [min, max] = LIMITS[key];
    const number = parseInt(value, 10);
    if (Number.isNaN(number)) return STATE.settings[key];
    return Math.min(max, Math.max(min, number));
}

// ---------- Settings ----------
function loadSettings() {
    const saved = storage.get('pomodoroItems');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.keys(LIMITS).forEach(key => {
                if (key in parsed) STATE.settings[key] = clampSetting(key, parsed[key]);
            });
            STATE.settings.sound = Boolean(parsed.sound);
            STATE.settings.notifications = Boolean(parsed.notifications);
        } catch (error) {
            console.error('Failed to load timer settings', error);
        }
    }
    STATE.sessionCount = parseInt(storage.get('pomodoroSessionCount') || '0', 10) || 0;
    writeInputs();
}

function writeInputs() {
    Object.keys(LIMITS).forEach(key => { elements.inputs[key].value = STATE.settings[key]; });
    elements.inputs.sound.checked = STATE.settings.sound;
    elements.inputs.notifications.checked = hasNotifications && STATE.settings.notifications;
    if (!hasNotifications) {
        elements.inputs.notifications.disabled = true;
        elements.inputs.notifications.title = 'This browser does not support notifications';
    }
}

function applySettings() {
    const previousDuration = durationOf(STATE.mode);

    Object.keys(LIMITS).forEach(key => {
        STATE.settings[key] = clampSetting(key, elements.inputs[key].value);
    });
    STATE.settings.sound = elements.inputs.sound.checked;
    STATE.settings.notifications = hasNotifications && elements.inputs.notifications.checked;
    writeInputs();

    storage.set('pomodoroItems', JSON.stringify(STATE.settings));

    // A running or paused session keeps its time; a new length for the
    // current mode only applies straight away when the timer is idle.
    const isIdle = !STATE.isRunning && STATE.timeLeft === previousDuration;
    if (isIdle && durationOf(STATE.mode) !== previousDuration) {
        resetTimer();
    } else {
        updateDisplay();
    }
}

// ---------- Timer ----------
function startTimer() {
    if (STATE.isRunning) return;
    STATE.endTime = Date.now() + STATE.timeLeft * 1000;
    STATE.isRunning = true;
    STATE.timerId = setInterval(tick, 100);
    updateControls();
}

function pauseTimer() {
    if (!STATE.isRunning) return;
    clearInterval(STATE.timerId);
    STATE.isRunning = false;
    updateControls();
}

function toggleTimer() {
    if (STATE.isRunning) {
        pauseTimer();
        return;
    }
    // Browsers only allow audio and permission prompts after a user gesture
    unlockAudio();
    if (STATE.settings.notifications && hasNotifications && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    startTimer();
}

function resetTimer() {
    clearInterval(STATE.timerId);
    STATE.isRunning = false;
    STATE.timeLeft = durationOf(STATE.mode);
    setProgress(1);
    updateDisplay();
    updateControls();
}

function tick() {
    const msLeft = Math.max(0, STATE.endTime - Date.now());
    const secondsLeft = Math.ceil(msLeft / 1000);

    setProgress(msLeft / 1000 / durationOf(STATE.mode));

    if (secondsLeft !== STATE.timeLeft) {
        STATE.timeLeft = secondsLeft;
        updateDisplay();
    }

    if (msLeft <= 0) completeTimer();
}

function completeTimer() {
    const finished = STATE.mode;
    clearInterval(STATE.timerId);
    STATE.isRunning = false;
    notify(finished);

    if (finished === 'focus') {
        STATE.sessionCount += 1;
        storage.set('pomodoroSessionCount', String(STATE.sessionCount));
        switchMode(STATE.sessionCount % STATE.settings.interval === 0 ? 'long' : 'short');
    } else {
        switchMode('focus');
    }
}

function switchMode(mode) {
    STATE.mode = mode;
    elements.page.dataset.mode = mode;
    elements.modeButtons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    resetTimer();
}

// ---------- Display ----------
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateDisplay() {
    const time = formatTime(STATE.timeLeft);
    const { interval } = STATE.settings;
    const doneInCycle = STATE.sessionCount % interval;

    elements.timeDisplay.textContent = time;
    elements.modeLabel.textContent = MODES[STATE.mode];
    document.title = `${time} · ${MODES[STATE.mode]}`;

    if (STATE.mode === 'focus') {
        elements.sessionCounter.textContent = `Session ${doneInCycle + 1} of ${interval}`;
    } else {
        const done = STATE.mode === 'long' && doneInCycle === 0 ? interval : doneInCycle;
        elements.sessionCounter.textContent = `${done} of ${interval} ${interval === 1 ? 'session' : 'sessions'} done`;
    }
}

function updateControls() {
    elements.toggleBtn.textContent = STATE.isRunning ? 'Pause' : 'Start';
}

// ---------- Sound and notifications ----------
let audioContext = null;

function unlockAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
}

function playChime() {
    const ctx = unlockAudio();
    if (!ctx) return;
    // Two soft tones, a fifth apart
    [660, 990].forEach((frequency, index) => {
        const start = ctx.currentTime + index * 0.18;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.65);
    });
}

function notify(finishedMode) {
    if (STATE.settings.sound) playChime();

    if (STATE.settings.notifications && hasNotifications && Notification.permission === 'granted') {
        new Notification(finishedMode === 'focus' ? 'Focus session done' : 'Break over', {
            body: finishedMode === 'focus' ? 'Time for a break.' : 'Ready for the next focus session?',
            icon: 'favicon.png'
        });
    }
}

// ---------- Settings dialog ----------
function openSettings() {
    writeInputs();
    if (typeof elements.settingsModal.showModal === 'function') {
        elements.settingsModal.showModal();
    } else {
        elements.settingsModal.setAttribute('open', '');
    }
}

function settingsOpen() {
    return elements.settingsModal.hasAttribute('open');
}

// ---------- Events ----------
function setupEventListeners() {
    elements.toggleBtn.addEventListener('click', toggleTimer);
    elements.resetBtn.addEventListener('click', resetTimer);

    elements.modeButtons.forEach(button => {
        button.addEventListener('click', () => switchMode(button.dataset.mode));
    });

    elements.settingsToggle.addEventListener('click', openSettings);

    // Settings are applied on every way out of the dialog. applySettings is
    // idempotent, so it is safe when more than one of these fires.
    const settingsForm = elements.settingsModal.querySelector('form');
    settingsForm.addEventListener('submit', event => {
        applySettings();
        if (typeof elements.settingsModal.showModal !== 'function') {
            event.preventDefault();
            elements.settingsModal.removeAttribute('open');
        }
    });
    elements.settingsModal.addEventListener('cancel', applySettings);
    elements.settingsModal.addEventListener('close', applySettings);

    // Clicking the dimmed backdrop closes the dialog
    elements.settingsModal.addEventListener('click', event => {
        if (event.target !== elements.settingsModal) return;
        applySettings();
        elements.settingsModal.close();
    });

    elements.inputs.sound.addEventListener('change', event => {
        if (event.target.checked) playChime();
    });

    elements.inputs.notifications.addEventListener('change', event => {
        if (!event.target.checked || !hasNotifications) return;
        if (Notification.permission === 'default') {
            // Older Safari takes a callback and returns nothing
            const request = Notification.requestPermission(permission => {
                if (permission !== 'granted') event.target.checked = false;
            });
            if (request && request.then) {
                request.then(permission => {
                    if (permission !== 'granted') event.target.checked = false;
                });
            }
        } else if (Notification.permission === 'denied') {
            event.target.checked = false;
            event.target.title = 'Notifications are blocked for this site in your browser settings';
        }
    });

    document.addEventListener('keydown', event => {
        if (settingsOpen() || event.metaKey || event.ctrlKey || event.altKey) return;
        // Let focused controls handle their own keys
        if (event.target.closest('button, a, input, select, textarea')) return;

        if (event.code === 'Space') {
            event.preventDefault();
            toggleTimer();
        } else if (event.code === 'KeyR') {
            resetTimer();
        }
    });
}

loadSettings();
setupEventListeners();
resetTimer();
