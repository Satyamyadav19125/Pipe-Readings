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

function hhmmNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  // Kobo time answers look like HH:MM:SS.000+05:30 — send a valid-looking one.
  return `${p(d.getHours())}:${p(d.getMinutes())}:00.000`;
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
  // Start time: Kobo auto-captures it, and pre-filling a partial time made
  // the form re-prompt for it. So we DON'T send start by default.
  if (opts.includeStart === true) add(paths.start, hhmmNow());

  if (params.length === 0) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}${params.join('&')}`;
}
