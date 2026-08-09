import { Suspense } from 'react';
import { readingDate } from '@/lib/weekly';
import { fetchSubmissions } from '@/lib/kobo';
import { detectFlagsScoped } from '@/lib/flagContext';
import { sameDayDuplicates } from '@/lib/redflags';
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
  // Item 7: a surveyor sees their own flags only if the admin enabled it.
  const canSeeFlags = isAdmin || currentUser?.showFlags === true;

  const scopedAll = await filterSubmissionsForUser(allSubmissions);

  // Red-flag detection is admin-only. Surveyors don't see flag chips, red
  // colouring, or "this submission was flagged" warnings — quality review
  // is the admin's job, not theirs. Their view stays positive and focused
  // on their own work.
  const allFlags = canSeeFlags ? await detectFlagsScoped(scopedAll, settings) : {};
  const isRed = (id) => canSeeFlags && !!allFlags[id] && !verifiedIds.has(String(id));

  const filtered0 = applyUrlFilters(scopedAll, sp);
  const redCount = canSeeFlags ? filtered0.filter((s) => isRed(s._id)).length : 0;
  const flagFilter = (canSeeFlags || isAdmin) ? (sp.flag || 'all') : 'all';

  // Correction status of a reading, for the Raw / Corrected / Dead tabs.
  //  - raw       : untouched by an admin
  //  - corrected : an admin edited the value or one or more fields
  //  - dead      : an admin marked it a mistake (excluded from analytics)
  const isDead = (s) => s._correction && s._correction.field === 'dead';
  const isCorrected = (s) => s._correction && s._correction.field !== 'dead';
  const isRaw = (s) => !s._correction;
  const rawCount = filtered0.filter(isRaw).length;
  const correctedCount = filtered0.filter(isCorrected).length;
  const deadCount = filtered0.filter(isDead).length;

  // Same-day duplicates: the same pipe read more than once on one date. Surfaced
  // for everyone (admins) independent of the red-flag toggle, so both forms can
  // be compared and one corrected/deleted.
  const dup = sameDayDuplicates(scopedAll);
  const isDuplicate = (s) => dup.ids.has(String(s._id));
  const duplicateCount = isAdmin ? filtered0.filter(isDuplicate).length : 0;
  // "Clean" = the trustworthy dataset: live (not dead) readings with no red
  // flag. Correcting a flagged reading clears its flag, so your fixes land
  // here — this is the most-accurate data to work from.
  const cleanCount = canSeeFlags ? filtered0.filter((s) => !isDead(s) && !isRed(s._id)).length : 0;

  const filtered = filtered0.filter((s) => {
    // The Dead tab shows dead readings only; every other tab hides them since
    // they're mistakes.
    if (flagFilter === 'dead') return isDead(s);
    if (isDead(s)) return false;
    if (flagFilter === 'raw') return isRaw(s);
    if (flagFilter === 'corrected' || flagFilter === 'fixed') return isCorrected(s);
    if (flagFilter === 'duplicates') return isDuplicate(s);
    if (!canSeeFlags) return true;
    if (flagFilter === 'flagged') return isRed(s._id);
    if (flagFilter === 'clean') return !isRed(s._id);
    return true; // 'all'
  });

  const sorted = [...filtered].sort(
    (a, b) => readingDate(b).getTime() - readingDate(a).getTime()
  );
  const filteredFlagCount = canSeeFlags ? sorted.filter((s) => isRed(s._id)).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{isAdmin ? 'Submissions' : 'My Submissions'}</h2>
          <p className="text-sm text-slate-500">
            {sorted.length} shown
            {canSeeFlags && <> · {filteredFlagCount} flagged</>}
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

      {(canSeeFlags || isAdmin) && (
        <>
          {!isAdmin && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              These are readings the reviewer flagged for you to double-check.
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FlagChip name="all" current={flagFilter} sp={sp}>All</FlagChip>
            {isAdmin ? (
              <>
                <FlagChip name="raw" current={flagFilter} sp={sp}>🗂️ Raw ({rawCount})</FlagChip>
                <FlagChip name="corrected" current={flagFilter} sp={sp}>✎ Corrected ({correctedCount})</FlagChip>
                <FlagChip name="clean" current={flagFilter} sp={sp}>✓ Clean ({cleanCount})</FlagChip>
                {duplicateCount > 0 && <FlagChip name="duplicates" current={flagFilter} sp={sp}>👯 Duplicates ({duplicateCount})</FlagChip>}
                <FlagChip name="dead" current={flagFilter} sp={sp}>🗑️ Dead ({deadCount})</FlagChip>
                <FlagChip name="flagged" current={flagFilter} sp={sp} danger>🚩 Flagged ({redCount})</FlagChip>
              </>
            ) : (
              <>
                <FlagChip name="clean" current={flagFilter} sp={sp}>✓ Clean</FlagChip>
                <FlagChip name="flagged" current={flagFilter} sp={sp} danger>🚩 Flagged ({redCount})</FlagChip>
              </>
            )}
          </div>
        </>
      )}

      <SubmissionList
        submissions={sorted}
        flags={allFlags}
        allSubmissions={scopedAll}
        canVerify={isAdmin}
        verifiedIds={canSeeFlags ? Array.from(verifiedIds) : []}
        duplicates={isAdmin ? dup.map : {}}
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
