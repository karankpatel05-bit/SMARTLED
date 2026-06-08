// ===========================================
// DOM Elements
// ===========================================
const connectionScreen     = document.getElementById('connection-screen');
const mainScreen           = document.getElementById('main-screen');
const connectBtn           = document.getElementById('connect-btn');
const disconnectBtn        = document.getElementById('disconnect-btn');
const connectionStatus     = document.getElementById('connection-status');
const statusIcon           = document.getElementById('status-icon');
const brightnessBar        = document.getElementById('brightness-bar');
const brightnessText       = document.getElementById('brightness-text');
const micBtn               = document.getElementById('mic-btn');
const cameraToggleBtn      = document.getElementById('camera-toggle-btn');
const voiceTranscript      = document.getElementById('voice-transcript');
const videoElement         = document.getElementById('input-video');
const canvasElement        = document.getElementById('output-canvas');
const canvasCtx            = canvasElement.getContext('2d');
const dashboard            = document.getElementById('dashboard');
const selectedDeviceLabel  = document.getElementById('selected-device-label');

// ===========================================
// Adafruit IO REST API Helpers
// AIO_USERNAME and AIO_KEY are loaded from config.js
// ===========================================
const AIO_REGISTRY_URL = `https://io.adafruit.com/api/v2/${AIO_USERNAME}/feeds/smartled-registry/data/last`;

function deviceFeedUrl(deviceId) {
    if (deviceId === 'all') return `https://io.adafruit.com/api/v2/${AIO_USERNAME}/feeds/smartled-all/data`;
    return `https://io.adafruit.com/api/v2/${AIO_USERNAME}/feeds/smartled-${deviceId}/data`;
}

// Proper queueing so commands don't drop when button is pressed rapidly
const _pubQueue = {};
async function publishToDevice(deviceId, value) {
    if (!_pubQueue[deviceId]) _pubQueue[deviceId] = Promise.resolve();
    
    _pubQueue[deviceId] = _pubQueue[deviceId].then(async () => {
        try {
            const res = await fetch(deviceFeedUrl(deviceId), {
                method: 'POST',
                headers: { 'X-AIO-Key': AIO_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ value })
            });
            if (!res.ok) console.error('Publish failed:', await res.text());
            
            // Wait 2s to comply with Adafruit IO rate limits before next publish
            await new Promise(r => setTimeout(r, 2000));
            return res.ok;
        } catch(e) {
            console.error('Publish error:', e);
            await new Promise(r => setTimeout(r, 2000));
            return false;
        }
    });
    
    return _pubQueue[deviceId];
}

// ===========================================
// Fleet Device Management
// ===========================================
let knownDevices   = JSON.parse(localStorage.getItem('smartled_devices')) || [];
let selectedId     = knownDevices.length > 0 ? knownDevices[0].id : null;
const deviceStates = {};

knownDevices.forEach(d => { deviceStates[d.id] = { power: 1, brightness: 127 }; });

// Poll Adafruit IO registry for new device pings
async function pollRegistry() {
    try {
        const res = await fetch(AIO_REGISTRY_URL, { headers: { 'X-AIO-Key': AIO_KEY } });
        if (!res.ok) return;
        const data = await res.json();
        const newId = data?.value?.trim();
        if (!newId || knownDevices.find(d => d.id === newId)) return;

        const name = prompt(
            `🔍 New SmartLED discovered!\nDevice ID: ${newId}\n\nWhat would you like to name it? (e.g., Living Room)`
        );
        if (!name || !name.trim()) return;

        // --- AUTO-PROVISIONING (Phone acting as Manager) ---
        const feedKey = `smartled-${newId}`;
        try {
            const checkRes = await fetch(`https://io.adafruit.com/api/v2/${AIO_USERNAME}/feeds/${feedKey}`, {
                headers: { 'X-AIO-Key': AIO_KEY }
            });
            if (checkRes.status === 404) {
                console.log(`🚀 Creating feed for ${newId} from PWA...`);
                await fetch(`https://io.adafruit.com/api/v2/${AIO_USERNAME}/feeds`, {
                    method: 'POST',
                    headers: { 'X-AIO-Key': AIO_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        feed: { name: feedKey, key: feedKey, description: "Auto-generated feed for SMARTLED device" }
                    })
                });
            }
        } catch (e) {
            console.error('Failed to auto-create feed:', e);
        }

        const device = { id: newId, name: name.trim() };
        knownDevices.push(device);
        localStorage.setItem('smartled_devices', JSON.stringify(knownDevices));
        deviceStates[device.id] = { power: 1, brightness: 127 };
        if (!selectedId) { selectedId = device.id; }
        renderDeviceCard(device);
        updateGlobalStatusBar();
    } catch(e) {
        console.error('Registry poll error:', e);
    }
}

