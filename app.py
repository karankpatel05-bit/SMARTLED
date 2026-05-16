from flask import Flask, render_template, request, jsonify, Response
from flask_cors import CORS
import threading
import time
import socket
import cv2
import mediapipe as mp

app = Flask(__name__)
CORS(app)

# ── UDP Configuration ──────────────────────────────────────────
UDP_PORT = 4210
udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# Using '<broadcast>' means the signal is sent to EVERY device on your Wi-Fi.
# You DO NOT need to know the ESP32's IP address! It will just pick it up.
# If your router blocks broadcasting, replace '<broadcast>' with '192.168.x.x' (your ESP32's IP).
ESP32_IP = '192.168.0.16'
udp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

# ── Hardware State & Video ─────────────────────────────────────
# power: 1=ON, 0=OFF
# brightness: 0-255
bot_state = {
    "power": 1,
    "brightness": 127
}
state_lock = threading.Lock()

latest_frame = None
frame_lock = threading.Lock()

def update_hardware():
    """Broadcasts state over UDP to the ESP32"""
    with state_lock:
        payload = f"{bot_state['power']},{bot_state['brightness']}\n"
    try:
        udp_socket.sendto(payload.encode('utf-8'), (ESP32_IP, UDP_PORT))
    except Exception as e:
        print(f"⚠️ UDP write error: {e}")

# ── Local Vision Loop ──────────────────────────────────────────
def count_fingers(landmarks, handedness_label):
    count = 0
    lm = landmarks.landmark
    
    # Thumb (Checking orientation relative to wrist/MCP)
    is_left = handedness_label == 'Left'
    if is_left and lm[4].x > lm[3].x: count += 1
    elif not is_left and lm[4].x < lm[3].x: count += 1
        
    # Index, Middle, Ring, Pinky (checking if tip is higher than PIP)
    if lm[8].y < lm[6].y: count += 1
    if lm[12].y < lm[10].y: count += 1
    if lm[16].y < lm[14].y: count += 1
    if lm[20].y < lm[18].y: count += 1
        
    return count

def run_vision_loop():
    global latest_frame
    mp_hands = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils
    mp_drawing_styles = mp.solutions.drawing_styles
    
    hands = mp_hands.Hands(
        max_num_hands=1, 
        min_detection_confidence=0.7, 
        min_tracking_confidence=0.5
    )
    
    # Try different video indices to find an active camera
    cap = None
    for i in range(4):
        c = cv2.VideoCapture(i, cv2.CAP_V4L2)
        if c.isOpened():
            cap = c
            print(f"👁️ Vision loop started (camera {i})")
            break
            
    if cap is None:
        cap = cv2.VideoCapture(0)
        
    if not cap.isOpened():
        print("⚠️ Could not open webcam. Vision loop disabled.")
        return

    stable_fingers = -1
    finger_frames = 0
    last_action_time = 0
        
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.05)
                continue
                
            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            
            result = hands.process(rgb)
            
            # Prepare frame for drawing and streaming
            rgb.flags.writeable = True
            bgr_frame = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            fingers = 0
            
            if result.multi_hand_landmarks:
                # Process the first hand detected
                hand_landmarks = result.multi_hand_landmarks[0]
                handedness = result.multi_handedness[0].classification[0].label
                fingers = count_fingers(hand_landmarks, handedness)
                
                # Draw hand landmarks
                mp_drawing.draw_landmarks(
                    bgr_frame,
                    hand_landmarks,
                    mp_hands.HAND_CONNECTIONS,
                    mp_drawing_styles.get_default_hand_landmarks_style(),
                    mp_drawing_styles.get_default_hand_connections_style()
                )

                # Debounce logic
                if fingers == stable_fingers:
                    finger_frames += 1
                else:
                    stable_fingers = fingers
                    finger_frames = 0
                    
                # If gesture is held stable for ~15 frames, apply it
                if finger_frames > 15 and (time.time() - last_action_time) > 1.5:
                    last_action_time = time.time()
                    with state_lock:
                        if fingers == 0:
                            bot_state["power"] = 0
                        else:
                            bot_state["power"] = 1
                            bot_state["brightness"] = int((fingers / 5.0) * 255)
                    
                    update_hardware()
                    print(f"👉 Gesture Detected: {fingers} fingers. State updated -> {bot_state}")
                    
            # Encode frame for web streaming
            ret, buffer = cv2.imencode('.jpg', bgr_frame)
            if ret:
                with frame_lock:
                    latest_frame = buffer.tobytes()
                    
            time.sleep(0.02)
    except Exception as e:
        print(f"⚠️ Vision loop crashed: {e}")
    finally:
        cap.release()
        hands.close()

def generate_video_stream():
    """Generator function to stream JPEG frames"""
    global latest_frame
    while True:
        with frame_lock:
            frame = latest_frame
        
        if frame is None:
            time.sleep(0.1)
            continue
            
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        time.sleep(0.03) # Cap stream at ~30 FPS

# ── API Routes ─────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_video_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/state', methods=['GET'])
def get_state():
    return jsonify(bot_state)

@app.route('/api/led', methods=['POST'])
def update_led():
    """Endpoint called by frontend when voice commands are parsed."""
    data = request.json or {}
    power = data.get('power', bot_state['power'])
    brightness = data.get('brightness', bot_state['brightness'])
    
    with state_lock:
        bot_state["power"] = int(power)
        bot_state["brightness"] = int(brightness)
        
    update_hardware()
    action = "ON" if bot_state["power"] else "OFF"
    print(f"🎙️ Voice/Web Command Received -> LED {action}, Brightness {bot_state['brightness']}")
    return jsonify({'success': True, 'state': bot_state})

# ── Main ───────────────────────────────────────────────────────
import os
if __name__ == '__main__':
    # Setup SSL Certificates for HTTPS
    cert_file = 'cert.pem'
    key_file = 'key.pem'
    use_ssl = os.path.exists(cert_file) and os.path.exists(key_file)
    ssl_ctx = (cert_file, key_file) if use_ssl else None
    protocol = 'https' if use_ssl else 'http'

    print("\n🌟 Smart LED Backend Engine")
    print(f"   Wireless: ✅ UDP Broadcast on port {UDP_PORT}")
    print(f"   Frontend: 🌐 {protocol}://0.0.0.0:5000\n")
    
    # Start vision loop in a background thread to mimic NavisLLM
    vision_thread = threading.Thread(target=run_vision_loop, daemon=True, name="VisionLoop")
    vision_thread.start()
    
    # Run the web server
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False, ssl_context=ssl_ctx)
