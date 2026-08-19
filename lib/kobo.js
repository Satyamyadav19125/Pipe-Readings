import { getCorrections, getActiveForm } from './db.js';
import { FIELD_MAP } from './fieldMap.js';
import { getDemoMaster } from './demoData.js';
import { getCurrentUser } from './auth.js';

// How long (seconds) to reuse Kobo data before re-fetching.
// This is the big speed win: pages share one cached fetch instead of
// hitting Kobo on every single visit. The webhook busts it on new data,
// so a longer window is safe and keeps filtering (e.g. by surveyor) instant
// instead of triggering a cold multi-thousand-row Kobo fetch each time.
const KOBO_TTL = 120;

function cleanToken(raw) {
  let t = (raw || '').trim();
  if (t.toLowerCase().startsWith('token ')) t = t.slice(6).trim();
  t = t.replace(/^["']|["']$/g, '');
  return t;
}

async function getConfig() {
  try {
    const form = await getActiveForm();
    const token = cleanToken(form.token);
    if (!token) throw new Error('KOBO_API_TOKEN is not set.');
    if (!form.assetUid) throw new Error('KOBO_ASSET_UID is not set.');
    return {
      base: (form.baseUrl || 'https://kf.kobotoolbox.org').replace(/\/$/, ''),
      asset: form.assetUid, token, formName: form.name,
    };
  } catch (e) {
    const base = (process.env.KOBO_BASE_URL || 'https://kf.kobotoolbox.org').trim().replace(/\/$/, '');
    const token = cleanToken(process.env.KOBO_API_TOKEN || '');
    const asset = (process.env.KOBO_ASSET_UID || '').trim();
    if (!token) throw new Error('KOBO_API_TOKEN is not set.');
    if (!asset) throw new Error('KOBO_ASSET_UID is not set.');
    return { base, asset, token, formName: 'env-default' };
  }
}

// Kobo's data API caps EACH request at ~1000 rows no matter how big `limit`
// is, so the old single call silently stopped at 1000 submissions. We now read
// the total `count` from the first page and pull every remaining page (in
// parallel) so the whole dataset comes back — effectively unlimited.
//   limit = 0 (default) -> fetch everything
//   limit > 0           -> fetch at most that many (used by /debug)
const KOBO_PAGE = 1000;

export async function fetchSubmissions({ limit = 0, applyCorrections = true } = {}) {
  const { base, asset, token } = await getConfig();
  const opts = { headers: { Authorization: `Token ${token}` }, next: { revalidate: KOBO_TTL, tags: ['kobo'] } };

  const fetchPage = async (start, count) => {
    const url = `${base}/api/v2/assets/${asset}/data/?format=json&limit=${count}&start=${start}`;
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kobo API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  };

  const wantAll = !(limit && limit > 0);
  const firstCount = wantAll ? KOBO_PAGE : Math.min(KOBO_PAGE, limit);
  const first = await fetchPage(0, firstCount);
  let rows = first.results || [];
  const reported = Number(first.count) || rows.length;
  const total = wantAll ? reported : Math.min(limit, reported);

  // Step by the size the server ACTUALLY returned (some Kobo instances cap a
  // page below the requested 1000), so offsets line up no matter the cap.
  const step = rows.length || KOBO_PAGE;
  // Remaining pages, fetched in parallel so 3000+ submissions still load fast.
  if (rows.length < total && step > 0) {
    const starts = [];
    for (let s = rows.length; s < total; s += step) starts.push(s);
    const pages = await Promise.all(starts.map((s) => fetchPage(s, step)));
    for (const p of pages) rows.push(...(p.results || []));
  }
  if (limit && limit > 0 && rows.length > limit) rows = rows.slice(0, limit);

  // The RAW view wants the exact record Kobo holds, with no admin overrides
  // overlaid. Every other caller gets the corrected values so fixes flow
  // through analytics, flags, map and exports.
  if (!applyCorrections) return rows;
  return applyCorrectionsToRows(rows);
}

// Overlay admin reading-corrections onto the raw Kobo rows. The RAW data is
// never changed on Kobo — we edit a shallow copy in memory so the corrected
// value flows through every view, analytic, red-flag and export. We also stash
// `_correction` so the UI can show old -> new.
async function applyCorrectionsToRows(rows) {
  let corrections = {};
  try { corrections = await getCorrections(); } catch { corrections = {}; }
  if (!corrections || Object.keys(corrections).length === 0) return rows;

  // The Kobo key that actually holds the inside reading (first candidate that
  // exists on a row), so we overwrite the same field getField() reads.
  const readingKeys = FIELD_MAP.reading || [];
  return rows.map((row) => {
    const c = corrections[String(row._id)];
    if (!c) return row;
    const copy = { ...row };
    if (c.field === 'dead') {
      // Submitted by mistake (e.g. a duplicate where the OTHER row is correct).
      // The raw row stays on Kobo, but the tool treats it as a dead reading:
      // excluded from analytics, red flags, targets, map and exports.
      copy._dead = true;
    } else if (c.field === 'fields' && c.fields && typeof c.fields === 'object') {
      // Full-form edit: an admin corrected one or more fields of this
      // submission. Each key is a Kobo field path; we overwrite the same keys
      // getField() reads, so the whole tool sees the edited values.
      for (const [path, val] of Object.entries(c.fields)) copy[path] = val;
    } else if (c.field === 'reading' || !c.field) {
      let target = readingKeys.find((k) => k in copy);
      if (!target) target = 'group_2/Readings_mm';
      copy[target] = c.newValue;
    }
    copy._correction = {
      field: c.field || 'reading',
      oldValue: c.oldValue,
      newValue: c.newValue,
      fields: c.fields || null,
      by: c.by, note: c.note, at: c.at,
    };
    return copy;
  });
}

export async function fetchAssetDefinition() {
  const { base, asset, token } = await getConfig();
  const url = `${base}/api/v2/assets/${asset}/?format=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
    next: { revalidate: 300, tags: ['kobo'] },
  });
  if (!res.ok) throw new Error(`Kobo asset fetch failed: ${res.status}`);
  return res.json();
}

export function findAttachmentUrl(submission, photoFilename) {
  if (!submission?._attachments || !photoFilename) return null;
  const target = String(photoFilename).replace(/\s+/g, '_');
  const att = submission._attachments.find((a) => (a.filename || '').endsWith(target));
  return att?.download_url || att?.download_large_url || null;
}

export async function fetchAttachmentStream(downloadUrl) {
  const { token } = await getConfig();
  const res = await fetch(downloadUrl, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`Attachment fetch ${res.status}`);
  return res;
}

// ---------------------------------------------------------------------------
// MASTER LIST from the form definition (#: show unread pipes/villages too).
// Reads the form's choice lists so the dashboard knows EVERY village and EVERY
// pipe that exists in Kobo — not just the ones that already have submissions.
// Works with cascading selects (village -> farm -> pipes) by matching each
// pipe/farm choice's filter columns back to the parent lists.
// If the form uses CSV pull-data instead of choice lists, this returns
// ok:false and every consumer silently falls back to submissions-derived data.
// ---------------------------------------------------------------------------
const SKIP_CHOICE_KEYS = new Set(['name', 'label', 'list_name', '$autovalue', '$kuid', 'order']);

export async function fetchFormMaster() {
  // Guests get the demo infrastructure so their views match the demo readings.
  try {
    const u = await getCurrentUser();
    if (u?.role === 'guest') return getDemoMaster();
  } catch { /* fall through to the real form */ }
  try {
    const asset = await fetchAssetDefinition();
    const survey = asset?.content?.survey || [];
    const choices = asset?.content?.choices || [];

    const rowByName = (needle) =>
      survey.find((r) => String(r.name || r.$autoname || '').toLowerCase() === needle);
    const listNameOf = (row) => String(row?.select_from_list_name || '').trim();
    const choicesOf = (ln) => (ln ? choices.filter((c) => String(c.list_name) === ln) : []);

    const villageRow = rowByName('village');
    const farmRow = rowByName('farm');
    const pipeRow = rowByName('pipes') || rowByName('pipe') || rowByName('pipe_id');

    const villageChoices = choicesOf(listNameOf(villageRow));
    const farmChoices = choicesOf(listNameOf(farmRow));
    const pipeChoices = choicesOf(listNameOf(pipeRow));

    const villages = villageChoices.map((c) => String(c.name));
    const villageByLower = new Map(villages.map((v) => [v.toLowerCase(), v]));

    // farm -> village via any extra column whose value is a village choice name
    const farmVillage = {};
    const farmNames = new Set();
    for (const f of farmChoices) {
      const fname = String(f.name);
      farmNames.add(fname);
      for (const k in f) {
        if (SKIP_CHOICE_KEYS.has(k)) continue;
        const hit = villageByLower.get(String(f[k] ?? '').toLowerCase());
        if (hit) { farmVillage[fname] = hit; break; }
      }
    }

    // pipe -> farm/village via its extra columns
    const pipes = [];
    for (const p of pipeChoices) {
      let farm = null;
      let village = null;
      for (const k in p) {
        if (SKIP_CHOICE_KEYS.has(k)) continue;
        const val = String(p[k] ?? '');
        if (!farm && farmNames.has(val)) farm = val;
        if (!village) {
          const hit = villageByLower.get(val.toLowerCase());
          if (hit) village = hit;
        }
      }
      if (!village && farm) village = farmVillage[farm] || null;
      pipes.push({ serial: String(p.name), village, farm });
    }

    return { ok: pipes.length > 0 || villages.length > 0, villages, pipes };
  } catch (e) {
    return { ok: false, villages: [], pipes: [], error: e.message };
  }
}
