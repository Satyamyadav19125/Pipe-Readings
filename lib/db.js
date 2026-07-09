import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let cached = global._mongoClient;

function getClient() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it in Vercel → Settings → Environment Variables.');
  }
  if (!cached) {
    cached = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 });
    global._mongoClient = cached;
  }
  return cached;
}

async function getCollection(name) {
  const client = getClient();
  const db = client.db('pipe_readings');
  return db.collection(name);
}

// ---- CIRCUIT BREAKER --------------------------------------------------
// If a DB call fails, remember it for a short window so we DON'T wait for
// another 3s timeout on every subsequent call. This keeps the whole site
// fast even when the DB password is wrong / DB is unreachable.
let _mongoDownUntil = 0;
function mongoIsDown() { return Date.now() < _mongoDownUntil; }
function markMongoDown() { _mongoDownUntil = Date.now() + 15000; }
function markMongoUp() { _mongoDownUntil = 0; }

export function getMongoHealth() {
  return { configured: isDbConfigured(), down: mongoIsDown() };
}

// ---- tiny in-memory cache so settings/assignments aren't re-read constantly ----
const _cache = { assignments: null, settings: null, ts: 0 };
const CACHE_TTL = 20000;
function cacheFresh() { return Date.now() - _cache.ts < CACHE_TTL; }
function bustCache() { _cache.assignments = null; _cache.settings = null; _cache.ts = 0; }

// ---- Assignments (CRASH-SAFE + circuit breaker) ----
export async function getAssignments() {
  if (!isDbConfigured()) return [];
  if (_cache.assignments && cacheFresh()) return _cache.assignments;
  if (mongoIsDown()) return _cache.assignments || [];
  try {
    const col = await getCollection('assignments');
    const doc = await col.findOne({ _key: 'main' });
    const list = doc?.list || [];
    _cache.assignments = list;
    _cache.ts = Date.now();
    markMongoUp();
    return list;
  } catch (e) {
    console.error('getAssignments DB error:', e.message);
    markMongoDown();
    return _cache.assignments || [];
  }
}

export async function saveAssignments(list) {
  const col = await getCollection('assignments');
  await col.updateOne(
    { _key: 'main' },
    { $set: { _key: 'main', list, updatedAt: new Date() } },
    { upsert: true }
  );
  markMongoUp();
  bustCache();
}

// ---- Settings ----
export const DEFAULT_SETTINGS = {
  contact: {
    showEmails: true, showPhone: false, showOnLanding: true, showInFooter: true,
    adminEmail: 'satyamyadav19125@gmail.com',
    leadEmail: 'danetgar@gmail.com',
    adminPhone: '', adminWhatsapp: '',
  },
  redFlags: {
    // OFF for pipes: water level goes up AND down, so these monotonic-meter
    // checks would fire constantly on normal wetting/drying.
    rollback: false, reverse: false, huge_jump: false, growth_anomaly: false,
    zero_consumption: false,
    // ON: the two headline checks — no reading in 7 days, and no photo.
    stale_no_reading: true, missing_photo: true,
    // ON: generally useful data-quality checks that suit pipe data too.
    stale_unchanged: true, future_date: true, out_of_sequence: true,
    inside_out_of_range: true, outside_out_of_range: true, missing_times: true,
    // Opt-in extras (admin can enable in Settings).
    gps_outlier: false, digit_count: false, duplicate_same_day: false,
    identical_gps: false, fabrication_speed: false, night_reading: false, village_outlier: false,
  },
  project: {
    name: 'Digital Village Project',
    tagline: 'PVC pipe water-level monitoring for AWD paddy irrigation',
    description: 'A joint research project between Tel Aviv University (Israel) and Thapar Institute of Engineering and Technology (Patiala, India). We monitor water usage across Punjab farms to drive water-saving practices in paddy irrigation through the Alternate Wetting and Drying (AWD) method.',
    formUploadUrl: 'https://ee.kobotoolbox.org/x/YiGsqfcY',
  },
  forms: [],
  adminProfiles: {},
  // Reading targets (admin-configurable). Each meter must be read `target` times
  // per `period`. periodDays = 7 (week), 10 (10-day), 30 (month), or custom int.
  // `photoMaxPx` controls the maximum dimension uploaded photos are resized to,
  // and `photoQuality` is the JPEG quality (0..1). Larger = more HD but uses more DB space.
  security: {
    // In-app admin passwords. When this list is non-empty it REPLACES the
    // ADMIN_PASSWORD environment variable; when empty, env is used.
    adminPasswords: [],
  },
  pipe: {
    // Standards for the two form questions, in mm. Editable in Settings ->
    // Pipe parameters. Empty value = that check is disabled.
    insideMinMm: 50,        // "Measure water level inside the PVC pipe" — valid from
    insideMaxMm: 250,       //   ...valid to (outside 50–250 = red flag)
    outsideStandardMm: 150, // "Measure the pipe from the outside" — expected exact value
    outsideToleranceMm: 0,  //   allowed ± around the standard (0 = must be exact)
    // AWD irrigation trigger: inside water level AT OR BELOW this = the field
    // has dried out and needs irrigation. Empty = irrigation view disabled.
    irrigateAtOrBelowMm: 50,
  },
  reading: {
    target: 2,
    periodLabel: 'week',
    periodDays: 7,
    photoMaxPx: 1600,
    photoQuality: 0.85,
    profilePhotoMaxPx: 600,
    profilePhotoQuality: 0.88,
  },
};

