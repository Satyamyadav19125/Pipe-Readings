import { Suspense } from 'react';
import { fetchSubmissions } from '@/lib/kobo';
import { detectRedFlags } from '@/lib/redflags';
import { getSettings, getVerifiedIds } from '@/lib/db';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { getCurrentUser } from '@/lib/auth';
import SubmissionList from '@/components/SubmissionList';
import FilterBar from '@/components/FilterBar';
import ExportButton from '@/components/ExportButton';

export const dynamic = 'force-dynamic';

export default async function SubmissionsPage({ searchParams }) {
  const sp = (await searchParams) || {};
  let allSubmissions = [];
  let settings;
  let verifiedIds = new Set();
  let error = null;
  try {
    [allSubmissions, settings, verifiedIds] = await Promise.all([fetchSubmissions(), getSettings(), getVerifiedIds()]);
  } catch (e) {
    error = e.message;
  }
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold mb-1">Error</p>
      <p className="text-sm">{error}</p>
      <p className="text-xs mt-2">Run <a href="/debug" className="underline">/debug</a> for diagnostics.</p>
    </div>
  );

  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const scopedAll = await filterSubmissionsForUser(allSubmissions);

  // Red-flag detection is admin-only. Surveyors don't see flag chips, red
  // colouring, or "this submission was flagged" warnings — quality review
  // is the admin's job, not theirs. Their view stays positive and focused
  // on their own work.
  const allFlags = isAdmin ? detectRedFlags(scopedAll, { enabled: settings?.redFlags, pipe: settings?.pipe }) : {};
  const isRed = (id) => isAdmin && !!allFlags[id] && !verifiedIds.has(String(id));

  const filtered0 = applyUrlFilters(scopedAll, sp);
  const redCount = isAdmin ? filtered0.filter((s) => isRed(s._id)).length : 0;
  const flagFilter = isAdmin ? (sp.flag || 'all') : 'all';
  const filtered = filtered0.filter((s) => {
    if (!isAdmin) return true;
    if (flagFilter === 'flagged') return isRed(s._id);
    if (flagFilter === 'clean') return !isRed(s._id);
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(b._submission_time).getTime() - new Date(a._submission_time).getTime()
  );
  const filteredFlagCount = isAdmin ? sorted.filter((s) => isRed(s._id)).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{isAdmin ? 'Submissions' : 'My Submissions'}</h2>
          <p className="text-sm text-slate-500">
            {sorted.length} shown
            {isAdmin && <> · {filteredFlagCount} flagged</>}
            {!isAdmin && <> · only the readings you sent</>}
          </p>
        </div>
        <Suspense fallback={<div className="h-9 w-24 bg-slate-200 rounded animate-pulse" />}>
          <ExportButton />
        </Suspense>
      </div>

      <Suspense fallback={<div className="h-12 bg-slate-100 rounded-lg animate-pulse" />}>
        <FilterBar />
      </Suspense>

      {isAdmin && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FlagChip name="all" current={flagFilter} sp={sp}>All</FlagChip>
          <FlagChip name="clean" current={flagFilter} sp={sp}>✓ Clean</FlagChip>
          <FlagChip name="flagged" current={flagFilter} sp={sp} danger>🚩 Flagged ({redCount})</FlagChip>
        </div>
      )}

      <SubmissionList
        submissions={sorted}
        flags={allFlags}
        allSubmissions={scopedAll}
        canVerify={isAdmin}
        verifiedIds={isAdmin ? Array.from(verifiedIds) : []}
      />
    </div>
  );
}

function FlagChip({ name, current, sp, danger, children }) {
  const active = (current || 'all') === name;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp || {})) {
    if (k !== 'flag' && v) params.set(k, Array.isArray(v) ? v[0] : String(v));
  }
  if (name !== 'all') params.set('flag', name);
  const href = `/submissions${params.toString() ? '?' + params.toString() : ''}`;
  return (
    <a href={href} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition ${
      active ? (danger ? 'bg-red-600 text-white border-red-600' : 'bg-brand-600 text-white border-brand-600') : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
    }`}>{children}</a>
  );
}
