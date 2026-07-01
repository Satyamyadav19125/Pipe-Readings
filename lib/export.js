import { getField } from './fieldMap.js';

const COLUMNS = [
  { key: 'id', label: 'Submission ID', get: (s) => s._id },
  { key: 'time', label: 'Submitted At', get: (s) => s._submission_time },
  { key: 'village', label: 'Village', get: (s) => getField(s, 'village') },
  { key: 'serial', label: 'Meter Serial', get: (s) => getField(s, 'serial') },
  { key: 'reading', label: 'Reading', get: (s) => getField(s, 'endReading') ?? getField(s, 'reading') },
  { key: 'startReading', label: 'Start Reading', get: (s) => getField(s, 'startReading') },
  { key: 'surveyor', label: 'Surveyor', get: (s) => getField(s, 'surveyor') },
  { key: 'date', label: 'Form Date', get: (s) => getField(s, 'date') },
  { key: 'location', label: 'Location', get: (s) => {
    const v = getField(s, 'location');
    return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  } },
];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(submissions) {
  const header = COLUMNS.map((c) => csvEscape(c.label)).join(',');
  const rows = submissions.map((s) => COLUMNS.map((c) => csvEscape(c.get(s))).join(','));
  return [header, ...rows].join('\n');
}

export function toJson(submissions) {
  return submissions.map((s) => {
    const row = {};
    for (const c of COLUMNS) row[c.key] = c.get(s);
    return row;
  });
}
