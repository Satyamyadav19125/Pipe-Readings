import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { saveMedia, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Accepted uploads (stored as base64 in MongoDB, so they must stay SMALL):
//   images (resized client-side), short voice notes, small audio files,
//   and small documents (PDF / Office / text / CSV). Max ~256 KB each.
const ALLOWED = /^data:(image\/(jpeg|png|webp|gif)|audio\/(webm|ogg|mpeg|mp4|aac|wav|x-m4a)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel)|text\/(plain|csv));base64,/i;

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.dataUrl) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED.test(body.dataUrl)) {
    return NextResponse.json({ error: 'This file type is not allowed. Allowed: photos, voice notes, small audio, PDF/Office/text files.' }, { status: 400 });
  }
  try {
    const id = await saveMedia(body.dataUrl);
    return NextResponse.json({ ok: true, id, url: `/api/media/${id}` });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
