import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPipeLocations, getSettings, getDisabledRegistry } from '@/lib/db';
import { fetchFormMaster } from '@/lib/kobo';
import { distanceMeters } from '@/lib/coords';

export const dynamic = 'force-dynamic';

// GET /api/nearest-pipe?lat=..&lng=..&radius=..
// Given the surveyor's current GPS, return the closest pipe(s) whose reference
// location (from the pipe-locations sheet) is within the radius, richest first.
// Used by the "What pipe am I on?" button so GPS identifies the farm/pipe and
// the rest of the reading can be pre-filled.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 });
  }

  let settings = {}; let locs = { locations: {} }; let master = { ok: false, pipes: [] }; let reg = { farms: [], pipes: [] };
  try {
    [settings, locs, master, reg] = await Promise.all([
      getSettings(), getPipeLocations(), fetchFormMaster(), getDisabledRegistry(),
    ]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 200 });
  }

  const radius = Number(sp.get('radius')) || Number(settings?.pipe?.geofence?.radiusMeters) || 50;
  const locations = locs.locations || {};
  if (Object.keys(locations).length === 0) {
    return NextResponse.json({ ok: true, matches: [], radius, reason: 'no-locations' });
  }

  // pipe -> {farm, village} from the form master, so a match can name the farm.
  const lc = (x) => String(x || '').trim().toLowerCase();
  const offFarms = new Set((reg.farms || []).map(lc));
  const offPipes = new Set((reg.pipes || []).map(lc));
  const meta = new Map();
  if (master.ok) for (const p of master.pipes) meta.set(String(p.serial).toUpperCase(), { farm: p.farm, village: p.village });

  const here = { lat, lng };
  const matches = [];
  for (const [serial, loc] of Object.entries(locations)) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    if (offPipes.has(lc(serial))) continue;
    const info = meta.get(String(serial).toUpperCase()) || {};
    if (info.farm && offFarms.has(lc(info.farm))) continue;
    const dist = distanceMeters(here, { lat: loc.lat, lng: loc.lng });
    if (dist <= radius) {
      matches.push({
        serial, farm: info.farm || null, village: info.village || null,
        distance: Math.round(dist), lat: loc.lat, lng: loc.lng,
      });
    }
  }
  matches.sort((a, b) => a.distance - b.distance);

  return NextResponse.json({
    ok: true,
    matches: matches.slice(0, 5),
    radius,
    formUploadUrl: settings?.project?.formUploadUrl || '',
    prefillPaths: settings?.project?.prefillPaths || null,
    userName: user.role === 'admin' ? '' : (user.name || ''),
  });
}
