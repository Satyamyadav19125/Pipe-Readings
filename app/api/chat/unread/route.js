import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAssignments } from '@/lib/db';
import { getUnreadCounts, markChannelRead } from '@/lib/chat';

export const dynamic = 'force-dynamic';

function senderIdOf(user) {
  return user.role === 'admin' ? (user.adminId || 'admin') : user.name;
}

async function channelsFor(user) {
  if (user.role === 'admin') {
    let people = [];
    try { people = (await getAssignments()).map((a) => a.person).filter(Boolean); } catch {}
    return ['group', ...people.map((p) => `dm:${p}`)];
  }
  return ['group', `dm:${user.name}`];
}

// GET -> { counts: { channel: n }, total }
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  const channels = await channelsFor(user);
  const data = await getUnreadCounts(senderIdOf(user), channels);
  return NextResponse.json(data);
}

// POST { channel } -> marks it read for this viewer
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const channel = String(body.channel || '');
  const allowed = await channelsFor(user);
  if (!allowed.includes(channel)) return NextResponse.json({ error: 'No access' }, { status: 403 });
  await markChannelRead(senderIdOf(user), channel);
  return NextResponse.json({ ok: true });
}
