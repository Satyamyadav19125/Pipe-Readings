// =====================================================================
// FIELD MAP — robust, CASE-INSENSITIVE matching for the PVC PIPE form.
//
// Real Kobo keys for "Kharif 26 - PVC Pipes" (aytG3bjuzKg92S3QihTJ6J):
//   group_1/Date            -> date          (capital D)
//   group_1/Start           -> startTime
//   End_time                -> endTime       (top-level, not in a group)
//   group_1/name            -> surveyor      (the reader's name)
//   group_1/village         -> village
//   group_2/pipes           -> serial        (the PVC pipe ID, e.g. MU_10068A)
//   group_2/Readings_mm     -> reading       (water level in the pipe, mm)
//   group_2/Outside_validation -> validation (a second sanity reading)
//   group_2/Photo_reading   -> photo         (close-up of the reading)
//   group_2/field_photo     -> (2nd photo, shown via _attachments)
//   group_2/Location        -> location      (GPS "lat lng alt acc")
//
// getField matches regardless of upper/lowercase AND can match on just the
// last path segment, so small form changes won't break the dashboard.
// "serial" is kept as the internal key for the pipe ID so all the shared
// logic (grouping, weekly targets, red flags, map) works unchanged.
// =====================================================================

export const FIELD_MAP = {
  village: ['group_1/village', 'group_1/Q2', 'group_1/village_name', 'village', 'village_name'],
  serial:  ['group_2/pipes', 'pipes', 'group_2/pipe_id', 'pipe_id', 'group_2/meter_id', 'meter_id', 'serial'],

  // The pipe water-level reading (mm). Both reading and endReading point here
  // because the shared logic reads "endReading" as the current value.
  reading:      ['group_2/Readings_mm', 'Readings_mm', 'group_2/readings_mm', 'group_2/reading', 'reading'],
  endReading:   ['group_2/Readings_mm', 'Readings_mm', 'group_2/readings_mm', 'group_2/reading', 'reading'],
  // No separate start/end reading pair on this form — leave unmatched so the
  // "reverse (end < start)" check never fires on pipe data.
  startReading: ['group_2/start_reading', 'start_reading'],
  // The secondary "outside validation" number, surfaced in detail views.
  validation:   ['group_2/Outside_validation', 'Outside_validation', 'outside_validation'],

  startTime: ['group_1/Start', 'group_1/start', 'group_1/start_time', 'Start', 'start_time'],
  endTime:   ['End_time', 'end_time', 'group_1/end_time', 'group_1/End'],
  date:      ['group_1/Date', 'group_1/date', 'Date', 'date', 'today'],

  photo:    ['group_2/Photo_reading', 'Photo_reading', 'group_2/photo_reading', 'group_2/field_photo', 'photo'],
  location: ['group_2/Location', 'Location', 'group_2/location', 'gps', '_geolocation'],

  surveyor: ['group_1/name', 'group_1/m_name', 'name', 'surveyor_name', 'surveyor'],
};

export function getField(submission, key) {
  if (!submission) return null;
  const conf = FIELD_MAP[key];
  if (!conf) return null;
  const candidates = Array.isArray(conf) ? conf : [conf];

  // 1) Exact match
  for (const path of candidates) {
    if (path == null) continue;
    if (path in submission) {
      const v = submission[path];
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }

  // 2) Case-insensitive full-key match
  const wantLower = candidates.map((c) => String(c).toLowerCase());
  for (const k in submission) {
    if (wantLower.includes(k.toLowerCase())) {
      const v = submission[k];
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }

  // 3) Last-path-segment match (e.g. ".../Readings_mm" matches "readings_mm")
  const wantSeg = candidates.map((c) => String(c).split('/').pop().toLowerCase());
  for (const k in submission) {
    const seg = k.split('/').pop().toLowerCase();
    if (wantSeg.includes(seg)) {
      const v = submission[k];
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }

  return null;
}

export function parseReading(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : NaN;
}
