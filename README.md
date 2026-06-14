# Serre Connectée – BTS CIEL

Projet de serre connectée réalisé dans le cadre du **BTS CIEL (Cybersécurité, Informatique et Réseaux, Électronique)**.

L'objectif est de superviser en temps réel les conditions environnementales d'une serre grâce à un microcontrôleur **ESP8266** (ou **ESP32**), plusieurs capteurs, un serveur Python et une interface web dynamique.

---

## Présentation du projet

La serre connectée permet de mesurer :

- Température ambiante
- Humidité de l'air
- Luminosité
- Humidité du sol

Les données sont collectées par l'ESP puis transmises via le protocole **MQTT** vers un serveur Python.

Le serveur :

- reçoit les mesures MQTT ;
- stocke les données dans une base MySQL ;
- diffuse les nouvelles mesures en temps réel via WebSocket ;
- fournit un tableau de bord Web développé avec Flask.

En complément de la supervision, le système permet également le pilotage de plusieurs actionneurs afin d'automatiser certaines tâches au sein de la serre.

---

## Architecture du système

```text
                    ┌─────────────────┐
                    │     DHT22       │
                    │ Température     │
                    │ Humidité Air    │
                    └────────┬────────┘
                             │

                    ┌─────────────────┐
                    │     BH1750      │
                    │   Luminosité    │
                    └────────┬────────┘
                             │

                    ┌─────────────────┐
                    │ Soil Moisture   │
                    │ Capacitive V2   │
                    └────────┬────────┘
                             │

                    ┌─────────────────┐
                    │ ESP8266 / ESP32 │
                    └───────┬─────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼

 ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
 │ Pompe à eau │    │ LED         │    │ Ventilateur │
 └─────────────┘    └─────────────┘    └─────────────┘

                            │ MQTT
                            ▼

                    ┌─────────────────┐
                    │ MQTT Broker     │
                    │ Mosquitto       │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               │                           │
               ▼                           ▼

      ┌─────────────────┐      ┌─────────────────┐
      │ Python Backend  │      │ Base de données │
      │ Flask + MQTT    │─────►│ MySQL           │
      └────────┬────────┘      └─────────────────┘
               │
         WebSocket
               │
               ▼

      ┌─────────────────┐
      │ Dashboard Web   │
      │ Flask           │
      └─────────────────┘
```

---

## Matériel utilisé

| Composant | Fonction |
|------------|----------|
| ESP8266 NodeMCU | Acquisition et transmission des données |
| DHT22 | Température et humidité de l'air |
| BH1750 | Mesure de luminosité |
| Soil Moisture Capacitive V2 | Humidité du sol |
| Pompe à eau | Arrosage automatique |
| Bandeau LED | Éclairage complémentaire |
| Ventilateur | Régulation thermique |
| Module relais | Commande des actionneurs |
| Alimentation 5V | Alimentation du système |

---

## Capteurs

### DHT22

Mesure :

- Température : -40°C à +80°C
- Humidité : 0 à 100 %

Communication :

```text
Numérique (1 fil)
```

### BH1750

Mesure :

- Luminosité en lux

Communication :

```text
I2C
```

Adresse par défaut :

```text
0x23
```

### Soil Moisture Capacitive V2

Mesure :

- Humidité du sol

Sortie :

```text
Analogique
```

---

## Actionneurs

Le système intègre plusieurs actionneurs permettant d'agir sur l'environnement de la serre.

### Actionneurs disponibles

| Actionneur | Fonction |
|------------|----------|
| Pompe à eau | Arrosage des plantes |
| Éclairage LED | Apport lumineux complémentaire |
| Ventilateur | Régulation de la température et renouvellement de l'air |

### Mode automatique

L'ESP contrôle automatiquement les actionneurs selon les seuils définis :

```text
Humidité du sol < seuil défini  → Pompe ON
Luminosité < seuil défini       → LED ON
Température > seuil défini      → Ventilateur ON
```

Les seuils peuvent être configurés depuis le tableau de bord ou directement dans le programme embarqué.

### Mode manuel

Le tableau de bord permet à l'utilisateur de contrôler chaque actionneur individuellement :

- Activation / désactivation de la pompe
- Activation / désactivation de l'éclairage LED
- Activation / désactivation du ventilateur

Les commandes sont envoyées via MQTT puis exécutées immédiatement par l'ESP.

