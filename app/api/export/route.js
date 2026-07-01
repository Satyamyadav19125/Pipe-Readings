import { fetchSubmissions } from '@/lib/kobo';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { detectRedFlags } from '@/lib/redflags';
import { toCsv, toJson } from '@/lib/export';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();
    const flagFilter = searchParams.get('flag') || 'all';

    let subs = await fetchSubmissions();
    subs = await filterSubmissionsForUser(subs);
    subs = applyUrlFilters(subs, searchParams);

    if (flagFilter !== 'all') {
      const flags = detectRedFlags(subs);
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
          'Content-Disposition': `attachment; filename="water-meter-readings-${ts}.json"`,
        },
      });
    }

    const body = '\uFEFF' + toCsv(subs);
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="water-meter-readings-${ts}.csv"`,
      },
    });
  } catch (e) {
    return new Response(`Export error: ${e.message}`, { status: 500 });
  }
}
