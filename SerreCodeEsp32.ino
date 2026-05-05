#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include "DHT.h"

/* -------- CONFIG WIFI AP -------- */
const char* ap_ssid     = "ESP8266_WIFI";
const char* ap_password = "12345678";

/* -------- MQTT -------- */
const char* mqtt_server = "192.168.4.2"; // IP broker

WiFiClient espClient;
PubSubClient client(espClient);

/* -------- BROCHES -------- */
#define DHTPIN           14
#define DHTTYPE          DHT22
#define SOIL_PIN         A0
#define PIN_LED_CULTURE  12
#define PIN_VENTILO      13
#define PIN_POMPE        16

/* -------- TOPICS -------- */
#define TOPIC_LED       "esp8266/cmd/led"
#define TOPIC_VENTILO   "esp8266/cmd/ventilo"
#define TOPIC_POMPE     "esp8266/cmd/pompe"
#define TOPIC_PUB       "esp8266/sensor1"

/* -------- OBJETS -------- */
DHT dht(DHTPIN, DHTTYPE);
BH1750 lightMeter;

unsigned long lastMsg = 0;

/* -------- ACTIONNEURS -------- */
void setActionneur(uint8_t pin, String cmd, const char* nom) {
  cmd.trim();

  if (cmd == "ON") {
    digitalWrite(pin, LOW);
    Serial.print(nom); Serial.println(" ON");
  } 
  else if (cmd == "OFF") {
    digitalWrite(pin, HIGH);
    Serial.print(nom); Serial.println(" OFF");
  } 
  else {
    Serial.print("Commande inconnue: ");
    Serial.println(cmd);
  }
}

/* -------- CALLBACK MQTT -------- */
void callback(char* topic, byte* payload, unsigned int length) {
  String msg;

  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  Serial.print("Reçu [");
  Serial.print(topic);
  Serial.print("] : ");
  Serial.println(msg);

  if (String(topic) == TOPIC_LED) {
    setActionneur(PIN_LED_CULTURE, msg, "LED");
  } 
  else if (String(topic) == TOPIC_VENTILO) {
    setActionneur(PIN_VENTILO, msg, "VENTILO");
  } 
  else if (String(topic) == TOPIC_POMPE) {
    setActionneur(PIN_POMPE, msg, "POMPE");
  }
}

/* -------- WIFI AP -------- */
void setup_wifi() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid, ap_password);

  Serial.println("AP lancé");
  Serial.print("IP ESP8266: ");
  Serial.println(WiFi.softAPIP());
}

/* -------- MQTT RECONNECT -------- */
void reconnect() {
  while (!client.connected()) {
    Serial.print("Connexion MQTT...");

    if (client.connect("ESP8266_client")) {
      Serial.println("OK");

      client.subscribe(TOPIC_LED);
      client.subscribe(TOPIC_VENTILO);
      client.subscribe(TOPIC_POMPE);

      Serial.println("Abonné aux topics");
    } 
    else {
      Serial.print("Erreur, rc=");
      Serial.print(client.state());
      Serial.println(" → retry 5s");
      delay(5000);
    }
  }
}

/* -------- SETUP -------- */
void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED_CULTURE, OUTPUT);
  pinMode(PIN_VENTILO, OUTPUT);
  pinMode(PIN_POMPE, OUTPUT);

  digitalWrite(PIN_LED_CULTURE, HIGH);
  digitalWrite(PIN_VENTILO, HIGH);
  digitalWrite(PIN_POMPE, HIGH);

  setup_wifi();

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  dht.begin();
  Wire.begin();
  lightMeter.begin();

  Serial.println("Setup terminé");
}

/* -------- LOOP -------- */
void loop() {

  if (!client.connected()) {
    reconnect();
  }

  client.loop();

  unsigned long now = millis();

  if (now - lastMsg > 4000) {
    lastMsg = now;

    float h = dht.readHumidity();
    float t = dht.readTemperature();
    float lux = lightMeter.readLightLevel();
    int soil = analogRead(SOIL_PIN);

    if (isnan(h) || isnan(t)) {
      Serial.println("Erreur DHT");
      return;
    }

    String payload = "{";
    payload += "\"temperature\":" + String(t) + ",";
    payload += "\"humidity\":" + String(h) + ",";
    payload += "\"lux\":" + String(lux) + ",";
    payload += "\"soil\":" + String(soil);
    payload += "}";

    if (client.connected()) {
      client.publish(TOPIC_PUB, payload.c_str());
      Serial.println("Envoyé: " + payload);
    }
  }
}
