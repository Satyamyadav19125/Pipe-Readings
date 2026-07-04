import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getActiveForm } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Deep-link one submission into the real KoboToolbox site.
// Kobo's per-submission view URLs come from its Enketo API, which needs the
// API token — so we resolve it server-side (token never reaches the browser)
// and 302-redirect. If Kobo refuses (endpoint varies by version), we fall
// back to the form's data table, which always works.
export async function GET(request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();

  let base = 'https://kf.kobotoolbox.org';
  let uid = '';
  let token = '';
  try {
    const f = await getActiveForm();
    base = (f.baseUrl || base).replace(/\/$/, '');
    uid = f.assetUid || '';
    token = f.token || '';
  } catch { /* fall through to env */ }
  if (!uid) uid = (process.env.KOBO_ASSET_UID || '').trim();
  if (!token) token = (process.env.KOBO_API_TOKEN || '').trim();
  if (!base) base = (process.env.KOBO_BASE_URL || 'https://kf.kobotoolbox.org').replace(/\/$/, '');

  const tableUrl = uid ? `${base}/#/forms/${uid}/data/table` : base;
  if (!id || !uid || !token) return NextResponse.redirect(tableUrl);

  try {
    const res = await fetch(`${base}/api/v2/assets/${uid}/data/${id}/enketo/view/`, {
      headers: { Authorization: `Token ${token}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.url) return NextResponse.redirect(data.url);
    }
  } catch { /* fall back below */ }
  return NextResponse.redirect(tableUrl);
}
