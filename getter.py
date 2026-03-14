import requests
import time

ESP32_IP = "http://10.201.124.200/"

while True:
    try:
        r = requests.get(ESP32_IP, timeout=5)
        data = r.json()

        print(data)
        temperature=data['temperature']
        humidite=data['humidite']
        lumiere=data['lux']
        humiditeSol=data['soil']


    except Exception as e:
        print("Erreur :", e)

    time.sleep(2)