# PVC Pipe Readings Dashboard — Deploy Guide

This is an exact clone of your Water Meter dashboard — same login, same design,
same map/analytics/red-flags/chat/tasks — repointed at the **Kharif 26 – PVC Pipes**
Kobo form. A "meter" is now a "pipe"; the reading is the pipe water level (mm).

**Verified before shipping:** `next build` passes (all 40 routes) and every field
was extracted correctly from your real submissions (pipe `MU_10068A`, level `100` mm,
surveyor `Khaushik`, village `Lang`, GPS, date, both photos).

---

## Why a fresh repo (not the old awd-pipe-readings)

Your old `awd-pipe-readings` project was the simple 4-tab app with a *different*
file layout. Uploading this clone on top of it would leave stale files behind and
cause conflicts. Cleanest path: **new repo + new Vercel project**, reusing the same
MongoDB and Kobo credentials. You can delete the old project afterwards.

The database is isolated: this app writes to a **`pipe_readings`** database inside
your existing cluster, so your water-meter data is never touched.

---

## Step 1 — New GitHub repo

1. https://github.com/new
2. Name: `pvc-pipe-readings`
3. Private. Do **not** initialise with README/.gitignore/license.
4. Create repository → keep the page open.

## Step 2 — Upload the files

1. Unzip `pvc-pipe-readings.zip` on your computer.
2. On the repo page → **uploading an existing file**.
3. Go **inside** the unzipped folder, select **everything inside** (Ctrl/Cmd+A) —
   `app/`, `components/`, `lib/`, `public/`, `package.json`, etc.
4. Drag them into GitHub → commit message `Initial commit` → **Commit changes**.
5. Verify the repo top level shows `app/ components/ lib/ public/ package.json …`
   (not a single wrapping folder).

## Step 3 — Import to Vercel

1. https://vercel.com/dashboard → **Add New… → Project**.
2. Import `pvc-pipe-readings`. Framework auto-detects as **Next.js**.
3. **Before deploying**, expand **Environment Variables** and add these 6:

| Key | Value |
|---|---|
| `MONGODB_URI` | your URI, but end the host with **`/pipe_readings`** before the `?` |
| `KOBO_API_TOKEN` | `cfda7c6ec2ad5c686e180747c4c005995710445a` |
| `KOBO_ASSET_UID` | `aytG3bjuzKg92S3QihTJ6J` |
| `KOBO_BASE_URL` | `https://kf.kobotoolbox.org` |
| `ADMIN_PASSWORD` | a strong admin password you choose |
| `WEBHOOK_SECRET` | `rgUX8gE2NV8yZrKmuuP5lxOHyw5L6v461ygID9wX` |

   Your `MONGODB_URI` should read:
   ```
   mongodb+srv://frd_user:YOUR_PASSWORD@cluster0.njbpaso.mongodb.net/pipe_readings?retryWrites=true&w=majority&appName=Cluster0
   ```
   (only the `/pipe_readings` database name differs from your water-meter URI)

4. **Deploy**. Wait ~2 minutes for ✓ Compiled successfully.

## Step 4 — First look

1. Open the Vercel URL. You'll see the **landing page** (same Digital Village /
   AWD project info).
2. Click **Log in**, enter your `ADMIN_PASSWORD` → you're in as admin.
3. Data loads automatically from Kobo (cached 30s). Tap **↻ Refresh** in the top
   bar to force a fresh pull.

## Step 5 — Webhook (instant auto-updates)

1. In KoboToolbox → open the PVC Pipes form → **Settings → REST Services**.
2. You already have one failing service from before — click its ✏️ edit (or delete
   it and **Register a new service**).
3. Set the Endpoint URL to:
   ```
   https://YOUR-NEW-VERCEL-URL.vercel.app/api/webhook?secret=rgUX8gE2NV8yZrKmuuP5lxOHyw5L6v461ygID9wX
   ```
4. Type: JSON. Save.
5. Test: submit a form in Enketo, wait ~10s, reload the dashboard — the count goes
   up on its own.

---

## What changed vs the water-meter version

| Area | Water meter | This app |
|---|---|---|
| Unit | Meter (serial) | **Pipe** (`group_2/pipes`, e.g. MU_10068A) |
| Reading | Cumulative meter value | **Water level (mm)** (`group_2/Readings_mm`) |
| Extra field | — | **Outside validation** shown in submission detail |
| Photos | 1 | **2** (reading close-up + field photo) |
| Red flags ON | rollback, jumps, stale 10d, … | **Missing photo**, **No reading 7 days**, stale-unchanged, future-date, out-of-sequence |
| Red flags OFF | — | rollback / reverse / huge-jump / growth (pipe levels rise **and** fall — drying is normal, not an error) |
| Login / design / map / chat / tasks / exports | ✓ | **identical** |

## Red flags — exactly what you asked for

- **Missing photo** → any submission with no photo attached.
- **No reading in 7 days** → any pipe whose latest reading is more than 7 days old.

Both are ON by default. Admins see them on the Overview ("Flagged"), Submissions
(🚩 filter), Map (red pins), and per-pipe history. Surveyors never see flags — their
view stays positive, same as the water-meter app. You can toggle any rule and change
the target/period under **Settings**.

## Customising later (GitHub web UI → commit → Vercel auto-redeploys ~1 min)

- Field names changed in Kobo? Edit `lib/fieldMap.js` (add the new key to the right
  list). The 3-pass matcher already tolerates case and group changes.
- Add/adjust red-flag rules → `lib/redflags.js` + defaults in `lib/db.js`
  (`DEFAULT_SETTINGS.redFlags`).
- Change reading target (default 2/week) → in-app **Settings**, no code needed.
