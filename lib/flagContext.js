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
  return {
    enabled: s?.redFlags,
    pipe: s?.pipe,
    geofence,
    refLocations,
  };
}

// Run red flags on the submissions that are NOT on a disabled farm/pipe.
// Disabled units never flag and never count as missed.
export async function detectFlagsScoped(submissions, settings) {
  const active = await excludeDisabled(submissions);
  const opts = await buildFlagOptions(settings);
  return detectRedFlags(active, opts);
}
