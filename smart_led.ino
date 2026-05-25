#include <WiFi.h>
#include <WebSocketsServer.h>

// ==========================================
// WiFi Credentials (UPDATE THESE)
// ==========================================
const char* ssid = "YOUR_SSID";
const char* password = "YOUR_PASSWORD";

// ==========================================
// Pin Definitions & PWM
// ==========================================
const int enaPin = 13;
const int in1Pin = 12;
const int in2Pin = 14;

const int freq = 5000;
const int resolution = 8;

// ==========================================
// WebSocket Configuration
// ==========================================
WebSocketsServer webSocket = WebSocketsServer(81);

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected!\n", num);
      break
;    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      break;
    }
    case WStype_TEXT: {
      // Parse format: "power,brightness"
      // Example: "1,255" or "0,127"
      String data = String((char *)payload);
      data.trim();
      
      int commaIdx = data.indexOf(',');
      if (commaIdx != -1) {
        int power = data.substring(0, commaIdx).toInt();
        int brightness = data.substring(commaIdx + 1).toInt();
        
        if (power == 0) {
          ledcWrite(enaPin, 0);
          Serial.println("Action: LED OFF");
        } else {
          ledcWrite(enaPin, brightness);
          Serial.printf("Action: LED ON (Brightness: %d)\n", brightness);
        }
      }
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);
 
  // Hardware Setup
  pinMode(in1Pin, OUTPUT);
  pinMode(in2Pin, OUTPUT);
  digitalWrite(in1Pin, HIGH);
  digitalWrite(in2Pin, LOW);
  ledcAttach(enaPin, freq, resolution);

  // WiFi Connection
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n\n✅ WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  // Start WebSocket Server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("🔗 Listening for WebSocket connections on port 81");
}

void loop() {
  webSocket.loop();
}
