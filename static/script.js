const $ = (id) => document.getElementById(id);

const REFRESH_MS = 3000;
const MAX_CHART_POINTS = 20;

const LIMITS = {
    highTemperature: 35,
    highHumidity: 70,
    lowLight: 150
};

let temperatureChart = null;
let humidityChart = null;
let lightChart = null;
let lastHistorySignature = "";


function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value;
    }
}


function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined || value === "") {
        return "--";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toFixed(decimals);
}


function formatTime(value) {
    if (!value) {
        return "--";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}


function setConnection(isOnline) {
    const dot = $("connectionDot");

    setText(
        "connectionStatus",
        isOnline ? "Connected" : "Disconnected"
    );

    if (dot) {
        dot.classList.toggle("online", isOnline);
        dot.classList.toggle("offline", !isOnline);
    }
}


function getAlerts(readings) {
    const alerts = [];

    if (
        readings.temperature !== null &&
        readings.temperature > LIMITS.highTemperature
    ) {
        alerts.push({
            level: "warning",
            message: "High temperature detected."
        });
    }

    if (
        readings.humidity !== null &&
        readings.humidity > LIMITS.highHumidity
    ) {
        alerts.push({
            level: "warning",
            message: "High humidity detected."
        });
    }

    if (
        readings.light !== null &&
        readings.light < LIMITS.lowLight
    ) {
        alerts.push({
            level: "warning",
            message: "Low light level detected."
        });
    }

    return alerts;
}


function updateOverallStatus(alerts, readings) {
    const hasWarning = alerts.some(
        (alert) => alert.level === "warning"
    );

    const unavailable =
        readings.temperature === null ||
        readings.humidity === null ||
        readings.light === null;

    let status;

    if (hasWarning) {
        status = "Warning";
    } else if (unavailable) {
        status = "Incomplete Data";
    } else {
        status = "Normal";
    }

    setText("classroomStatus", status);
    setText("statusTag", status.toUpperCase());

    if (hasWarning) {
        setText(
            "statusDescription",
            "One or more environmental readings exceed the configured limits."
        );
        setText("statusSymbol", "!");
    } else if (unavailable) {
        setText(
            "statusDescription",
            "Waiting for valid temperature, humidity and light readings."
        );
        setText("statusSymbol", "?");
    } else {
        setText(
            "statusDescription",
            "All environmental readings are within configured limits."
        );
        setText("statusSymbol", "✓");
    }

    const banner = $("statusBanner");

    if (banner) {
        banner.classList.toggle("warning", hasWarning);
        banner.classList.toggle(
            "normal",
            !hasWarning && !unavailable
        );
        banner.classList.toggle(
            "incomplete",
            !hasWarning && unavailable
        );
    }
}


function updateAlerts(alerts, readings) {
    const list = $("alertsList");

    if (!list) {
        return;
    }

    list.replaceChildren();

    setText(
        "alertCount",
        `${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"}`
    );

    if (alerts.length === 0) {
        const item = document.createElement("li");

        if (
            readings.temperature === null ||
            readings.humidity === null ||
            readings.light === null
        ) {
            item.textContent =
                "Waiting for complete environmental readings.";
            item.classList.add("info-alert");
        } else {
            item.textContent = "No active environmental alerts.";
            item.classList.add("info-alert");
        }

        list.appendChild(item);
        return;
    }

    alerts.forEach((alert) => {
        const item = document.createElement("li");
        item.textContent = alert.message;
        list.appendChild(item);
    });
}


function updateSensorCards(readings) {
    const temperature = readings.temperature;
    const humidity = readings.humidity;
    const light = readings.light;

    setText("temperature", formatNumber(temperature));
    setText("humidity", formatNumber(humidity));
    setText("light", light === null ? "--" : String(light));

    setText(
        "temperatureNote",
        temperature === null
            ? "Waiting for reading"
            : temperature > LIMITS.highTemperature
                ? "Above recommended limit"
                : "Within configured limit"
    );

    setText(
        "humidityNote",
        humidity === null
            ? "Waiting for reading"
            : humidity > LIMITS.highHumidity
                ? "Above recommended limit"
                : "Within configured limit"
    );

    setText(
        "lightNote",
        light === null
            ? "Waiting for reading"
            : light < LIMITS.lowLight
                ? "Light level is low"
                : "Light level is acceptable"
    );

    const temperatureBar = $("temperatureBar");
    const humidityBar = $("humidityBar");
    const lightBar = $("lightBar");

    if (temperatureBar) {
        temperatureBar.style.width =
            temperature === null
                ? "0%"
                : `${Math.max(0, Math.min(100, temperature / 50 * 100))}%`;
    }

    if (humidityBar) {
        humidityBar.style.width =
            humidity === null
                ? "0%"
                : `${Math.max(0, Math.min(100, humidity))}%`;
    }

    if (lightBar) {
        lightBar.style.width =
            light === null
                ? "0%"
                : `${Math.max(0, Math.min(100, light / 1023 * 100))}%`;
    }

}


function createChart(canvasId, label, color, unit) {
    const canvas = $(canvasId);

    if (!canvas || typeof Chart === "undefined") {
        return null;
    }

    return new Chart(canvas, {
        type: "line",

        data: {
            labels: [],
            datasets: [{
                label,
                data: [],
                borderColor: color,
                backgroundColor: color + "22",
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `${label}: ${context.parsed.y} ${unit}`
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 6,
                        maxRotation: 0
                    },
                    grid: {
                        display: false
                    }
                },

                y: {
                    beginAtZero: false
                }
            }
        }
    });
}


