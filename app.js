// Application state
let currentDataset = null;
let forecastResult = null;
let historicalChart = null;
let forecastChart = null;

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    // Icons init
    lucide.createIcons();
    
    // Theme setup
    initTheme();
    
    // Setup Section Navigation
    setupNavigation();
    
    // Setup Drag and Drop
    setupDragAndDrop();
    
    // Setup Form Listeners
    setupFormListeners();
    
    // Auto-load sample dataset on start
    loadSampleDataset();
});

/* ==========================================================================
   Theme Management
   ========================================================================== */
function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeToggleUI(savedTheme);
    
    const themeBtn = document.getElementById("theme-toggle");
    themeBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        updateThemeToggleUI(newTheme);
        
        // Re-render charts to adjust grid/text colors in dark/light mode
        if (currentDataset) {
            updateDashboard(document.getElementById("dashboard-param-select").value);
        }
        if (forecastResult) {
            renderForecastChart();
        }
    });
}

function updateThemeToggleUI(theme) {
    const themeBtn = document.getElementById("theme-toggle");
    if (theme === "dark") {
        themeBtn.setAttribute("title", "Switch to Light Mode");
    } else {
        themeBtn.setAttribute("title", "Switch to Dark Mode");
    }
}

function isDarkMode() {
    return document.documentElement.getAttribute("data-theme") === "dark";
}

/* ==========================================================================
   Navigation
   ========================================================================== */
function setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const targetId = item.getAttribute("data-target");
            navigateToSection(targetId);
        });
    });
}

function navigateToSection(sectionId) {
    // Hide all sections
    const sections = document.querySelectorAll(".content-section");
    sections.forEach(s => s.classList.remove("active"));
    
    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add("active");
    }
    
    // Update active nav item
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        if (item.getAttribute("data-target") === sectionId) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
}

/* ==========================================================================
   Dataset Handlers & API Calls
   ========================================================================== */
function loadSampleDataset() {
    fetch("/api/sample-data")
        .then(response => {
            if (!response.ok) throw new Error("Failed to load sample dataset");
            return response.json();
        })
        .then(data => {
            handleDatasetResponse(data);
            navigateToSection("section-dashboard");
        })
        .catch(err => {
            console.error(err);
            alert("Error loading sample dataset: " + err.message);
        });
}

function setupDragAndDrop() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    
    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });
    
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            uploadFile(fileInput.files[0]);
        }
    });
}

function uploadFile(file) {
    const dropzone = document.getElementById("dropzone");
    const originalHTML = dropzone.innerHTML;
    
    // Loading state in dropzone
    dropzone.innerHTML = `
        <div class="spinner" style="margin: 0 auto 1.5rem auto; width: 40px; height: 40px; border-width: 3px;"></div>
        <h3>Uploading and analyzing file...</h3>
        <p>${file.name}</p>
    `;
    
    const formData = new FormData();
    formData.append("file", file);
    
    fetch("/api/upload", {
        method: "POST",
        body: formData
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(json => { throw new Error(json.error || "File analysis failed") });
            }
            return response.json();
        })
        .then(data => {
            dropzone.innerHTML = originalHTML;
            handleDatasetResponse(data);
            // Flash visual validation panel
            const panel = document.getElementById("validation-panel");
            panel.scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            dropzone.innerHTML = originalHTML;
            alert("Upload Error: " + err.message);
        });
}

function handleDatasetResponse(data) {
    currentDataset = data;
    
    // Show validation panel
    const validationPanel = document.getElementById("validation-panel");
    validationPanel.classList.remove("hidden");
    
    document.getElementById("data-rows-count").innerText = `${data.dates.length} Records Found`;
    document.getElementById("date-col-name").innerText = data.date_column;
    
    // Populate parameters tags
    const tagsContainer = document.getElementById("parameters-tags");
    tagsContainer.innerHTML = "";
    data.columns.forEach(col => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.innerText = col;
        tagsContainer.appendChild(tag);
    });
    
    // Handle Warnings
    const warningsContainer = document.getElementById("validation-warnings-container");
    const warningsList = document.getElementById("validation-warnings-list");
    if (data.warnings && data.warnings.length > 0) {
        warningsList.innerHTML = "";
        data.warnings.forEach(w => {
            const li = document.createElement("li");
            li.innerText = w;
            warningsList.appendChild(li);
        });
        warningsContainer.classList.remove("hidden");
    } else {
        warningsContainer.classList.add("hidden");
    }
    
    // Populate dropdowns
    populateDropdowns(data.columns);
    
    // Render Raw Data Table
    renderRawTable(data);
    
    // Update Dashboard (default to first parameter)
    if (data.columns.length > 0) {
        document.getElementById("dashboard-param-select").value = data.columns[0];
        document.getElementById("forecast-param-select").value = data.columns[0];
        updateDashboard(data.columns[0]);
    }
}

