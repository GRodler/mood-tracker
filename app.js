// ─── app.js ─────────────────────────────────────────────────────────
// UI logic: wires up the form, draws the chart, computes stats.
// All database work is done through db.js (loadEntries, saveEntry, loadEntryByDay).
// ─────────────────────────────────────────────────────────────────────

// ─── DOM references ────────────────────────────────────────────────
const inputDate    = document.getElementById("input-date");
const inputMood    = document.getElementById("input-mood");
const moodDisplay  = document.getElementById("mood-display");
const inputNote    = document.getElementById("input-note");
const charCurrent  = document.getElementById("char-current");
const btnSave      = document.getElementById("btn-save");
const saveFeedback = document.getElementById("save-feedback");
const chartScroll  = document.getElementById("chart-scroll");
const chartInner   = document.getElementById("chart-inner");
const emptyState   = document.getElementById("empty-state");

// Stat elements
const statAvg    = document.getElementById("stat-avg");
const statAvg7   = document.getElementById("stat-avg7");
const statCount  = document.getElementById("stat-count");
const statBest   = document.getElementById("stat-best");
const statLow    = document.getElementById("stat-low");
const statDanger = document.getElementById("stat-danger");

// ─── State ─────────────────────────────────────────────────────────
let entries = [];       // all mood entries, kept in sync
let moodChart = null;   // Chart.js instance (created once, updated later)

// ─── Helpers ───────────────────────────────────────────────────────

