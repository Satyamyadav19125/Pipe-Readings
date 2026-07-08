import { Suspense } from 'react';
import Link from 'next/link';
import { fetchSubmissions, findAttachmentUrl } from '@/lib/kobo';
import { getActiveForm, getSettings } from '@/lib/db';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { getField } from '@/lib/fieldMap';
import { isAdmin } from '@/lib/auth';
import FilterBar from '@/components/FilterBar';
import KoboTable from '@/components/KoboTable';
import ExportButton from '@/components/ExportButton';

export const dynamic = 'force-dynamic';

function fmtLoc(val) {
  if (val == null) return '';
  if (typeof val === 'string') {
    const parts = val.trim().split(/\s+/);
    if (parts.length >= 2) return `${Number(parts[0]).toFixed(5)}, ${Number(parts[1]).toFixed(5)}`;
  }
  if (Array.isArray(val) && val.length >= 2) return `${val[0]}, ${val[1]}`;
  return '';
}
function latlng(val, geo) {
  let lat, lng;
  if (typeof val === 'string') {
    const p = val.trim().split(/\s+/).map(Number);
    if (p.length >= 2) { lat = p[0]; lng = p[1]; }
  }
  if ((lat == null || lng == null) && Array.isArray(geo) && geo.length >= 2) { lat = geo[0]; lng = geo[1]; }
  return { lat, lng };
}

export default async function KoboViewPage({ searchParams }) {
  // Admin only — this is the full raw spreadsheet view. Surveyors see
  // their own data via the regular Submissions page instead.
  if (!(await isAdmin())) {
    return (
      <div className="max-w-2xl mx-auto bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-900">
        <p className="font-semibold mb-1">🔒 Admin only</p>
        <p>The full Kobo spreadsheet view is reserved for project administrators.</p>
        <p className="mt-2">
          You can see all <Link href="/submissions" className="underline font-medium">your own submissions</Link> on the Submissions page.
        </p>
      </div>
    );
  }

  const sp = (await searchParams) || {};
  // Direct link to this form's data table on the real KoboToolbox site.
  let koboUrl = null;
  try {
    const f = await getActiveForm();
    if (f?.assetUid) koboUrl = `${(f.baseUrl || 'https://kf.kobotoolbox.org').replace(/\/$/, '')}/#/forms/${f.assetUid}/data/table`;
  } catch { /* env not configured */ }
  // Pipe standards from Settings -> Pipe parameters: the table colors Level
  // and Outside cells that fall outside them, so bad measurements pop out.
  let standards = null;
  try { standards = (await getSettings())?.pipe || null; } catch { /* defaults */ }
  let submissions = [];
  let error = null;
  try { submissions = await fetchSubmissions(); }
  catch (e) { error = e.message; }

  if (error) return <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800 text-sm">{error}</div>;

  submissions = await filterSubmissionsForUser(submissions);
  submissions = applyUrlFilters(submissions, sp);

  const sorted = [...submissions].sort((a, b) => new Date(b._submission_time).getTime() - new Date(a._submission_time).getTime());

  const labelFor = (a) => {
    const q = String(a.question_xpath || a.filename || '').toLowerCase();
    if (q.includes('photo_reading')) return 'Reading photo';
    if (q.includes('field_photo')) return 'Field photo';
    return 'Photo';
  };
  const rows = sorted.map((s) => {
    const locRaw = getField(s, 'location');
    const { lat, lng } = latlng(locRaw, s._geolocation);
    const photoName = getField(s, 'photo');
    let photo = null;
    if (photoName) {
      const direct = findAttachmentUrl(s, photoName);
      photo = direct ? `/api/photo?url=${encodeURIComponent(direct)}` : null;
    } else if (s._attachments?.[0]?.download_url) {
      photo = `/api/photo?url=${encodeURIComponent(s._attachments[0].download_url)}`;
    }
    // ALL photos on the submission (reading close-up + field shot), labeled,
    // deduped by filename — shown in the detail modal.
    const seen = new Set();
    const photos = (s._attachments || []).filter((a) => {
      if (a.is_deleted) return false;
      const key = a.media_file_basename || a.filename || a.download_url || '';
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map((a) => ({
      url: `/api/photo?url=${encodeURIComponent(a.download_url)}`,
      label: labelFor(a),
    }));
    // ONE ordered, labeled list covering the WHOLE form — known questions get
    // friendly labels, anything new the form gains later is appended
    // automatically. Photos are excluded (they render as images above).
    const LABELS = [
      ['name', 'Surveyor'], ['village', 'Village'], ['farm', 'Farm ID'],
      ['pipes', 'Pipe ID'], ['readings_mm', 'Water level (mm)'],
      ['outside_validation', 'Outside height (mm)'], ['date', 'Date'],
      ['start', 'Start time'], ['end_time', 'End time'], ['location', 'GPS'],
    ];
    const skip = new Set(['photo_reading', 'field_photo']);
    const raw = {};
    for (const [k, v] of Object.entries(s)) {
      if (k.startsWith('_') || k.startsWith('meta/') || k.startsWith('formhub/') || k === '__version__') continue;
      const seg = k.split('/').pop().toLowerCase();
      if (skip.has(seg)) continue;
      raw[seg] = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const rows2 = [];
    for (const [seg, label] of LABELS) {
      if (seg in raw) { rows2.push([label, raw[seg]]); delete raw[seg]; }
    }
    for (const [seg, v] of Object.entries(raw)) {
      rows2.push([seg.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), v]);
    }
    return {
      photos,
      photosCount: photos.length,
      rows: rows2,
      farm: getField(s, 'farm'),
      validation: getField(s, 'validation'),
      id: s._id,
      validation: (s._validation_status && s._validation_status.label) || '',
      start: getField(s, 'startTime') || '',
      end: getField(s, 'endTime') || '',
      date: getField(s, 'date') || '',
      time: getField(s, 'endTime') || getField(s, 'startTime') || '',
      gps: fmtLoc(locRaw) || (Array.isArray(s._geolocation) ? s._geolocation.map((x) => x?.toFixed?.(5) ?? x).join(', ') : ''),
      lat, lng,
      surveyor: getField(s, 'surveyor') || '',
      village: getField(s, 'village') || 'Unknown',
      meter: getField(s, 'serial') || '',
      reading: getField(s, 'endReading') ?? '',
      photo,
      submitted: new Date(s._submission_time).toLocaleString(),
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">🪞 Kobo Data View</h2>
          <p className="text-sm text-slate-500">Spreadsheet view of all submissions, like the KoboToolbox table. Search any column, tap a row number to expand. {rows.length.toLocaleString()} rows shown.</p>
        </div>
        <div className="flex items-center gap-2">
          {koboUrl && (
            <a href={koboUrl} target="_blank" rel="noreferrer"
              className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium whitespace-nowrap">
              🔗 Open in KoboToolbox ↗
            </a>
          )}
          <Suspense fallback={<div className="h-9 w-24 bg-slate-200 rounded animate-pulse" />}>
            <ExportButton />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<div className="h-12 bg-slate-100 rounded-lg animate-pulse" />}>
        <FilterBar />
      </Suspense>

      <KoboTable rows={rows} standards={standards} />
    </div>
  );
}
