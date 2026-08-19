import { fetchSubmissions } from '@/lib/kobo';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { detectFlagsScoped } from '@/lib/flagContext';
import { sameDayDuplicates } from '@/lib/redflags';
import { getVerifiedIds } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { toCsv, toJson, toLabeledRows, buildSummary, objectsToCsv, toCleanLabeledRows, toCorrectedChangeRows } from '@/lib/export';

// Which subset each tab exports, and a friendly sheet/file name for it.
const SCOPE_LABEL = {
  all: 'All readings', raw: 'Raw', corrected: 'Corrected', clean: 'Clean',
  flagged: 'Red flags', dead: 'Dead', duplicates: 'Duplicates',
};

export async function GET(request) {
  try {
    // Downloads are blocked for the read-only guest viewer.
    const me = await getCurrentUser();
    if (!me) return new Response('Not logged in', { status: 401 });
    if (me.role === 'guest') return new Response('Downloads are disabled for guest viewers.', { status: 403 });
    const admin = me.role === 'admin';

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();
    const scope = (searchParams.get('flag') || 'all').toLowerCase();

    const [subsAll, subsRawAll] = await Promise.all([
      fetchSubmissions(), fetchSubmissions({ applyCorrections: false }),
    ]);
    let subs = await filterSubmissionsForUser(subsAll);
    subs = applyUrlFilters(subs, searchParams);
    let subsRaw = await filterSubmissionsForUser(subsRawAll);
    subsRaw = applyUrlFilters(subsRaw, searchParams);
    const rawById = new Map(subsRaw.map((s) => [String(s._id), s]));

    // Partition by correction status.
    const dead = subs.filter((s) => s._correction && s._correction.field === 'dead');
    const live = subs.filter((s) => !s._dead);
    const corrected = live.filter((s) => s._correction && s._correction.field !== 'dead');
    // Raw = every row shown with its ORIGINAL Kobo values.
    const rawRows = subs.map((s) => rawById.get(String(s._id)) || s);

    const flags = admin ? await detectFlagsScoped(live) : {};
    const verified = await getVerifiedIds().catch(() => new Set());
    const isRed = (s) => admin && !!flags[s._id] && !verified.has(String(s._id));
    const flagged = live.filter(isRed);
    const clean = live.filter((s) => !isRed(s));

    // Duplicates computed over ALL rows incl. dead so a resolved pair still exports.
    const dupIds = sameDayDuplicates(subs).ids;
    const duplicates = subs.filter((s) => dupIds.has(String(s._id)));

    const sortByTime = (arr) => [...arr].sort((a, b) => new Date(b._submission_time) - new Date(a._submission_time));
    const scopeSets = { all: subs, raw: rawRows, corrected, clean, flagged, dead, duplicates };
    const selected = sortByTime(scopeSets[scope] || subs);

    // Labeled rows for a given scope (each export tab has its own column set).
    const flagReasons = (s) => (flags[s._id]?.flags || []).map((f) => f.type).join('; ');
    function labeledFor(sc, rows) {
      if (sc === 'clean') return toCleanLabeledRows(rows);
      if (sc === 'corrected') return toCorrectedChangeRows(rows, rawById);
      if (sc === 'flagged') return toLabeledRows(rows).map((r, i) => ({ ...r, 'Red Flags': flagReasons(rows[i]) }));
      return toLabeledRows(rows);
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileScope = scope === 'all' ? '' : `-${scope}`;

    // ---- JSON ----
    if (format === 'json') {
      const data = (scope === 'clean' || scope === 'corrected')
        ? labeledFor(scope, selected)
        : toJson(selected);
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="pipe-readings${fileScope}-${ts}.json"`,
        },
      });
    }

    // ---- XLSX ----
    if (format === 'xlsx') {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const addSheet = (name, labeled) => {
        const rows = labeled.length ? labeled : [{ 'No rows': '' }];
        const sheet = XLSX.utils.json_to_sheet(rows);
        sheet['!cols'] = Object.keys(rows[0]).map((label) => ({ wch: Math.max(12, label.length + 2) }));
        XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
      };
      const addSummary = (rows) => {
        const { overall, perVillage } = buildSummary(rows);
        const aoa = [
          ['PIPE READINGS — SUMMARY'], [], [`Scope: ${SCOPE_LABEL[scope] || 'All readings'}`], [],
          ['Overall'], ...overall, [],
          ['Per village'],
          ['Village', 'Readings', 'Distinct farms', 'Distinct pipes', 'Avg level (mm)', 'Lowest (mm)', 'Highest (mm)', 'Last reading'],
          ...perVillage.map((v) => [v.village, v.readings, v.farms, v.pipes, v.avg, v.min, v.max, v.last]),
        ];
        const s = XLSX.utils.aoa_to_sheet(aoa);
        s['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }];
        XLSX.utils.book_append_sheet(wb, s, 'Summary');
      };

      if (scope === 'all') {
        // One sheet per Submissions tab, in the same order the tabs appear.
        addSummary(live);
        addSheet('All', toLabeledRows(sortByTime(subs)));
        addSheet('Raw', toLabeledRows(sortByTime(rawRows)));
        addSheet('Red flags', labeledFor('flagged', sortByTime(flagged)));
        addSheet('Duplicate', toLabeledRows(sortByTime(duplicates)));
        addSheet('Dead', toLabeledRows(sortByTime(dead)));
        addSheet('Corrected (old vs new)', toCorrectedChangeRows(sortByTime(corrected), rawById));
        addSheet('Clean', toCleanLabeledRows(sortByTime(clean)));
      } else if (scope === 'corrected') {
        addSummary(corrected);
        addSheet('Corrected (old vs new)', toCorrectedChangeRows(selected, rawById));
        addSheet('Corrected forms (full)', toLabeledRows(selected));
      } else {
        addSummary(scope === 'raw' ? subs : selected);
        addSheet(SCOPE_LABEL[scope] || 'Readings', labeledFor(scope, selected));
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="pipe-readings${fileScope}-${ts}.xlsx"`,
        },
      });
    }

    // ---- CSV ----
    let csv;
    if (scope === 'clean' || scope === 'corrected') csv = objectsToCsv(labeledFor(scope, selected));
    else csv = toCsv(selected);
    return new Response('﻿' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pipe-readings${fileScope}-${ts}.csv"`,
      },
    });
  } catch (e) {
    return new Response(`Export error: ${e.message}`, { status: 500 });
  }
}