function populateDropdowns(columns) {
    const dashSelect = document.getElementById("dashboard-param-select");
    const foreSelect = document.getElementById("forecast-param-select");
    
    dashSelect.innerHTML = "";
    foreSelect.innerHTML = "";
    
    columns.forEach(col => {
        const opt1 = document.createElement("option");
        opt1.value = col;
        opt1.innerText = col;
        dashSelect.appendChild(opt1);
        
        const opt2 = document.createElement("option");
        opt2.value = col;
        opt2.innerText = col;
        foreSelect.appendChild(opt2);
    });
    
    // Add change listeners
    dashSelect.onchange = () => updateDashboard(dashSelect.value);
}

function renderRawTable(data) {
    const tableContainer = document.getElementById("data-table-container");
    const table = document.getElementById("raw-data-table");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    
    thead.innerHTML = "";
    tbody.innerHTML = "";
    
    tableContainer.classList.remove("hidden");
    
    // Headers
    const hRow = document.createElement("tr");
    const dateTh = document.createElement("th");
    dateTh.innerText = data.date_column;
    hRow.appendChild(dateTh);
    
    data.columns.forEach(col => {
        const th = document.createElement("th");
        th.innerText = col;
        hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    
    // Rows (Limit to first 10 for performance / readability)
    const previewLimit = Math.min(data.dates.length, 10);
    for (let i = 0; i < previewLimit; i++) {
        const row = document.createElement("tr");
        const dateTd = document.createElement("td");
        dateTd.innerText = data.dates[i];
        row.appendChild(dateTd);
        
        data.columns.forEach(col => {
            const td = document.createElement("td");
            td.innerText = data.data[col][i];
            row.appendChild(td);
        });
        tbody.appendChild(row);
    }
}

/* ==========================================================================
   Dashboard & Summary Statistics
   ========================================================================== */
function updateDashboard(param) {
    if (!currentDataset) return;
    
    // Update summary statistics
    const stats = currentDataset.statistics[param];
    if (stats) {
        document.getElementById("stat-mean").innerText = stats.mean;
        document.getElementById("stat-median").innerText = stats.median;
        document.getElementById("stat-std").innerText = stats.std;
        document.getElementById("stat-min").innerText = stats.min;
        document.getElementById("stat-max").innerText = stats.max;
    }
    
    // Render chart
    renderHistoricalChart(param);
}

function renderHistoricalChart(param) {
    const ctx = document.getElementById("historicalChart").getContext("2d");
    
    if (historicalChart) {
        historicalChart.destroy();
    }
    
    const dates = currentDataset.dates;
    const values = currentDataset.data[param];
    
    // Colors based on theme
    const gridColor = isDarkMode() ? "#27273a" : "#e2e8f0";
    const textColor = isDarkMode() ? "#cdd6f4" : "#1e1e2e";
    const primaryColor = isDarkMode() ? "#89b4fa" : "#4f46e5";
    const areaColor = isDarkMode() ? "rgba(137, 180, 250, 0.1)" : "rgba(79, 70, 229, 0.06)";
    
    historicalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: param,
                data: values,
                borderColor: primaryColor,
                backgroundColor: areaColor,
                borderWidth: 2,
                pointBackgroundColor: primaryColor,
                pointRadius: 3,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: textColor, font: { family: 'Outfit' } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: isDarkMode() ? '#1e1e2f' : '#ffffff',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: primaryColor,
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit' } }
                }
            }
        }
    });
    
    document.getElementById("chart-title").innerText = `${param} Historical trendline`;
}

