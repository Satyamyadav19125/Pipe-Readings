// Shared assembly of everything detectRedFlags needs, so all pages call it the
// same way: settings toggles, pipe standards, geofence + reference locations,
// and disabled-farm/pipe exclusion. Keeps the six callers consistent.
import { getSettings, getPipeLocations } from './db.js';
import { excludeDisabled } from './filter.js';
import { detectRedFlags } from './redflags.js';

export async function buildFlagOptions(settings) {
  const s = settings || (await getSettings());
  const geofence = s?.pipe?.geofence || null;
  let refLocations = null;
  if (geofence?.enabled) {
    try { refLocations = (await getPipeLocations()).locations || {}; } catch { refLocations = {}; }
  }
  // "Stale — no reading" should mean "not read within the CURRENT reading
  // period", so it tracks the admin's period setting instead of a hardcoded 7
  // days. With the default 7-day period this is unchanged; a 14-day period now
  // only flags a pipe once 14 days pass, so a reading sent within the period is
  // never wrongly flagged as stale.
  const periodDays = Math.max(1, Number(s?.reading?.periodDays) || 7);
  // How far a single reading may sit from the centre of all readings before it
  // is flagged as an obvious GPS mistake. Admin-tunable; default 50 km. An
  // explicitly-cleared box ('' ) is passed through unchanged so the detector
  // disables the check (Number('') is not > 0); only a never-configured value
  // (undefined/null) falls back to the 50 km default.
  const maxLocationKm = s?.pipe?.maxLocationKm == null ? 100 : s.pipe.maxLocationKm;
  // Only red-flag readings from the last N days (blank/0 = flag everything).
  const flagWindowDays = s?.redFlags?.flagWindowDays ?? s?.pipe?.flagWindowDays ?? null;
  return {
    enabled: s?.redFlags,
    pipe: s?.pipe,
    geofence,
    refLocations,
    staleDays: periodDays,
    maxLocationKm,
    flagWindowDays,
  };
}

// Run red flags on the submissions that are NOT on a disabled farm/pipe.
// Disabled units never flag and never count as missed.
export async function detectFlagsScoped(submissions, settings) {
  const active = await excludeDisabled(submissions);
  const opts = await buildFlagOptions(settings);
  return detectRedFlags(active, opts);
}
