"use strict";

const $ = (id) => document.getElementById(id);

const REFRESH_MS = 3000;
const MAX_CHART_POINTS = 20;
const ATTENDANCE_KEY = "smartClassroomAttendance";

let temperatureChart = null;
let humidityChart = null;
let lightChart = null;
let lastHistorySignature = "";

/* ---------- Date and display helpers ---------- */

function formatDate(value) {
    if (!value) return "Time unavailable";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString([], {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function setProgress(id, value, maximum) {
    const element = $(id);
    if (!element) return;

    const number = Number(value);
    const percentage = Number.isFinite(number)
        ? Math.max(0, Math.min(100, (number / maximum) * 100))
        : 0;

    element.style.width = `${percentage}%`;
}

function isValidNumber(value) {
    return value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(Number(value));
}

function formatNumber(value, decimals = 1) {
    return isValidNumber(value) ? Number(value).toFixed(decimals) : "--";
}

/* ---------- Sidebar and mobile navigation ---------- */

function setupNavigation() {
    const sidebar = $("sidebar");
    const overlay = $("sidebarOverlay");
    const menuButton = $("menuToggle");
    const closeButton = $("closeSidebar");

    function closeMenu() {
        sidebar?.classList.remove("open");
        overlay?.classList.remove("visible");
        document.body.style.overflow = "";
    }

    function openMenu() {
        sidebar?.classList.add("open");
        overlay?.classList.add("visible");
        document.body.style.overflow = "hidden";
    }

    menuButton?.addEventListener("click", openMenu);
    closeButton?.addEventListener("click", closeMenu);
    overlay?.addEventListener("click", closeMenu);

    document.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", () => {
            document.querySelectorAll(".nav-link").forEach((item) => {
                item.classList.remove("active");
            });

            link.classList.add("active");
            closeMenu();
        });
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 760) closeMenu();
    });
}

/* ---------- Connection status ---------- */

function setConnection(connected, message = "") {
    const dot = $("connectionDot");

    if (dot) {
        dot.classList.toggle("connected", connected);
        dot.classList.toggle("disconnected", !connected);
    }

    setText("connectionText", connected ? "Server connected" : "Server unavailable");
    setText("lastUpdated", message || (connected ? "Receiving API data" : "Check Flask server"));
}

/* ---------- Overall system status ---------- */

function updateOverallStatus(data) {
    const banner = $("statusBanner");
    const symbol = $("statusSymbol");

    if (!banner) return;

    banner.classList.remove("warning", "incomplete");

    const complete = data &&
        isValidNumber(data.temperature) &&
        isValidNumber(data.humidity) &&
        isValidNumber(data.light);

    if (!complete) {
        banner.classList.add("incomplete");
        if (symbol) symbol.textContent = "…";

        setText("overallStatus", "Waiting for sensor data");
        setText("statusDescription", "The latest temperature, humidity, or light reading is missing.");
        setText("statusPill", "INCOMPLETE");
        return;
    }

    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    const warning = data.status === "Warning" || alerts.length > 0;

    if (warning) {
        banner.classList.add("warning");
        if (symbol) symbol.textContent = "!";

        setText("overallStatus", "Classroom needs attention");
        setText(
            "statusDescription",
            `${alerts.length || 1} condition(s) may need checking. Review the alerts below.`
        );
        setText("statusPill", "WARNING");
    } else {
        if (symbol) symbol.textContent = "✓";

        setText("overallStatus", "Classroom conditions look normal");
        setText("statusDescription", "All received readings are within the configured dashboard limits.");
        setText("statusPill", "NORMAL");
    }
}

/* ---------- Sensor cards ---------- */