/* ==========================================================================
   ARIMA Forecasting
   ========================================================================== */
function setupFormListeners() {
    const arimaModeInputs = document.getElementsByName("arima-mode");
    const manualInputs = document.getElementById("manual-arima-inputs");
    
    arimaModeInputs.forEach(input => {
        input.addEventListener("change", () => {
            if (input.value === "manual") {
                manualInputs.classList.remove("hidden");
            } else {
                manualInputs.classList.add("hidden");
            }
        });
    });
    
    const form = document.getElementById("forecast-form");
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        runForecast();
    });
}

function runForecast() {
    if (!currentDataset) {
        alert("Please load or upload a dataset first.");
        return;
    }
    
    const param = document.getElementById("forecast-param-select").value;
    const horizon = document.getElementById("forecast-horizon").value;
    const arimaMode = document.querySelector('input[name="arima-mode"]:checked').value;
    
    let payload = {
        dates: currentDataset.dates,
        values: currentDataset.data[param],
        parameter: param,
        horizon: parseInt(horizon),
        dark_mode: isDarkMode()
    };
    
    if (arimaMode === "manual") {
        payload.p = parseInt(document.getElementById("arima-p").value);
        payload.d = parseInt(document.getElementById("arima-d").value);
        payload.q = parseInt(document.getElementById("arima-q").value);
    }
    
    // Toggle loader
    const btn = document.getElementById("btn-run-forecast");
    const spinner = document.getElementById("forecast-spinner");
    btn.disabled = true;
    spinner.classList.remove("hidden");
    
    fetch("/api/forecast", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(json => { throw new Error(json.error || "Forecasting failed") });
            }
            return response.json();
        })
        .then(data => {
            forecastResult = data;
            forecastResult.parameter = param; // save parameter name
            
            // Show result fields
            document.getElementById("forecast-chart-container").classList.remove("hidden");
            document.getElementById("forecast-table-container").classList.remove("hidden");
            
            // Update Summary
            const order = data.model_summary.order;
            document.getElementById("model-applied").innerText = `ARIMA(${order[0]}, ${order[1]}, ${order[2]})`;
            document.getElementById("model-aic").innerText = data.model_summary.aic !== null ? data.model_summary.aic : "N/A";
            document.getElementById("model-bic").innerText = data.model_summary.bic !== null ? data.model_summary.bic : "N/A";
            
            const modePill = document.getElementById("model-mode-pill");
            if (data.model_summary.is_auto) {
                modePill.innerText = "Auto (Optimal)";
                modePill.className = "status-pill success";
            } else {
                modePill.innerText = "Manual";
                modePill.className = "status-pill warning";
            }
            
            document.getElementById("forecast-interpretation").innerText = data.interpretation;
            
            // Render forecast charts & table
            renderForecastChart();
            renderForecastTable();
            
            // Scroll to chart
            document.getElementById("forecast-chart-container").scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            alert("Forecasting Error: " + err.message);
        })
        .finally(() => {
            btn.disabled = false;
            spinner.classList.add("hidden");
        });
}

