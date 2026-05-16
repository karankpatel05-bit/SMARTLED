# Smart LED Controller 🚀

An advanced, AI-powered Smart LED controller using an **ESP32**, **MediaPipe** (Hand Tracking), and the **Web Speech API** (Voice Recognition). 

The heavy lifting (AI processing) is done locally on your PC using a Flask backend, which then instantly transmits `UDP Broadcasts` to your ESP32 with zero latency. You do NOT even need to know your ESP32's IP address!

---

## 🛠️ Hardware Requirements
- **ESP32** Microcontroller
- **L298N** Motor Driver
- **LED Module** (connected to the L298N output pins)
- Your PC/Laptop (with a webcam and microphone)

---

## 🚀 Setup Instructions (Windows)

### 1. Flash the ESP32
1. Open `smart_led.ino` in the Arduino IDE.
2. Change the `ssid` and `password` variables to match your local Wi-Fi.
3. Select your ESP32 board and COM port, then click **Upload**.
4. *(The ESP32 will now blindly listen on UDP port 4210 for incoming brightness commands).*

### 2. Install Python Dependencies
You must have Python 3 installed on your Windows machine.
1. Open Command Prompt (`cmd`) or PowerShell.
2. Clone or download this repository.
3. Navigate to the project directory:
   ```cmd
   cd path\to\SMARTLED
   ```
4. Create a virtual environment (recommended):
   ```cmd
   python -m venv venv
   ```
5. Activate the virtual environment:
   ```cmd
   venv\Scripts\activate
   ```
6. Install the required packages:
   ```cmd
   pip install -r requirements.txt
   ```

### 3. Run the AI Backend
1. Ensure your virtual environment is activated.
2. Start the Flask server:
   ```cmd
   python app.py
   ```
3. Look at your terminal! It should say `👁️ Vision loop started` and turn on your webcam.

### 4. Open the Web Interface
1. Open your web browser and navigate to: **http://localhost:5000**
2. **Gesture Control:** Hold your hand up to your webcam! 
   - 1 finger = 20% brightness
   - 5 fingers = 100% brightness
   - Closed fist = OFF
3. **Voice Control:** Click the microphone icon on the webpage and say commands like `"Turn on"`, `"Turn off"`, or `"Set to 50%"`.

*(Note: If you want to access the microphone from a smartphone over your local network, you will need to host the Flask app on HTTPS by generating an SSL certificate).*

---

## 🚀 Setup Instructions (Linux / macOS)

1. Flash the ESP32 using Arduino IDE just like the Windows steps.
2. Open a terminal and navigate to the folder.
3. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Run the app:
   ```bash
   python app.py
   ```

---

## 🧠 How it Works
1. **app.py** captures your webcam stream via OpenCV.
2. **MediaPipe** analyzes the video in real-time to count your fingers.
3. When a gesture is detected, Python formats a string like `1,255\n` (Power=1, Brightness=255) and blasts it over your Wi-Fi network using a UDP broadcast (`<broadcast>:4210`).
4. The **ESP32** immediately intercepts the broadcast and adjusts the PWM signal sent to the L298N motor driver. No HTTP handshakes, no slow API requests. Instant control.