function updateSensorCards(data) {
    const temperatureValid = isValidNumber(data.temperature);
    const humidityValid = isValidNumber(data.humidity);
    const lightValid = isValidNumber(data.light);

    setText("temperature", formatNumber(data.temperature));
    setText("humidity", formatNumber(data.humidity));
    setText("light", lightValid ? Math.round(Number(data.light)).toString() : "--");

    if (temperatureValid) {
        const temperature = Number(data.temperature);

        setText(
            "temperatureNote",
            temperature > 35 ? "High temperature detected" :
            temperature >= 18 ? "Within the configured range" :
            "Below the configured range"
        );

        setProgress("temperatureBar", temperature, 50);
    } else {
        setText("temperatureNote", "Waiting for reading");
        setProgress("temperatureBar", 0, 50);
    }

    if (humidityValid) {
        const humidity = Number(data.humidity);

        setText(
            "humidityNote",
            humidity > 70 ? "High humidity detected" :
            humidity >= 30 ? "Within the configured range" :
            "Low humidity reading"
        );

        setProgress("humidityBar", humidity, 100);
    } else {
        setText("humidityNote", "Waiting for reading");
        setProgress("humidityBar", 0, 100);
    }

    if (lightValid) {
        const light = Number(data.light);

        setText(
            "lightNote",
            light < 150 ? "Low light level detected" :
            "Raw LDR sensor reading"
        );

        setProgress("lightBar", light, 1023);
    } else {
        setText("lightNote", "Waiting for reading");
        setProgress("lightBar", 0, 1023);
    }

    setText(
        "lastUpdated",
        data.recorded_at ? `Updated ${formatDate(data.recorded_at)}` : "Reading received"
    );
}

/* ---------- Alerts ---------- */

function normalizeAlert(alert) {
    if (typeof alert === "string") {
        return { message: alert, level: "warning" };
    }

    if (alert && typeof alert === "object") {
        return {
            message: String(alert.message || alert.text || "Check sensor reading"),
            level: String(alert.level || "warning").toLowerCase()
        };
    }

    return { message: "Check sensor reading", level: "warning" };
}

function renderAlerts(data) {
    const container = $("alertsList");
    if (!container) return;

    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    container.replaceChildren();

    setText("alertCount", `${alerts.length} alert${alerts.length === 1 ? "" : "s"}`);

    if (alerts.length === 0) {
        const item = document.createElement("div");
        item.className = "alert-item";

        const symbol = document.createElement("div");
        symbol.className = "alert-symbol";
        symbol.textContent = "✓";

        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = "No active alerts";

        const description = document.createElement("p");
        description.textContent =
            "No configured temperature, humidity, or light warning is active.";

        copy.append(title, description);
        item.append(symbol, copy);
        container.appendChild(item);
        return;
    }

    alerts.forEach((rawAlert) => {
        const alert = normalizeAlert(rawAlert);
        const item = document.createElement("div");

        const level = ["warning", "error"].includes(alert.level)
            ? alert.level
            : "warning";

        item.className = `alert-item ${level}`;

        const symbol = document.createElement("div");
        symbol.className = "alert-symbol";
        symbol.textContent = level === "error" ? "×" : "!";

        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = alert.message;

        const description = document.createElement("p");
        description.textContent = "Review the latest sensor reading and classroom conditions.";

        copy.append(title, description);
        item.append(symbol, copy);
        container.appendChild(item);
    });
}

/* ---------- Charts ---------- */

function createChart(canvasId, label, color) {
    const canvas = $(canvasId);
    if (!canvas || typeof Chart === "undefined") return null;

    return new Chart(canvas, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label,
                data: [],
                borderColor: color,
                backgroundColor: `${color}20`,
                fill: true,
                borderWidth: 2,
                tension: 0.35,
                pointRadius: 2,
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
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#0b1120",
                    titleColor: "#e8eef8",
                    bodyColor: "#cbd5e1",
                    borderColor: "#34455d",
                    borderWidth: 1,
                    padding: 10
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: "#8195af",
                        maxTicksLimit: 6,
                        maxRotation: 0
                    },
                    border: { color: "#2a3a51" }
                },
                y: {
                    beginAtZero: false,
                    grid: { color: "#24334b" },
                    ticks: { color: "#8195af", maxTicksLimit: 5 },
                    border: { display: false }
                }
            }
        }
    });
}

