import json
import time
import serial
import requests

# Change COM3 if your ESP8266 uses another COM port.
SERIAL_PORT = "COM3"
BAUD_RATE = 115200

FLASK_URL = "http://127.0.0.1:5000/api/data"

try:
    board = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
    time.sleep(2)
    print(f"Connected to ESP8266 on {SERIAL_PORT}")

    while True:
        line = board.readline().decode(
            "utf-8", errors="ignore"
        ).strip()

        if not line:
            continue

        try:
            data = json.loads(line)

            required = {"temperature", "humidity", "light", "motion"}
            if not required.issubset(data):
                continue

            response = requests.post(
                FLASK_URL, json=data, timeout=5
            )

            print("Sensor data:", data)
            print("Flask response:", response.status_code)

        except json.JSONDecodeError:
            continue
        except requests.RequestException as error:
            print("Flask connection error:", error)
            time.sleep(2)

except serial.SerialException as error:
    print("Serial port error:", error)
    print("Check the COM port and close Arduino Serial Monitor.")

except KeyboardInterrupt:
    print("Stopping serial reader.")

finally:
    if "board" in locals() and board.is_open:
        board.close()