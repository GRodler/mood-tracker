// ─── db.js ──────────────────────────────────────────────────────────
// This file is the ONLY place that talks to Supabase.
// app.js calls loadEntries() and saveEntry() — nothing else.
// If you ever swap Supabase for another backend, only this file changes.
// ─────────────────────────────────────────────────────────────────────

// Create a single Supabase client that the rest of the file uses.
// supabase-js is loaded from a CDN <script> tag before this file runs,
// so `supabase` is available as a global.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Load every mood entry, sorted oldest → newest.
 * Returns an array of objects: { id, day, mood, note, created_at }
 * Throws on network / permission errors.
 */
async function loadEntries() {
  const { data, error } = await supabaseClient
    .from("moods")
    .select("*")
    .order("day", { ascending: true });

  if (error) throw error;   // let the caller show an error message
  return data;               // [] if no rows yet
}

/**
 * Save (or update) a mood entry.
 *
 * @param {string} day   – ISO date string like "2026-10-25"
 * @param {number} mood  – 0 to 10, steps of 0.5
 * @param {string} note  – optional text, max 500 chars
 *
 * Uses UPSERT with onConflict:"day" so saving the same date twice
 * updates the existing row instead of creating a duplicate.
 * Returns the saved row.
 */
async function saveEntry(day, mood, note) {
  const { data, error } = await supabaseClient
    .from("moods")
    .upsert(
      { day, mood, note },
      { onConflict: "day" }          // "day" column has a unique constraint
    )
    .select()                        // return the saved row so we can use it
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load a single entry for a specific date.
 * Returns the entry object, or null if nothing is logged for that day.
 */
async function loadEntryByDay(day) {
  const { data, error } = await supabaseClient
    .from("moods")
    .select("*")
    .eq("day", day)
    .maybeSingle();                  // returns null instead of erroring when 0 rows

  if (error) throw error;
  return data;
}

// ─── Habit Tracking Functions ────────────────────────────────────────

/**
 * Format a Date object to YYYY-MM-DD in the local timezone.
 * Helper for habit date arithmetic avoiding timezone bugs.
 *
 * @param {Date} d
 * @returns {string}
 */
function formatLocalDate(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Load all non-archived habits, sorted oldest first (created_at ascending).
 * Returns an array of habit objects: { id, name, archived, created_at }
 * Throws on network / permission errors.
 */
async function loadHabits() {
  const { data, error } = await supabaseClient
    .from("habits")
    .select("*")
    .eq("archived", false)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Create a new habit.
 *
 * @param {string} name - habit name, 1 to 60 characters
 * Returns the saved habit row.
 */
async function createHabit(name) {
  const { data, error } = await supabaseClient
    .from("habits")
    .insert({ name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Archive a habit by setting archived = true.
 * Note: Habits are never hard-deleted because the anon role has no DELETE permission.
 *
 * @param {string} habitId - UUID of the habit
 * Returns the updated habit row.
 */
async function archiveHabit(habitId) {
  const { data, error } = await supabaseClient
    .from("habits")
    .update({ archived: true })
    .eq("id", habitId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load all habit logs where done = true.
 * Paginates in a loop using .range() (max 1000 rows per request) until fewer
 * rows than the page size are returned.
 *
 * Returns an array of log objects: { id, habit_id, day, done, created_at }
 */
async function loadHabitLogs() {
  const allLogs = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from("habit_logs")
      .select("*")
      .eq("done", true)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allLogs.push(...data);
    }
    if (!data || data.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return allLogs;
}

/**
 * Record or update a habit check-in for a specific day.
 * Uses upsert with onConflict: "habit_id,day".
 * Undoing a check-in sets done = false (no DELETE used).
 *
 * @param {string} habitId - UUID of the habit
 * @param {string} day - ISO date string "YYYY-MM-DD"
 * @param {boolean} done - true if completed, false if undone
 * Returns the saved row.
 */
async function setHabitDone(habitId, day, done) {
  const { data, error } = await supabaseClient
    .from("habit_logs")
    .upsert(
      { habit_id: habitId, day, done },
      { onConflict: "habit_id,day" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Bulk backfill done = true rows for `days` days BEFORE today
 * (yesterday back to today - days), in a single upsert call.
 * Uses local dates to avoid timezone/DST bugs.
 *
 * @param {string} habitId - UUID of the habit
 * @param {number} days - number of days to backfill (min 1)
 * Returns the array of saved rows.
 */
async function backfillHabitStreak(habitId, days) {
  if (!days || days <= 0) return [];

  const rows = [];
  const now = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    rows.push({
      habit_id: habitId,
      day: formatLocalDate(d),
      done: true,
    });
  }

  const { data, error } = await supabaseClient
    .from("habit_logs")
    .upsert(rows, { onConflict: "habit_id,day" })
    .select();

  if (error) throw error;
  return data;
}
