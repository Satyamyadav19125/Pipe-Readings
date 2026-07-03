import { Suspense } from 'react';
import { fetchSubmissions } from '@/lib/kobo';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { getField } from '@/lib/fieldMap';
import { detectRedFlags } from '@/lib/redflags';
import { getSettings, getVerifiedIds } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import MapView from '@/components/MapView';
import FilterBar from '@/components/FilterBar';
import MapExportButton from '@/components/MapExportButton';

export const dynamic = 'force-dynamic';

function parseLocation(val) {
  if (val == null) return null;
  if (typeof val === 'object') {
    const lat = val.latitude ?? val.lat ?? val.y;
    const lng = val.longitude ?? val.lng ?? val.lon ?? val.x;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
    return null;
  }
  const parts = String(val).trim().split(/\s+/).map((x) => Number(x));
  if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) return { lat: parts[0], lng: parts[1] };
  return null;
}

export default async function MapPage({ searchParams }) {
  const sp = (await searchParams) || {};
  let submissions = [];
  let settings;
  let verifiedIds = new Set();
  let error = null;
  try {
    [submissions, settings, verifiedIds] = await Promise.all([fetchSubmissions(), getSettings(), getVerifiedIds()]);
  } catch (e) { error = e.message; }

  if (error) return <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800 text-sm">{error}</div>;

  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const scoped0 = await filterSubmissionsForUser(submissions);
  // Surveyors see all their pins as clean — no red flag indicators on the map.
  const flags = isAdmin ? detectRedFlags(scoped0, { enabled: settings?.redFlags, pipe: settings?.pipe }) : {};
  const scoped = applyUrlFilters(scoped0, sp);

  const points = [];
  for (const s of scoped) {
    const loc = parseLocation(getField(s, 'location')) || parseLocation(s._geolocation);
    if (loc) {
      const f = flags[s._id];
      const flagged = isAdmin && !!f && !verifiedIds.has(String(s._id));
      points.push({
        id: s._id, lat: loc.lat, lng: loc.lng,
        village: getField(s, 'village') || 'Unknown',
        serial: getField(s, 'serial') || 'Unknown',
        reading: getField(s, 'endReading') ?? '—',
        surveyor: getField(s, 'surveyor') || 'Unknown',
        time: s._submission_time,
        isFlagged: flagged,
        flagTypes: flagged ? f.flags.map((x) => x.type) : [],
      });
    }
  }
  const flaggedOnMap = points.filter((p) => p.isFlagged).length;
  // Count flags across ALL filtered submissions — including ones without GPS
  // that can't be drawn as pins — so this number always matches the
  // Submissions page instead of silently under-reporting.
  const flaggedTotal = scoped.filter(
    (s) => flags[s._id] && !verifiedIds.has(String(s._id))
  ).length;
  const flaggedNoGps = flaggedTotal - flaggedOnMap;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">🗺️ Map</h2>
          <p className="text-sm text-slate-500">
            {points.length} with GPS
            {isAdmin && <> · <span className="text-red-600 font-medium">{flaggedTotal} flagged</span>
              {flaggedNoGps > 0 && <span className="text-slate-400"> ({flaggedNoGps} without GPS — not on map)</span>}</>}
            {' '}· tap a pin for details
          </p>
        </div>
        <Suspense fallback={<div className="h-9 w-32 bg-slate-200 rounded animate-pulse" />}>
          <MapExportButton />
        </Suspense>
      </div>

      <Suspense fallback={<div className="h-12 bg-slate-100 rounded-lg animate-pulse" />}>
        <FilterBar />
      </Suspense>

      {points.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-slate-500">
          No submissions match the current filters, or they don't have GPS data.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <MapView points={points} showFlagFilter={isAdmin} />
        </div>
      )}
    </div>
  );
}
