import { getField } from './fieldMap.js';

const COLUMNS = [
  { key: 'id', label: 'Submission ID', get: (s) => s._id },
  { key: 'time', label: 'Submitted At', get: (s) => s._submission_time },
  { key: 'village', label: 'Village', get: (s) => getField(s, 'village') },
  { key: 'serial', label: 'Pipe ID', get: (s) => getField(s, 'serial') },
  { key: 'reading', label: 'Water Level (mm)', get: (s) => getField(s, 'endReading') ?? getField(s, 'reading') },
  { key: 'validation', label: 'Outside Height (mm)', get: (s) => getField(s, 'validation') },
  { key: 'surveyor', label: 'Surveyor', get: (s) => getField(s, 'surveyor') },
  { key: 'date', label: 'Form Date', get: (s) => getField(s, 'date') },
  { key: 'location', label: 'Location', get: (s) => {
    const v = getField(s, 'location');
    return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  } },
];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(submissions) {
  const header = COLUMNS.map((c) => csvEscape(c.label)).join(',');
  const rows = submissions.map((s) => COLUMNS.map((c) => csvEscape(c.get(s))).join(','));
  return [header, ...rows].join('\n');
}

export function toJson(submissions) {
  return submissions.map((s) => {
    const row = {};
    for (const c of COLUMNS) row[c.key] = c.get(s);
    return row;
  });
}


// ---------------------------------------------------------------------------
// Summary statistics for the XLSX export's second sheet: overall + per-village
// totals, averages, min/max — computed from whatever rows are being exported.
// ---------------------------------------------------------------------------
export function buildSummary(submissions) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const overallVals = [];
  const villages = new Map(); // village -> { readings, pipes:Set, vals:[], lastTs }
  let firstTs = null, lastTs = null;

  for (const s of submissions) {
    const village = getField(s, 'village') || 'Unknown';
    const serial = getField(s, 'serial') || '';
    const val = num(getField(s, 'endReading') ?? getField(s, 'reading'));
    const ts = s._submission_time || '';
    if (!villages.has(village)) villages.set(village, { readings: 0, pipes: new Set(), vals: [], lastTs: '' });
    const v = villages.get(village);
    v.readings += 1;
    if (serial) v.pipes.add(serial);
    if (val != null) { v.vals.push(val); overallVals.push(val); }
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
      if (ts > v.lastTs) v.lastTs = ts;
    }
  }

  const stats = (vals) => vals.length === 0
    ? { avg: null, min: null, max: null }
    : { avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
        min: Math.min(...vals), max: Math.max(...vals) };

  const allPipes = new Set();
  for (const v of villages.values()) for (const pIt of v.pipes) allPipes.add(pIt);
  const o = stats(overallVals);

  const overall = [
    ['Total readings', submissions.length],
    ['Distinct pipes read', allPipes.size],
    ['Total villages', villages.size],
    ['Average water level (mm)', o.avg ?? '—'],
    ['Lowest water level (mm)', o.min ?? '—'],
    ['Highest water level (mm)', o.max ?? '—'],
    ['First submission', firstTs || '—'],
    ['Latest submission', lastTs || '—'],
  ];

  const perVillage = Array.from(villages.entries())
    .sort((a, b) => b[1].readings - a[1].readings)
    .map(([name, v]) => {
      const st = stats(v.vals);
      return {
        village: name, readings: v.readings, pipes: v.pipes.size,
        avg: st.avg ?? '—', min: st.min ?? '—', max: st.max ?? '—',
        last: v.lastTs ? v.lastTs.slice(0, 10) : '—',
      };
    });

  return { overall, perVillage };
}
