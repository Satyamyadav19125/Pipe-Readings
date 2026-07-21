import { NextResponse } from 'next/server';
import { isAdmin, getCurrentUser } from '@/lib/auth';
import { getCorrections, saveCorrection, deleteCorrection } from '@/lib/db';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  const map = await getCorrections();
  return NextResponse.json({ corrections: Object.values(map) });
}

// POST { submissionId, newValue, oldValue, note, field? } -> save/overwrite
export async function POST(request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  const user = await getCurrentUser();
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { submissionId, newValue, oldValue, note, field } = body;
  const isDead = field === 'dead';
  if (!submissionId || (!isDead && (newValue === undefined || newValue === null || String(newValue).trim() === ''))) {
    return NextResponse.json({ error: 'submissionId and newValue are required' }, { status: 400 });
  }
  const doc = await saveCorrection(submissionId, {
    field: field || 'reading',
    oldValue: oldValue ?? null,
    newValue: isDead ? null : String(newValue).trim(),
    by: user?.name || user?.adminId || 'admin',
    note: note || '',
  });
  revalidateTag('kobo'); // corrections overlay applies on next fetch
  return NextResponse.json({ ok: true, correction: doc });
}

// DELETE ?id=submissionId -> revert to raw Kobo value
export async function DELETE(request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await deleteCorrection(id);
  revalidateTag('kobo');
  return NextResponse.json({ ok: true });
}
