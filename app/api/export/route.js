import { fetchSubmissions } from '@/lib/kobo';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { detectFlagsScoped } from '@/lib/flagContext';
import { sameDayDuplicates } from '@/lib/redflags';
import { getVerifiedIds } from '@/lib/db';
import { toCsv, toJson, toLabeledRows, buildSummary } from '@/lib/export';

// Which subset each tab exports, and a friendly sheet/file name for it.
const SCOPE_LABEL = {
  all: 'All readings',
  raw: 'Raw',
  corrected: 'Corrected',
  clean: 'Clean',
  flagged: 'Red flags',
  dead: 'Dead',
  duplicates: 'Duplicates',
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();
    const scope = (searchParams.get('flag') || 'all').toLowerCase();

    let subs = await fetchSubmissions();
    subs = await filterSubmissionsForUser(subs);
    subs = applyUrlFilters(subs, searchParams);

    // Partition by correction status. `live` = everything the tool counts
    // (dead readings excluded); `dead` = admin-marked mistakes, kept for their
    // own tab/sheet.
    const dead = subs.filter((s) => s._correction && s._correction.field === 'dead');
    const live = subs.filter((s) => !s._dead);
    const corrected = live.filter((s) => s._correction && s._correction.field !== 'dead');
    const raw = live.filter((s) => !s._correction);

    // Red flags on the live set, so the Red-flags sheet lists WHY each row fired.
    // A reading an admin marked "correct" (verified) is treated as clean here,
    // exactly like the Submissions page, so the two never disagree.
    const flags = await detectFlagsScoped(live);
    const verified = await getVerifiedIds().catch(() => new Set());
    const isRed = (s) => !!flags[s._id] && !verified.has(String(s._id));
    const flagged = live.filter(isRed);
    const clean = live.filter((s) => !isRed(s));

    // Same-day duplicate readings (same pipe read twice+ on one date).
    const dupIds = sameDayDuplicates(live).ids;
    const duplicates = live.filter((s) => dupIds.has(String(s._id)));

    const sortByTime = (arr) => [...arr].sort((a, b) => new Date(b._submission_time) - new Date(a._submission_time));
    const scopeSets = { all: live, raw, corrected, clean, flagged, dead, duplicates };
    const selected = sortByTime(scopeSets[scope] || live);

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileScope = scope === 'all' ? '' : `-${scope}`;

    if (format === 'json') {
      const body = JSON.stringify(toJson(selected), null, 2);
      return new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="pipe-readings${fileScope}-${ts}.json"`,
        },
      });
    }

    if (format === 'xlsx') {
      // Real Excel workbook. "Download all" (scope=all) => a Summary sheet plus
      // one sheet each for All readings, Clean, Corrected, Dead and Red flags. A
      // single tab (e.g. Dead or Clean) => just that data + a Summary sheet.
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const addDataSheet = (name, rows, extraCol) => {
        let labeled = toLabeledRows(rows);
        if (extraCol) labeled = labeled.map((r, i) => ({ ...r, [extraCol.label]: extraCol.value(rows[i]) }));
        const sheet = XLSX.utils.json_to_sheet(labeled.length ? labeled : [{ 'No rows': '' }]);
        const cols = Object.keys((labeled[0]) || { 'No rows': 1 });
        sheet['!cols'] = cols.map((label) => ({ wch: Math.max(12, label.length + 2) }));
        XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
      };

      const addSummarySheet = (rows) => {
        const { overall, perVillage } = buildSummary(rows);
        const summaryRows = [
          ['PIPE READINGS — SUMMARY'], [],
          [`Scope: ${SCOPE_LABEL[scope] || 'All readings'}`], [],
          ['Overall'], ...overall, [],
          ['Per village'],
          ['Village', 'Readings', 'Distinct farms', 'Distinct pipes', 'Avg level (mm)', 'Lowest (mm)', 'Highest (mm)', 'Last reading'],
          ...perVillage.map((v) => [v.village, v.readings, v.farms, v.pipes, v.avg, v.min, v.max, v.last]),
        ];
        const sumSheet = XLSX.utils.aoa_to_sheet(summaryRows);
        sumSheet['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }];
        XLSX.utils.book_append_sheet(wb, sumSheet, 'Summary');
      };

      const flagCol = { label: 'Red Flags', value: (s) => (flags[s._id]?.flags || []).map((f) => f.type).join('; ') };

      if (scope === 'all') {
        addSummarySheet(live);
        addDataSheet('All readings', sortByTime(live));
        addDataSheet('Clean', sortByTime(clean));
        addDataSheet('Corrected', sortByTime(corrected));
        addDataSheet('Dead', sortByTime(dead));
        addDataSheet('Red flags', sortByTime(flagged), flagCol);
      } else {
        addSummarySheet(selected);
        addDataSheet(SCOPE_LABEL[scope] || 'Readings', selected, scope === 'flagged' ? flagCol : null);
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="pipe-readings${fileScope}-${ts}.xlsx"`,
        },
      });
    }

    const body = '﻿' + toCsv(selected);
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pipe-readings${fileScope}-${ts}.csv"`,
      },
    });
  } catch (e) {
    return new Response(`Export error: ${e.message}`, { status: 500 });
  }
}
