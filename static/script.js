const $ = (id) => document.getElementById(id);

let temperatureChart;
let humidityChart;
let lightChart;

let lastHistorySignature = "";
let lastSensorResponse = null;

const REFRESH_MS = 3000;
const MAX_CHART_POINTS = 20;

// Keep these limits consistent with app.py.
const LIMITS = {
    highTemperature: 35,
    highHumidity: 70,
    lowLight: 150
};

function createChart(canvasId, label, color, fillColor) {
    const canvas = $(canvasId);

    return new Chart(canvas, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label,
                data: [],
                borderColor: color,
                backgroundColor: fillColor,
                fill: true,
                tension: 0.35,
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: color,
                spanGaps: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: "index"
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: "#8794a8",
                        maxTicksLimit: 6,
                        maxRotation: 0
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: "#edf1f7"
                    },
                    ticks: {
                        color: "#8794a8",
                        maxTicksLimit: 5
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

function initializeCharts() {
    if (typeof Chart === "undefined") {
        console.warn("Chart.js could not load.");
        return;
    }

    temperatureChart = createChart(
        "temperatureChart",
        "Temperature",
        "#f29567",
        "rgba(242,149,103,0.12)"
    );

    humidityChart = createChart(
        "humidityChart",
        "Humidity",
        "#4d91ee",
        "rgba(77,145,238,0.12)"
    );

    lightChart = createChart(
        "lightChart",
        "Light",
        "#dcb52e",
        "rgba(220,181,46,0.13)"
    );
}

function formatTime(value) {
    if (!value) return "--";

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

function formatDateTime(value) {
    if (!value) return "Waiting for data";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function setConnection(connected, message) {
    $("connectionStatus").textContent = message;

    const dot = document.querySelector(".connection-dot");

    if (dot) {
        dot.style.background = connected ? "#18c887" : "#ef5968";
    }
}

function setText(id, value) {
    $(id).textContent = value;
}

function updateProgress(id, value, maximum) {
    const percent = Math.max(
        0,
        Math.min(100, (Number(value) / maximum) * 100)
    );

    $(id).style.width = `${percent}%`;
}

// Generate warnings with current readings and configured limits.
function getAlerts(data) {
    const alerts = [];

    const temperature = Number(data.temperature);
    const humidity = Number(data.humidity);
    const light = Number(data.light);

    if (
        data.temperature !== null &&
        data.temperature !== undefined &&
        Number.isFinite(temperature) &&
        temperature > LIMITS.highTemperature
    ) {
        alerts.push({
            title: "High temperature",
            value: `${temperature.toFixed(1)} °C`,
            limit: `${LIMITS.highTemperature} °C`,
            message: "Check classroom ventilation."
        });
    }

    if (
        data.humidity !== null &&
        data.humidity !== undefined &&
        Number.isFinite(humidity) &&
        humidity > LIMITS.highHumidity
    ) {
        alerts.push({
            title: "High humidity",
            value: `${humidity.toFixed(1)}%`,
            limit: `${LIMITS.highHumidity}%`,
            message: "Check classroom ventilation."
        });
    }

    if (
        data.light !== null &&
        data.light !== undefined &&
        Number.isFinite(light) &&
        light < LIMITS.lowLight
    ) {
        alerts.push({
            title: "Low light level",
            value: `${light}`,
            limit: `${LIMITS.lowLight} (minimum)`,
            message: "Check room lighting and sensor calibration."
        });
    }

    return alerts;
}

function updateStatus(data) {
    const banner = $("statusBanner");
    const symbol = $("statusSymbol");
    const tag = $("statusTag");

    banner.classList.remove("warning", "waiting");

    if (data.temperature === null || data.temperature === undefined) {
        banner.classList.add("waiting");

        setText("classroomStatus", "Waiting for sensor data");
        setText(
            "statusDescription",
            "The server is running, but no ESP8266 readings have been saved yet."
        );

        symbol.textContent = "…";
        tag.textContent = "WAITING";
        return;
    }

    const alerts = getAlerts(data);
    const warning = alerts.length > 0;

    if (warning) {
        banner.classList.add("warning");
        symbol.textContent = "!";
        tag.textContent = "WARNING";

        setText("classroomStatus", "Classroom needs attention");
        setText(
            "statusDescription",
            `${alerts.length} environmental alert(s) detected. Check the alerts below.`
        );
    } else {
        symbol.textContent = "✓";
        tag.textContent = "NORMAL";

        setText("classroomStatus", "Classroom conditions look normal");
        setText(
            "statusDescription",
            "No configured temperature, humidity or light warnings detected."
        );
    }
}

// Display the current sensor value and its limit in every warning.
function updateAlerts(data) {
    const alerts = getAlerts(data);
    const container = $("alertsList");

    setText(
        "alertCount",
        `${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"}`
    );

    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>✓</span>
                <p>No environmental warnings at the moment.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = alerts.map(alert => `
        <div class="alert-item">
            <div class="alert-icon">!</div>
            <div class="alert-content">
                <strong>${alert.title}</strong>
                <p><b>Current reading:</b> ${alert.value}</p>
                <p><b>Configured limit:</b> ${alert.limit}</p>
                <p>${alert.message}</p>
            </div>
        </div>
    `).join("");
}

function updateDashboard(data) {
    lastSensorResponse = data;

    const hasReading =
        data.temperature !== null &&
        data.temperature !== undefined;

    if (!hasReading) {
        setText("temperature", "--");
        setText("humidity", "--");
        setText("light", "--");
        setText("occupancy", "--");
        setText("lastUpdated", "Waiting for data");

        updateStatus(data);
        updateAlerts(data);
        return;
    }

    const temperature = Number(data.temperature);
    const humidity = Number(data.humidity);
    const light = Number(data.light);
    const motion = Number(data.motion);

    setText("temperature", temperature.toFixed(1));
    setText("humidity", humidity.toFixed(1));
    setText("light", light);

    setText(
        "temperatureNote",
        temperature > LIMITS.highTemperature
            ? "Above configured limit"
            : "Temperature reading received"
    );

    setText(
        "humidityNote",
        humidity > LIMITS.highHumidity
            ? "Above configured limit"
            : "Humidity reading received"
    );

    setText(
        "lightNote",
        light < LIMITS.lowLight
            ? "Below configured minimum"
            : "Raw analog value from LDR"
    );

    updateProgress("temperatureBar", temperature, 50);
    updateProgress("humidityBar", humidity, 100);
    updateProgress("lightBar", light, 1023);

    setText("occupancy", motion === 1 ? "Motion" : "No motion");

    setText(
        "occupancyNote",
        motion === 1
            ? "PIR sensor detected movement"
            : "No movement detected currently"
    );

    setText(
        "occupancyState",
        motion === 1 ? "Movement detected" : "No movement"
    );

    $("occupancyDot").style.background =
        motion === 1 ? "#18c887" : "#a6afbd";

    setText("lastUpdated", formatDateTime(data.recorded_at));

    updateStatus(data);
    updateAlerts(data);
}

function updateCharts(history) {
    if (!temperatureChart || !humidityChart || !lightChart) {
        return;
    }

    const recent = history.slice(-MAX_CHART_POINTS);

    const labels = recent.map(item => formatTime(item.recorded_at));

    const temperatures = recent.map(item =>
        Number(item.temperature)
    );

    const humidities = recent.map(item =>
        Number(item.humidity)
    );

    const lights = recent.map(item =>
        Number(item.light)
    );

    const chartData = [
        [temperatureChart, temperatures],
        [humidityChart, humidities],
        [lightChart, lights]
    ];

    for (const [chart, values] of chartData) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.update("none");
    }
}

function calculateRowStatus(item) {
    return getAlerts(item).length > 0 ? "Warning" : "Normal";
}

function updateHistoryTable(history) {
    const table = $("historyTable");

    // Show newest readings first in the table.
    const recent = [...history].reverse().slice(0, 10);

    setText("historyCount", `${recent.length} readings displayed`);

    if (recent.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">
                    No readings recorded yet.
                </td>
            </tr>
        `;
        return;
    }

    table.innerHTML = recent.map(item => {
        const motion = Number(item.motion) === 1;
        const status = calculateRowStatus(item);

        return `
            <tr>
                <td>${formatDateTime(item.recorded_at)}</td>
                <td>${Number(item.temperature).toFixed(1)} °C</td>
                <td>${Number(item.humidity).toFixed(1)}%</td>
                <td>${Number(item.light)}</td>
                <td>
                    <span class="motion-badge">
                        ${motion ? "Motion" : "No motion"}
                    </span>
                </td>
                <td>
                    <span class="${status === "Warning"
                        ? "warning-badge"
                        : "normal-badge"}">
                        ${status}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}

async function fetchLatestData() {
    try {
        const response = await fetch("/api/data", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();

        setConnection(true, "Connected");
        updateDashboard(data);
    } catch (error) {
        setConnection(false, "Connection lost");

        console.error("Unable to fetch sensor data:", error);

        const banner = $("statusBanner");
        banner.classList.remove("warning");
        banner.classList.add("waiting");

        setText("classroomStatus", "Server connection unavailable");
        setText(
            "statusDescription",
            "Check that Flask is running and the dashboard can reach it."
        );
        setText("statusTag", "OFFLINE");
        setText("statusSymbol", "!");
    }
}

async function fetchHistory() {
    try {
        const response = await fetch("/api/history", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const history = await response.json();

        // Update only when the saved history has changed.
        const signature = history.length
            ? `${history.length}:${history[history.length - 1].id}`
            : "empty";

        if (signature !== lastHistorySignature) {
            lastHistorySignature = signature;

            updateCharts(history);
            updateHistoryTable(history);
        }
    } catch (error) {
        console.error("Unable to fetch sensor history:", error);
    }
}

async function refreshDashboard() {
    await fetchLatestData();
    await fetchHistory();
}

document.addEventListener("DOMContentLoaded", () => {
    initializeCharts();

    // Load data immediately, then refresh periodically.
    refreshDashboard();
    setInterval(refreshDashboard, REFRESH_MS);
});