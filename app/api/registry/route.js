import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getDisabledRegistry, saveDisabledRegistry } from '@/lib/db';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  const reg = await getDisabledRegistry();
  return NextResponse.json(reg);
}

// POST { farms: [...], pipes: [...] } -> replace the disabled lists
export async function POST(request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const saved = await saveDisabledRegistry({ farms: body.farms || [], pipes: body.pipes || [] });
  revalidateTag('kobo');
  return NextResponse.json({ ok: true, ...saved });
}
