import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { testMongo } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  }

  const rawToken = process.env.KOBO_API_TOKEN || '';
  const cleanedToken = (() => {
    let t = rawToken.trim();
    if (t.toLowerCase().startsWith('token ')) t = t.slice(6).trim();
    t = t.replace(/^["']|["']$/g, '');
    return t;
  })();

  const base = (process.env.KOBO_BASE_URL || 'https://kf.kobotoolbox.org').trim().replace(/\/$/, '');
  const asset = (process.env.KOBO_ASSET_UID || '').trim();

  const diag = {
    timestamp: new Date().toISOString(),
    env: {
      KOBO_API_TOKEN: rawToken ? {
        rawLength: rawToken.length, cleanedLength: cleanedToken.length,
        hadWhitespace: rawToken !== rawToken.trim(),
        hadTokenPrefix: rawToken.trim().toLowerCase().startsWith('token '),
        prefix: cleanedToken.slice(0, 4), suffix: cleanedToken.slice(-4),
      } : 'NOT SET',
      KOBO_BASE_URL: base, KOBO_ASSET_UID: asset || 'NOT SET',
      MONGODB_URI: process.env.MONGODB_URI ? 'set' : 'NOT SET',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? 'set' : 'NOT SET',
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ? 'set' : 'NOT SET',
    },
    mongodb: null,
    tests: [],
  };

  // ---- MongoDB test (THIS is what causes "bad auth : authentication failed") ----
  diag.mongodb = await testMongo();
  if (diag.mongodb && !diag.mongodb.ok && diag.mongodb.configured) {
    diag.mongodb.hint = 'If this says "bad auth", the password in your Vercel MONGODB_URI is wrong. Reset the DB user password in MongoDB Atlas (Database Access), then update MONGODB_URI in Vercel and redeploy.';
  }

  async function runTest(name, url) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Token ${cleanedToken}` }, cache: 'no-store' });
      const text = await res.text();
      diag.tests.push({ name, url, status: res.status, ok: res.ok, snippet: text.slice(0, 200) });
    } catch (e) {
      diag.tests.push({ name, url, error: e.message });
    }
  }

  if (cleanedToken && asset) {
    await runTest('Asset definition', `${base}/api/v2/assets/${asset}/?format=json`);
    await runTest('User info (validates token)', `${base}/me/?format=json`);
    await runTest('Submission DATA (this is what dashboard uses)', `${base}/api/v2/assets/${asset}/data/?format=json&limit=1`);
  }

  return NextResponse.json(diag, { status: 200 });
}
