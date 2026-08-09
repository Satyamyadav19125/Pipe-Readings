// ---------------------------------------------------------------------------
// Build a Kobo/Enketo "New reading" URL with fields pre-filled for one pipe.
//
// Enketo (the web form behind KoboToolbox) accepts URL query parameters in the
// form  ?d[field_path]=value  which pre-populate matching questions. So from a
// pending-pipe row we can hand the surveyor a link that already has the village,
// farm, pipe, their name and today's date filled — they only enter the outside
// height, water level, GPS and photos.
//
// The field PATHS must match the Kobo form's question names. These are the
// paths this dashboard already maps (see lib/fieldMap.js); they're overridable
// per-form in Settings if a form uses different names.
// ---------------------------------------------------------------------------

const DEFAULT_PATHS = {
  village: 'group_1/village',
  farm: 'group_2/farm',
  pipe: 'group_2/pipes',
  name: 'group_1/name',
  date: 'group_1/Date',
  start: 'group_1/Start',
};

function koboTimeNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  // Kobo/Enketo time answers are full ISO-ish times WITH a timezone offset,
  // e.g. 16:00:00.000+05:30. Sending a partial time (no seconds / no offset)
  // made Enketo treat the answer as incomplete and re-prompt for it, which is
  // why the start time appeared blank. Build the complete value here.
  const offMin = -d.getTimezoneOffset();          // e.g. +330 for IST
  const sign = offMin >= 0 ? '+' : '-';
  const oh = p(Math.floor(Math.abs(offMin) / 60));
  const om = p(Math.abs(offMin) % 60);
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.000${sign}${oh}:${om}`;
}

// values: { village, farm, pipe, name } ; opts.paths overrides field paths.
export function buildPrefillUrl(baseUrl, values, opts = {}) {
  if (!baseUrl) return null;
  const paths = { ...DEFAULT_PATHS, ...(opts.paths || {}) };
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const params = [];
  const add = (path, val) => {
    if (path && val != null && String(val).trim() !== '') {
      params.push(`d[${encodeURIComponent(path)}]=${encodeURIComponent(val)}`);
    }
  };
  add(paths.village, values.village);
  add(paths.farm, values.farm);
  add(paths.pipe, values.pipe);
  add(paths.name, values.name);
  add(paths.date, today);
  // Start time: fill the real current time by default (a complete value with
  // timezone, so Enketo accepts it and doesn't re-prompt). Pass
  // includeStart:false to opt out for a specific link.
  if (opts.includeStart !== false) add(paths.start, koboTimeNow());

  if (params.length === 0) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}${params.join('&')}`;
}