// ===========================================
// Device Card Rendering
// ===========================================
function renderDeviceCard(device) {
    const noMsg = dashboard.querySelector('.no-devices-msg');
    if (noMsg) noMsg.remove();

    // Ensure Global Card is rendered first
    if (!document.getElementById('card-all')) {
        renderGlobalCard();
    }

    const state = deviceStates[device.id];
    const pct   = Math.round((state.brightness / 255) * 100);
    const isOn  = state.power === 1 && state.brightness > 0;
    const isSel = device.id === selectedId;

    const card = document.createElement('div');
    card.className = `device-card${isSel ? ' selected' : ''}`;
    card.id = `card-${device.id}`;

    card.innerHTML = `
        <div class="device-card-header">
            <div class="device-info">
                <i class="ph ph-lightbulb device-icon${isOn ? '' : ' off'}"></i>
                <div>
                    <div class="device-name">${device.name}</div>
                    <div class="device-id">ID: ${device.id.slice(-6).toUpperCase()}</div>
                </div>
            </div>
            <div class="device-card-actions">
                <button class="power-btn ${isOn ? 'on' : ''}" id="power-${device.id}" title="Toggle Power">
                    <i class="ph ph-power"></i>
                </button>
                <button class="select-btn ${isSel ? 'active' : ''}" id="select-${device.id}" title="Select for gesture &amp; voice">
                    <i class="ph ph-cursor-click"></i>
                </button>
            </div>
        </div>
        <div class="slider-row" style="margin-top:0.75rem;">
            <i class="ph ph-sun-dim slider-icon"></i>
            <input type="range" class="brightness-slider" id="slider-${device.id}" min="0" max="255" value="${state.brightness}">
            <i class="ph ph-sun slider-icon"></i>
        </div>
        <div class="slider-label"><span id="pct-${device.id}">${pct}%</span></div>
        <button class="reset-btn" id="reset-${device.id}">
            <i class="ph ph-wifi-x"></i> Reset Wi-Fi
        </button>
    `;
    dashboard.appendChild(card);
    attachCardListeners(device);
}

function renderGlobalCard() {
    const card = document.createElement('div');
    const isSel = selectedId === 'all';
    card.className = `device-card${isSel ? ' selected' : ''}`;
    card.id = `card-all`;
    card.style.border = '2px solid var(--primary)';
    card.style.background = 'rgba(59, 130, 246, 0.1)';

    card.innerHTML = `
        <div class="device-card-header">
            <div class="device-info">
                <i class="ph ph-globe-hemisphere-west device-icon"></i>
                <div>
                    <div class="device-name">Global Control</div>
                    <div class="device-id">Control all devices simultaneously</div>
                </div>
            </div>
            <div class="device-card-actions">
                <button class="select-btn ${isSel ? 'active' : ''}" id="select-all" title="Select for gesture & voice">
                    <i class="ph ph-cursor-click"></i>
                </button>
            </div>
        </div>
        <div class="slider-row" style="margin-top:0.75rem;">
            <i class="ph ph-sun-dim slider-icon"></i>
            <input type="range" class="brightness-slider" id="slider-all" min="0" max="255" value="127">
            <i class="ph ph-sun slider-icon"></i>
        </div>
        <div class="slider-label"><span id="pct-all">50%</span></div>
    `;
    dashboard.insertBefore(card, dashboard.firstChild);

    // Select for gesture/voice targeting
    document.getElementById(`select-all`).addEventListener('click', () => {
        selectedId = 'all';
        document.querySelectorAll('.device-card').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`card-all`).classList.add('selected');
        document.getElementById(`select-all`).classList.add('active');
        updateGlobalStatusBar();
    });

    // Global Brightness slider (debounced)
    let globalSliderTimer = null;
    document.getElementById(`slider-all`).addEventListener('input', () => {
        const val = parseInt(document.getElementById(`slider-all`).value);
        const power = val > 0 ? 1 : 0;
        document.getElementById(`pct-all`).textContent = `${Math.round((val / 255) * 100)}%`;
        
        // Also update local states visually
        knownDevices.forEach(d => {
            deviceStates[d.id].brightness = val;
            deviceStates[d.id].power = power;
            updateCardUI(d.id);
        });

        clearTimeout(globalSliderTimer);
        globalSliderTimer = setTimeout(() => {
            publishToDevice('all', `${power},${val}`);
        }, 500);
    });
}

