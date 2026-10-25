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
