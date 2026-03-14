#include <WiFi.h>
#include <Wire.h>
#include <BH1750.h>
#include "DHT.h"

// WIFI
const char* ssid = "TON_WIFI";
const char* password = "TON_MOT_DE_PASSE";

// IP fixe (adaptée à ton réseau)
IPAddress local_IP(10,201,124,200);
IPAddress gateway(10,201,124,1);
IPAddress subnet(255,255,255,0);

WiFiServer server(80);

// --- DHT22 ---
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// --- BH1750 ---
BH1750 lightMeter;

// --- Soil Moisture ---
#define SOIL_PIN 34

void connectWiFi() {

  WiFi.mode(WIFI_STA);

  if (!WiFi.config(local_IP, gateway, subnet)) {
    Serial.println("Erreur configuration IP");
  }

  Serial.println("Connexion WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connecté !");
  Serial.print("IP : ");
  Serial.println(WiFi.localIP());
}

void setup() {

  Serial.begin(115200);

  connectWiFi();

  server.begin();

  // Initialisation capteurs
  dht.begin();

  Wire.begin();
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("BH1750 prêt !");
  } else {
    Serial.println("Erreur BH1750 !");
  }
}

void loop() {

  // Reconnexion WiFi si perdu
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi perdu, reconnexion...");
    connectWiFi();
  }

  WiFiClient client = server.available();
  if (!client) return;

  Serial.println("Client connecté");

  while (client.connected() && !client.available()) {
    delay(1);
  }

  String request = client.readStringUntil('\r');
  Serial.println(request);
  client.flush();

  // --- Lecture DHT22 ---
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  // --- Lecture BH1750 ---
  float lux = lightMeter.readLightLevel();

  // --- Lecture Soil Moisture ---
  int soilRaw = analogRead(SOIL_PIN);
  float soilPercent = map(soilRaw, 4095, 0, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);

  // JSON envoyé
  String data = "{";
  data += "\"temperature\":" + String(temperature) + ",";
  data += "\"humidity\":" + String(humidity) + ",";
  data += "\"lux\":" + String(lux) + ",";
  data += "\"soil\":" + String(soilPercent);
  data += "}";

  // Réponse HTTP
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: application/json");
  client.println("Connection: close");
  client.println();
  client.println(data);

  delay(10);
  client.stop();

  Serial.println("Client déconnecté");
}