function attachCardListeners(device) {
    const id = device.id;

    // Power toggle
    document.getElementById(`power-${id}`).addEventListener('click', () => {
        const s = deviceStates[id];
        s.power = s.power === 1 ? 0 : 1;
        if (s.power === 1 && s.brightness === 0) s.brightness = 255;
        updateCardUI(id);
        publishToDevice(id, `${s.power},${s.brightness}`);
    });

    // Select for gesture/voice targeting
    document.getElementById(`select-${id}`).addEventListener('click', () => {
        selectedId = id;
        document.querySelectorAll('.device-card').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`card-${id}`).classList.add('selected');
        document.getElementById(`select-${id}`).classList.add('active');
        updateGlobalStatusBar();
    });

    // Brightness slider (debounced 500ms)
    let sliderTimer = null;
    document.getElementById(`slider-${id}`).addEventListener('input', () => {
        const val = parseInt(document.getElementById(`slider-${id}`).value);
        deviceStates[id].brightness = val;
        deviceStates[id].power      = val > 0 ? 1 : 0;
        document.getElementById(`pct-${id}`).textContent = `${Math.round((val / 255) * 100)}%`;
        updateCardUI(id);
        clearTimeout(sliderTimer);
        sliderTimer = setTimeout(() => {
            const s = deviceStates[id];
            publishToDevice(id, `${s.power},${s.brightness}`);
        }, 500);
    });

    // Reset Wi-Fi
    document.getElementById(`reset-${id}`).addEventListener('click', () => {
        if (confirm(`Reset Wi-Fi on "${device.name}"?\nIt will restart in setup mode.`)) {
            publishToDevice(id, 'RESET').then(ok => alert(ok ? 'Reset sent!' : 'Failed to send reset.'));
        }
    });
}

function updateCardUI(deviceId) {
    const s   = deviceStates[deviceId];
    const isOn = s.power === 1 && s.brightness > 0;
    const pct  = Math.round((s.brightness / 255) * 100);

    const powerBtn = document.getElementById(`power-${deviceId}`);
    const icon     = document.querySelector(`#card-${deviceId} .device-icon`);
    if (powerBtn) powerBtn.className = `power-btn ${isOn ? 'on' : ''}`;
    if (icon)     icon.className     = `ph ph-lightbulb device-icon${isOn ? '' : ' off'}`;
    const pctEl = document.getElementById(`pct-${deviceId}`);
    if (pctEl)    pctEl.textContent  = `${pct}%`;

    if (deviceId === selectedId) updateGlobalStatusBar();
}

function updateGlobalStatusBar() {
    const name  = knownDevices.find(d => d.id === selectedId)?.name;
    selectedDeviceLabel.textContent = name ? `🎯 ${name}` : 'No device selected';

    if (!selectedId || !deviceStates[selectedId]) {
        brightnessText.textContent = '–';
        brightnessBar.style.width = '0%';
        return;
    }
    const s = deviceStates[selectedId];
    const p = (s.power === 1 && s.brightness > 0) ? (s.brightness / 255) * 100 : 0;
    brightnessBar.style.width  = `${p}%`;
    brightnessText.textContent = `${Math.round(p)}%`;
    statusIcon.className = `ph ph-lightbulb${p === 0 ? ' off' : ''}`;
    statusIcon.style.filter = p > 0
        ? `drop-shadow(0 0 ${10 + p / 10}px rgba(234,179,8,${0.5 + p / 200}))`
        : 'none';
}

function renderDashboard() {
    dashboard.innerHTML = '';
    if (knownDevices.length === 0) {
        dashboard.innerHTML = `
            <div class="no-devices-msg">
                <i class="ph ph-wifi-none" style="font-size:2rem;color:var(--text-muted);"></i>
                <p style="margin-top:0.5rem;color:var(--text-muted);text-align:center;font-size:0.9rem;">
                    No devices found yet.<br>Power on your SmartLED to auto-discover it.
                </p>
            </div>`;
        return;
    }
    knownDevices.forEach(d => renderDeviceCard(d));
}

// Gesture / Voice → selected device
function sendToSelected(power, brightness) {
    if (!selectedId) return;
    if (selectedId === 'all') {
        knownDevices.forEach(d => {
            deviceStates[d.id] = { power, brightness };
            updateCardUI(d.id);
        });
        const globalSlider = document.getElementById('slider-all');
        if (globalSlider) globalSlider.value = brightness;
        const globalPct = document.getElementById('pct-all');
        if (globalPct) globalPct.textContent = `${Math.round((brightness / 255) * 100)}%`;
        publishToDevice('all', `${power},${brightness}`);
        updateGlobalStatusBar();
    } else {
        deviceStates[selectedId] = { power, brightness };
        updateCardUI(selectedId);
        publishToDevice(selectedId, `${power},${brightness}`);
    }
}

// ===========================================
// App Init
// ===========================================
function initApp() {
    if (!AIO_USERNAME || AIO_USERNAME === 'YOUR_AIO_USERNAME' ||
        !AIO_KEY       || AIO_KEY       === 'YOUR_AIO_KEY') {
        connectionStatus.textContent = '❌ Credentials missing in config.js!';
        connectionStatus.style.color = 'var(--danger)';
        return false;
    }
    return true;
}