/** Return today's date as an ISO string (YYYY-MM-DD) in the local timezone. */
function todayISO() {
  const d = new Date();
  // Avoid UTC shifting by manually building the string
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Format an ISO date string like "25 Oct" for the chart X-axis. */
function shortDate(isoStr) {
  const d = new Date(isoStr + "T00:00:00"); // force local midnight
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Format an ISO date string like "25 Oct 2026" for tooltips / stats. */
function longDate(isoStr) {
  const d = new Date(isoStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Round a number to 1 decimal place. */
function round1(n) {
  return Math.round(n * 10) / 10;
}

// ─── Initialisation ────────────────────────────────────────────────

// Set the date picker to today on load.
inputDate.value = todayISO();

// When the slider moves, update the big number beside it.
inputMood.addEventListener("input", () => {
  moodDisplay.textContent = inputMood.value;
});

// Live character counter for the note field.
inputNote.addEventListener("input", () => {
  charCurrent.textContent = inputNote.value.length;
});

// ─── Pre-fill form when changing date ──────────────────────────────
// If the user picks a date that already has an entry, fill in its values.
inputDate.addEventListener("change", async () => {
  const day = inputDate.value;
  if (!day) return;

  try {
    const existing = await loadEntryByDay(day);
    if (existing) {
      inputMood.value = existing.mood;
      moodDisplay.textContent = existing.mood;
      inputNote.value = existing.note || "";
      charCurrent.textContent = (existing.note || "").length;
    } else {
      // Reset to defaults for a new day
      inputMood.value = 5;
      moodDisplay.textContent = "5";
      inputNote.value = "";
      charCurrent.textContent = "0";
    }
  } catch (err) {
    // Silently ignore — form still works, just no pre-fill
    console.warn("Could not pre-fill:", err.message);
  }
});

// ─── Save handler ──────────────────────────────────────────────────
btnSave.addEventListener("click", async () => {
  const day  = inputDate.value;
  const mood = parseFloat(inputMood.value);
  const note = inputNote.value.trim().slice(0, 500); // enforce max length

  if (!day) {
    showFeedback("Please pick a date.", false);
    return;
  }

  btnSave.disabled = true;
  try {
    await saveEntry(day, mood, note);
    showFeedback("✓ Saved!", true);

    // Reload all data so the chart and stats reflect the change.
    await refreshAll();
  } catch (err) {
    console.error("Save failed:", err);
    showFeedback("Error: " + err.message, false);
  } finally {
    btnSave.disabled = false;
  }
});

/** Show a temporary success/error message under the Save button. */
function showFeedback(msg, success) {
  saveFeedback.textContent = msg;
  saveFeedback.className = "save-feedback " + (success ? "success" : "error");
  // Fade out after 3 seconds
  clearTimeout(showFeedback._timer);
  showFeedback._timer = setTimeout(() => {
    saveFeedback.textContent = "";
    saveFeedback.className = "save-feedback";
  }, 3000);
}

// ─── Data loading & refresh ────────────────────────────────────────

/** Reload entries from the database, then update the chart and stats. */
async function refreshAll() {
  try {
    entries = await loadEntries();
    updateStats(entries);
    updateChart(entries);
  } catch (err) {
    console.error("Failed to load entries:", err);
    showFeedback("Could not load data: " + err.message, false);
  }
}

// ─── Stats ─────────────────────────────────────────────────────────

function updateStats(data) {
  if (data.length === 0) {
    statAvg.textContent    = "—";
    statAvg7.textContent   = "—";
    statCount.textContent  = "0";
    statBest.textContent   = "—";
    statLow.textContent    = "—";
    statDanger.textContent = "0";
    return;
  }

  // All-time average
  const avg = data.reduce((s, e) => s + e.mood, 0) / data.length;
  statAvg.textContent = round1(avg);

  // Last-7-days average (by most recent 7 entries, not calendar days)
  const last7 = data.slice(-7);
  const avg7 = last7.reduce((s, e) => s + e.mood, 0) / last7.length;
  statAvg7.textContent = round1(avg7);

  // Count
  statCount.textContent = data.length;

  // Best day (highest mood)
  const best = data.reduce((a, b) => (b.mood > a.mood ? b : a));
  statBest.textContent = shortDate(best.day);

  // Lowest day
  const low = data.reduce((a, b) => (b.mood < a.mood ? b : a));
  statLow.textContent = shortDate(low.day);

  // Danger days: mood ≤ 4  OR  mood ≥ 8 (outside the safe 4–8 band)
  const dangerCount = data.filter(e => e.mood <= 4 || e.mood >= 8).length;
  statDanger.textContent = dangerCount;
}

// ─── Chart ─────────────────────────────────────────────────────────

/**
 * Chart.js plugin: paints coloured horizontal bands behind the chart.
 *   0–4  → transparent red   (danger zone — too low)
 *   4–8  → transparent green (safe zone)
 *   8–10 → transparent red   (danger zone — too high)
 */
const zoneBackgroundPlugin = {
  id: "zoneBackground",
  beforeDraw(chart) {
    const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;

    // Helper: fill a horizontal band between two mood values
    function fillBand(low, high, colour) {
      const yTop    = y.getPixelForValue(high);
      const yBottom = y.getPixelForValue(low);
      ctx.fillStyle = colour;
      ctx.fillRect(left, yTop, right - left, yBottom - yTop);
    }

    ctx.save();
    fillBand(0, 4,  "rgba(214, 60, 60, 0.08)");   // red — low mood danger
    fillBand(4, 8,  "rgba(46, 158, 90, 0.08)");    // green — safe zone
    fillBand(8, 10, "rgba(214, 60, 60, 0.08)");    // red — high mood danger
    ctx.restore();
  }
};

Chart.register(zoneBackgroundPlugin);

/**
 * Chart.js plugin: draws a dashed horizontal line at the mean mood.
 * Registered only once; it reads the mean from the chart's options.
 */
const meanLinePlugin = {
  id: "meanLine",
  afterDraw(chart) {
    const mean = chart.options.plugins.meanLine?.value;
    if (mean == null) return;

    const yScale = chart.scales.y;
    const yPixel = yScale.getPixelForValue(mean);

    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(242, 145, 0, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.moveTo(chart.chartArea.left, yPixel);
    ctx.lineTo(chart.chartArea.right, yPixel);
    ctx.stroke();
    ctx.restore();
  }
};

// Register the plugin globally so every chart instance uses it.
Chart.register(meanLinePlugin);

/** Detect if dark mode is active for chart text/grid colours. */
function isDarkMode() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function chartColors() {
  const dark = isDarkMode();
  return {
    text:  dark ? "#c8c8c8" : "#555",
    grid:  dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
    point: dark ? "#fdb644" : "#F29100",
    bg:    dark ? "#26262b" : "#ffffff",
  };
}

/**
 * Create or update the Chart.js line chart.
 * The canvas sits inside a horizontally-scrollable wrapper.
 */
function updateChart(data) {
  const canvas = document.getElementById("mood-chart");

  // Show/hide empty state
  if (data.length === 0) {
    emptyState.style.display = "block";
    chartInner.style.display = "none";
    if (moodChart) { moodChart.destroy(); moodChart = null; }
    return;
  }
  emptyState.style.display = "none";
  chartInner.style.display = "block";

  // Compute the inner width: at least the viewport, or days * 56px
  const dayWidth = 56; // pixels per day point
  const minWidth = Math.max(chartScroll.clientWidth, data.length * dayWidth);
  chartInner.style.width = minWidth + "px";

  // Prepare data arrays
  const labels = data.map(e => shortDate(e.day));
  const moods  = data.map(e => e.mood);
  const notes  = data.map(e => e.note || "");
  const days   = data.map(e => e.day); // ISO strings for tooltip

  // Mean mood for the dashed line
  const mean = data.reduce((s, e) => s + e.mood, 0) / data.length;

  const colors = chartColors();

  // Build configuration
  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Mood",
        data: moods,
        borderColor: "#F29100",
        backgroundColor: "rgba(242, 145, 0, 0.12)",
        pointBackgroundColor: colors.point,
        pointBorderColor: colors.point,
        pointRadius: 5,
        pointHoverRadius: 8,
        borderWidth: 2.5,
        tension: 0.35,         // slight smoothing for a hand-drawn feel
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,   // fixed height in CSS (320px)
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.bg,
          titleColor: colors.text,
          bodyColor: colors.text,
          borderColor: "#F29100",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title(items) {
              // Show the full date
              const idx = items[0].dataIndex;
              return longDate(days[idx]);
            },
            label(item) {
              return "Mood: " + item.raw;
            },
            afterLabel(item) {
              const n = notes[item.dataIndex];
              return n ? "📝 " + n : "";
            },
          },
        },
        // Custom plugin option: pass the mean value
        meanLine: {
          value: round1(mean),
        },
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          ticks: {
            stepSize: 2,
            color: colors.text,
            font: { size: 12 },
          },
          grid: {
            color: colors.grid,
          },
          border: { display: false },
        },
        x: {
          ticks: {
            color: colors.text,
            font: { size: 11 },
            maxRotation: 45,
            minRotation: 0,
          },
          grid: { display: false },
          border: { display: false },
        },
      },
    },
  };

  // Create or update
  if (moodChart) {
    // Update existing chart in-place
    moodChart.data.labels = labels;
    moodChart.data.datasets[0].data = moods;
    moodChart.options.plugins.meanLine.value = round1(mean);
    // Refresh tooltip closure data
    moodChart.options.plugins.tooltip.callbacks.title = config.options.plugins.tooltip.callbacks.title;
    moodChart.options.plugins.tooltip.callbacks.afterLabel = config.options.plugins.tooltip.callbacks.afterLabel;
    // Update colours (in case dark mode toggled)
    const c = chartColors();
    moodChart.options.scales.y.ticks.color = c.text;
    moodChart.options.scales.y.grid.color  = c.grid;
    moodChart.options.scales.x.ticks.color = c.text;
    moodChart.data.datasets[0].pointBackgroundColor = c.point;
    moodChart.data.datasets[0].pointBorderColor = c.point;
    moodChart.options.plugins.tooltip.backgroundColor = c.bg;
    moodChart.options.plugins.tooltip.titleColor = c.text;
    moodChart.options.plugins.tooltip.bodyColor  = c.text;
    moodChart.update();
  } else {
    moodChart = new Chart(canvas, config);
  }

  // Scroll the wrapper to the far right so the most recent day is visible
  requestAnimationFrame(() => {
    chartScroll.scrollLeft = chartScroll.scrollWidth;
  });
}

// ─── Dark-mode change listener ─────────────────────────────────────
// Re-render the chart when the user toggles system dark mode.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (entries.length) updateChart(entries);
});

// ─── Boot ──────────────────────────────────────────────────────────
// Load data as soon as the page is ready.
refreshAll();