function setupCharts() {
    if (typeof Chart === "undefined") {
        console.error("Chart.js did not load. Check your internet connection.");
        return;
    }

    temperatureChart = createChart(
        "temperatureChart", "Temperature (°C)", "#fb7185"
    );

    humidityChart = createChart(
        "humidityChart", "Humidity (%)", "#38bdf8"
    );

    lightChart = createChart(
        "lightChart", "Light level", "#fbbf24"
    );
}

function updateOneChart(chart, labels, values) {
    if (!chart) return;

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update("none");
}

function updateCharts(history) {
    if (!Array.isArray(history)) return;

    const recent = history.slice(-MAX_CHART_POINTS);

    const labels = recent.map((item) => {
        if (!item.recorded_at) return "--";

        const date = new Date(item.recorded_at);
        if (Number.isNaN(date.getTime())) return item.recorded_at;

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    });

    updateOneChart(
        temperatureChart,
        labels,
        recent.map((item) => isValidNumber(item.temperature)
            ? Number(item.temperature) : null)
    );

    updateOneChart(
        humidityChart,
        labels,
        recent.map((item) => isValidNumber(item.humidity)
            ? Number(item.humidity) : null)
    );

    updateOneChart(
        lightChart,
        labels,
        recent.map((item) => isValidNumber(item.light)
            ? Number(item.light) : null)
    );
}

/* ---------- Reading history ---------- */

function getReadingStatus(item) {
    const temperature = Number(item.temperature);
    const humidity = Number(item.humidity);
    const light = Number(item.light);

    if (temperature > 35 || humidity > 70 || light < 150) {
        return "Warning";
    }

    return "Normal";
}

function renderHistory(history) {
    const body = $("historyBody");
    if (!body) return;

    body.replaceChildren();

    if (!Array.isArray(history) || history.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.className = "table-empty";
        cell.textContent = "No readings have been saved yet.";

        row.appendChild(cell);
        body.appendChild(row);
        setText("historyCount", "0 records");
        return;
    }

    const recent = history.slice(-100).reverse();

    recent.forEach((item) => {
        const row = document.createElement("tr");

        const values = [
            formatDate(item.recorded_at),
            `${formatNumber(item.temperature)} °C`,
            `${formatNumber(item.humidity)} %`,
            isValidNumber(item.light) ? Math.round(Number(item.light)) : "--"
        ];

        values.forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        const status = getReadingStatus(item);
        const badge = document.createElement("span");

        badge.className = `table-status${status === "Warning" ? " warning" : ""}`;
        badge.textContent = status;

        statusCell.appendChild(badge);
        row.appendChild(statusCell);
        body.appendChild(row);
    });

    setText("historyCount", `${history.length} record${history.length === 1 ? "" : "s"}`);
}

async function refreshHistory() {
    const response = await fetch("/api/history", { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`History API returned ${response.status}`);
    }

    const history = await response.json();

    if (!Array.isArray(history)) {
        throw new Error("History API did not return a list");
    }

    // Redraw only when the stored history has changed.
    const signature = JSON.stringify(history);

    if (signature !== lastHistorySignature) {
        lastHistorySignature = signature;
        renderHistory(history);
        updateCharts(history);
    }
}

/* ---------- Live sensor updates ---------- */

