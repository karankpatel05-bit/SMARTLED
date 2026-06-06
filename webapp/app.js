// --- DOM Elements ---
const connectionScreen = document.getElementById('connection-screen');
const mainScreen = document.getElementById('main-screen');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const connectionStatus = document.getElementById('connection-status');
const statusIcon = document.getElementById('status-icon');
const brightnessBar = document.getElementById('brightness-bar');
const brightnessText = document.getElementById('brightness-text');
const micBtn = document.getElementById('mic-btn');
const cameraToggleBtn = document.getElementById('camera-toggle-btn');
const voiceTranscript = document.getElementById('voice-transcript');
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const powerBtn = document.getElementById('power-btn');
const brightnessSlider = document.getElementById('brightness-slider');
const sliderPctLabel = document.getElementById('slider-pct-label');
const resetDeviceBtn = document.getElementById('reset-device-btn');

// --- Adafruit IO MQTT Config ---
// AIO_USERNAME and AIO_KEY are loaded from config.js
const AIO_SERVER = "io.adafruit.com";
const AIO_PORT = 443;
const AIO_FEED_TOPIC = `${AIO_USERNAME}/feeds/smartled-commands`;

// --- State ---
let mqttClient = null;
let botState = { power: 1, brightness: 127 };
let lastActionTime = 0;
let stableFingers = -1;
let fingerFrames = 0;
let isListening = false;
let facingMode = 'user'; // 'user' (front) or 'environment' (back)
let camera = null;

// --- MQTT Logic ---
connectBtn.addEventListener('click', () => {
    connectionStatus.textContent = "Connecting to Adafruit IO...";
    connectionStatus.style.color = "var(--text-muted)";
    
    const clientId = "SmartLED_PWA_" + Math.random().toString(16).substring(2, 10);
    mqttClient = new Paho.MQTT.Client(AIO_SERVER, AIO_PORT, "/mqtt", clientId);

    mqttClient.onConnectionLost = (responseObject) => {
        console.log("Disconnected from Adafruit IO", responseObject);
        mainScreen.classList.remove('active');
        connectionScreen.classList.add('active');
        connectionStatus.textContent = "Disconnected. Try again.";
        connectionStatus.style.color = "var(--danger)";
        stopCamera();
    };

    const options = {
        useSSL: true,
        userName: AIO_USERNAME,
        password: AIO_KEY,
        onSuccess: () => {
            console.log("Connected to Adafruit IO MQTT");
            connectionScreen.classList.remove('active');
            mainScreen.classList.add('active');
            startCamera();
            sendState();
        },
        onFailure: (message) => {
            console.error("MQTT Connection failed:", message);
            connectionStatus.textContent = "Connection failed.";
            connectionStatus.style.color = "var(--danger)";
        }
    };

    mqttClient.connect(options);
});

disconnectBtn.addEventListener('click', () => {
    if (mqttClient) mqttClient.disconnect();
});

function sendState() {
    if (mqttClient && mqttClient.isConnected()) {
        const payload = `${botState.power},${botState.brightness}`;
        const message = new Paho.MQTT.Message(payload);
        message.destinationName = AIO_FEED_TOPIC;
        message.qos = 1;
        mqttClient.send(message);
        updateUI();
    }
}

resetDeviceBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to wipe the ESP8266's Wi-Fi credentials? This will restart the device in setup mode.")) {
        if (mqttClient && mqttClient.isConnected()) {
            const message = new Paho.MQTT.Message("RESET");
            message.destinationName = AIO_FEED_TOPIC;
            message.qos = 1;
            mqttClient.send(message);
            alert("Reset command sent. The device will restart shortly.");
        } else {
            alert("Not connected to MQTT.");
        }
    }
});

function updateUI() {
    const p = (botState.power === 1 && botState.brightness > 0) ? (botState.brightness / 255) * 100 : 0;
    brightnessBar.style.width = `${p}%`;
    brightnessText.textContent = `${Math.round(p)}%`;

    // Sync manual controls
    brightnessSlider.value = botState.brightness;
    sliderPctLabel.textContent = `${Math.round((botState.brightness / 255) * 100)}%`;
    if (botState.power === 1) {
        powerBtn.classList.add('on');
    } else {
        powerBtn.classList.remove('on');
    }
    
    if (botState.power === 0 || botState.brightness === 0) {
        statusIcon.classList.add('off');
        statusIcon.style.filter = 'none';
    } else {
        statusIcon.classList.remove('off');
        statusIcon.style.filter = `drop-shadow(0 0 ${10 + p/10}px rgba(234, 179, 8, ${0.5 + p/200}))`;
    }
}

