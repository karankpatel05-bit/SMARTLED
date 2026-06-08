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

// ==========================================
// Pin Definitions (ESP8266 NodeMCU)
// ==========================================
const int pwmPin = D1; // GPIO 5 - PWM / Brightness
const int dirPin = D2; // GPIO 4 - Direction

// ==========================================
// Device Identity (derived from MAC address)
// ==========================================
String deviceID;         // e.g. "aabbccddeeff"
String deviceFeedTopic;  // AIO_USERNAME/feeds/smartled-aabbccddeeff
String globalFeedTopic;  // AIO_USERNAME/feeds/smartled-all

// ==========================================
// MQTT Client
// ==========================================
WiFiClient espClient;
PubSubClient mqtt(espClient);

void applyCommand(String data) {
  data.trim();
  if (data == "RESET") {
    Serial.println("RESET requested — wiping WiFi settings...");
    WiFiManager wm;
    wm.resetSettings();
    delay(1000);
    ESP.restart();
  } else {
    int commaIdx = data.indexOf(',');
    if (commaIdx != -1) {
      int power      = data.substring(0, commaIdx).toInt();
      int brightness = data.substring(commaIdx + 1).toInt();
      if (power == 0) {
        analogWrite(pwmPin, 0);
        Serial.println("LED OFF");
      } else {
        analogWrite(pwmPin, brightness);
        Serial.printf("LED ON  brightness=%d\n", brightness);
      }
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String data = "";
  for (unsigned int i = 0; i < length; i++) data += (char)payload[i];
  Serial.printf("[MQTT] topic=%s  payload=%s\n", topic, data.c_str());
  applyCommand(data);
}

// ==========================================
// Non-blocking MQTT reconnect
// ==========================================
unsigned long lastMQTTAttempt = 0;
const unsigned long MQTT_RETRY_INTERVAL = 5000;

void connectMQTT() {
  if (millis() - lastMQTTAttempt < MQTT_RETRY_INTERVAL) return;
  lastMQTTAttempt = millis();

  Serial.print("MQTT connecting... ");
  String clientId = "SmartLED-" + deviceID;

  if (mqtt.connect(clientId.c_str(), AIO_USERNAME, AIO_KEY)) {
    Serial.println("connected!");

    // 1. Fleet ping — broadcast device ID to registry feed
    String registryTopic = String(AIO_USERNAME) + "/feeds/smartled-registry";
    mqtt.publish(registryTopic.c_str(), deviceID.c_str());
    Serial.printf("Registry ping sent: %s\n", deviceID.c_str());

    // 2. Subscribe to this device's specific command feed
    mqtt.subscribe(deviceFeedTopic.c_str());
    Serial.printf("Subscribed: %s\n", deviceFeedTopic.c_str());

    // 3. Subscribe to global broadcast feed
    mqtt.subscribe(globalFeedTopic.c_str());
    Serial.printf("Subscribed: %s\n", globalFeedTopic.c_str());

  } else {
    Serial.printf("failed rc=%d, retry in 5s\n", mqtt.state());
  }
}

// ==========================================
// Setup
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.println("\nStarting SmartLED...");

  pinMode(dirPin, OUTPUT);
  pinMode(pwmPin, OUTPUT);
  digitalWrite(dirPin, HIGH);
  analogWrite(pwmPin, 0);
  analogWriteRange(255);

  WiFiManager wm;
  Serial.println("WiFiManager starting...");
  if (!wm.autoConnect("SmartLED_Setup", "password123")) {
    Serial.println("WiFi failed — restarting");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP: "); Serial.println(WiFi.localIP());

  // Build device ID from MAC (strip colons, lowercase)
  deviceID = WiFi.macAddress();
  deviceID.replace(":", "");
  deviceID.toLowerCase();
  Serial.printf("Device ID: %s\n", deviceID.c_str());

  // Build feed topic strings
  deviceFeedTopic = String(AIO_USERNAME) + "/feeds/smartled-" + deviceID;
  globalFeedTopic = String(AIO_USERNAME) + "/feeds/smartled-all";

  mqtt.setServer(AIO_SERVER, AIO_SERVERPORT);
  mqtt.setCallback(mqttCallback);
}

// ==========================================
// Loop
// ==========================================
void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();
}