import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getDisabledRegistry, saveDisabledRegistry } from '@/lib/db';
import { fetchFormMaster } from '@/lib/kobo';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  const [reg, master] = await Promise.all([getDisabledRegistry(), fetchFormMaster()]);
  // Include the full farm/pipe list from the Kobo form so the Settings panel
  // can show every unit with an on/off toggle — including never-read ones.
  return NextResponse.json({
    farms: reg.farms || [], pipes: reg.pipes || [],
    master: { ok: master.ok, villages: master.villages, pipes: master.pipes, error: master.error || null },
  });
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
