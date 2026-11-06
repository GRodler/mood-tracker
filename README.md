# 🌤️ vibe — personal mood tracker

A minimal, mobile-first mood tracker that stores data in [Supabase](https://supabase.com) and runs as a static site on GitHub Pages. No build step, no frameworks — just HTML, CSS and JavaScript.

![HTML](https://img.shields.io/badge/HTML-5-orange) ![CSS](https://img.shields.io/badge/CSS-3-blue) ![JS](https://img.shields.io/badge/JavaScript-ES2020-yellow)

---

## Setup

### 1. Create a Supabase project

If you haven't already, create a free project at [supabase.com](https://supabase.com).

Create a table called `moods` with these columns:

| Column       | Type      | Notes                        |
|-------------|-----------|------------------------------|
| `id`        | `uuid`    | Primary key, default `gen_random_uuid()` |
| `day`       | `date`    | Unique constraint            |
| `mood`      | `numeric` | 0–10                         |
| `note`      | `text`    | Nullable, max 500 chars      |
| `created_at`| `timestamptz` | Default `now()`          |

Enable **Row Level Security** and create policies that allow the **anon** role to `SELECT`, `INSERT`, and `UPDATE` (but **not** `DELETE`).

### 2. Fill in `config.js`

Open `config.js` and replace the placeholder values with your Supabase project URL and **anon/public** key:

```js
const SUPABASE_URL = "https://xyzxyz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJI...";
```

You'll find these in **Supabase → Project Settings → API**.

> ⚠️ **Never** put your `service_role` key in this file. It must stay secret and server-side only.

### 3. Run locally

No build step needed. Just serve the files:

```bash
# Option A: open the file directly
open index.html          # macOS
xdg-open index.html      # Linux

# Option B: local HTTP server (recommended for CORS)
python3 -m http.server 8000
# then visit http://localhost:8000
```

### 4. Deploy on GitHub Pages

1. Push all files to a GitHub repository (the `main` branch, root folder).
2. Go to **Settings → Pages**.
3. Under **Source**, select **Deploy from a branch**.
4. Choose **main** branch, **/ (root)** folder.
5. Click **Save**. Your site will be live at `https://<username>.github.io/<repo>/` in a minute or two.

---

## Security note

> **There is no login.** The site uses the Supabase anon key directly from the browser. This means **anyone who has access to the site (or inspects the key in the source code) can read and write mood entries**. This is fine for personal use on a private repo, but be aware the data is not private if the site or the key is shared.

---

## Files

| File         | Purpose                                      |
|-------------|----------------------------------------------|
| `index.html` | Page structure                               |
| `style.css`  | All styling (light + dark mode)              |
| `app.js`     | UI logic: form, chart (Chart.js), stats      |
| `db.js`      | Supabase wrapper — the only file that talks to the database |
| `config.js`  | Your Supabase URL and anon key (git-ignore this if your repo is public) |

---

## License
This is just a test to see if the deploy now works 
MIT — do whatever you want with it.