async function refreshDashboard() {
    try {
        const response = await fetch("/api/data", { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Data API returned ${response.status}`);
        }

        const data = await response.json();

        setConnection(true, "Flask API reachable");

        updateSensorCards(data);
        updateOverallStatus(data);
        renderAlerts(data);

        if (data.recorded_at) {
            setText("lastUpdated", `Updated ${formatDate(data.recorded_at)}`);
        }

        await refreshHistory();
    } catch (error) {
        console.error("Dashboard refresh failed:", error);
        setConnection(false, "Unable to fetch readings");

        setText("overallStatus", "Connection problem");
        setText("statusDescription", "Check that Flask and the sensor data reader are running.");
        setText("statusPill", "OFFLINE");

        const banner = $("statusBanner");
        if (banner) {
            banner.classList.remove("warning");
            banner.classList.add("incomplete");
        }

        if ($("statusSymbol")) setText("statusSymbol", "!");
    }
}

/* ---------- Manual attendance calculator ---------- */

function saveAttendance(total, present) {
    try {
        localStorage.setItem(
            ATTENDANCE_KEY,
            JSON.stringify({ total, present })
        );
    } catch (error) {
        console.warn("Attendance could not be saved in this browser.", error);
    }
}

function showAttendance(total, present, showSavedMessage = true) {
    const absent = total - present;
    const percentage = (present / total) * 100;

    setText("attendancePercentage", percentage.toFixed(1));
    setText("presentResult", present);
    setText("absentResult", absent);
    setText("totalResult", total);

    const bar = $("attendanceBar");
    if (bar) bar.style.width = `${percentage}%`;

    setText(
        "attendanceSaved",
        showSavedMessage
            ? "Attendance result saved in this browser."
            : "Attendance calculated."
    );
}

function setupAttendance() {
    const form = $("attendanceForm");
    const totalInput = $("totalStudents");
    const presentInput = $("presentStudents");
    const error = $("attendanceError");

    if (!form || !totalInput || !presentInput) return;

    try {
        const saved = JSON.parse(localStorage.getItem(ATTENDANCE_KEY));

        if (saved && Number.isInteger(saved.total) &&
            Number.isInteger(saved.present) &&
            saved.total > 0 &&
            saved.present >= 0 &&
            saved.present <= saved.total) {

            totalInput.value = saved.total;
            presentInput.value = saved.present;
            showAttendance(saved.total, saved.present);
        }
    } catch (readError) {
        console.warn("Could not restore saved attendance.", readError);
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (error) error.textContent = "";

        const total = Number(totalInput.value);
        const present = Number(presentInput.value);

        if (!Number.isInteger(total) || total <= 0) {
            if (error) error.textContent = "Enter a total student count greater than zero.";
            return;
        }

        if (!Number.isInteger(present) || present < 0) {
            if (error) error.textContent = "Enter a valid present student count.";
            return;
        }

        if (present > total) {
            if (error) error.textContent = "Present students cannot exceed total students.";
            return;
        }

        saveAttendance(total, present);
        showAttendance(total, present);
    });

    $("clearAttendance")?.addEventListener("click", () => {
        totalInput.value = "";
        presentInput.value = "";

        if (error) error.textContent = "";

        try {
            localStorage.removeItem(ATTENDANCE_KEY);
        } catch (clearError) {
            console.warn("Could not clear saved attendance.", clearError);
        }

        setText("attendancePercentage", "--");
        setText("presentResult", "--");
        setText("absentResult", "--");
        setText("totalResult", "--");
        setText("attendanceSaved", "Enter counts to calculate attendance.");

        const bar = $("attendanceBar");
        if (bar) bar.style.width = "0%";
    });
}

/* ---------- CSV export ---------- */

function setupExport() {
    $("exportButton")?.addEventListener("click", () => {
        // Uses the existing Flask CSV endpoint.
        window.location.href = "/api/export";
    });
}

/* ---------- Page initialization ---------- */

function initializeDashboard() {
    setText(
        "currentDate",
        new Date().toLocaleDateString([], {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        })
    );

    setupNavigation();
    setupCharts();
    setupAttendance();
    setupExport();

    refreshDashboard();
    window.setInterval(refreshDashboard, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded",initializeDashboard);