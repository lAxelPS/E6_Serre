// ====== LIBRAIRIES ======
#include <Wire.h>
#include <BH1750.h>
#include <DHT.h>

// ====== DHT11 ======
#define DHTPIN 3
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ====== BH1750 ======
BH1750 lightMeter;

void setup() {
    Serial.begin(9600);
    Wire.begin();
    // BH1750
    lightMeter.begin();
    // Initialisation DHT11
    dht.begin();
}

void loop() {
    // ----- Lecture DHT11 -----
    float temperature = dht.readTemperature();
    float humidite = dht.readHumidity();

    Serial.print("Temperature : ");
    Serial.print(temperature);
    Serial.println(" °C");

    Serial.print("Humidite : ");
    Serial.print(humidite);
    Serial.println(" %");

    // ----- Lecture BH1750 -----
    uint16_t lux = lightMeter.readLightLevel();
    Serial.print("Luminosité : ");
    Serial.print(lux);
    Serial.println(" lux");
 
    delay(2000);
}