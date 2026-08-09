import { NextResponse } from 'next/server';
import { fetchSubmissions, fetchFormMaster } from '@/lib/kobo';
import { getCurrentUser } from '@/lib/auth';
import { getSettings, getDisabledRegistry, getPipeLocations } from '@/lib/db';
import { getField, parseReading } from '@/lib/fieldMap';
import { startOfWeek, endOfWeek, daysRemaining, readingDate } from '@/lib/weekly';

export const dynamic = 'force-dynamic';

// Parse a Kobo location ("lat lng alt acc" string or _geolocation array).
function parseLoc(sub) {
  const raw = getField(sub, 'location');
  if (typeof raw === 'string') {
    const p = raw.trim().split(/\s+/).map(Number);
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) return { lat: p[0], lng: p[1] };
  }
  const geo = sub._geolocation;
  if (Array.isArray(geo) && geo.length >= 2 && Number.isFinite(Number(geo[0])) && Number.isFinite(Number(geo[1]))) {
    return { lat: Number(geo[0]), lng: Number(geo[1]) };
  }
  return null;
}
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Every meter in the user's villages with its read-count + status for a period.
// Period membership uses the reading's DATE field, not its upload time.
//   ?week=this  (default) — the current period
//   ?week=last            — the period BEFORE the current one
//   ?date=YYYY-MM-DD      — the period CONTAINING that date (admin date picker)
// Period length and target count come from admin settings (reading.target /
// reading.periodDays). Default is 2 readings per 7-day week.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const weekSel = (searchParams.get('week') || 'this').toLowerCase();
  const dateParam = (searchParams.get('date') || '').trim();

  let submissions = [];
  let settings;
  let master = { ok: false, villages: [], pipes: [] };
  let disabledReg = { farms: [], pipes: [] };
  let pipeLocs = { locations: {} };
  try {
    [submissions, settings, master, disabledReg, pipeLocs] = await Promise.all([fetchSubmissions(), getSettings(), fetchFormMaster(), getDisabledRegistry(), getPipeLocations().catch(() => ({ locations: {} }))]);
  } catch (e) {
    return NextResponse.json({ error: e.message, villages: [] }, { status: 200 });
  }

  const target = Math.max(1, Number(settings?.reading?.target) || 2);
  const periodDays = Math.max(1, Number(settings?.reading?.periodDays) || 7);
  const periodLabel = String(settings?.reading?.periodLabel || 'week');

  let allowed = null;
  if (user.role === 'user') {
    allowed = new Set((user.villages || []).map((v) => String(v).trim().toLowerCase()));
  }

  const now = new Date();
  let ref = now;
  let mode = 'this';
  if (weekSel === 'last') {
    ref = new Date(now.getTime() - periodDays * 86400000);
    mode = 'last';
  }
  if (dateParam) {
    const t = Date.parse(dateParam);
    if (!Number.isNaN(t)) { ref = new Date(t); mode = 'custom'; }
  }

  let periodStart, periodEnd;
  if (periodDays === 7) {
    periodStart = startOfWeek(ref);
    periodEnd = endOfWeek(ref);
  } else {
    periodEnd = endOfWeek(ref);
    periodStart = new Date(periodEnd.getTime() - periodDays * 86400000);
  }
  const isCurrent = now.getTime() >= periodStart.getTime() && now.getTime() < periodEnd.getTime();

  const meters = {};

  // Seed with the FULL pipe list from the form definition, so pipes that have
  // never been read appear as "pending" (0 readings) instead of being
  // invisible. Falls back silently to submissions-only when the form has no
  // choice lists (e.g. CSV-driven selects).
  const lcv = (x) => String(x || '').trim().toLowerCase();
  const offFarms = new Set((disabledReg.farms || []).map(lcv));
  const offPipes = new Set((disabledReg.pipes || []).map(lcv));
  if (master.ok) {
    for (const pm of master.pipes) {
      const village = pm.village || 'Unassigned';
      if (allowed && !allowed.has(String(village).trim().toLowerCase())) continue;
      // Turned-off farms/pipes must never show up as pending readings.
      if (offFarms.has(lcv(pm.farm)) || offPipes.has(lcv(pm.serial))) continue;
      const key = `${village}|||${pm.serial}`;
      meters[key] = { serial: pm.serial, farm: pm.farm || null, village, countThisPeriod: 0, lastReading: null, lastDate: null, lastSurveyor: null, lastTs: 0, locs: [] };
    }
  }

  for (const s of submissions) {
    if (s._dead) continue; // readings marked dead by an admin don't count
    if (offFarms.has(lcv(getField(s, 'farm'))) || offPipes.has(lcv(getField(s, 'serial')))) continue;
    const serial = getField(s, 'serial');
    if (!serial) continue;
    const village = getField(s, 'village') || 'Unknown';
    if (allowed && !allowed.has(String(village).trim().toLowerCase())) continue;

    const key = `${village}|||${serial}`;
    if (!meters[key]) {
      meters[key] = { serial, farm: getField(s, 'farm') || null, village, countThisPeriod: 0, lastReading: null, lastDate: null, lastSurveyor: null, lastTs: 0, locs: [] };
    }
    const m = meters[key];
    if (!m.farm) m.farm = getField(s, 'farm') || null;
    const loc = parseLoc(s);
    if (loc) m.locs.push(loc);

    const rt = readingDate(s).getTime();
    if (!Number.isNaN(rt) && rt >= periodStart.getTime() && rt < periodEnd.getTime()) {
      m.countThisPeriod += 1;
    }
    const upTs = readingDate(s).getTime();
    if (!Number.isNaN(upTs) && upTs > m.lastTs) {
      m.lastTs = upTs;
      const r = parseReading(getField(s, 'endReading'));
      m.lastReading = Number.isNaN(r) ? null : r;
      m.lastDate = getField(s, 'date') || s._submission_time;
      m.lastSurveyor = getField(s, 'surveyor') || null;
    }
  }

  const byVillage = {};
  for (const key in meters) {
    const m = meters[key];
    const status = m.countThisPeriod >= target ? 'done' : m.countThisPeriod > 0 ? 'partial' : 'pending';
    const rl = (pipeLocs.locations || {})[m.serial] || (pipeLocs.locations || {})[String(m.serial).toUpperCase()] || null;
    // Where the pipe actually is: prefer the admin reference location, else the
    // median of every reading's GPS (robust to a stray point). Feeds the mini
    // map + "how far am I?" in the details panel.
    let lat = null, lng = null;
    if (rl && Number.isFinite(Number(rl.lat)) && Number.isFinite(Number(rl.lng))) {
      lat = Number(rl.lat); lng = Number(rl.lng);
    } else if (m.locs.length) {
      lat = median(m.locs.map((l) => l.lat));
      lng = median(m.locs.map((l) => l.lng));
    }
    const row = { serial: m.serial, farm: m.farm, countThisPeriod: m.countThisPeriod, status, lastReading: m.lastReading, lastDate: m.lastDate, lastSurveyor: m.lastSurveyor, refLoc: rl ? `${rl.lat}, ${rl.lng}` : null, lat, lng };
    if (!byVillage[m.village]) byVillage[m.village] = [];
    byVillage[m.village].push(row);
  }

  const villages = Object.keys(byVillage).sort().map((village) => {
    const list = byVillage[village].sort((a, b) => a.serial.localeCompare(b.serial));
    return {
      village, meters: list,
      done: list.filter((x) => x.status === 'done').length,
      partial: list.filter((x) => x.status === 'partial').length,
      pending: list.filter((x) => x.status === 'pending').length,
      total: list.length,
    };
  });

  const totals = villages.reduce(
    (acc, v) => ({ done: acc.done + v.done, partial: acc.partial + v.partial, pending: acc.pending + v.pending, total: acc.total + v.total }),
    { done: 0, partial: 0, pending: 0, total: 0 }
  );

  const daysLeft = isCurrent
    ? Math.max(0, Math.floor((periodEnd.getTime() - now.getTime()) / 86400000))
    : 0;

  return NextResponse.json({
    villages, totals,
    week: mode,
    target, periodDays, periodLabel,
    weekStart: periodStart.toISOString(),
    weekEnd: periodEnd.toISOString(),
    daysLeft,
    isCurrentWeek: isCurrent,
    role: user.role,
    // For the pre-filled "Take reading" links on each pending pipe.
    formUploadUrl: settings?.project?.formUploadUrl || '',
    userName: user.role === 'admin' ? '' : (user.name || ''),
    prefillPaths: settings?.project?.prefillPaths || null,
  });
}
