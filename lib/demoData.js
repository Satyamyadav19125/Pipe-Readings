// ---------------------------------------------------------------------------
// SAFE DEMO DATA for the guest (read-only) viewer.
//
// Guests never see real Kobo submissions. Instead every guest view is fed this
// synthetic dataset — well-formed fake villages, farms, pipes, readings and
// GPS — so the demo looks fully populated (villages, flags, consumption,
// duplicates, a map) without exposing any real project data.
// ---------------------------------------------------------------------------

// Inline SVG "photos" so demo submissions have images that render without
// hitting Kobo (real field photos would expose actual data to guests). These
// are illustrated to look like an actual pipe reading + field shot.
function svgUri(svg) { return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64'); }

// Close-up: looking down a white PVC pipe with water inside + a measuring rule.
const DEMO_PHOTO_READING = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
    <defs>
      <radialGradient id="soil" cx="50%" cy="40%" r="80%"><stop offset="0%" stop-color="#8d9e6a"/><stop offset="100%" stop-color="#5c6b3f"/></radialGradient>
      <radialGradient id="water" cx="50%" cy="35%" r="70%"><stop offset="0%" stop-color="#3a556b"/><stop offset="60%" stop-color="#22384a"/><stop offset="100%" stop-color="#152532"/></radialGradient>
      <linearGradient id="pvc" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#cfd8dc"/><stop offset="45%" stop-color="#fbfdff"/><stop offset="100%" stop-color="#aeb8bd"/></linearGradient>
    </defs>
    <rect width="320" height="240" fill="url(#soil)"/>
    <g opacity="0.35" stroke="#3f4a2a" stroke-width="2"><path d="M20 40 l40 30"/><path d="M300 60 l-40 24"/><path d="M40 210 l30 -34"/><path d="M280 205 l-26 -30"/></g>
    <ellipse cx="160" cy="126" rx="92" ry="80" fill="#8a929a"/>
    <ellipse cx="160" cy="120" rx="92" ry="80" fill="url(#pvc)"/>
    <ellipse cx="160" cy="120" rx="70" ry="60" fill="#5b656b"/>
    <ellipse cx="160" cy="130" rx="60" ry="50" fill="url(#water)"/>
    <ellipse cx="150" cy="118" rx="20" ry="9" fill="#6f8496" opacity="0.55"/>
    <rect x="152" y="34" width="16" height="150" rx="2" fill="#f4e9c9" stroke="#b9a765" stroke-width="1.5"/>
    <g stroke="#7a6b3a" stroke-width="1.4">
      <line x1="152" y1="54" x2="168" y2="54"/><line x1="152" y1="74" x2="168" y2="74"/>
      <line x1="152" y1="94" x2="168" y2="94"/><line x1="152" y1="114" x2="168" y2="114"/>
      <line x1="152" y1="134" x2="168" y2="134"/><line x1="152" y1="154" x2="168" y2="154"/>
    </g>
    <line x1="150" y1="130" x2="205" y2="130" stroke="#ef4444" stroke-width="2.5"/>
    <rect x="206" y="120" width="60" height="22" rx="4" fill="#111827" opacity="0.75"/>
    <text x="236" y="135" font-family="sans-serif" font-size="13" fill="#fff" text-anchor="middle">water</text>
  </svg>`
);
// Wider field shot: a pipe standing in a green paddy field under a bright sky.
const DEMO_PHOTO_FIELD = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#bfe3ff"/><stop offset="100%" stop-color="#e8f6ff"/></linearGradient>
      <linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7bbf4f"/><stop offset="100%" stop-color="#3f7a2e"/></linearGradient>
    </defs>
    <rect width="320" height="150" fill="url(#sky)"/>
    <circle cx="270" cy="46" r="26" fill="#fff6cf" opacity="0.9"/>
    <rect y="118" width="320" height="122" fill="url(#field)"/>
    <path d="M0 130 Q160 110 320 132 L320 150 L0 150 Z" fill="#5aa53c" opacity="0.6"/>
    <g stroke="#2f5f23" stroke-width="2" opacity="0.5">
      <path d="M30 230 V150"/><path d="M70 235 V158"/><path d="M120 232 V150"/><path d="M210 236 V156"/><path d="M260 232 V150"/><path d="M300 236 V158"/>
    </g>
    <rect x="150" y="96" width="26" height="120" rx="5" fill="#eef2f4" stroke="#9aa4a9" stroke-width="2"/>
    <ellipse cx="163" cy="98" rx="13" ry="5" fill="#7d8a91"/>
    <ellipse cx="163" cy="97" rx="10" ry="4" fill="#2b3b46"/>
    <text x="160" y="230" font-family="sans-serif" font-size="12" fill="#eafbe0" text-anchor="middle" opacity="0.9">field view</text>
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

// Fake group-chat so guests never see the real team's private conversation.
export function getDemoChat() {
  const now = Date.now();
  const mk = (i, name, role, text, minsAgo) => ({
    id: `demo-msg-${i}`, channel: 'group', from: `demo-${name}`, name, role,
    text, kind: 'text', reactions: {}, ts: new Date(now - minsAgo * 60000).toISOString(),
  });
  return [
    mk(1, 'Project Admin', 'admin', 'Good morning team — please upload today’s readings when you can.', 620),
    mk(2, 'Aman', 'user', 'Morning! Greenfield done ✅', 585),
    mk(3, 'Bikram', 'user', 'Riverside pipes read, uploading now.', 560),
    mk(4, 'Chandni', 'user', 'Hillcrest 4003A looks a bit low, I’ll re-check tomorrow.', 505),
    mk(5, 'Project Admin', 'admin', 'Great work everyone 👏', 470),
    mk(6, 'Aman', 'user', 'One reading photo was blurry, re-took it 📸', 110),
  ];
}

// Fake tasks for the guest Tasks view.
export function getDemoTasks() {
  const now = Date.now();
  const mk = (i, assignedTo, title, notes, done, dueDate) => ({
    id: `demo-task-${i}`, assignedTo, title, notes,
    done, doneAt: done ? new Date(now - 86400000).toISOString() : null,
    dueType: dueDate ? 'date' : 'week', dueDate: dueDate || '',
    createdAt: new Date(now - 3 * 86400000).toISOString(),
  });
  return [
    mk(1, 'Aman', 'Re-read Greenfield GRN_2001B (photo was missing)', 'Take a clear reading + field photo', false, ''),
    mk(2, 'Bikram', 'Verify Riverside outside heights', 'A couple looked off vs the 150 mm standard', false, ''),
    mk(3, 'Chandni', 'Upload Hillcrest readings', '', true, ''),
  ];
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

function makeRow(id, date, p, reading, outside, surveyor, withPhoto = true, realPhotos = null) {
  const iso = date.toISOString();
  const dateStr = iso.slice(0, 10);
  // tiny deterministic jitter so pins don't stack exactly
  const j = ((id % 7) - 3) * 0.00012;
  const lat = p.lat + j;
  const lng = p.lng + j;
  let atts = [];
  if (withPhoto) {
    if (Array.isArray(realPhotos) && realPhotos.length >= 1) {
      // Use REAL photos pulled from the project's own Kobo data.
      atts = realPhotos;
    } else {
      atts = [
        { filename: `demo_${id}_reading.jpg`, download_url: DEMO_PHOTO_READING, download_small_url: DEMO_PHOTO_READING, question_xpath: 'group_2/Photo_reading', media_file_basename: `demo_${id}_reading.jpg` },
        { filename: `demo_${id}_field.jpg`, download_url: DEMO_PHOTO_FIELD, download_small_url: DEMO_PHOTO_FIELD, question_xpath: 'group_2/field_photo', media_file_basename: `demo_${id}_field.jpg` },
      ];
    }
  }
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
export function getDemoSubmissions(count = 20, realPhotos = []) {
  const n = Math.max(6, Math.min(80, Math.round(Number(count) || 20)));
  const rows = [];
  const now = Date.now();
  let id = 990001;
  const perPipe = Math.max(2, Math.ceil(n / DEMO_PIPES.length));
  // Pair up real Kobo photos (2 per form) so the demo shows actual field photos.
  const pool = Array.isArray(realPhotos) ? realPhotos : [];
  const photosFor = (i) => (pool.length >= 1 ? [pool[(i * 2) % pool.length], pool[(i * 2 + 1) % pool.length]].filter(Boolean) : null);
  let photoIdx = 0;

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
      rows.push(makeRow(id++, d, p, reading, outside, surveyor, withPhoto, withPhoto ? photosFor(photoIdx++) : null));
    }
  }

  // A same-day duplicate on the first pipe (so the Duplicate tab isn't empty).
  if (rows.length >= 2) {
    const first = rows[0];
    const dup = makeRow(id++, new Date(first._submission_time), DEMO_PIPES[0], (first['group_2/Readings_mm'] || 150) + 20, 150, DEMO_SURVEYORS[1], true, photosFor(photoIdx++));
    rows.push(dup);
  }

  // newest submitted first
  rows.sort((a, b) => new Date(b._submission_time) - new Date(a._submission_time));
  return rows.slice(0, n);
}
