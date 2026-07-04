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
    return NextResponse.json({ settings, activeForm });
  }
  // Non-admin: strip Kobo API tokens AND admin personal profiles (don't leak
  // names/photos/phones of admins to surveyors).
  const safe = {
    ...settings,
    forms: (settings.forms || []).map((f) => ({ ...f, token: undefined })),
    adminProfiles: undefined,
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

  let foundActive = false;
  merged.forms = merged.forms.map((f) => {
    if (f.isActive && !foundActive) { foundActive = true; return f; }
    return { ...f, isActive: false };
  });
  await saveSettings(merged);
  return NextResponse.json({ ok: true });
}
