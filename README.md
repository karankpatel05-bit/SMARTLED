# Smart LED Controller (Global Fleet Edition) 🚀

An advanced, AI-powered Smart LED and motor controller system built for global, low-latency control using **Adafruit IO MQTT**. It features an **Android PWA (Progressive Web App)** with an integrated **MediaPipe Hand Gesture Dashboard**, **Voice Recognition**, and a **"Fleet Ping" Auto-Discovery** architecture.

You can now control an infinite fleet of LED strips globally from your smartphone!

---

## 🏗️ Architecture

This project is divided into three main components:

1. **The Firmware (ESP8266 NodeMCU):**
   Connects to Wi-Fi via a captive portal (`WiFiManager`), connects to Adafruit IO MQTT, and listens for device-specific commands to adjust PWM signals.
2. **The Android PWA (Frontend):**
   Runs entirely on your smartphone browser (or compiled to an APK via GitHub Actions). Captures webcam data, runs MediaPipe AI locally on the phone to detect gestures, translates voice commands, and publishes REST API calls to Adafruit IO.
3. **The Python Backend (Provisioning Manager):**
   Runs on a server (or PC) to listen to the global `smartled-registry` MQTT feed. When a new ESP8266 comes online for the first time, it intercepts the ping and uses Adafruit IO's REST API to dynamically generate the required database feeds on the fly!

---

## 🛠️ Hardware Setup

- **ESP8266 NodeMCU** (The microcontroller)
- **L298N** Motor Driver (or a simple MOSFET for LEDs)
- **LED Module / DC Motor** (connected to the output pins)
- Your Smartphone (for the PWA dashboard)

---

## 🚀 Setup Instructions

### 1. Adafruit IO Configuration
1. Create a free account at [io.adafruit.com](https://io.adafruit.com).
2. Go to **Feeds** and manually create TWO feeds:
   - `smartled-registry`
   - `smartled-all`
3. Get your **AIO Username** and **AIO Key** from the yellow key button in the top right.

### 2. Run the Provisioning Manager (Python Backend)
This backend listens for new devices and creates their feeds automatically.
1. Create a `.env` file in the project root:
   ```env
   AIO_USERNAME=your_username
   AIO_KEY=your_aio_key
   ```
2. Install dependencies and run:
   ```bash
   pip install -r requirements.txt
   python app.py
   ```
*(Leave this running in the background).*

### 3. Flash the ESP8266
1. Open `smart_led.ino` in the Arduino IDE.
2. Update lines 8 and 9 with your Adafruit IO credentials:
   ```cpp
   #define AIO_USERNAME "your_username"
   #define AIO_KEY      "your_aio_key"
   ```
3. Upload to your ESP8266.
4. On your phone, connect to the Wi-Fi network `SmartLED_Setup` and enter your home Wi-Fi credentials.
5. The ESP8266 will boot, connect to Adafruit IO, and send a **Fleet Ping**.
6. Watch your Python backend terminal — it will detect the ping and automatically create the specific feed for this device!

### 4. Open the Android PWA
1. Open the `webapp` folder. (Or wait for the GitHub Action to build your `.apk`).
2. The UI will dynamically generate a device card.
3. It will ask you to name the newly discovered device (e.g., "Living Room").
4. **Select** the device by tapping the cursor icon on its card.
5. **Gesture Control:** Hold your hand up to your front camera! 
   - 1 finger = 20% brightness
   - 5 fingers = 100% brightness
   - Closed fist = OFF
6. **Voice Control:** Tap the microphone icon and say `"Turn on"`, `"Turn off"`, or `"Set to 50%"`.

---

## 🧠 How Auto-Discovery Works

Because Adafruit IO restricts automatic feed generation on free accounts, this system implements a custom Provisioning Bridge:

1. **ESP8266 Boot:** Reads its own MAC Address (e.g., `84cca8a01234`).
2. **Fleet Ping:** Publishes its MAC Address to the master `smartled-registry` feed.
3. **Interception:** `app.py` sees the ping. It checks Adafruit IO via the REST API. If the feed `smartled-84cca8a01234` does not exist, it instantly creates it.
4. **PWA Discovery:** The phone app polls the registry, sees the new MAC Address, prompts the user for a friendly name, and renders the UI controls.

No manual configuration required after the initial setup!
