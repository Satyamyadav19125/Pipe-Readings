// ---------------------------------------------------------------------------
// AWD irrigation status from a pipe's LATEST inside water-level reading.
//
// Rule (configurable in Settings -> Pipe parameters): a reading at or below
// `irrigateAtOrBelowMm` means the field has dried to the AWD trigger depth and
// needs irrigating now. A small band above it is "getting low" (visit soon),
// everything higher is "wet".
//
//   status: 'dry'  -> irrigate now   (red)
//           'low'  -> getting low     (amber)
//           'wet'  -> fine            (blue/green)
//           'na'   -> no numeric reading / feature disabled
// ---------------------------------------------------------------------------

export function irrigationThreshold(pipeSettings) {
  const v = pipeSettings?.irrigateAtOrBelowMm;
  const n = v === '' || v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function irrigationStatus(readingMm, threshold) {
  if (threshold == null) return 'na';
  const r = readingMm === '' || readingMm == null ? NaN : Number(readingMm);
  if (!Number.isFinite(r)) return 'na';
  if (r <= threshold) return 'dry';
  // "getting low" = within 25 mm (or 50% of the threshold, whichever larger)
  const band = Math.max(25, threshold * 0.5);
  if (r <= threshold + band) return 'low';
  return 'wet';
}

export const IRRIGATION_META = {
  dry: { label: 'Irrigate now', color: '#dc2626', pin: 'red', emoji: '🔴' },
  low: { label: 'Getting low', color: '#f59e0b', pin: 'orange', emoji: '🟠' },
  wet: { label: 'Wet / fine', color: '#2563eb', pin: 'blue', emoji: '🔵' },
  na:  { label: 'No reading', color: '#94a3b8', pin: 'grey', emoji: '⚪' },
};

// Reduce many submissions to the LATEST reading per pipe, with its status.
// Returns { byPipe: Map(serial -> {serial, village, reading, status, ts, id}),
//           counts: { dry, low, wet, na } }
export function latestPerPipe(submissions, getField, threshold) {
  const byPipe = new Map();
  for (const s of submissions) {
    const serial = getField(s, 'serial');
    if (!serial) continue;
    const tStr = getField(s, 'date') || s._submission_time;
    const ts = tStr ? new Date(tStr).getTime() : 0;
    const prev = byPipe.get(serial);
    if (!prev || ts >= prev.ts) {
      byPipe.set(serial, {
        serial,
        village: getField(s, 'village') || 'Unknown',
        reading: getField(s, 'endReading') ?? getField(s, 'reading'),
        ts,
        id: s._id,
      });
    }
  }
  const counts = { dry: 0, low: 0, wet: 0, na: 0 };
  for (const v of byPipe.values()) {
    v.status = irrigationStatus(v.reading, threshold);
    counts[v.status] += 1;
  }
  return { byPipe, counts };
}
