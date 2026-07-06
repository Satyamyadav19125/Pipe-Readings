import { NextResponse } from 'next/server';
import { getSettings, saveSettings, getActiveForm, DEFAULT_SETTINGS } from '@/lib/db';
import { isAdmin, getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  if (user?.role === 'admin') {
    // Which Kobo form the tool is ACTUALLY using right now (saved form or env
    // fallback) — shown read-only in Settings so the UID is always visible.
    let activeForm = null;
    try {
      const f = await getActiveForm();
      activeForm = { name: f.name || 'env-default', baseUrl: f.baseUrl || process.env.KOBO_BASE_URL || 'https://kf.kobotoolbox.org', assetUid: f.assetUid || '' };
    } catch { /* not configured yet */ }
    // Admin login overview for Settings -> Admin passwords: where the
    // passwords come from, how many admins there are, which one is YOU, and
    // the current list (prefilled so "change my password" is one edit away).
    const dbList = (settings.security?.adminPasswords || []).map((p) => String(p)).filter(Boolean);
    const activeList = dbList.length > 0 ? dbList : envAdminPasswords();
    const profiles = settings.adminProfiles || {};
    const adminInfo = {
      source: dbList.length > 0 ? 'settings' : 'env',
      count: activeList.length,
      passwords: activeList,
      youIndex: user?.adminId ? Number(String(user.adminId).replace('admin', '')) : -1,
      names: activeList.map((_, i) => profiles[`admin${i}`]?.name || `Admin ${i + 1}`),
    };
    return NextResponse.json({ settings, activeForm, adminInfo });
  }
  // Non-admin: strip Kobo API tokens AND admin personal profiles (don't leak
  // names/photos/phones of admins to surveyors).
  const safe = {
    ...settings,
    forms: (settings.forms || []).map((f) => ({ ...f, token: undefined })),
    adminProfiles: undefined,
    security: undefined,
  };
  return NextResponse.json({ settings: safe });
}

export async function PUT(request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Load the existing doc so fields we don't manage here (adminProfiles) are
  // preserved. The settings page only edits contact / redFlags / project /
  // forms / reading — if we don't carry adminProfiles forward, every save
  // would wipe out admin display names/photos and crash /api/auth/check the
  // next time it tried to read them.
  const existing = await getSettings();

  const merged = {
    contact: { ...DEFAULT_SETTINGS.contact, ...(body.contact || {}) },
    redFlags: { ...DEFAULT_SETTINGS.redFlags, ...(body.redFlags || {}) },
    project: { ...DEFAULT_SETTINGS.project, ...(body.project || {}) },
    forms: Array.isArray(body.forms) ? body.forms : [],
    pipe: { ...DEFAULT_SETTINGS.pipe, ...(existing.pipe || {}), ...(body.pipe || {}) },
    security: { ...DEFAULT_SETTINGS.security, ...(existing.security || {}), ...(body.security || {}) },
    reading: { ...DEFAULT_SETTINGS.reading, ...(existing.reading || {}), ...(body.reading || {}) },
    adminProfiles: existing.adminProfiles || {},  // <-- preserve, never overwrite from this endpoint
  };

  // Sanity-clamp: target 1..50, periodDays 1..365, photo 200..3000 px.
  const r = merged.reading;
  r.target = Math.max(1, Math.min(50, Math.round(Number(r.target) || 2)));
  r.periodDays = Math.max(1, Math.min(365, Math.round(Number(r.periodDays) || 7)));
  r.photoMaxPx = Math.max(200, Math.min(3000, Math.round(Number(r.photoMaxPx) || 1600)));
  r.photoQuality = Math.max(0.4, Math.min(0.98, Number(r.photoQuality) || 0.85));
  r.profilePhotoMaxPx = Math.max(200, Math.min(2000, Math.round(Number(r.profilePhotoMaxPx) || 600)));
  r.profilePhotoQuality = Math.max(0.4, Math.min(0.98, Number(r.profilePhotoQuality) || 0.88));

  // Pipe params: keep numbers as numbers; empty string means "check disabled".
  const pp = merged.pipe;
  for (const k of ['insideMinMm', 'insideMaxMm', 'outsideStandardMm', 'outsideToleranceMm', 'maxInsideMm', 'outsideMinMm', 'outsideMaxMm']) {
    if (pp[k] === '' || pp[k] == null) { pp[k] = ''; continue; }
    const n = Number(pp[k]);
    pp[k] = Number.isFinite(n) ? Math.max(0, n) : '';
  }

  // Admin passwords: trimmed, deduped, max 10, each 4-100 chars. An empty
  // list is allowed and means "use the ADMIN_PASSWORD env var".
  {
    const list = Array.isArray(merged.security.adminPasswords) ? merged.security.adminPasswords : [];
    merged.security.adminPasswords = Array.from(new Set(
      list.map((p) => String(p).trim()).filter((p) => p.length >= 4 && p.length <= 100)
    )).slice(0, 10);
  }

  let foundActive = false;
  merged.forms = merged.forms.map((f) => {
    if (f.isActive && !foundActive) { foundActive = true; return f; }
    return { ...f, isActive: false };
  });
  await saveSettings(merged);
  return NextResponse.json({ ok: true });
}