### Priorité des modes

```text
Mode manuel > Mode automatique
```

Lorsqu'un actionneur est placé en mode manuel, les règles automatiques sont temporairement ignorées jusqu'à la réactivation du mode automatique.

---

## Compatibilité ESP8266 / ESP32

Le projet est développé initialement pour un **ESP8266**.

Il peut être porté vers un **ESP32** en modifiant uniquement certaines parties spécifiques.

### Conversion Analogique / Numérique

#### ESP8266

```cpp
int soilValue = analogRead(A0);
```

Plage :

```text
0 → 1023
```

#### ESP32

```cpp
int soilValue = analogRead(34);
```

Plage :

```text
0 → 4095
```

Selon la version d'ESP32 utilisée, il peut être nécessaire de configurer l'ADC :

```cpp
analogSetAttenuation(ADC_11db);
```

### Bibliothèques WiFi

ESP8266 :

```cpp
#include <ESP8266WiFi.h>
```

ESP32 :

```cpp
#include <WiFi.h>
```

---

## Communication MQTT

Le protocole MQTT est utilisé pour assurer la communication entre :

- ESP8266 / ESP32
- Backend Python
- Dashboard temps réel

Broker MQTT recommandé :

- Eclipse Mosquitto

### Topics MQTT

#### Publication des mesures

```text
greenhouse/data
```

Exemple :

```json
{
  "temperature": 24.5,
  "humidity": 58.2,
  "light": 430,
  "soil": 72
}
```

#### Commandes des actionneurs

```text
greenhouse/cmd/pump
greenhouse/cmd/light
greenhouse/cmd/fan
```

Messages :

```text
ON
OFF
AUTO
```

---

## Technologies utilisées

### Embarqué

- C++
- Arduino Framework
- ESP8266
- ESP32

### Backend

- Python 3
- Flask
- Flask-SocketIO
- Paho-MQTT
- MySQL Connector

### Frontend

- HTML5
- CSS3
- JavaScript
- WebSocket

### Base de données

- MySQL

---

## Structure du projet

```text
greenhouse/
│
├── esp/
│   ├── greenhouse_esp8266.ino
│   └── greenhouse_esp32.ino
│
├── backend/
│   ├── app.py
│   ├── mqtt_client.py
│   ├── database.py
│   └── requirements.txt
│
├── templates/
│   └── dashboard.html
│
├── static/
│   ├── css/
│   └── js/
│
├── database/
│   └── greenhouse.sql
│
└── README.md
```

---

## Fonctionnement

### 1. Acquisition

L'ESP lit périodiquement :

- Température
- Humidité de l'air
- Luminosité
- Humidité du sol

### 2. Publication MQTT

```text
ESP → MQTT Broker
```

### 3. Réception Python

Le backend Python est abonné au topic :

```text
greenhouse/data
```

et reçoit automatiquement les nouvelles mesures.

### 4. Enregistrement

```text
MQTT → Python → MySQL
```

Chaque mesure est enregistrée dans la base de données.

### 5. Diffusion temps réel

```text
Flask → WebSocket → Dashboard
```

### 6. Contrôle des actionneurs

```text
Dashboard → MQTT → ESP → Actionneur
```

Les commandes envoyées depuis l'interface web sont transmises en temps réel à l'ESP via MQTT.

### 7. Affichage

Le tableau de bord affiche :

- Température
- Humidité de l'air
- Humidité du sol
- Luminosité
- État des actionneurs
- Mode automatique / manuel
- Historique des mesures

---

## Sécurité

Améliorations possibles :

- Authentification MQTT
- MQTT via TLS
- Authentification des utilisateurs
- Gestion des rôles
- Chiffrement des mots de passe
- Reverse Proxy Nginx
- HTTPS

---

## Évolutions possibles

- Gestion avancée des seuils automatiques
- Notifications Discord
- Notifications Telegram
- Application mobile
- API REST
- Dockerisation du projet
- Historisation avancée
- Gestion multi-serres
- Export des données au format CSV

---

## Compétences BTS CIEL mobilisées

- Développement embarqué
- Réseaux IP
- MQTT
- Développement Python
- Développement Web
- Bases de données SQL
- Architecture IoT
- Supervision temps réel
- Automatisation industrielle
- Cybersécurité

---

## Licence

Projet pédagogique.

```text
MIT License
```
