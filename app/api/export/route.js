import { fetchSubmissions } from '@/lib/kobo';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { detectFlagsScoped } from '@/lib/flagContext';
import { toCsv, toJson, toLabeledRows, buildSummary } from '@/lib/export';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();
    const flagFilter = searchParams.get('flag') || 'all';

    let subs = await fetchSubmissions();
    subs = await filterSubmissionsForUser(subs);
    subs = applyUrlFilters(subs, searchParams);
    // Readings an admin marked dead (submitted by mistake) are excluded from
    // every export so downstream analysis never sees them.
    subs = subs.filter((s) => !s._dead);

    if (flagFilter !== 'all') {
      const flags = await detectFlagsScoped(subs);
      if (flagFilter === 'flagged') subs = subs.filter((s) => flags[s._id]);
      if (flagFilter === 'clean') subs = subs.filter((s) => !flags[s._id]);
    }

    subs.sort((a, b) => new Date(b._submission_time) - new Date(a._submission_time));

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'json') {
      const body = JSON.stringify(toJson(subs), null, 2);
      return new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="pipe-readings-${ts}.json"`,
        },
      });
    }

    if (format === 'xlsx') {
      // Real Excel workbook: sheet 1 = data, sheet 2 = summary statistics
      // (totals, averages, min/max, per-village breakdown) about this data.
      const XLSX = await import('xlsx');
      const rows = toLabeledRows(subs);
      const wb = XLSX.utils.book_new();
      const dataSheet = XLSX.utils.json_to_sheet(rows);
      dataSheet['!cols'] = Object.keys(rows[0] || { '': 1 }).map((label) => ({ wch: Math.max(12, label.length + 2) }));
      XLSX.utils.book_append_sheet(wb, dataSheet, 'Readings');

      const { overall, perVillage } = buildSummary(subs);
      const summaryRows = [
        ['PIPE READINGS — SUMMARY'], [],
        ['Overall'], ...overall, [],
        ['Per village'],
        ['Village', 'Readings', 'Distinct farms', 'Distinct pipes', 'Avg level (mm)', 'Lowest (mm)', 'Highest (mm)', 'Last reading'],
        ...perVillage.map((v) => [v.village, v.readings, v.farms, v.pipes, v.avg, v.min, v.max, v.last]),
      ];
      const sumSheet = XLSX.utils.aoa_to_sheet(summaryRows);
      sumSheet['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 13 }];
      XLSX.utils.book_append_sheet(wb, sumSheet, 'Summary');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="pipe-readings-${ts}.xlsx"`,
        },
      });
    }

    const body = '\uFEFF' + toCsv(subs);
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pipe-readings-${ts}.csv"`,
      },
    });
  } catch (e) {
    return new Response(`Export error: ${e.message}`, { status: 500 });
  }
}
