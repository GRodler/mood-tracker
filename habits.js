// ─── habits.js ───────────────────────────────────────────────────────
// UI logic for Habit Tracking: habit creation, check-ins, streak calculations.
// All database work is done via db.js (loadHabits, createHabit, archiveHabit,
// loadHabitLogs, setHabitDone, backfillHabitStreak).
// ─────────────────────────────────────────────────────────────────────

// ─── Pure Streak Calculation Logic ─────────────────────────────────

/**
 * Compute current and best streak for a habit.
 * Pure function: takes a Set of ISO date strings (done = true) and today's ISO date string.
 *
 * Streak rules:
 * - current streak = number of consecutive days ending TODAY if today is done;
 *   if today is NOT done, count consecutive days ending YESTERDAY (the streak is
 *   still alive until today ends). If neither today nor yesterday is done, current = 0.
 * - best streak = longest run of consecutive days anywhere in the set.
 * - All date calculations use local Date objects (new Date(y, m-1, d)) to avoid DST/midnight bugs.
 *
 * @param {Set<string>|string[]} doneDays - Set or array of "YYYY-MM-DD" strings where done = true
 * @param {string} todayStr - today's date "YYYY-MM-DD" in local time
 * @returns {{ current: number, best: number }}
 */
function computeStreaks(doneDays, todayStr) {
  if (!doneDays) {
    return { current: 0, best: 0 };
  }

  const set = doneDays instanceof Set ? doneDays : new Set(doneDays);
  if (set.size === 0) {
    return { current: 0, best: 0 };
  }

  function parseLocal(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function toLocalISO(d) {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function shift(d, offsetDays) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays);
  }

  const todayDate = parseLocal(todayStr);

  // 1. Current streak
  let current = 0;
  const todayDone = set.has(todayStr);
  const yesterdayStr = toLocalISO(shift(todayDate, -1));
  const yesterdayDone = set.has(yesterdayStr);

  if (todayDone) {
    let checkDate = todayDate;
    while (set.has(toLocalISO(checkDate))) {
      current++;
      checkDate = shift(checkDate, -1);
    }
  } else if (yesterdayDone) {
    let checkDate = shift(todayDate, -1);
    while (set.has(toLocalISO(checkDate))) {
      current++;
      checkDate = shift(checkDate, -1);
    }
  } else {
    current = 0;
  }

  // 2. Best streak: longest consecutive run anywhere in the set
  const sortedDates = Array.from(set).sort();
  let best = 0;
  let run = 0;
  let prevDate = null;

  for (let i = 0; i < sortedDates.length; i++) {
    const iso = sortedDates[i];
    const d = parseLocal(iso);

    if (prevDate) {
      const expected = toLocalISO(shift(prevDate, 1));
      if (iso === expected) {
        run++;
      } else {
        run = 1;
      }
    } else {
      run = 1;
    }

    prevDate = d;
    if (run > best) {
      best = run;
    }
  }

  if (current > best) {
    best = current;
  }

  return { current, best };
}

// Expose computeStreaks on window for testing
window.computeStreaks = computeStreaks;

// ─── DOM References ────────────────────────────────────────────────
const formHabit           = document.getElementById("form-habit");
const inputHabitName      = document.getElementById("input-habit-name");
const checkExistingStreak = document.getElementById("check-existing-streak");
const streakDaysGroup     = document.getElementById("streak-days-group");
const inputStreakDays     = document.getElementById("input-streak-days");
const btnAddHabit         = document.getElementById("btn-add-habit");
const habitFeedback       = document.getElementById("habit-feedback");
const habitList           = document.getElementById("habit-list");
const habitsEmptyState    = document.getElementById("habits-empty-state");

// ─── State ─────────────────────────────────────────────────────────
let habits = [];                      // non-archived habits
let logsByHabit = new Map();          // Map<habitId, Set<day>>

// ─── Feedback helper ───────────────────────────────────────────────
let habitFeedbackTimer = null;
function showHabitFeedback(msg, success) {
  habitFeedback.textContent = msg;
  habitFeedback.className = "save-feedback " + (success ? "success" : "error");
  clearTimeout(habitFeedbackTimer);
  habitFeedbackTimer = setTimeout(() => {
    habitFeedback.textContent = "";
    habitFeedback.className = "save-feedback";
  }, 3000);
}

// ─── Date arithmetic helpers ───────────────────────────────────────
function parseLocalDate(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftLocalDate(dateObj, offsetDays) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + offsetDays);
}