// --- Manual Controls Logic ---
powerBtn.addEventListener('click', () => {
    botState.power = botState.power === 1 ? 0 : 1;
    // When turning on from off, restore to a default brightness if it was 0
    if (botState.power === 1 && botState.brightness === 0) {
        botState.brightness = 255;
        brightnessSlider.value = 255;
    }
    sendState();
});

brightnessSlider.addEventListener('input', () => {
    const val = parseInt(brightnessSlider.value);
    botState.brightness = val;
    // Auto-power on if slider moved above 0 from an off state
    if (val > 0) botState.power = 1;
    else botState.power = 0;
    sliderPctLabel.textContent = `${Math.round((val / 255) * 100)}%`;
    sendState();
});

// --- MediaPipe Hands Logic ---
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0, // 0 for faster mobile performance
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

function countFingers(landmarks, handedness) {
    let count = 0;
    // Thumb
    const isLeft = handedness === 'Left';
    if (isLeft && landmarks[4].x > landmarks[3].x) count++;
    else if (!isLeft && landmarks[4].x < landmarks[3].x) count++;
    
    // Index, Middle, Ring, Pinky
    if (landmarks[8].y < landmarks[6].y) count++;
    if (landmarks[12].y < landmarks[10].y) count++;
    if (landmarks[16].y < landmarks[14].y) count++;
    if (landmarks[20].y < landmarks[18].y) count++;
    
    return count;
}

function onResults(results) {
    // Resize canvas to match video
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw Video feed
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const handedness = results.multiHandedness[0].label;
        
        // Draw Hand
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#3b82f6', lineWidth: 3});
        drawLandmarks(canvasCtx, landmarks, {color: '#eab308', lineWidth: 1, radius: 3});
        
        const fingers = countFingers(landmarks, handedness);
        
        // Debounce Logic
        if (fingers === stableFingers) {
            fingerFrames++;
        } else {
            stableFingers = fingers;
            fingerFrames = 0;
        }
        
        // Apply gesture if stable for 15 frames (~0.5s) and debounce time passed (1s)
        const now = Date.now();
        if (fingerFrames > 10 && (now - lastActionTime) > 1000) {
            lastActionTime = now;
            
            if (fingers === 0) {
                botState.power = 0;
            } else {
                botState.power = 1;
                botState.brightness = Math.round((fingers / 5.0) * 255);
            }
            sendState();
        }
    }
    canvasCtx.restore();
}

function startCamera() {
    if (camera) {
        camera.stop();
    }
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({image: videoElement});
        },
        width: 640,
        height: 480,
        facingMode: facingMode
    });
    camera.start().catch(e => {
        console.error("Camera start failed:", e);
        alert("Camera permission denied or camera not found.");
    });
}

function stopCamera() {
    if (camera) camera.stop();
}

cameraToggleBtn.addEventListener('click', () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    // Mirroring logic: we only mirror if it's the front camera
    if(facingMode === 'user') {
        canvasElement.style.transform = 'scaleX(-1)';
    } else {
        canvasElement.style.transform = 'scaleX(1)';
    }
    startCamera();
});

// --- Web Speech API (Voice Control) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add('listening');
        voiceTranscript.textContent = "Listening...";
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        voiceTranscript.textContent = `"${transcript}"`;
        parseVoiceCommand(transcript);
    };
    
    recognition.onerror = (event) => {
        console.error("Speech Error:", event.error);
        voiceTranscript.textContent = "Error listening to voice.";
    };
    
    recognition.onend = () => {
        isListening = false;
        micBtn.classList.remove('listening');
        setTimeout(() => {
            if(!isListening) voiceTranscript.textContent = "Say something like \"Turn on\" or \"Set to 50%\"";
        }, 3000);
    };
    
    micBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });
} else {
    micBtn.style.display = 'none';
    voiceTranscript.textContent = "Voice control not supported in this browser.";
}

function parseVoiceCommand(text) {
    if (text.includes('turn on') || text.includes('lights on')) {
        botState.power = 1;
        if(botState.brightness === 0) botState.brightness = 255;
    } 
    else if (text.includes('turn off') || text.includes('lights off')) {
        botState.power = 0;
    } 
    else if (text.includes('%') || text.includes('percent')) {
        // Extract number
        const match = text.match(/(\d+)/);
        if (match) {
            let pct = parseInt(match[1]);
            pct = Math.max(0, Math.min(100, pct)); // clamp 0-100
            
            if (pct === 0) {
                botState.power = 0;
            } else {
                botState.power = 1;
                botState.brightness = Math.round((pct / 100) * 255);
            }
        }
    }
    
    sendState();
}
