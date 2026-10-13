from flask import Flask, render_template, request, jsonify, Response
import sqlite3
import csv
import io
from datetime import datetime

app = Flask(__name__)
DB_NAME = "/tmp/classroom.db"

# Environmental warning limits
HIGH_TEMPERATURE = 35
HIGH_HUMIDITY = 70
LOW_LIGHT = 150


def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL,
                light INTEGER NOT NULL,
                motion INTEGER NOT NULL DEFAULT 0,
                recorded_at TEXT NOT NULL
            )
        """)


def make_alerts(temperature, humidity, light):
    alerts = []

    if temperature is not None and temperature > HIGH_TEMPERATURE:
        alerts.append({
            "level": "warning",
            "message": "High temperature detected."
        })

    if humidity is not None and humidity > HIGH_HUMIDITY:
        alerts.append({
            "level": "warning",
            "message": "High humidity detected."
        })

    if light is not None and light < LOW_LIGHT:
        alerts.append({
            "level": "warning",
            "message": "Low light level detected."
        })

    return alerts


def make_status(temperature, humidity, light, alerts):
    if alerts:
        return "Warning"

    if temperature is None or humidity is None or light is None:
        return "Incomplete Data"

    return "Normal"


@app.route("/")
def dashboard():
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# Get the latest sensor readings
@app.route("/api/data", methods=["GET"])
def latest_data():
    with get_db() as conn:
        row = conn.execute("""
            SELECT id, temperature, humidity, light, recorded_at
            FROM readings
            ORDER BY id DESC
            LIMIT 1
        """).fetchone()

    if row is None:
        return jsonify({
            "temperature": None,
            "humidity": None,
            "light": None,
            "recorded_at": None,
            "alerts": [],
            "status": "Incomplete Data"
        })

    data = dict(row)

    alerts = make_alerts(
        data["temperature"],
        data["humidity"],
        data["light"]
    )

    data["alerts"] = alerts
    data["status"] = make_status(
        data["temperature"],
        data["humidity"],
        data["light"],
        alerts
    )

    return jsonify(data)


# Receive sensor readings from the existing ESP8266 sender
@app.route("/api/data", methods=["POST"])
def receive_data():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Send sensor data as JSON."
        }), 400

    try:
        temperature = float(data["temperature"])
        humidity = float(data["humidity"])
        light = int(data["light"])

        if not -40 <= temperature <= 125:
            raise ValueError("Temperature is outside the accepted range.")

        if not 0 <= humidity <= 100:
            raise ValueError("Humidity must be between 0 and 100.")

        if not 0 <= light <= 1023:
            raise ValueError("Light must be between 0 and 1023.")

    except (KeyError, TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400

    timestamp = datetime.now().astimezone().isoformat(
        timespec="seconds"
    )

    # Keep the existing database column for compatibility.
    # This value is NOT a real PIR sensor reading.
    legacy_motion_value = 0

    with get_db() as conn:
        conn.execute("""
            INSERT INTO readings
            (temperature, humidity, light, motion, recorded_at)
            VALUES (?, ?, ?, ?, ?)
        """, (
            temperature,
            humidity,
            light,
            legacy_motion_value,
            timestamp
        ))

    return jsonify({
        "message": "Sensor data saved",
        "recorded_at": timestamp
    }), 201


# Return recent readings for the history table and charts
@app.route("/api/history", methods=["GET"])
def history():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, temperature, humidity, light, recorded_at
            FROM readings
            ORDER BY id DESC
            LIMIT 100
        """).fetchall()

    return jsonify([
        dict(row) for row in reversed(rows)
    ])


# Download recorded sensor data as a CSV file
@app.route("/api/export", methods=["GET"])
def export_csv():
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "ID",
        "Temperature (C)",
        "Humidity (%)",
        "Light (ADC)",
        "Recorded At"
    ])

    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, temperature, humidity, light, recorded_at
            FROM readings
            ORDER BY id DESC
        """).fetchall()

    for row in rows:
        writer.writerow(list(row))

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition":
            "attachment; filename=classroom_sensor_history.csv"
        }
    )


initialize_database()

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