function initializeCharts() {
    temperatureChart = createChart(
        "temperatureChart",
        "Temperature",
        "#e88a43",
        "°C"
    );

    humidityChart = createChart(
        "humidityChart",
        "Humidity",
        "#4786eb",
        "%"
    );

    lightChart = createChart(
        "lightChart",
        "Light Intensity",
        "#d6aa24",
        "ADC"
    );
}


function updateOneChart(chart, labels, values) {
    if (!chart) {
        return;
    }

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update("none");
}


function updateCharts(historyRows) {
    const rows = historyRows.slice(-MAX_CHART_POINTS);

    const labels = rows.map((row) => {
        if (!row.recorded_at) {
            return "--";
        }

        const date = new Date(row.recorded_at);

        return Number.isNaN(date.getTime())
            ? row.recorded_at
            : date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });
    });

    updateOneChart(
        temperatureChart,
        labels,
        rows.map((row) => row.temperature)
    );

    updateOneChart(
        humidityChart,
        labels,
        rows.map((row) => row.humidity)
    );

    updateOneChart(
        lightChart,
        labels,
        rows.map((row) => row.light)
    );
}


function getHistoryStatus(row) {
    const alerts = getAlerts({
        temperature: row.temperature,
        humidity: row.humidity,
        light: row.light
    });

    return alerts.length > 0 ? "Warning" : "Normal";
}


function renderHistory(rows) {
    const table = $("historyTable");

    if (!table) {
        return;
    }

    table.replaceChildren();

    setText("historyCount", `${rows.length} records`);

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");

        td.colSpan = 5;
        td.textContent = "No sensor readings recorded yet.";

        tr.appendChild(td);
        table.appendChild(tr);
        return;
    }

    rows.slice().reverse().forEach((row) => {
        const tr = document.createElement("tr");

        const values = [
            formatTime(row.recorded_at),
            `${formatNumber(row.temperature)} °C`,
            `${formatNumber(row.humidity)}%`,
            row.light === null ? "--" : String(row.light),
            getHistoryStatus(row)
        ];

        values.forEach((value) => {
            const td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });

        table.appendChild(tr);
    });
}


