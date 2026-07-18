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
        
        // Render initial Python correlation chart
        updateCorrelationPlot();
    }
}

function populateDropdowns(columns) {
    const dashSelect = document.getElementById("dashboard-param-select");
    const foreSelect = document.getElementById("forecast-param-select");
    const corrSelect1 = document.getElementById("corr-param-1");
    const corrSelect2 = document.getElementById("corr-param-2");
    
    dashSelect.innerHTML = "";
    foreSelect.innerHTML = "";
    corrSelect1.innerHTML = "";
    corrSelect2.innerHTML = "";
    
    columns.forEach(col => {
        const opt1 = document.createElement("option");
        opt1.value = col;
        opt1.innerText = col;
        dashSelect.appendChild(opt1);
        
        const opt2 = document.createElement("option");
        opt2.value = col;
        opt2.innerText = col;
        foreSelect.appendChild(opt2);
        
        const opt3 = document.createElement("option");
        opt3.value = col;
        opt3.innerText = col;
        corrSelect1.appendChild(opt3);
        
        const opt4 = document.createElement("option");
        opt4.value = col;
        opt4.innerText = col;
        corrSelect2.appendChild(opt4);
    });
    
    // Set default correlation selections (e.g. Rainfall vs Turbidity if available)
    if (columns.length >= 2) {
        corrSelect1.value = columns[0];
        corrSelect2.value = columns[1];
        
        // If we have Rainfall and Turbidity, prefer those as default correlation
        const rainfallCol = columns.find(c => c.toLowerCase().includes("rainfall"));
        const turbidityCol = columns.find(c => c.toLowerCase().includes("turbidity"));
        if (rainfallCol && turbidityCol) {
            corrSelect1.value = rainfallCol;
            corrSelect2.value = turbidityCol;
        }
    }
    
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
/* ==========================================================================
   Manual Data Grid Editor Logic
   ========================================================================== */
function switchUploadTab(tabType) {
    const uploadTabBtn = document.getElementById("btn-tab-upload");
    const manualTabBtn = document.getElementById("btn-tab-manual");
    const dropzone = document.getElementById("dropzone");
    const manualEntryZone = document.getElementById("manual-entry-zone");
    
    if (tabType === 'upload') {
        uploadTabBtn.classList.add("active");
        manualTabBtn.classList.remove("active");
        dropzone.classList.remove("hidden");
        manualEntryZone.classList.add("hidden");
    } else {
        uploadTabBtn.classList.remove("active");
        manualTabBtn.classList.add("active");
        dropzone.classList.add("hidden");
        manualEntryZone.classList.remove("hidden");
        
        // Add default row if table is completely empty
        const tbody = document.getElementById("manual-input-tbody");
        if (tbody.children.length === 0) {
            addManualRow("2026-01-01", "120.0", "7.2", "5.0", "8.5", "2.0");
        }
    }
}

function addManualRow(dateStr = "", rainfall = "", ph = "", turbidity = "", doVal = "", nitrates = "") {
    const tbody = document.getElementById("manual-input-tbody");
    
    // Auto-calculate next date (1 month after last row's date)
    if (!dateStr) {
        if (tbody.children.length > 0) {
            const lastRowDateInput = tbody.lastElementChild.querySelector(".table-input-date");
            const lastDate = new Date(lastRowDateInput.value);
            if (!isNaN(lastDate)) {
                // Add 1 month
                lastDate.setMonth(lastDate.getMonth() + 1);
                // Format back to YYYY-MM-DD
                const y = lastDate.getFullYear();
                const m = String(lastDate.getMonth() + 1).padStart(2, '0');
                const d = String(lastDate.getDate()).padStart(2, '0');
                dateStr = `${y}-${m}-${d}`;
            }
        }
        if (!dateStr) {
            dateStr = "2026-01-01";
        }
    }
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><input type="date" class="table-input-date" value="${dateStr}"></td>
        <td><input type="number" class="table-input-num" step="0.1" placeholder="Rainfall" value="${rainfall}"></td>
        <td><input type="number" class="table-input-num" step="0.01" placeholder="pH" value="${ph}"></td>
        <td><input type="number" class="table-input-num" step="0.1" placeholder="Turbidity" value="${turbidity}"></td>
        <td><input type="number" class="table-input-num" step="0.01" placeholder="DO" value="${doVal}"></td>
        <td><input type="number" class="table-input-num" step="0.01" placeholder="Nitrates" value="${nitrates}"></td>
        <td>
            <button type="button" class="btn-danger" onclick="deleteManualRow(this)" title="Delete Row">
                <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(tr);
    lucide.createIcons();
}

function deleteManualRow(button) {
    const row = button.closest("tr");
    row.remove();
    
    // Add back an empty row if all deleted
    const tbody = document.getElementById("manual-input-tbody");
    if (tbody.children.length === 0) {
        addManualRow();
    }
}

function clearManualTable() {
    const tbody = document.getElementById("manual-input-tbody");
    tbody.innerHTML = "";
    addManualRow();
}

function loadManualTemplateData() {
    const tbody = document.getElementById("manual-input-tbody");
    tbody.innerHTML = "";
    
    const templates = [
        { date: "2026-01-01", rainfall: "45.0", ph: "7.15", turbidity: "3.2", doVal: "9.20", nitrates: "2.10" },
        { date: "2026-02-01", rainfall: "52.0", ph: "7.20", turbidity: "3.5", doVal: "8.90", nitrates: "2.15" },
        { date: "2026-03-01", rainfall: "65.0", ph: "7.10", turbidity: "4.1", doVal: "8.50", nitrates: "2.25" },
        { date: "2026-04-01", rainfall: "120.0", ph: "7.30", turbidity: "8.2", doVal: "7.80", nitrates: "2.50" },
        { date: "2026-05-01", rainfall: "210.0", ph: "6.95", turbidity: "14.5", doVal: "7.10", nitrates: "2.90" },
        { date: "2026-06-01", rainfall: "320.0", ph: "6.80", turbidity: "22.0", doVal: "6.50", nitrates: "3.40" },
        { date: "2026-07-01", rainfall: "290.0", ph: "6.85", turbidity: "19.5", doVal: "6.80", nitrates: "3.20" },
        { date: "2026-08-01", rainfall: "180.0", ph: "7.12", turbidity: "12.2", doVal: "7.30", nitrates: "2.85" },
        { date: "2026-09-01", rainfall: "95.0", ph: "7.22", turbidity: "6.8", doVal: "7.95", nitrates: "2.45" },
        { date: "2026-10-01", rainfall: "50.0", ph: "7.18", turbidity: "4.0", doVal: "8.40", nitrates: "2.20" },
        { date: "2026-11-01", rainfall: "35.0", ph: "7.25", turbidity: "3.1", doVal: "8.95", nitrates: "2.05" },
        { date: "2026-12-01", rainfall: "40.0", ph: "7.21", turbidity: "2.9", doVal: "9.15", nitrates: "2.00" }
    ];
    
    templates.forEach(t => {
        addManualRow(t.date, t.rainfall, t.ph, t.turbidity, t.doVal, t.nitrates);
    });
}

function submitManualData() {
    const tbody = document.getElementById("manual-input-tbody");
    const rows = [];
    
    // Read all rows
    let validationError = false;
    for (let tr of tbody.children) {
        const date = tr.querySelector(".table-input-date").value;
        const rainfall = parseFloat(tr.querySelector("input[placeholder='Rainfall']").value);
        const ph = parseFloat(tr.querySelector("input[placeholder='pH']").value);
        const turbidity = parseFloat(tr.querySelector("input[placeholder='Turbidity']").value);
        const doVal = parseFloat(tr.querySelector("input[placeholder='DO']").value);
        const nitrates = parseFloat(tr.querySelector("input[placeholder='Nitrates']").value);
        
        if (!date || isNaN(rainfall) || isNaN(ph) || isNaN(turbidity) || isNaN(doVal) || isNaN(nitrates)) {
            validationError = true;
            break;
        }
        
        rows.push({
            "Date": date,
            "Average Rainfall (mm)": rainfall,
            "pH": ph,
            "Turbidity (NTU)": turbidity,
            "Dissolved Oxygen (DO) (mg/L)": doVal,
            "Nitrates (mg/L)": nitrates
        });
    }
    
    if (validationError) {
        alert("Please fill in all columns with valid values before submitting.");
        return;
    }
    
    if (rows.length < 5) {
        alert("You must enter at least 5 rows of data for forecasting calculations.");
        return;
    }
    
    // Enable loader
    const spinner = document.getElementById("manual-process-spinner");
    spinner.classList.remove("hidden");
    
    fetch("/api/process-manual", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ "rows": rows })
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(json => { throw new Error(json.error || "Manual data validation failed") });
            }
            return response.json();
        })
        .then(data => {
            handleDatasetResponse(data);
            navigateToSection("section-dashboard");
        })
        .catch(err => {
            alert("Validation Error: " + err.message);
        })
        .finally(() => {
            spinner.classList.add("hidden");
        });
}

