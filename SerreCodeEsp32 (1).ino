#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include "DHT.h"
#include <ESP8266WiFi.h>

/* ════════════════════════════════════════════════════════════════
   BROCHAGE — NodeMCU ESP8266
   ════════════════════════════════════════════════════════════════
   CAPTEURS (inchangés)
     DHT22 (temp/hum)   → D5  = GPIO14
     BH1750 SDA         → D2  = GPIO4
     BH1750 SCL         → D1  = GPIO5
     Humidité sol       → A0

   ACTIONNEURS (relais ou MOSFET — signal HIGH = actif)
     LED de croissance  → D6  = GPIO12
     Ventilateur        → D7  = GPIO13
     Pompe d'arrosage   → D0  = GPIO16

   LED intégrée (statut) → D4 = GPIO2  (LOW = allumée)
   ════════════════════════════════════════════════════════════════ */

/* -------- MQTT -------- */
const char* mqtt_server = "192.168.4.2";

/* -------- WiFi AP -------- */
const char* ap_ssid     = "ESP8266_WIFI";
const char* ap_password = "12345678";

WiFiClient   espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;

/* -------- BROCHES -------- */
#define LED_STATUS_PIN  2   // LED intégrée NodeMCU (statut connexion)

// Capteurs
#define DHTPIN    14        // D5
#define DHTTYPE   DHT22
#define SOIL_PIN  A0

// Actionneurs
#define PIN_LED_CULTURE  12  // D6 — Rampe LED de croissance
#define PIN_VENTILO      13  // D7 — Ventilateur(s)
#define PIN_POMPE        16  // D0 — Pompe d'arrosage

/* -------- TOPICS MQTT (abonnement) -------- */
#define TOPIC_LED     "esp8266/cmd/led"
#define TOPIC_VENTILO "esp8266/cmd/ventilo"
#define TOPIC_POMPE   "esp8266/cmd/pompe"
#define TOPIC_PUB     "esp8266/sensor1"
#define TOPIC_BROADCAST "rpi/broadcast"

/* -------- OBJETS CAPTEURS -------- */
DHT    dht(DHTPIN, DHTTYPE);
BH1750 lightMeter;

/* ════════════════════════════════════════════════════════════════
   LED STATUT (intégrée)
   ════════════════════════════════════════════════════════════════ */
void blink_led(unsigned int times, unsigned int duration) {
  for (unsigned int i = 0; i < times; i++) {
    digitalWrite(LED_STATUS_PIN, LOW);   // LOW = allumée sur ESP8266
    delay(duration);
    digitalWrite(LED_STATUS_PIN, HIGH);
    delay(200);
  }
}

/* ════════════════════════════════════════════════════════════════
   PILOTAGE ACTIONNEURS
   ════════════════════════════════════════════════════════════════ */
void setActionneur(uint8_t pin, const String& cmd, const char* nom) {
  if (cmd == "ON") {
    digitalWrite(pin, HIGH);
    Serial.print("✅ "); Serial.print(nom); Serial.println(" → ON");
  } else if (cmd == "OFF") {
    digitalWrite(pin, LOW);
    Serial.print("⛔ "); Serial.print(nom); Serial.println(" → OFF");
  } else {
    Serial.print("⚠️  Commande inconnue pour "); Serial.println(nom);
  }
}

/* ════════════════════════════════════════════════════════════════
   CALLBACK MQTT — réception des commandes
   ════════════════════════════════════════════════════════════════ */
void callback(char* topic, byte* message, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)message[i];
  }
  msg.trim();

  Serial.print("📩 MQTT reçu [");
  Serial.print(topic);
  Serial.print("] → ");
  Serial.println(msg);

  if (String(topic) == TOPIC_LED) {
    setActionneur(PIN_LED_CULTURE, msg, "LED culture");

  } else if (String(topic) == TOPIC_VENTILO) {
    setActionneur(PIN_VENTILO, msg, "Ventilateur");

  } else if (String(topic) == TOPIC_POMPE) {
    setActionneur(PIN_POMPE, msg, "Pompe");

  } else if (String(topic) == TOPIC_BROADCAST) {
    // Commandes broadcast génériques (ex: blink de statut)
    if (msg == "10") blink_led(1, 1250);
  }
}

