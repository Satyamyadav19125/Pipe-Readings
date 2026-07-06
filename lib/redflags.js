import { getField, parseReading } from './fieldMap.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const ALL_FLAG_TYPES = [
  { key: 'rollback', label: 'Water level dropped vs previous reading', severity: 'high' },
  { key: 'reverse', label: 'Reverse (end < start within submission)', severity: 'high' },
  { key: 'huge_jump', label: 'Huge jump (>100,000 units)', severity: 'high' },
  { key: 'growth_anomaly', label: 'Growth anomaly (5x normal rate)', severity: 'medium' },
  { key: 'stale_no_reading', label: 'Stale (no reading for 7+ days)', severity: 'medium' },
  { key: 'stale_unchanged', label: 'Stuck (3 same readings in a row)', severity: 'medium' },
  { key: 'missing_photo', label: 'Missing photo', severity: 'low' },
  { key: 'inside_out_of_range', label: 'Inside reading outside the valid range', severity: 'high' },
  { key: 'outside_out_of_range', label: 'Outside height outside the expected band', severity: 'medium' },
  { key: 'missing_times', label: 'Start or end time missing', severity: 'low' },
  { key: 'future_date', label: 'Future-dated reading', severity: 'medium' },
  { key: 'zero_consumption', label: 'Zero usage over 7+ days', severity: 'medium' },
  { key: 'gps_outlier', label: 'GPS far from this pipe\'s usual spot', severity: 'medium' },
  { key: 'digit_count', label: 'Digit-count jump (likely typo)', severity: 'medium' },
  { key: 'out_of_sequence', label: 'Date earlier than previous reading', severity: 'medium' },
  { key: 'duplicate_same_day', label: 'Same pipe read twice in one day', severity: 'low' },
  { key: 'identical_gps', label: 'Same GPS used by different pipes', severity: 'medium' },
  { key: 'fabrication_speed', label: 'Surveyor logged readings impossibly fast', severity: 'medium' },
  { key: 'night_reading', label: 'Reading taken at night (10pm-5am)', severity: 'low' },
  { key: 'village_outlier', label: 'Usage far above village neighbours', severity: 'medium' },
];

function parseLoc(val) {
  if (val == null) return null;
  if (typeof val === 'object') {
    const lat = val.latitude ?? val.lat ?? (Array.isArray(val) ? val[0] : undefined);
    const lng = val.longitude ?? val.lng ?? (Array.isArray(val) ? val[1] : undefined);
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
    return null;
  }
  const parts = String(val).trim().split(/\s+/).map(Number);
  if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) return { lat: parts[0], lng: parts[1] };
  return null;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function hourOf(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  return Number.isNaN(h) ? null : h;
}

export function groupBySerial(submissions) {
  const groups = {};
  for (const sub of submissions) {
    const serial = getField(sub, 'serial');
    if (!serial) continue;
    if (!groups[serial]) groups[serial] = [];
    groups[serial].push(sub);
  }
  for (const serial in groups) {
    groups[serial].sort((a, b) => new Date(a._submission_time).getTime() - new Date(b._submission_time).getTime());
  }
  return groups;
}

function medianDailyGrowth(list) {
  const rates = [];
  for (let i = 1; i < list.length; i++) {
    const a = parseReading(getField(list[i - 1], 'endReading'));
    const b = parseReading(getField(list[i], 'endReading'));
    const t0 = new Date(list[i - 1]._submission_time).getTime();
    const t1 = new Date(list[i]._submission_time).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const days = (t1 - t0) / MS_PER_DAY;
    if (days <= 0) continue;
    const delta = b - a;
    if (delta < 0) continue;
    rates.push(delta / days);
  }
  if (rates.length < 2) return null;
  return median(rates);
}

