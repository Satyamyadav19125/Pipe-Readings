import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getSettings, getPipeLocations, savePipeLocations } from '@/lib/db';
import { parseLatLng } from '@/lib/coords';

export const dynamic = 'force-dynamic';

// Turn a normal Google Sheet URL into its published-CSV form. Works with:
//   .../spreadsheets/d/<ID>/edit#gid=<GID>
//   .../spreadsheets/d/e/<PUBID>/pub?output=csv   (already CSV)
function toCsvUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  if (u.includes('output=csv') || u.endsWith('.csv')) return u;
  const m = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const id = m[1];
  const gid = (u.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// Minimal CSV parser (handles quoted cells + commas inside quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* skip */ }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// GET -> current cached locations + count
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  const data = await getPipeLocations();
  return NextResponse.json({
    count: Object.keys(data.locations || {}).length,
    syncedAt: data.syncedAt, source: data.source || '',
    sample: Object.entries(data.locations || {}).slice(0, 5),
  });
}

// POST -> pull the sheet now, parse, save. Body optional { sheetUrl } overrides
// the saved settings URL for a one-off test.
export async function POST(request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch { /* no body */ }
  const settings = await getSettings();
  const rawUrl = body.sheetUrl || settings?.pipe?.geofence?.sheetUrl || '';
  const csvUrl = toCsvUrl(rawUrl);
  if (!csvUrl) {
    return NextResponse.json({ error: 'No valid Google Sheet URL. Paste the normal share link or a published CSV link.' }, { status: 400 });
  }

  let text;
  try {
    const res = await fetch(csvUrl, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}. Is the sheet shared as "Anyone with the link" or published to the web?`);
    text = await res.text();
    if (text.trim().startsWith('<')) throw new Error('Got a login/HTML page instead of CSV. Set the sheet to "Anyone with the link can view", or File → Share → Publish to web → CSV.');
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const rows = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (rows.length === 0) return NextResponse.json({ error: 'The sheet appears empty.' }, { status: 400 });

  // Detect header. We look for a pipe column and a location column by name;
  // if no recognizable header, assume col0 = pipe, col1 = lat/lng, col2 = lng.
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const hasHeader = header.some((h) => /pipe|code|id|lat|lng|lon|location|coord/.test(h));
  const findCol = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  let pipeCol = findCol('pipe', 'code', 'id');
  let latCol = findCol('lat');
  let lngCol = findCol('lng', 'lon', 'long');
  let locCol = findCol('location', 'coord', 'gps', 'latlng', 'lat/lng', 'lat lng');
  if (pipeCol < 0) pipeCol = 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const locations = {};
  let parsed = 0, skipped = 0;
  for (const r of dataRows) {
    const pipe = String(r[pipeCol] ?? '').trim();
    if (!pipe) { skipped++; continue; }
    let coord = null;
    if (latCol >= 0 && lngCol >= 0 && r[latCol] && r[lngCol]) {
      coord = parseLatLng(`${r[latCol]},${r[lngCol]}`);
    } else if (locCol >= 0 && r[locCol]) {
      coord = parseLatLng(r[locCol]);
    } else {
      // fall back: whichever cell after the pipe column parses as a coord
      for (let i = 0; i < r.length; i++) {
        if (i === pipeCol) continue;
        const c = parseLatLng(r[i]) || (r[i + 1] ? parseLatLng(`${r[i]},${r[i + 1]}`) : null);
        if (c) { coord = c; break; }
      }
    }
    if (coord) { locations[pipe] = coord; parsed++; } else skipped++;
  }

  await savePipeLocations(locations, rawUrl);
  return NextResponse.json({ ok: true, parsed, skipped, total: dataRows.length, sample: Object.entries(locations).slice(0, 5) });
}
