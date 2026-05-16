#include <WiFi.h>
#include <WiFiUdp.h>

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
// UDP Broadcast Configuration
// ==========================================
WiFiUDP udp;
const int udpPort = 4210;
char packetBuffer[255]; 

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
  
  // Start UDP Listener
  udp.begin(udpPort);
  Serial.printf("🔗 Listening for UDP Broadcasts on port %d\n", udpPort);
}

void loop() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(packetBuffer, 255);
    if (len > 0) {
      packetBuffer[len] = 0;
    }
    
    // Parse format: "power,brightness\n"
    // Example: "1,255" or "0,127"
    String data = String(packetBuffer);
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
  }
}
