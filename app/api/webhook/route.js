// =====================================================================
// Webhook receiver: Kobo POSTs to this URL when a new submission arrives.
// We verify the shared secret, then bust the cached Kobo data + pages.
// =====================================================================

import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(request) {
  const url = new URL(request.url);
  const provided = url.searchParams.get('secret') || request.headers.get('x-webhook-secret');
  const expected = process.env.WEBHOOK_SECRET;

  if (expected && provided !== expected) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    // Kobo may POST form-encoded; we don't actually need the body
    body = null;
  }

  // THIS is the line that makes updates instant: lib/kobo.js caches all Kobo
  // fetches under the 'kobo' tag for 30s — busting the tag forces a fresh
  // fetch on the next page view, on EVERY page at once.
  revalidateTag('kobo');

  // Also refresh the rendered pages themselves.
  revalidatePath('/');
  revalidatePath('/submissions');
  revalidatePath('/usage');
  revalidatePath('/map');
  revalidatePath('/kobo-view');

  console.log('[webhook] received submission', body?._id || '(no id)');
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    message: 'PVC Pipe Readings webhook is alive. Kobo should POST here with ?secret=YOUR_WEBHOOK_SECRET',
  });
}
