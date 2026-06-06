#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>

// ==========================================
// Adafruit IO Configuration
// ==========================================
#define AIO_USERNAME "YOUR_AIO_USERNAME"
#define AIO_KEY      "YOUR_AIO_KEY"
#define AIO_SERVER   "io.adafruit.com"
#define AIO_SERVERPORT 1883

const char* feed_topic = AIO_USERNAME "/feeds/smartled-commands";

// ==========================================
// Pin Definitions (ESP8266 NodeMCU)
// ==========================================
const int pwmPin = D1; // GPIO 5 - PWM Speed control
const int dirPin = D2; // GPIO 4 - Direction control

// ==========================================
// MQTT Client Setup
// ==========================================
WiFiClient espClient;
PubSubClient mqtt(espClient);

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String data = "";
  for (unsigned int i = 0; i < length; i++) {
    data += (char)payload[i];
  }
  data.trim();
  Serial.printf("Received message on topic %s: %s\n", topic, data.c_str());

  if (data == "RESET") {
    Serial.println("Action: RESET requested. Wiping WiFi settings...");
    WiFiManager wm;
    wm.resetSettings();
    delay(1000);
    ESP.restart();
  } else {
    // Parse format: "power,brightness"
    // Example: "1,255" or "0,127"
    int commaIdx = data.indexOf(',');
    if (commaIdx != -1) {
      int power = data.substring(0, commaIdx).toInt();
      int brightness = data.substring(commaIdx + 1).toInt();

      if (power == 0) {
        analogWrite(pwmPin, 0); // ESP8266 native PWM control
        Serial.println("Action: Motor/LED OFF");
      } else {
        analogWrite(pwmPin, brightness);
        Serial.printf("Action: Motor/LED ON (Speed/Brightness: %d)\n", brightness);
      }
    }
  }
}

void connectMQTT() {
  // Loop until we're reconnected
  while (!mqtt.connected()) {
    Serial.print("Attempting MQTT connection...");
    // Create a random client ID
    String clientId = "ESP8266Client-";
    clientId += String(random(0xffff), HEX);
    // Attempt to connect
    if (mqtt.connect(clientId.c_str(), AIO_USERNAME, AIO_KEY)) {
      Serial.println("connected");
      // Subscribe to feed
      mqtt.subscribe(feed_topic);
      Serial.printf("Subscribed to %s\n", feed_topic);
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" try again in 5 seconds");
      // Wait 5 seconds before retrying
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\nStarting SmartLED...");

  // Hardware Setup
  pinMode(dirPin, OUTPUT);
  pinMode(pwmPin, OUTPUT);

  // Set default direction state and turn off initially
  digitalWrite(dirPin, HIGH);
  analogWrite(pwmPin, 0);

  // Force ESP8266 PWM to match 8-bit scale (0-255)
  analogWriteRange(255);

  // WiFiManager Setup
  WiFiManager wm;
  // wm.resetSettings(); // uncomment to force reset during testing
  
  Serial.println("Connecting to WiFi via WiFiManager...");
  if (!wm.autoConnect("SmartLED_Setup", "password123")) {
    Serial.println("Failed to connect and hit timeout. Restarting...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\n✅ WiFi Connected Successfully!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // MQTT Server Configuration
  mqtt.setServer(AIO_SERVER, AIO_SERVERPORT);
  mqtt.setCallback(mqttCallback);
}

void loop() {
  if (!mqtt.connected()) {
    connectMQTT();
  }
  mqtt.loop();
}