#include <ESP8266WiFi.h>  // Changement ici
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include "DHT.h"

/* -------- WiFi principal -------- */
const char* ssid = "Sashinobi's Galaxy S20 FE 5G";
const char* password = "bonjour2024";

/* -------- WiFi émis par l’ESP8266 -------- */
const char* ap_ssid = "ESP8266_WIFI";
const char* ap_password = "12345678";

/* -------- MQTT -------- */
const char* mqtt_server = "192.168.4.2";

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;

// Sur ESP8266 (NodeMCU/Wemos), la LED intégrée est souvent sur D4 (GPIO2)
#define ledPin 2 

/* -------- CAPTEURS -------- */

// DHT22 - Attention : sur ESP8266, utilisez de préférence D1, D2, etc. 
// Ici on garde le GPIO 14 (qui correspond à la broche D5 sur NodeMCU)
#define DHTPIN 14
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// BH1750
BH1750 lightMeter;

// Soil moisture - L'ESP8266 n'a qu'une seule entrée analogique : A0
#define SOIL_PIN A0

/* -------- LED -------- */
void blink_led(unsigned int times, unsigned int duration) {
  for (int i = 0; i < times; i++) {
    digitalWrite(ledPin, LOW); // Note: Sur bcp d'ESP8266, la LED est inversée (LOW = ON)
    delay(duration);
    digitalWrite(ledPin, HIGH);
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
    if (c > 20) { // On laisse un peu plus de temps à l'ESP8266
      ESP.restart();
    }
  }

  Serial.println("\nWiFi connecté !");
  Serial.print("IP ESP8266 : ");
  Serial.println(WiFi.localIP());

  /* --- WiFi émis --- */
  WiFi.softAP(ap_ssid, ap_password);
  Serial.print("IP AP : ");
  Serial.println(WiFi.softAPIP());
}

/* -------- MQTT callback -------- */
void callback(char* topic, byte* message, unsigned int length) {
  String messageTemp;
  for (unsigned int i = 0; i < length; i++) {
    messageTemp += (char)message[i];
  }
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
    if (client.connect("ESP8266_client1")) {
      Serial.println("OK");
      client.subscribe("rpi/broadcast");
    } else {
      Serial.print("Erreur, rc=");
      Serial.println(client.state());
      delay(2000);
    }
  }
}

/* -------- Setup -------- */
void setup() {
  // Suppression des lignes RTC_CNTL (Spécifique ESP32)
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);

  setup_wifi();

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  dht.begin();
  Wire.begin(); // Sur ESP8266, Wire utilise par défaut D2 (SDA) et D1 (SCL)
  
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("BH1750 prêt !");
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

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();
    float lux = lightMeter.readLightLevel();

    // IMPORTANT : L'ADC de l'ESP8266 est sur 10 bits (0-1023)
    // Contrairement à l'ESP32 qui est sur 12 bits (0-4095)
    int soilRaw = analogRead(SOIL_PIN);
    float soilPercent = map(soilRaw, 1023, 0, 0, 100); 
    soilPercent = constrain(soilPercent, 0, 100);

    String payload = "{";
    payload += "\"temperature\":" + String(temperature) + ",";
    payload += "\"humidity\":" + String(humidity) + ",";
    payload += "\"lux\":" + String(lux) + ",";
    payload += "\"soil\":" + String(soilPercent);
    payload += "}";

    client.publish("esp8266/sensor1", payload.c_str());
    Serial.println(payload);
  }
}