function formatLocalDateStr(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Streak & Dots rendering helpers ───────────────────────────────

function updateStreakDisplay(currentEl, bestEl, doneDays, today) {
  const { current, best } = computeStreaks(doneDays, today);
  currentEl.textContent = `🔥 ${current}`;
  bestEl.textContent = `best: ${best}`;
}

function updateDotsDisplay(dotsContainer, doneDays, today) {
  dotsContainer.innerHTML = "";
  const todayDate = parseLocalDate(today);

  // Mini row of last 7 days (from today - 6 up to today)
  for (let offset = 6; offset >= 0; offset--) {
    const d = shiftLocalDate(todayDate, -offset);
    const dayISO = formatLocalDateStr(d);
    const isDone = doneDays.has(dayISO);
    const isToday = offset === 0;

    const dot = document.createElement("span");
    dot.className = "habit-dot" + (isDone ? " done" : "") + (isToday ? " today" : "");

    // e.g. "11 Nov: completed" or "10 Nov: not done"
    const label = shortDate ? shortDate(dayISO) : dayISO;
    dot.title = `${label} (${isToday ? "Today" : ""}): ${isDone ? "Completed" : "Not done"}`;

    dotsContainer.appendChild(dot);
  }
}

// ─── Render Habit List ─────────────────────────────────────────────

/**
 * Helper to update the Brain visualization using current habits and streaks.
 * Wrapped in try/catch to ensure brain rendering never interrupts habit workflows.
 */
function updateBrainDisplay() {
  if (typeof renderBrain !== "function") return;
  try {
    const today = todayISO();
    const streaksByHabitId = new Map();
    habits.forEach(h => {
      const doneDays = logsByHabit.get(h.id) || new Set();
      streaksByHabitId.set(h.id, computeStreaks(doneDays, today));
    });
    renderBrain(habits, streaksByHabitId);
  } catch (err) {
    console.error("renderBrain failed:", err);
  }
}
window.callRenderBrain = updateBrainDisplay;

function renderHabits() {
  habitList.innerHTML = "";

  if (habits.length === 0) {
    habitsEmptyState.style.display = "block";
    habitList.style.display = "none";
    updateBrainDisplay();
    return;
  }

  habitsEmptyState.style.display = "none";
  habitList.style.display = "flex";

  const today = todayISO();

  habits.forEach(habit => {
    const doneDays = logsByHabit.get(habit.id) || new Set();
    const isDoneToday = doneDays.has(today);

    // Row container
    const item = document.createElement("div");
    item.className = "habit-item";

    // Main row: Checkbox, Name, Streaks, Archive button
    const mainRow = document.createElement("div");
    mainRow.className = "habit-main-row";

    // Checkbox for today
    const checkWrap = document.createElement("label");
    checkWrap.className = "habit-check-wrap";
    const checkToday = document.createElement("input");
    checkToday.type = "checkbox";
    checkToday.className = "habit-check";
    checkToday.checked = isDoneToday;
    checkToday.setAttribute("aria-label", `Mark ${habit.name} done for today`);
    checkWrap.appendChild(checkToday);

    // Habit name (using textContent for XSS safety)
    const nameEl = document.createElement("span");
    nameEl.className = "habit-name";
    nameEl.textContent = habit.name;

    // Streak display
    const streakEl = document.createElement("div");
    streakEl.className = "habit-streak";
    const currentSpan = document.createElement("span");
    currentSpan.className = "streak-current";
    const bestSpan = document.createElement("span");
    bestSpan.className = "streak-best";
    streakEl.appendChild(currentSpan);
    streakEl.appendChild(bestSpan);

    // Archive button
    const btnArchive = document.createElement("button");
    btnArchive.type = "button";
    btnArchive.className = "btn-archive";
    btnArchive.textContent = "Archive";
    btnArchive.title = `Archive ${habit.name}`;

    mainRow.appendChild(checkWrap);
    mainRow.appendChild(nameEl);
    mainRow.appendChild(streakEl);
    mainRow.appendChild(btnArchive);

    // Secondary row: 7-day consistency dots
    const dotsWrap = document.createElement("div");
    dotsWrap.className = "habit-dots-wrap";

    const dotsLabel = document.createElement("span");
    dotsLabel.className = "habit-dots-label";
    dotsLabel.textContent = "Last 7 days:";

    const dotsContainer = document.createElement("div");
    dotsContainer.className = "habit-dots";

    dotsWrap.appendChild(dotsLabel);
    dotsWrap.appendChild(dotsContainer);

    item.appendChild(mainRow);
    item.appendChild(dotsWrap);
    habitList.appendChild(item);

    // Initial render of streak and dots
    updateStreakDisplay(currentSpan, bestSpan, doneDays, today);
    updateDotsDisplay(dotsContainer, doneDays, today);

    // ─── Event: Toggle Today Checkbox (Optimistic Update) ───
    checkToday.addEventListener("change", async () => {
      const isChecked = checkToday.checked;

      // 1. Optimistic in-memory update
      if (isChecked) {
        doneDays.add(today);
      } else {
        doneDays.delete(today);
      }

      // 2. Instant UI update
      updateStreakDisplay(currentSpan, bestSpan, doneDays, today);
      updateDotsDisplay(dotsContainer, doneDays, today);
      updateBrainDisplay();

      // 3. Persist to Supabase via db.js
      try {
        await setHabitDone(habit.id, today, isChecked);
      } catch (err) {
        console.error("Failed to update habit check-in:", err);
        // Revert on failure
        if (isChecked) {
          doneDays.delete(today);
        } else {
          doneDays.add(today);
        }
        checkToday.checked = !isChecked;
        updateStreakDisplay(currentSpan, bestSpan, doneDays, today);
        updateDotsDisplay(dotsContainer, doneDays, today);
        updateBrainDisplay();
        showHabitFeedback("Could not update habit: " + err.message, false);
      }
    });

    // ─── Event: Archive Habit ──────────────────────────────
    btnArchive.addEventListener("click", async () => {
      if (!confirm(`Archive habit "${habit.name}"?`)) {
        return;
      }

      btnArchive.disabled = true;
      try {
        await archiveHabit(habit.id);
        showHabitFeedback("✓ Habit archived", true);
        await refreshHabits();
      } catch (err) {
        console.error("Failed to archive habit:", err);
        showHabitFeedback("Could not archive: " + err.message, false);
        btnArchive.disabled = false;
      }
    });
  });

  // Update Brain neural pathways and legend
  updateBrainDisplay();
}

// ─── Data Loading & Refresh ────────────────────────────────────────

/**
 * Load habits and their completed logs from Supabase,
 * group logs by habit_id once, and render the list.
 */
async function refreshHabits() {
  try {
    const [loadedHabits, loadedLogs] = await Promise.all([
      loadHabits(),
      loadHabitLogs(),
    ]);

    habits = loadedHabits;

    // Group logs by habit_id once after loading (Map<habit_id, Set<day>>)
    const map = new Map();
    habits.forEach(h => map.set(h.id, new Set()));

    loadedLogs.forEach(log => {
      if (log.done) {
        let set = map.get(log.habit_id);
        if (!set) {
          set = new Set();
          map.set(log.habit_id, set);
        }
        set.add(log.day);
      }
    });

    logsByHabit = map;
    renderHabits();
  } catch (err) {
    console.error("Failed to load habits:", err);
    showHabitFeedback("Could not load habits: " + err.message, false);
  }
}

// Expose refreshHabits globally for app.js and manual triggering
window.refreshHabits = refreshHabits;

// ─── Add Habit Form Handling ───────────────────────────────────────

// Toggle the streak input visibility when the checkbox is toggled
checkExistingStreak.addEventListener("change", () => {
  const isChecked = checkExistingStreak.checked;
  streakDaysGroup.style.display = isChecked ? "block" : "none";
  if (isChecked) {
    inputStreakDays.focus();
  }
});

// Form submit: create habit and optionally backfill streak
formHabit.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = inputHabitName.value.trim();
  if (!name) {
    showHabitFeedback("Please enter a habit name.", false);
    return;
  }
  if (name.length > 60) {
    showHabitFeedback("Habit name must be 60 characters or less.", false);
    return;
  }

  const hasStreak = checkExistingStreak.checked;
  const streakDays = hasStreak ? parseInt(inputStreakDays.value, 10) : 0;

  if (hasStreak && (isNaN(streakDays) || streakDays < 1 || streakDays > 3650)) {
    showHabitFeedback("Streak must be between 1 and 3650 days.", false);
    return;
  }

  btnAddHabit.disabled = true;

  try {
    const savedHabit = await createHabit(name);

    if (hasStreak && streakDays > 0) {
      await backfillHabitStreak(savedHabit.id, streakDays);
    }

    // Reset form
    inputHabitName.value = "";
    checkExistingStreak.checked = false;
    streakDaysGroup.style.display = "none";
    inputStreakDays.value = "1";

    showHabitFeedback("✓ Habit added!", true);
    await refreshHabits();
  } catch (err) {
    console.error("Failed to add habit:", err);
    showHabitFeedback("Could not add habit: " + err.message, false);
  } finally {
    btnAddHabit.disabled = false;
  }
});

// ─── Boot ──────────────────────────────────────────────────────────
refreshHabits();