window.addEventListener('load', () => {
    if (!initApp()) return;
    connectionScreen.classList.remove('active');
    mainScreen.classList.add('active');
    renderDashboard();
    updateGlobalStatusBar();
    startCamera();
    pollRegistry();
    setInterval(pollRegistry, 30000);
});

connectBtn.addEventListener('click', () => {
    if (!initApp()) return;
    connectionScreen.classList.remove('active');
    mainScreen.classList.add('active');
    renderDashboard();
    updateGlobalStatusBar();
    startCamera();
    pollRegistry();
    setInterval(pollRegistry, 30000);
});

disconnectBtn.addEventListener('click', () => {
    mainScreen.classList.remove('active');
    connectionScreen.classList.add('active');
    stopCamera();
});

// ===========================================
// MediaPipe Hand Gesture Detection
// ===========================================
const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
hands.onResults(onResults);

function countFingers(landmarks, handedness) {
    let c = 0;
    const isLeft = handedness === 'Left';
    if (isLeft  && landmarks[4].x > landmarks[3].x) c++;
    if (!isLeft && landmarks[4].x < landmarks[3].x) c++;
    if (landmarks[8].y  < landmarks[6].y)  c++;
    if (landmarks[12].y < landmarks[10].y) c++;
    if (landmarks[16].y < landmarks[14].y) c++;
    if (landmarks[20].y < landmarks[18].y) c++;
    return c;
}

let lastActionTime = 0, stableFingers = -1, fingerFrames = 0;

function onResults(results) {
    canvasElement.width  = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks?.length > 0) {
        const lm = results.multiHandLandmarks[0];
        const hd = results.multiHandedness[0].label;
        drawConnectors(canvasCtx, lm, HAND_CONNECTIONS, { color: '#3b82f6', lineWidth: 3 });
        drawLandmarks(canvasCtx, lm, { color: '#eab308', lineWidth: 1, radius: 3 });

        const fingers = countFingers(lm, hd);
        if (fingers === stableFingers) fingerFrames++;
        else { stableFingers = fingers; fingerFrames = 0; }

        const now = Date.now();
        if (fingerFrames > 10 && (now - lastActionTime) > 1000) {
            lastActionTime = now;
            if (fingers === 0) sendToSelected(0, deviceStates[selectedId]?.brightness || 127);
            else               sendToSelected(1, Math.round((fingers / 5.0) * 255));
        }
    }
    canvasCtx.restore();
}

// ===========================================
// Camera
// ===========================================
let facingMode = 'user', camera = null;

function startCamera() {
    if (camera) camera.stop();
    camera = new Camera(videoElement, {
        onFrame: async () => { await hands.send({ image: videoElement }); },
        width: 640, height: 480, facingMode
    });
    camera.start().catch(e => { console.error('Camera error:', e); });
}

function stopCamera() { if (camera) camera.stop(); }

cameraToggleBtn.addEventListener('click', () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    canvasElement.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    startCamera();
});

// ===========================================
// Voice Control (targets selected device)
// ===========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let isListening = false;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => { isListening = true;  micBtn.classList.add('listening');    voiceTranscript.textContent = 'Listening...'; };
    recognition.onend   = () => { isListening = false; micBtn.classList.remove('listening'); setTimeout(() => { if (!isListening) voiceTranscript.textContent = 'Say "Turn on" or "Set to 50%" — targets selected device'; }, 3000); };
    recognition.onerror = ()  => { voiceTranscript.textContent = 'Error listening.'; };

    recognition.onresult = event => {
        const text = event.results[0][0].transcript.toLowerCase().trim();
        voiceTranscript.textContent = `"${text}"`;
        parseVoiceCommand(text);
    };

    micBtn.addEventListener('click', () => { isListening ? recognition.stop() : recognition.start(); });
} else {
    micBtn.style.display = 'none';
}

function parseVoiceCommand(text) {
    if (!selectedId) return;
    const s = { ...deviceStates[selectedId] };
    if      (text.includes('turn on')  || text.includes('lights on'))  { s.power = 1; if (s.brightness === 0) s.brightness = 255; }
    else if (text.includes('turn off') || text.includes('lights off')) { s.power = 0; }
    else if (text.includes('%') || text.includes('percent')) {
        const m = text.match(/(\d+)/);
        if (m) {
            const pct = Math.max(0, Math.min(100, parseInt(m[1])));
            s.power = pct > 0 ? 1 : 0;
            s.brightness = Math.round((pct / 100) * 255);
        }
    }
    sendToSelected(s.power, s.brightness);
}
