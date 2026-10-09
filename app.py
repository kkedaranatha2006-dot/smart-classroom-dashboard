from flask import Flask, render_template, request, jsonify, Response
import sqlite3
import csv
import io
from datetime import datetime

app = Flask(__name__)
DB_NAME = "classroom.db"


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
                motion INTEGER NOT NULL,
                recorded_at TEXT NOT NULL
            )
        """)


@app.route("/")
def dashboard():
    return render_template("index.html")


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/data", methods=["GET"])
def latest_data():
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM readings ORDER BY id DESC LIMIT 1"
        ).fetchone()

    if row is None:
        return jsonify({
            "temperature": None,
            "humidity": None,
            "light": None,
            "motion": None,
            "occupancy": "Waiting for sensor",
            "status": "Waiting",
            "recorded_at": None
        })

    data = dict(row)
    alerts = []

    if data["temperature"] > 35:
        alerts.append("High temperature")
    if data["humidity"] > 70:
        alerts.append("High humidity")
    if data["light"] < 150:
        alerts.append("Low light level")

    data["occupancy"] = (
        "Motion detected" if data["motion"] else "No motion"
    )
    data["alerts"] = alerts
    data["status"] = "Warning" if alerts else "Normal"

    return jsonify(data)


@app.route("/api/data", methods=["POST"])
def receive_data():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send sensor data as JSON"}), 400

    try:
        temperature = float(data["temperature"])
        humidity = float(data["humidity"])
        light = int(data["light"])
        motion = int(data["motion"])

        if not 0 <= humidity <= 100:
            raise ValueError("Humidity must be between 0 and 100")
        if not 0 <= light <= 1023:
            raise ValueError("Light must be between 0 and 1023")
        if motion not in (0, 1):
            raise ValueError("Motion must be 0 or 1")

    except (KeyError, TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400

    timestamp = datetime.now().astimezone().isoformat(
        timespec="seconds"
    )

    with get_db() as conn:
        conn.execute("""
            INSERT INTO readings
            (temperature, humidity, light, motion, recorded_at)
            VALUES (?, ?, ?, ?, ?)
        """, (temperature, humidity, light, motion, timestamp))

    return jsonify({
        "message": "Sensor data saved",
        "recorded_at": timestamp
    }), 201


@app.route("/api/history")
def history():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT * FROM readings ORDER BY id DESC LIMIT 100
        """).fetchall()

    return jsonify([dict(row) for row in reversed(rows)])


@app.route("/api/export")
def export_csv():
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "ID", "Temperature (C)", "Humidity (%)",
        "Light (raw)", "Motion", "Recorded At"
    ])

    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, temperature, humidity, light, motion, recorded_at
            FROM readings ORDER BY id DESC
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
    app.run(host="0.0.0.0", port=5000, debug=True)