function setupAttendance() {
    const totalInput = $("totalStudents");
    const presentInput = $("presentStudents");
    const calculateButton = $("calculateAttendance");
    const message = $("attendanceMessage");

    if (!totalInput || !presentInput || !calculateButton) {
        console.error("Attendance elements were not found in index.html.");
        return;
    }

    function calculateAttendance(showError = true) {
        const totalText = totalInput.value.trim();
        const presentText = presentInput.value.trim();

        const total = Number(totalText);
        const present = Number(presentText);

        const valid =
            totalText !== "" &&
            presentText !== "" &&
            Number.isInteger(total) &&
            Number.isInteger(present) &&
            total >= 1 &&
            present >= 0 &&
            present <= total;

        if (!valid) {
            setText("presentCount", "--");
            setText("absentCount", "--");
            setText("attendancePercent", "--");
            setText("occupancyPercent", "--");

            if (message) {
                message.textContent =
                    "Enter a valid total and present count.";
            }

            if (showError) {
                alert(
                    "Enter a total of at least 1 student and a present count between 0 and the total."
                );
            }

            return;
        }

        const absent = total - present;
        const percentage = (present / total) * 100;
        const formattedPercentage = `${percentage.toFixed(1)}%`;

        setText("presentCount", String(present));
        setText("absentCount", String(absent));
        setText("attendancePercent", formattedPercentage);
        setText("occupancyPercent", formattedPercentage);

        if (message) {
            message.textContent = "Attendance calculated successfully.";
        }

        try {
            localStorage.setItem(
                "classroomAttendance",
                JSON.stringify({
                    total,
                    present
                })
            );
        } catch (error) {
            console.warn("Could not save attendance in this browser.", error);
        }
    }

    calculateButton.addEventListener("click", () => {
        calculateAttendance(true);
    });

    // Update automatically when both fields contain valid values.
    totalInput.addEventListener("input", () => {
        if (totalInput.value.trim() && presentInput.value.trim()) {
            calculateAttendance(false);
        }
    });

    presentInput.addEventListener("input", () => {
        if (totalInput.value.trim() && presentInput.value.trim()) {
            calculateAttendance(false);
        }
    });

    // Restore previously entered attendance after a page refresh.
    try {
        const saved = localStorage.getItem("classroomAttendance");

        if (saved) {
            const attendance = JSON.parse(saved);

            if (
                Number.isInteger(attendance.total) &&
                Number.isInteger(attendance.present) &&
                attendance.total >= 1 &&
                attendance.present >= 0 &&
                attendance.present <= attendance.total
            ) {
                totalInput.value = attendance.total;
                presentInput.value = attendance.present;
                calculateAttendance(false);
            }
        }
    } catch (error) {
        console.warn("Could not restore saved attendance.", error);
    }
}


async function fetchLatestData() {
    const response = await fetch("/api/data", {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error("Could not fetch the latest sensor readings.");
    }

    return response.json();
}


async function fetchHistory() {
    const response = await fetch("/api/history", {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error("Could not fetch sensor history.");
    }

    return response.json();
}


async function refreshDashboard() {
    try {
        const readings = await fetchLatestData();

        setConnection(true);

        const normalizedReadings = {
            temperature:
                readings.temperature == null
                    ? null
                    : Number(readings.temperature),

            humidity:
                readings.humidity == null
                    ? null
                    : Number(readings.humidity),

            light:
                readings.light == null
                    ? null
                    : Number(readings.light)
        };

        updateSensorCards(normalizedReadings);

        const alerts = getAlerts(normalizedReadings);

        updateOverallStatus(alerts, normalizedReadings);
        updateAlerts(alerts, normalizedReadings);

        setText(
            "lastUpdated",
            readings.recorded_at
                ? formatTime(readings.recorded_at)
                : "Waiting for sensor data"
        );

        try {
            const historyRows = await fetchHistory();

            renderHistory(historyRows);

            const signature = JSON.stringify(historyRows);

            if (signature !== lastHistorySignature) {
                updateCharts(historyRows);
                lastHistorySignature = signature;
            }
        } catch (historyError) {
            console.error("History update failed:", historyError);
        }
    } catch (error) {
        console.error("Dashboard update failed:", error);
        setConnection(false);
        setText("lastUpdated", "Connection failed");

        const banner = $("statusBanner");

        if (banner) {
            banner.classList.remove("normal", "warning");
            banner.classList.add("incomplete");
        }

        setText("classroomStatus", "Connection Error");
        setText("statusTag", "OFFLINE");
        setText("statusSymbol", "!");
        setText(
            "statusDescription",
            "Cannot retrieve readings. Check that Flask is running."
        );
    }
}


document.addEventListener("DOMContentLoaded", () => {
    initializeCharts();
    setupAttendance();

    refreshDashboard();
    window.setInterval(refreshDashboard, REFRESH_MS);
});