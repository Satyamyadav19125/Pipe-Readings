// ---------------------------------------------------------------------------
// SAFE DEMO DATA for the guest (read-only) viewer.
//
// Guests never see real Kobo submissions. Instead every guest view is fed this
// synthetic dataset — well-formed fake villages, farms, pipes, readings and
// GPS — so the demo looks fully populated (villages, flags, consumption,
// duplicates, a map) without exposing any real project data.
// ---------------------------------------------------------------------------

// A little inline SVG "photo" so demo submissions have images that render
// (no broken thumbnails, no missing-photo flags) without hitting Kobo.
const DEMO_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160">
    <rect width="240" height="160" fill="#e0f2fe"/>
    <circle cx="120" cy="80" r="46" fill="#bae6fd" stroke="#38bdf8" stroke-width="4"/>
    <circle cx="120" cy="80" r="30" fill="#7dd3fc"/>
    <text x="120" y="140" font-family="sans-serif" font-size="13" fill="#0369a1" text-anchor="middle">demo pipe photo</text>
  </svg>`
);

// Fixed demo infrastructure. Coordinates sit in a tidy cluster (so the map and
// the "far from project" check behave), but are NOT a real location.
const DEMO_PIPES = [
  { serial: 'GRN_2001A', farm: 'DM_GREEN_PLT_01', village: 'Greenfield', lat: 30.402, lng: 76.352 },
  { serial: 'GRN_2001B', farm: 'DM_GREEN_PLT_01', village: 'Greenfield', lat: 30.4025, lng: 76.3526 },
  { serial: 'RIV_3002A', farm: 'DM_RIVER_PLT_02', village: 'Riverside', lat: 30.411, lng: 76.361 },
  { serial: 'RIV_3002B', farm: 'DM_RIVER_PLT_02', village: 'Riverside', lat: 30.4116, lng: 76.3617 },
  { serial: 'HIL_4003A', farm: 'DM_HILL_PLT_03', village: 'Hillcrest', lat: 30.421, lng: 76.343 },
  { serial: 'HIL_4003B', farm: 'DM_HILL_PLT_03', village: 'Hillcrest', lat: 30.4217, lng: 76.3436 },
];
const DEMO_SURVEYORS = ['Aman', 'Bikram', 'Chandni'];

export function getDemoMaster() {
  const villages = Array.from(new Set(DEMO_PIPES.map((p) => p.village)));
  return { ok: true, villages, pipes: DEMO_PIPES.map((p) => ({ serial: p.serial, farm: p.farm, village: p.village })) };
}

export function getDemoAssignments() {
  // One "team member" per village, so the guest Team/Assignment view isn't empty.
  const byVillage = {};
  for (const p of DEMO_PIPES) (byVillage[p.village] ||= []);
  const villages = Object.keys(byVillage);
  return villages.map((v, i) => ({
    person: DEMO_SURVEYORS[i % DEMO_SURVEYORS.length],
    villages: [v],
    phone: '',
    bio: 'Demo field surveyor',
  }));
}

function pad(n) { return String(n).padStart(2, '0'); }

function makeRow(id, date, p, reading, outside, surveyor, withPhoto = true) {
  const iso = date.toISOString();
  const dateStr = iso.slice(0, 10);
  // tiny deterministic jitter so pins don't stack exactly
  const j = ((id % 7) - 3) * 0.00012;
  const lat = p.lat + j;
  const lng = p.lng + j;
  const atts = withPhoto ? [
    { filename: `demo_${id}_reading.jpg`, download_url: DEMO_PHOTO, download_small_url: DEMO_PHOTO, question_xpath: 'group_2/Photo_reading', media_file_basename: `demo_${id}_reading.jpg` },
    { filename: `demo_${id}_field.jpg`, download_url: DEMO_PHOTO, download_small_url: DEMO_PHOTO, question_xpath: 'group_2/field_photo', media_file_basename: `demo_${id}_field.jpg` },
  ] : [];
  return {
    _id: id,
    _submission_time: iso,
    _geolocation: [lat, lng],
    _attachments: atts,
    _demo: true,
    'group_1/Date': dateStr,
    'group_1/Start': `${pad(8 + (id % 6))}:${pad((id * 7) % 60)}:00.000+05:30`,
    'End_time': `${pad(8 + (id % 6))}:${pad(((id * 7) % 60) + 5 > 59 ? 59 : ((id * 7) % 60) + 5)}:00.000+05:30`,
    'group_1/name': surveyor,
    'group_1/village': p.village,
    'group_2/farm': p.farm,
    'group_2/pipes': p.serial,
    'group_2/Readings_mm': reading,
    'group_2/Outside_validation': outside,
    'group_2/Location': `${lat} ${lng} 0 0`,
  };
}

// Generate `count` demo submissions across the demo pipes, each pipe getting a
// few readings over the past weeks so consumption + the reading-timeline work.
// A couple are intentionally out-of-range / missing-photo so the guest sees
// what red flags look like, and one pipe is read twice on a day (a duplicate).
export function getDemoSubmissions(count = 20) {
  const n = Math.max(6, Math.min(80, Math.round(Number(count) || 20)));
  const rows = [];
  const now = Date.now();
  let id = 990001;
  const perPipe = Math.max(2, Math.ceil(n / DEMO_PIPES.length));

  for (let pi = 0; pi < DEMO_PIPES.length && rows.length < n; pi++) {
    const p = DEMO_PIPES[pi];
    let last = 120 + pi * 10;
    for (let r = 0; r < perPipe && rows.length < n; r++) {
      // spaced roughly a week apart, most recent first
      const daysAgo = (perPipe - 1 - r) * 6 + pi;
      const d = new Date(now - daysAgo * 86400000);
      // a gentle wetting/drying wave
      last = Math.max(40, Math.min(250, last + ((r % 2 === 0) ? 35 : -25)));
      let reading = last;
      let outside = 150;
      let withPhoto = true;
      // seed a few flags
      if (p.serial === 'RIV_3002B' && r === perPipe - 1) reading = 340;        // inside out of range
      if (p.serial === 'HIL_4003A' && r === perPipe - 1) outside = 120;         // outside out of band
      if (p.serial === 'GRN_2001B' && r === 0) withPhoto = false;              // missing photo
      const surveyor = DEMO_SURVEYORS[(pi + r) % DEMO_SURVEYORS.length];
      rows.push(makeRow(id++, d, p, reading, outside, surveyor, withPhoto));
    }
  }

  // A same-day duplicate on the first pipe (so the Duplicate tab isn't empty).
  if (rows.length >= 2) {
    const first = rows[0];
    const dup = makeRow(id++, new Date(first._submission_time), DEMO_PIPES[0], (first['group_2/Readings_mm'] || 150) + 20, 150, DEMO_SURVEYORS[1], true);
    rows.push(dup);
  }

  // newest submitted first
  rows.sort((a, b) => new Date(b._submission_time) - new Date(a._submission_time));
  return rows.slice(0, n);
}
