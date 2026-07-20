import { Suspense } from 'react';
import Link from 'next/link';
import { fetchSubmissions } from '@/lib/kobo';
import { computeConsumption } from '@/lib/weekly';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { detectFlagsScoped } from '@/lib/flagContext';
import { getSettings, getVerifiedIds } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import FilterBar from '@/components/FilterBar';
import ExportButton from '@/components/ExportButton';
import UsageRow from '@/components/UsageRow';

export const dynamic = 'force-dynamic';

export default async function UsagePage({ searchParams }) {
  const sp = (await searchParams) || {};
  let submissions = [];
  let settings;
  let verifiedIds = new Set();
  let error = null;
  try { [submissions, settings, verifiedIds] = await Promise.all([fetchSubmissions(), getSettings(), getVerifiedIds()]); }
  catch (e) { error = e.message; }

  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold mb-1">Error</p>
      <p className="text-sm">{error}</p>
    </div>
  );

  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const scoped = await filterSubmissionsForUser(submissions);

  // Surveyors don't see flag info. They just see their consumption history.
  const flags = {};
  if (isAdmin) {
    const rawFlags = await detectFlagsScoped(scoped, settings);
    for (const id in rawFlags) { if (!verifiedIds.has(String(id))) flags[id] = rawFlags[id]; }
  }

  const filtered = applyUrlFilters(scoped, sp);
  const byId = {};
  for (const s of scoped) byId[s._id] = s;

  const consumption = computeConsumption(filtered);
  const totalUsage = consumption.reduce((sum, m) => sum + m.consumption.filter((c) => c.used > 0).reduce((s, c) => s + c.used, 0), 0);
  const flaggedCount = isAdmin
    ? consumption.reduce((sum, m) => sum + m.consumption.filter((c) => (c.flagged && !verifiedIds.has(String(c.toSubmissionId))) || flags[c.toSubmissionId]).length, 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{isAdmin ? 'Water Level' : 'My Water Level'}</h2>
          <p className="text-sm text-slate-500">Water level at each visit · tap any row to compare two readings</p>
        </div>
        <Suspense fallback={<div className="h-9 w-24 bg-slate-200 rounded animate-pulse" />}>
          <ExportButton />
        </Suspense>
      </div>

      <Suspense fallback={<div className="h-12 bg-slate-100 rounded-lg animate-pulse" />}>
        <FilterBar />
      </Suspense>

      <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-2 sm:gap-3`}>
        <Stat label="Total rise (mm)" value={totalUsage.toLocaleString()} color="bg-brand-50" />
        {isAdmin && (
          <Stat label="Flagged readings" value={flaggedCount} color={flaggedCount > 0 ? 'bg-red-50' : 'bg-emerald-50'} />
        )}
      </div>

      <div className="space-y-3">
        {consumption.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-slate-500">No pipes with multiple readings match the filters.</div>
        ) : (
          consumption.map((m) => {
            const usedTotal = m.consumption.filter((c) => c.used > 0).reduce((s, c) => s + c.used, 0);
            const hasFlag = isAdmin && m.consumption.some((c) => (c.flagged && !verifiedIds.has(String(c.toSubmissionId))) || flags[c.toSubmissionId]);
            return (
              <div key={m.serial} className={`bg-white rounded-lg shadow overflow-hidden ${hasFlag ? 'ring-1 ring-red-200' : ''}`}>
                <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{m.village || 'Unknown village'}</div>
                    <div className="text-xs font-mono text-slate-500 truncate">{m.serial}</div>
                    {m.latestSurveyor && (
                      <div className="text-xs text-slate-500 mt-0.5">Latest by {m.latestSurveyor}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold tabular-nums">{usedTotal.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">mm change</div>
                    <Link href={`/meter/${encodeURIComponent(m.serial)}`} className="text-xs text-brand-600 hover:underline mt-1 inline-block">
                      Full history →
                    </Link>
                  </div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {m.consumption.slice(-5).reverse().map((c) => (
                    <UsageRow
                      key={`${c.fromSubmissionId}-${c.toSubmissionId}`}
                      entry={c}
                      previous={byId[c.fromSubmissionId]}
                      current={byId[c.toSubmissionId]}
                      flag={isAdmin ? flags[c.toSubmissionId] : null}
                      hideFlags={!isAdmin}
                    />
                  ))}
                  {m.consumption.length > 5 && (
                    <li className="px-4 py-2 text-xs text-slate-500 bg-slate-50 text-center">
                      Showing last 5 of {m.consumption.length} ·{' '}
                      <Link href={`/meter/${encodeURIComponent(m.serial)}`} className="text-brand-600 hover:underline">View all</Link>
                    </li>
                  )}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <div className="text-xl sm:text-2xl font-bold leading-tight">{value}</div>
      <div className="text-xs text-slate-700 mt-0.5">{label}</div>
    </div>
  );
}
