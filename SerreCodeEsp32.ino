#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include "DHT.h"
#include <ESP8266WiFi.h>

/* -------- MQTT -------- */
// Note : L'ESP8266 aura l'IP 192.168.4.1. 
// Assure-toi que ton broker (ex: Raspberry Pi) est bien en 192.168.4.2
const char* mqtt_server = "192.168.4.2";

/* -------- WiFi émis par l’ESP8266 -------- */
const char* ap_ssid = "ESP8266_WIFI";
const char* ap_password = "12345678";

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;

// LED intégrée (GPIO2 / D4 sur NodeMCU)
#define ledPin 2 

/* -------- CAPTEURS -------- */
#define DHTPIN 14 // GPIO 14 = Broche D5
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

BH1750 lightMeter;

#define SOIL_PIN A0

/* -------- LED -------- */
void blink_led(unsigned int times, unsigned int duration) {
  for (unsigned int i = 0; i < times; i++) {
    digitalWrite(ledPin, LOW); // LOW = ON sur la plupart des ESP8266
    delay(duration);
    digitalWrite(ledPin, HIGH);
    delay(200);
  }
}

/* -------- CONFIGURATION WIFI AP -------- */
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Configuration du point d'accès : ");
  Serial.println(ap_ssid);

  // On configure l'ESP en mode Point d'Accès uniquement
  WiFi.mode(WIFI_AP);
  bool result = WiFi.softAP(ap_ssid, ap_password);

  if(result == true) {
    Serial.println("Point d'accès prêt !");
    Serial.print("Adresse IP de l'ESP (Passerelle) : ");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("Échec du démarrage du point d'accès.");
  }
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
    Serial.print("Tentative de connexion MQTT...");
    // Identifiant unique pour le client MQTT
    if (client.connect("ESP8266_client1")) {
      Serial.println("Connecté au broker !");
      client.subscribe("rpi/broadcast");
    } else {
      Serial.print("Erreur, rc=");
      Serial.print(client.state());
      Serial.println(" Nouvelle tentative dans 2 secondes...");
      delay(2000);
    }
  }
}

/* -------- Setup -------- */
void setup() {
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH); // Éteindre la LED au départ
  
  Serial.begin(115200);

  // 1. Démarrage du WiFi AP
  setup_wifi();

  // 2. Configuration MQTT
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  // 3. Initialisation Capteurs
  dht.begin();
  Wire.begin(); // D2 (SDA) et D1 (SCL) par défaut
  
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("BH1750 détecté !");
  } else {
    Serial.println("Erreur BH1750 (vérifiez le câblage I2C)");
  }
}

/* -------- Loop -------- */
void loop() {
  // Maintenir la connexion MQTT
  if (!client.connected()) {
    connect_mqttServer();
  }
  client.loop();

  unsigned long now = millis();
  // Envoi des données toutes les 4 secondes
  if (now - lastMsg > 4000) {
    lastMsg = now;

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();
    float lux = lightMeter.readLightLevel();

    // Lecture humidité du sol (ADC 10 bits : 0 à 1023)
    int soilRaw = analogRead(SOIL_PIN);
    // On inverse souvent car 1023 = sec, 0 = très humide
    float soilPercent = map(soilRaw, 1023, 0, 0, 100); 
    soilPercent = constrain(soilPercent, 0, 100);

    // Vérification si lectures valides
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("Erreur de lecture DHT22 !");
      return;
    }

    // Construction du JSON
    String payload = "{";
    payload += "\"temperature\":" + String(temperature) + ",";
    payload += "\"humidity\":" + String(humidity) + ",";
    payload += "\"lux\":" + String(lux) + ",";
    payload += "\"soil\":" + String(soilPercent);
    payload += "}";

    // Publication
    if (client.publish("esp8266/sensor1", payload.c_str())) {
      Serial.print("Message envoyé : ");
      Serial.println(payload);
    } else {
      Serial.println("Échec de l'envoi MQTT");
    }
  }
}
