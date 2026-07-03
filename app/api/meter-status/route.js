import { NextResponse } from 'next/server';
import { fetchSubmissions, fetchFormMaster } from '@/lib/kobo';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { getField, parseReading } from '@/lib/fieldMap';
import { startOfWeek, endOfWeek, daysRemaining, readingDate } from '@/lib/weekly';

export const dynamic = 'force-dynamic';

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
  try {
    [submissions, settings, master] = await Promise.all([fetchSubmissions(), getSettings(), fetchFormMaster()]);
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
  if (master.ok) {
    for (const pm of master.pipes) {
      const village = pm.village || 'Unassigned';
      if (allowed && !allowed.has(String(village).trim().toLowerCase())) continue;
      const key = `${village}|||${pm.serial}`;
      meters[key] = { serial: pm.serial, village, countThisPeriod: 0, lastReading: null, lastDate: null, lastSurveyor: null, lastTs: 0 };
    }
  }

  for (const s of submissions) {
    const serial = getField(s, 'serial');
    if (!serial) continue;
    const village = getField(s, 'village') || 'Unknown';
    if (allowed && !allowed.has(String(village).trim().toLowerCase())) continue;

    const key = `${village}|||${serial}`;
    if (!meters[key]) {
      meters[key] = { serial, village, countThisPeriod: 0, lastReading: null, lastDate: null, lastSurveyor: null, lastTs: 0 };
    }
    const m = meters[key];

    const rt = readingDate(s).getTime();
    if (!Number.isNaN(rt) && rt >= periodStart.getTime() && rt < periodEnd.getTime()) {
      m.countThisPeriod += 1;
    }
    const upTs = new Date(s._submission_time).getTime();
    if (!Number.isNaN(upTs) && upTs > m.lastTs) {
      m.lastTs = upTs;
      const r = parseReading(getField(s, 'endReading'));
      m.lastReading = Number.isNaN(r) ? null : r;
      m.lastDate = s._submission_time;
      m.lastSurveyor = getField(s, 'surveyor') || null;
    }
  }

  const byVillage = {};
  for (const key in meters) {
    const m = meters[key];
    const status = m.countThisPeriod >= target ? 'done' : m.countThisPeriod > 0 ? 'partial' : 'pending';
    const row = { serial: m.serial, countThisPeriod: m.countThisPeriod, status, lastReading: m.lastReading, lastDate: m.lastDate, lastSurveyor: m.lastSurveyor };
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
  });
}