/* ════════════════════════════════════════════════════════════════
   WIFI — Point d'accès
   ════════════════════════════════════════════════════════════════ */
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Démarrage du point d'accès : ");
  Serial.println(ap_ssid);

  WiFi.mode(WIFI_AP);
  bool ok = WiFi.softAP(ap_ssid, ap_password);

  if (ok) {
    Serial.println("Point d'accès prêt !");
    Serial.print("IP ESP8266 : ");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("Échec du point d'accès !");
  }
}

/* ════════════════════════════════════════════════════════════════
   MQTT — (re)connexion
   ════════════════════════════════════════════════════════════════ */
void connect_mqttServer() {
  while (!client.connected()) {
    Serial.print("Connexion MQTT...");
    if (client.connect("ESP8266_client1")) {
      Serial.println(" OK !");

      // Abonnement à toutes les commandes actionneurs + broadcast
      client.subscribe(TOPIC_LED);
      client.subscribe(TOPIC_VENTILO);
      client.subscribe(TOPIC_POMPE);
      client.subscribe(TOPIC_BROADCAST);

      blink_led(2, 200); // 2 clignos = connecté
    } else {
      Serial.print("Erreur rc=");
      Serial.print(client.state());
      Serial.println(" — nouvelle tentative dans 2s");
      delay(2000);
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   SETUP
   ════════════════════════════════════════════════════════════════ */
void setup() {
  Serial.begin(115200);

  // LED statut
  pinMode(LED_STATUS_PIN, OUTPUT);
  digitalWrite(LED_STATUS_PIN, HIGH); // éteinte au départ

  // Actionneurs — tout éteint au démarrage (sécurité)
  pinMode(PIN_LED_CULTURE, OUTPUT); digitalWrite(PIN_LED_CULTURE, LOW);
  pinMode(PIN_VENTILO,     OUTPUT); digitalWrite(PIN_VENTILO,     LOW);
  pinMode(PIN_POMPE,       OUTPUT); digitalWrite(PIN_POMPE,       LOW);

  // WiFi
  setup_wifi();

  // MQTT
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  // Capteurs
  dht.begin();
  Wire.begin(); // SDA=D2 SCL=D1

  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("BH1750 OK !");
  } else {
    Serial.println("Erreur BH1750 — vérifier câblage I2C");
  }
}

/* ════════════════════════════════════════════════════════════════
   LOOP
   ════════════════════════════════════════════════════════════════ */
void loop() {
  // Maintenir la connexion MQTT
  if (!client.connected()) {
    connect_mqttServer();
  }
  client.loop();

  // Envoi des mesures toutes les 4 secondes
  unsigned long now = millis();
  if (now - lastMsg > 4000) {
    lastMsg = now;

    float humidity    = dht.readHumidity();
    float temperature = dht.readTemperature();
    float lux         = lightMeter.readLightLevel();

    int   soilRaw     = analogRead(SOIL_PIN);
    float soilPercent = constrain(map(soilRaw, 1023, 0, 0, 100), 0, 100);

    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("Erreur de lecture DHT22 !");
      return;
    }

    String payload = "{";
    payload += "\"temperature\":" + String(temperature, 1) + ",";
    payload += "\"humidity\":"    + String(humidity,    1) + ",";
    payload += "\"lux\":"         + String(lux,         1) + ",";
    payload += "\"soil\":"        + String(soilPercent, 1);
    payload += "}";

    if (client.publish(TOPIC_PUB, payload.c_str())) {
      Serial.print("📤 Envoyé : ");
      Serial.println(payload);
    } else {
      Serial.println("❌ Échec publication MQTT");
    }
  }
}
