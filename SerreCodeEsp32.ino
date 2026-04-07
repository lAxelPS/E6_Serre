#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include "DHT.h"

/* -------- WiFi principal -------- */
const char* ssid = "Sashinobi's Galaxy S20 FE 5G";
const char* password = "bonjour2024";

/* -------- WiFi émis par l’ESP32 -------- */
const char* ap_ssid = "ESP32_WIFI";
const char* ap_password = "12345678";

/* -------- MQTT -------- */
const char* mqtt_server = "192.168.4.2";

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;
#define ledPin 2

/* -------- CAPTEURS -------- */

// DHT22
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// BH1750
BH1750 lightMeter;

// Soil moisture
#define SOIL_PIN 34

/* -------- LED -------- */
void blink_led(unsigned int times, unsigned int duration) {
  for (int i = 0; i < times; i++) {
    digitalWrite(ledPin, HIGH);
    delay(duration);
    digitalWrite(ledPin, LOW);
    delay(200);
  }
}

/* -------- Connexion WiFi -------- */
void setup_wifi() {

  WiFi.mode(WIFI_AP_STA);

  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int c = 0;
  while (WiFi.status() != WL_CONNECTED) {
    blink_led(2, 200);
    delay(1000);
    Serial.print(".");
    c++;
    if (c > 10) {
      ESP.restart();
    }
  }

  Serial.println();
  Serial.println("WiFi connecté !");
  Serial.print("IP ESP32 : ");
  Serial.println(WiFi.localIP());

  /* --- WiFi émis --- */
  WiFi.softAP(ap_ssid, ap_password);

  Serial.println("Point d'accès ESP32 actif !");
  Serial.print("IP AP : ");
  Serial.println(WiFi.softAPIP());
}

/* -------- MQTT callback -------- */
void callback(char* topic, byte* message, unsigned int length) {

  Serial.print("Message reçu : ");

  String messageTemp;
  for (unsigned int i = 0; i < length; i++) {
    messageTemp += (char)message[i];
    Serial.print((char)message[i]);
  }
  Serial.println();

  if (String(topic) == "rpi/broadcast") {
    if (messageTemp == "10") {
      blink_led(1, 1250);
    }
  }
}

/* -------- Connexion MQTT -------- */
void connect_mqttServer() {

  while (!client.connected()) {

    if (WiFi.status() != WL_CONNECTED) {
      setup_wifi();
    }

    Serial.print("Connexion MQTT...");

    if (client.connect("ESP32_client1")) {
      Serial.println("OK");
      client.subscribe("rpi/broadcast");
    } else {
      Serial.print("Erreur, rc=");
      Serial.println(client.state());
      blink_led(3, 200);
      delay(2000);
    }
  }
}

/* -------- Setup -------- */
void setup() {

  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);

  setup_wifi();

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  /* --- Initialisation capteurs --- */
  dht.begin();

  Wire.begin();
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("BH1750 prêt !");
  } else {
    Serial.println("Erreur BH1750 !");
  }
}

/* -------- Loop -------- */
void loop() {

  if (!client.connected()) {
    connect_mqttServer();
  }

  client.loop();

  unsigned long now = millis();

  if (now - lastMsg > 4000) {

    lastMsg = now;

    /* -------- Lecture capteurs -------- */

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();
    float lux = lightMeter.readLightLevel();

    int soilRaw = analogRead(SOIL_PIN);
    float soilPercent = map(soilRaw, 4095, 0, 0, 100);
    soilPercent = constrain(soilPercent, 0, 100);

    /* -------- JSON MQTT -------- */

    String payload = "{";
    payload += "\"temperature\":" + String(temperature) + ",";
    payload += "\"humidity\":" + String(humidity) + ",";
    payload += "\"lux\":" + String(lux) + ",";
    payload += "\"soil\":" + String(soilPercent);
    payload += "}";

    client.publish("esp32/sensor1", payload.c_str());

    Serial.println("Données envoyées MQTT :");
    Serial.println(payload);
    delay(2000);
  }
}