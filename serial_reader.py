import json
import time
import serial
import requests

SERIAL_PORT = "COM3"
BAUD_RATE = 115200

FLASK_URL = "https://smart-classroom-dashboard-nine.vercel.app/api/data"

try:
    board = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
    time.sleep(2)

    print(f"Connected to ESP8266 on {SERIAL_PORT}")
    print("Waiting for sensor readings...")

    while True:
        line = board.readline().decode(
            "utf-8", errors="ignore"
        ).strip()

        if not line:
            continue

        try:
            data = json.loads(line)

            # PIR/motion is no longer required
            required = {"temperature", "humidity", "light"}

            if not required.issubset(data):
                print("Ignoring incomplete data:", line)
                continue

            # Send only the three sensor readings to Flask
            sensor_data = {
                "temperature": data["temperature"],
                "humidity": data["humidity"],
                "light": data["light"]
            }

            response = requests.post(
                FLASK_URL,
                json=sensor_data,
                timeout=5
            )

            print("Sensor data:", sensor_data)
            print("Flask response:", response.status_code)

        except json.JSONDecodeError:
            print("Ignoring non-JSON serial output:", line)

        except requests.RequestException as error:
            print("Flask connection error:", error)
            time.sleep(2)

except serial.SerialException as error:
    print("Serial port error:", error)
    print("Check COM3 and close Arduino Serial Monitor.")

except KeyboardInterrupt:
    print("Stopping serial reader.")

finally:
    if "board" in locals() and board.is_open:
        board.close()