// ---------------------------------------------------------------------------
// Coordinate parsing that accepts BOTH decimal and degree/DMS formats, so the
// Google Sheet can hold locations however the field team wrote them.
//
// Accepted lat/lng cell formats (either "lat,lng" in one cell, or already split):
//   "30.4219523 76.3615922"      (space)          -> decimal
//   "30.4219523, 76.3615922"     (comma)          -> decimal
//   "30.42195, 76.36159"                          -> decimal
//   "30°25'19.0\"N 76°21'41.7\"E"                 -> DMS with hemisphere
//   "30 25 19 N, 76 21 41 E"                      -> DMS spaced
//   "N30.4219 E76.3615"                           -> prefixed hemisphere
// ---------------------------------------------------------------------------

function dmsToDecimal(deg, min, sec, hemi) {
  let d = Math.abs(Number(deg) || 0) + (Number(min) || 0) / 60 + (Number(sec) || 0) / 3600;
  const h = String(hemi || '').toUpperCase();
  if (h === 'S' || h === 'W') d = -d;
  else if (Number(deg) < 0) d = -Math.abs(d);
  return d;
}

// Parse a single coordinate token (one of lat OR lng) that may be decimal or DMS.
function parseOne(token) {
  if (token == null) return NaN;
  let t = String(token).trim();
  if (!t) return NaN;

  // Pure decimal (optionally with a trailing hemisphere letter)
  const decMatch = t.match(/^([+-]?\d+(?:\.\d+)?)\s*([NSEW])?$/i);
  if (decMatch) {
    let v = Number(decMatch[1]);
    const h = (decMatch[2] || '').toUpperCase();
    if (h === 'S' || h === 'W') v = -Math.abs(v);
    return v;
  }
  // Leading hemisphere: "N30.42"
  const preMatch = t.match(/^([NSEW])\s*([+-]?\d+(?:\.\d+)?)$/i);
  if (preMatch) {
    let v = Number(preMatch[2]);
    if (preMatch[1].toUpperCase() === 'S' || preMatch[1].toUpperCase() === 'W') v = -Math.abs(v);
    return v;
  }
  // DMS: 30°25'19.0"N  or  30 25 19 N  or  30:25:19N
  const dms = t.match(/^(\d+(?:\.\d+)?)[°:\s]+(\d+(?:\.\d+)?)['’:\s]+(\d+(?:\.\d+)?)["”\s]*([NSEW])?$/i);
  if (dms) return dmsToDecimal(dms[1], dms[2], dms[3], dms[4]);
  // Degrees + minutes only: 30°25.316'N
  const dm = t.match(/^(\d+(?:\.\d+)?)[°:\s]+(\d+(?:\.\d+)?)['’]?\s*([NSEW])?$/i);
  if (dm) return dmsToDecimal(dm[1], dm[2], 0, dm[3]);
  return NaN;
}

// Parse a "lat,lng" style value (one string) OR return null.
export function parseLatLng(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Split into two tokens. Prefer comma; else split on whitespace between two
  // coordinate-looking chunks. DMS contains spaces, so be careful: split on a
  // comma first, and only fall back to the "two decimals separated by space".
  let latTok, lngTok;
  if (raw.includes(',')) {
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length === 2) { [latTok, lngTok] = parts; }
    else if (parts.length >= 4) {
      // "30 25 19 N, 76 21 41 E" style already handled by comma split into 2
      [latTok, lngTok] = [parts.slice(0, parts.length / 2).join(' '), parts.slice(parts.length / 2).join(' ')];
    }
  }
  if (latTok == null) {
    // No comma: try "lat lng" as two decimal numbers (Kobo's native format)
    const m = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)/);
    if (m) { latTok = m[1]; lngTok = m[2]; }
    else {
      // DMS pair separated by space + trailing hemisphere letters, e.g.
      // 30°25'19"N 76°21'41"E
      const dmsPair = raw.match(/^(.*?[NSEW])\s+(.*?[NSEW])$/i);
      if (dmsPair) { latTok = dmsPair[1]; lngTok = dmsPair[2]; }
      else {
        // Leading-hemisphere pair: "N30.42 E76.36"
        const prePair = raw.match(/^([NSEW]\s*[+-]?\d+(?:\.\d+)?)\s+([NSEW]\s*[+-]?\d+(?:\.\d+)?)$/i);
        if (prePair) { latTok = prePair[1]; lngTok = prePair[2]; }
      }
    }
  }
  if (latTok == null || lngTok == null) return null;

  const lat = parseOne(latTok);
  const lng = parseOne(lngTok);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Distance between two lat/lng points, in metres (haversine).
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