function renderForecastChart() {
    const ctx = document.getElementById("forecastChart").getContext("2d");
    if (forecastChart) {
        forecastChart.destroy();
    }
    
    const history = forecastResult.history;
    const forecast = forecastResult.forecast;
    const param = forecastResult.parameter;
    
    // Setup joint array of labels for chronological alignment
    // Let's create null-padded arrays for clean overlay
    const allLabels = [...history.dates, ...forecast.dates];
    
    const histData = [...history.values];
    // Pad historical values to cover the forecast indices (as null, so it doesn't draw)
    const forecastPadding = new Array(forecast.dates.length).fill(null);
    const histSeries = [...histData, ...forecastPadding];
    
    // Forecast data needs historical padding (so it draws right after historical ends)
    // We pad the beginning with nulls except the VERY LAST point of history so they connect
    const historyPadding = new Array(history.dates.length - 1).fill(null);
    const lastHistVal = history.values[history.values.length - 1];
    
    const foreSeries = [...historyPadding, lastHistVal, ...forecast.values];
    const lowerSeries = [...historyPadding, lastHistVal, ...forecast.lower_bounds];
    const upperSeries = [...historyPadding, lastHistVal, ...forecast.upper_bounds];
    
    // Theme styling colors
    const gridColor = isDarkMode() ? "#27273a" : "#e2e8f0";
    const textColor = isDarkMode() ? "#cdd6f4" : "#1e1e2e";
    const histColor = isDarkMode() ? "#89b4fa" : "#2563eb";
    const foreColor = isDarkMode() ? "#f38ba8" : "#dc2626";
    const ciColor = isDarkMode() ? "rgba(243, 139, 168, 0.12)" : "rgba(220, 38, 38, 0.08)";
    const ciBorderColor = isDarkMode() ? "rgba(243, 139, 168, 0.3)" : "rgba(220, 38, 38, 0.2)";
    
    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: "Historical Values",
                    data: histSeries,
                    borderColor: histColor,
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.1
                },
                {
                    label: "ARIMA Forecast",
                    data: foreSeries,
                    borderColor: foreColor,
                    borderDash: [5, 5],
                    backgroundColor: "transparent",
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointStyle: 'rect',
                    tension: 0.1
                },
                {
                    label: "95% CI Lower Bound",
                    data: lowerSeries,
                    borderColor: ciBorderColor,
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false, // Don't fill lower
                    tension: 0.1
                },
                {
                    label: "95% CI Upper Bound",
                    data: upperSeries,
                    borderColor: ciBorderColor,
                    backgroundColor: ciColor,
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: '-1', // Fills down to lower series (dataset index 2)
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: textColor,
                        font: { family: 'Outfit' },
                        // filter out CI boundary legends to keep legend clean
                        filter: (legendItem) => !legendItem.text.includes("Bound")
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: isDarkMode() ? '#1e1e2f' : '#ffffff',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: foreColor,
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit' } }
                }
            }
        }
    });
}

function renderForecastTable() {
    const tbody = document.querySelector("#forecast-data-table tbody");
    tbody.innerHTML = "";
    
    const forecast = forecastResult.forecast;
    for (let i = 0; i < forecast.dates.length; i++) {
        const tr = document.createElement("tr");
        
        const dateTd = document.createElement("td");
        dateTd.innerText = forecast.dates[i];
        tr.appendChild(dateTd);
        
        const valTd = document.createElement("td");
        valTd.innerText = forecast.values[i];
        tr.appendChild(valTd);
        
        const lowTd = document.createElement("td");
        lowTd.innerText = forecast.lower_bounds[i];
        tr.appendChild(lowTd);
        
        const highTd = document.createElement("td");
        highTd.innerText = forecast.upper_bounds[i];
        tr.appendChild(highTd);
        
        tbody.appendChild(tr);
    }
}

/* ==========================================================================
   Exporter & Downloads
   ========================================================================== */
function downloadChartPNG(chartType) {
    const canvasId = chartType === 'historical' ? 'historicalChart' : 'forecastChart';
    const canvas = document.getElementById(canvasId);
    
    // Create temporary anchor
    const link = document.createElement('a');
    link.download = `${currentDataset ? currentDataset.columns[0] : 'water'}_${chartType}_chart.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadMatplotlibPNG() {
    if (!forecastResult || !forecastResult.plot_image) return;
    
    const link = document.createElement('a');
    link.download = `${forecastResult.parameter}_arima_matplotlib.png`;
    link.href = forecastResult.plot_image;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadForecastCSV() {
    if (!forecastResult) return;
    
    const forecast = forecastResult.forecast;
    const parameter = forecastResult.parameter;
    
    // Construct CSV content
    let csvContent = `Forecast Period,Predicted ${parameter},95% CI Lower Limit,95% CI Upper Limit\n`;
    
    for (let i = 0; i < forecast.dates.length; i++) {
        csvContent += `"${forecast.dates[i]}",${forecast.values[i]},${forecast.lower_bounds[i]},${forecast.upper_bounds[i]}\n`;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = `${parameter}_arima_predictions.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