export function detectRedFlags(submissions, options = {}) {
  const {
    enabled = {}, hugeJumpThreshold = 100000, staleDays = 7,
    anomalyMultiplier = 5, nowDate = new Date(), pipe = {},
  } = options;
  // Pipe standards (mm) from Settings -> Pipe parameters. Each check only
  // runs when its numbers are actually configured (empty = disabled).
  // Backward compatible with the older maxInsideMm / outsideMin/Max shape.
  // '' or null means "not configured" — Number('') would be 0, which is a trap.
  const num = (v) => (v === '' || v == null ? NaN : Number(v));
  const insideMin = Number.isFinite(num(pipe.insideMinMm)) ? num(pipe.insideMinMm) : 0;
  const insideMax = Number.isFinite(num(pipe.insideMaxMm)) ? num(pipe.insideMaxMm) : num(pipe.maxInsideMm);
  const outsideStd = num(pipe.outsideStandardMm);
  const outsideTol = Number.isFinite(num(pipe.outsideToleranceMm)) ? num(pipe.outsideToleranceMm) : 0;
  const legacyOutMin = num(pipe.outsideMinMm);
  const legacyOutMax = num(pipe.outsideMaxMm);
  const isOn = (k) => enabled[k] !== false;
  const isOptIn = (k) => enabled[k] === true;

  const groups = groupBySerial(submissions);
  const flagged = {};
  const push = (id, serial, flag) => {
    if (!flagged[id]) flagged[id] = { flags: [], serial };
    flagged[id].flags.push(flag);
  };

  // ---- GLOBAL PRE-PASSES (for cross-meter / cross-surveyor checks) ----

  // identical_gps: which exact coordinates are shared by multiple distinct meters
  const gpsToSerials = {};
  const coordKeyOf = {};
  if (isOptIn('identical_gps')) {
    for (const sub of submissions) {
      const loc = parseLoc(getField(sub, 'location')) || parseLoc(sub._geolocation);
      const serial = getField(sub, 'serial');
      if (!loc || !serial) continue;
      const key = `${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
      coordKeyOf[sub._id] = key;
      if (!gpsToSerials[key]) gpsToSerials[key] = new Set();
      gpsToSerials[key].add(String(serial));
    }
  }

  // fabrication_speed: per surveyor, submissions less than 15s apart
  const fabSuspect = new Set();
  if (isOptIn('fabrication_speed')) {
    const bySurveyor = {};
    for (const sub of submissions) {
      const sv = getField(sub, 'surveyor') || 'Unknown';
      if (!bySurveyor[sv]) bySurveyor[sv] = [];
      bySurveyor[sv].push({ id: sub._id, t: new Date(sub._submission_time).getTime() });
    }
    for (const sv in bySurveyor) {
      const arr = bySurveyor[sv].sort((a, b) => a.t - b.t);
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].t - arr[i - 1].t < 15000) fabSuspect.add(arr[i].id);
      }
    }
  }

  // village_outlier: meters whose avg daily usage is far above their village median
  const villageOutlierLatestId = new Set();
  if (isOptIn('village_outlier')) {
    const meterAvg = {};   // serial -> avg daily usage
    const meterVillage = {};
    const meterLatestId = {};
    for (const serial in groups) {
      const list = groups[serial];
      const med = medianDailyGrowth(list);
      if (med != null) meterAvg[serial] = med;
      meterVillage[serial] = getField(list[list.length - 1], 'village') || 'Unknown';
      meterLatestId[serial] = list[list.length - 1]._id;
    }
    const byVillage = {};
    for (const serial in meterAvg) {
      const v = meterVillage[serial];
      if (!byVillage[v]) byVillage[v] = [];
      byVillage[v].push({ serial, avg: meterAvg[serial] });
    }
    for (const v in byVillage) {
      const arr = byVillage[v];
      if (arr.length < 3) continue;
      const vm = median(arr.map((x) => x.avg));
      if (!vm || vm <= 0) continue;
      for (const { serial, avg } of arr) {
        if (avg > vm * 4 && avg > 50) villageOutlierLatestId.add(meterLatestId[serial]);
      }
    }
  }

  // ---- PER-METER / PER-SUBMISSION CHECKS ----
  for (const serial in groups) {
    const list = groups[serial];
    const med = medianDailyGrowth(list);

    const locs = list.map((s) => parseLoc(getField(s, 'location')) || parseLoc(s._geolocation)).filter(Boolean);
    let centre = null;
    if (locs.length >= 3) centre = { lat: median(locs.map((l) => l.lat)), lng: median(locs.map((l) => l.lng)) };

    const digitCounts = list.map((s) => {
      const r = parseReading(getField(s, 'endReading'));
      return Number.isNaN(r) ? null : String(Math.trunc(Math.abs(r))).length;
    }).filter((x) => x != null);
    const medDigits = median(digitCounts);

    const seenDays = {};

    for (let i = 0; i < list.length; i++) {
      const sub = list[i];
      const id = sub._id;
      const startR = parseReading(getField(sub, 'startReading'));
      const endR = parseReading(getField(sub, 'endReading'));
      const subTime = new Date(sub._submission_time).getTime();

      if (isOn('reverse') && !Number.isNaN(startR) && !Number.isNaN(endR) && startR !== endR && endR < startR) {
        push(id, serial, { type: 'reverse', severity: 'high', message: `End reading (${endR}) < start reading (${startR})` });
      }

      if (isOptIn('missing_photo')) {
        const hasPhoto = (sub._attachments && sub._attachments.length > 0) || getField(sub, 'photo');
        if (!hasPhoto) push(id, serial, { type: 'missing_photo', severity: 'low', message: 'No photo attached to this submission' });
      }

      // Start / end time of the visit must both be filled
      if (isOn('missing_times')) {
        const st = getField(sub, 'startTime');
        const et = getField(sub, 'endTime');
        if (!st || !et) {
          const which = !st && !et ? 'Start and end times are' : (!st ? 'Start time is' : 'End time is');
          push(id, serial, { type: 'missing_times', severity: 'low', message: `${which} missing on this submission` });
        }
      }

      // "Measure water level inside the PVC pipe" — must be inside the valid range
      if (isOn('inside_out_of_range') && Number.isFinite(insideMax) && !Number.isNaN(endR)) {
        if (endR < insideMin || endR > insideMax) {
          push(id, serial, { type: 'inside_out_of_range', severity: 'high', message: `Inside water level ${endR} mm is outside the valid ${insideMin}–${insideMax} mm range (Settings → Pipe parameters)` });
        }
      }

      // "Measure the pipe from the outside" — must equal the standard (± tolerance)
      if (isOn('outside_out_of_range')) {
        const outsideR = parseReading(getField(sub, 'validation'));
        if (!Number.isNaN(outsideR)) {
          if (Number.isFinite(outsideStd)) {
            if (Math.abs(outsideR - outsideStd) > outsideTol) {
              push(id, serial, { type: 'outside_out_of_range', severity: 'medium', message: `Outside height ${outsideR} mm differs from the ${outsideStd} mm standard${outsideTol > 0 ? ` (±${outsideTol} allowed)` : ''} — wrong measurement, or pipe sunk / lifted / re-installed` });
            }
          } else if (Number.isFinite(legacyOutMin) && Number.isFinite(legacyOutMax)) {
            if (outsideR < legacyOutMin || outsideR > legacyOutMax) {
              push(id, serial, { type: 'outside_out_of_range', severity: 'medium', message: `Outside height ${outsideR} mm is outside the expected ${legacyOutMin}–${legacyOutMax} mm band` });
            }
          }
        }
      }

      if (isOn('future_date')) {
        const d = getField(sub, 'date');
        if (d) {
          const dt = new Date(d).getTime();
          if (!Number.isNaN(dt) && dt > nowDate.getTime() + MS_PER_DAY) {
            push(id, serial, { type: 'future_date', severity: 'medium', message: `Reading date (${d}) is in the future` });
          }
        }
      }

      if (isOptIn('digit_count') && medDigits && !Number.isNaN(endR)) {
        const dc = String(Math.trunc(Math.abs(endR))).length;
        if (Math.abs(dc - medDigits) >= 2) {
          push(id, serial, { type: 'digit_count', severity: 'medium', message: `Reading ${endR} has ${dc} digits but this pipe usually has ${medDigits}. Possible extra/missing digit.` });
        }
      }

      if (isOptIn('gps_outlier') && centre) {
        const loc = parseLoc(getField(sub, 'location')) || parseLoc(sub._geolocation);
        if (loc) {
          const dist = haversineMeters(centre, loc);
          if (dist > 500) {
            push(id, serial, { type: 'gps_outlier', severity: 'medium', message: `Reading taken ${Math.round(dist)} m from where this pipe is usually read. Possible wrong pipe or location error.` });
          }
        }
      }

      if (isOptIn('identical_gps')) {
        const key = coordKeyOf[id];
        if (key && gpsToSerials[key] && gpsToSerials[key].size > 1) {
          push(id, serial, { type: 'identical_gps', severity: 'medium', message: `These exact GPS coordinates are used by ${gpsToSerials[key].size} different pipes. Surveyor may not have moved between pipes.` });
        }
      }

      if (isOptIn('night_reading')) {
        const h = hourOf(getField(sub, 'endTime') || getField(sub, 'startTime'));
        if (h != null && (h < 5 || h >= 22)) {
          push(id, serial, { type: 'night_reading', severity: 'low', message: `Reading taken at ${String(h).padStart(2, '0')}:00 — unusual hour for field work.` });
        }
      }

      if (isOptIn('fabrication_speed') && fabSuspect.has(id)) {
        push(id, serial, { type: 'fabrication_speed', severity: 'medium', message: `Logged less than 15 seconds after the same surveyor's previous reading. (Note: offline bulk-uploads can also cause this.)` });
      }

      if (isOptIn('duplicate_same_day')) {
        const t = new Date(sub._submission_time).getTime();
        if (!Number.isNaN(t)) {
          const dayKey = new Date(t).toISOString().slice(0, 10);
          if (seenDays[dayKey]) {
            push(id, serial, { type: 'duplicate_same_day', severity: 'low', message: `This pipe was already read on ${dayKey}` });
          }
          seenDays[dayKey] = true;
        }
      }

      if (i > 0) {
        const prev = list[i - 1];
        const prevEnd = parseReading(getField(prev, 'endReading'));
        const prevTime = new Date(prev._submission_time).getTime();
        const daysGap = (subTime - prevTime) / MS_PER_DAY;

        if (isOn('out_of_sequence')) {
          const dPrev = new Date(getField(prev, 'date') || prev._submission_time).getTime();
          const dCur = new Date(getField(sub, 'date') || sub._submission_time).getTime();
          if (!Number.isNaN(dPrev) && !Number.isNaN(dCur) && dCur < dPrev - MS_PER_DAY) {
            push(id, serial, { type: 'out_of_sequence', severity: 'medium', message: `Reading date is earlier than the previous reading's date` });
          }
        }

        if (!Number.isNaN(prevEnd) && !Number.isNaN(endR)) {
          if (isOn('rollback') && endR < prevEnd) {
            push(id, serial, { type: 'rollback', severity: 'high', message: `Reading ${endR} < previous ${prevEnd} (level dropped vs previous reading)`, previousReading: prevEnd, previousSubmissionId: prev._id, previousDate: prev._submission_time, currentReading: endR });
          } else if (isOn('huge_jump') && endR - prevEnd > hugeJumpThreshold) {
            push(id, serial, { type: 'huge_jump', severity: 'high', message: `Reading jumped by ${(endR - prevEnd).toLocaleString()} (${prevEnd} -> ${endR}). Likely an extra digit.`, previousReading: prevEnd, previousSubmissionId: prev._id, previousDate: prev._submission_time, currentReading: endR });
          } else if (isOn('growth_anomaly') && med !== null && daysGap > 0) {
            const rate = (endR - prevEnd) / daysGap;
            if (med > 0 && rate > med * anomalyMultiplier && (endR - prevEnd) > 50) {
              push(id, serial, { type: 'growth_anomaly', severity: 'medium', message: `Used ${(endR - prevEnd).toLocaleString()} units in ${daysGap.toFixed(1)} days. Typical is about ${(med * daysGap).toFixed(0)} units - ${(rate / med).toFixed(1)}x higher than usual.`, previousReading: prevEnd, previousSubmissionId: prev._id, previousDate: prev._submission_time, currentReading: endR });
            }
          }

          if (isOptIn('zero_consumption') && daysGap >= 7 && endR === prevEnd && endR > 0) {
            push(id, serial, { type: 'zero_consumption', severity: 'medium', message: `No water used in ${daysGap.toFixed(0)} days (reading stayed at ${endR}). Level unchanged across visits.` });
          }
        }
      }
    }

    // stale checks + village outlier on the latest reading
    if (list.length > 0) {
      const last = list[list.length - 1];
      const id = last._id;
      const daysSince = (nowDate.getTime() - new Date(last._submission_time).getTime()) / MS_PER_DAY;
      const lastReading = parseReading(getField(last, 'endReading'));

      if (isOn('stale_no_reading') && daysSince > staleDays) {
        push(id, serial, { type: 'stale_no_reading', severity: 'medium', message: `No reading taken for ${daysSince.toFixed(0)} days on pipe ${serial}` });
      }
      if (isOn('stale_unchanged') && list.length >= 3) {
        const a = parseReading(getField(list[list.length - 3], 'endReading'));
        const b = parseReading(getField(list[list.length - 2], 'endReading'));
        const c = lastReading;
        if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c) && a === b && b === c && a > 0) {
          push(id, serial, { type: 'stale_unchanged', severity: 'medium', message: `Reading has not changed across the last 3 submissions (${c}). Meter may be stuck.` });
        }
      }
      if (isOptIn('village_outlier') && villageOutlierLatestId.has(id)) {
        push(id, serial, { type: 'village_outlier', severity: 'medium', message: `This pipe's average daily change is far higher than other pipes in the same village.` });
      }
    }
  }

  return flagged;
}
