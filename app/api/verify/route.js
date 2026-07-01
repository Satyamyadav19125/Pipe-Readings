import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setVerification, getVerifiedIds } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  const ids = await getVerifiedIds();
  return NextResponse.json({ verified: Array.from(ids) });
}

// Admin only — mark a submission as correct (clears its red flag) or undo it.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = body.submissionId;
  if (!id) return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
  const on = body.verified !== false; // default true
  try {
    await setVerification(id, on, user.name || 'admin', body.note || '');
  } catch (e) {
    return NextResponse.json({ error: `Could not save: ${e.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, submissionId: String(id), verified: on });
}