/* ==========================================================================
   Python-based Parameter Correlation Analysis
   ========================================================================== */
function updateCorrelationPlot() {
    if (!currentDataset) return;
    
    const param1 = document.getElementById("corr-param-1").value;
    const param2 = document.getElementById("corr-param-2").value;
    
    const plotImg = document.getElementById("correlationPlotImg");
    const spinner = document.getElementById("correlation-spinner");
    const placeholder = document.getElementById("correlation-placeholder");
    
    if (param1 === param2) {
        plotImg.style.display = "none";
        placeholder.style.display = "block";
        alert("Please select two different parameters to analyze correlation.");
        return;
    }
    
    // UI Loading state
    plotImg.style.display = "none";
    placeholder.style.display = "none";
    spinner.classList.remove("hidden");
    
    const payload = {
        dates: currentDataset.dates,
        param1_name: param1,
        param1_values: currentDataset.data[param1],
        param2_name: param2,
        param2_values: currentDataset.data[param2],
        dark_mode: isDarkMode()
    };
    
    fetch("/api/correlation-plot", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(json => { throw new Error(json.error || "Correlation analysis failed") });
            }
            return response.json();
        })
        .then(data => {
            if (data.plot_image) {
                plotImg.src = data.plot_image;
                plotImg.style.display = "block";
            } else {
                placeholder.style.display = "block";
            }
        })
        .catch(err => {
            alert("Correlation Error: " + err.message);
            placeholder.style.display = "block";
        })
        .finally(() => {
            spinner.classList.add("hidden");
        });
}

function downloadCorrelationPNG() {
    const plotImg = document.getElementById("correlationPlotImg");
    if (!plotImg || !plotImg.src) {
        alert("Please generate a correlation plot first.");
        return;
    }
    
    const param1 = document.getElementById("corr-param-1").value;
    const param2 = document.getElementById("corr-param-2").value;
    
    const link = document.createElement('a');
    link.download = `correlation_${param1}_vs_${param2}.png`;
    link.href = plotImg.src;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/* ==========================================================================
   A4 PDF Report Print Generator
   ========================================================================== */
function exportPDFReport() {
    window.print();
}