export async function getSettings() {
  if (!isDbConfigured()) return DEFAULT_SETTINGS;
  if (_cache.settings && cacheFresh()) return _cache.settings;
  if (mongoIsDown()) return _cache.settings || DEFAULT_SETTINGS;
  try {
    const col = await getCollection('settings');
    const doc = await col.findOne({ _key: 'main' });
    const merged = !doc ? DEFAULT_SETTINGS : {
      contact: { ...DEFAULT_SETTINGS.contact, ...(doc.contact || {}) },
      redFlags: { ...DEFAULT_SETTINGS.redFlags, ...(doc.redFlags || {}) },
      project: { ...DEFAULT_SETTINGS.project, ...(doc.project || {}) },
      forms: Array.isArray(doc.forms) ? doc.forms : [],
      adminProfiles: doc.adminProfiles || {},
      pipe: { ...DEFAULT_SETTINGS.pipe, ...(doc.pipe || {}) },
      security: { ...DEFAULT_SETTINGS.security, ...(doc.security || {}) },
      reading: { ...DEFAULT_SETTINGS.reading, ...(doc.reading || {}) },
    };
    _cache.settings = merged;
    _cache.ts = Date.now();
    markMongoUp();
    return merged;
  } catch (e) {
    console.error('getSettings DB error:', e.message);
    markMongoDown();
    return _cache.settings || DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings) {
  const col = await getCollection('settings');
  await col.updateOne(
    { _key: 'main' },
    { $set: { _key: 'main', ...settings, updatedAt: new Date() } },
    { upsert: true }
  );
  markMongoUp();
  bustCache();
}

// Save one admin's personal profile, keyed by which admin login they used
// (admin0 = first password, admin1 = second, ...). Uses a nested $set so it
// never disturbs the other admin's profile or any other settings.
export async function saveAdminProfile(adminId, profile) {
  const col = await getCollection('settings');
  await col.updateOne(
    { _key: 'main' },
    { $set: { _key: 'main', [`adminProfiles.${adminId}`]: profile, updatedAt: new Date() } },
    { upsert: true }
  );
  markMongoUp();
  bustCache();
}

export async function getActiveForm() {
  const settings = await getSettings();
  const active = (settings.forms || []).find((f) => f.isActive);
  if (active) return active;
  return {
    name: 'Default (env vars)',
    assetUid: (process.env.KOBO_ASSET_UID || '').trim(),
    baseUrl: (process.env.KOBO_BASE_URL || 'https://kf.kobotoolbox.org').trim().replace(/\/$/, ''),
    token: process.env.KOBO_API_TOKEN || '',
    isActive: true, isEnvFallback: true,
  };
}

// ---- Red-flag overrides ("mark as correct") --------------------------------
let _verifiedCache = null;
let _verifiedTs = 0;

export async function getVerifiedIds() {
  if (!isDbConfigured()) return new Set();
  if (_verifiedCache && Date.now() - _verifiedTs < CACHE_TTL) return _verifiedCache;
  if (mongoIsDown()) return _verifiedCache || new Set();
  try {
    const col = await getCollection('verifications');
    const docs = await col.find({}).toArray();
    const set = new Set(docs.map((d) => String(d.submissionId)));
    _verifiedCache = set;
    _verifiedTs = Date.now();
    markMongoUp();
    return set;
  } catch (e) {
    console.error('getVerifiedIds DB error:', e.message);
    markMongoDown();
    return _verifiedCache || new Set();
  }
}

export async function setVerification(submissionId, on, by, note) {
  const id = String(submissionId);
  const col = await getCollection('verifications');
  if (on) {
    await col.updateOne(
      { submissionId: id },
      { $set: { submissionId: id, by: by || 'admin', note: note || '', ts: new Date().toISOString() } },
      { upsert: true }
    );
  } else {
    await col.deleteOne({ submissionId: id });
  }
  markMongoUp();
  _verifiedCache = null;
  _verifiedTs = 0;
}

// ---- Media (photos / voice notes / docs stored IN MongoDB) ----
export async function saveMedia(base64DataUrl) {
  const col = await getCollection('media');
  const m = /^data:(.+?);base64,(.*)$/.exec(base64DataUrl || '');
  if (!m) throw new Error('Invalid image data');
  const contentType = m[1];
  const data = m[2];
  if (data.length > 1_500_000) throw new Error('Image too large after resize (max ~1.1 MB).');
  const res = await col.insertOne({ contentType, data, createdAt: new Date() });
  markMongoUp();
  return res.insertedId.toString();
}

export async function getMedia(id) {
  const col = await getCollection('media');
  let _id;
  try { _id = new ObjectId(id); } catch { return null; }
  const doc = await col.findOne({ _id });
  if (!doc) return null;
  return { contentType: doc.contentType, buffer: Buffer.from(doc.data, 'base64') };
}

// ---- MongoDB connectivity self-test (used by /api/diag — always does a real ping) ----
export async function testMongo() {
  if (!MONGODB_URI) return { configured: false, ok: false, error: 'MONGODB_URI not set' };
  try {
    const client = getClient();
    await client.db('pipe_readings').command({ ping: 1 });
    markMongoUp();
    return { configured: true, ok: true };
  } catch (e) {
    markMongoDown();
    return { configured: true, ok: false, error: e.message };
  }
}


// ---- Storage stats & cleanup (admin "Data" page) ---------------------------
const KNOWN_COLLECTIONS = ['assignments', 'settings', 'media', 'tasks', 'verifications', 'messages'];

export async function getStorageStats() {
  const client = getClient();
  const db = client.db('pipe_readings');
  const stats = await db.command({ dbStats: 1 });
  const collections = [];
  for (const name of KNOWN_COLLECTIONS) {
    try {
      const cs = await db.command({ collStats: name });
      collections.push({ name, size: cs.size || 0, storageSize: cs.storageSize || 0, count: cs.count || 0 });
    } catch {
      collections.push({ name, size: 0, storageSize: 0, count: 0 });
    }
  }
  markMongoUp();
  return {
    limitBytes: 512 * 1024 * 1024,
    dataSize: stats.dataSize || 0,
    storageSize: stats.storageSize || 0,
    collections,
  };
}

export async function cleanupBefore(what, beforeIso) {
  const t = new Date(beforeIso);
  if (Number.isNaN(t.getTime())) throw new Error('Invalid date');
  const iso = t.toISOString();
  let col, filter;
  if (what === 'messages') { col = await getCollection('messages'); filter = { ts: { $lt: iso } }; }
  else if (what === 'tasks') { col = await getCollection('tasks'); filter = { done: true, doneAt: { $lt: iso } }; }
  else if (what === 'verifications') { col = await getCollection('verifications'); filter = { ts: { $lt: iso } }; }
  else throw new Error('Unknown cleanup target');
  const res = await col.deleteMany(filter);
  markMongoUp();
  bustCache();
  return res.deletedCount || 0;
}

export function isDbConfigured() {
  return Boolean(MONGODB_URI);
}
