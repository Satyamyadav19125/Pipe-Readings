import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getMessages, sendMessage, editMessage, deleteMessage,
  reactToMessage, updateLiveLocation, endLiveLocation,
} from '@/lib/chat';

export const dynamic = 'force-dynamic';

// Who is allowed in a channel?
//   'group'        -> any logged-in user (all admins + all assistants)
//   'dm:<name>'    -> any admin, OR the assistant whose name === <name>
function canAccess(user, channel) {
  if (!channel) return false;
  if (channel === 'group') return true;
  if (channel.startsWith('dm:')) {
    const who = channel.slice(3);
    if (user.role === 'admin') return true;
    return String(user.name).toLowerCase() === String(who).toLowerCase();
  }
  return false;
}

function senderIdOf(user) {
  return user.role === 'admin' ? (user.adminId || 'admin') : user.name;
}

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel') || 'group';
  if (!canAccess(user, channel)) return NextResponse.json({ error: 'No access to this chat' }, { status: 403 });

  const me = senderIdOf(user);
  const messages = await getMessages(channel, me);
  return NextResponse.json({ messages, me });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const channel = body.channel || 'group';
  if (!canAccess(user, channel)) return NextResponse.json({ error: 'No access to this chat' }, { status: 403 });

  const hasText = body.text && String(body.text).trim();
  const hasMedia = typeof body.mediaUrl === 'string' && body.mediaUrl.startsWith('/api/media/');
  const hasLive = body.kind === 'live' && body.live;
  if (!hasText && !hasMedia && !hasLive) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  const msg = await sendMessage({
    channel,
    senderId: senderIdOf(user),
    senderName: user.name || (user.role === 'admin' ? 'Admin' : 'Unknown'),
    senderRole: user.role,
    text: body.text,
    kind: body.kind,
    mediaUrl: body.mediaUrl,
    fileName: body.fileName,
    live: body.live,
  });
  if (!msg) return NextResponse.json({ error: 'Could not send (database unavailable)' }, { status: 503 });
  return NextResponse.json({ message: msg });
}

// PATCH: { id, action: 'edit', text } | { id, action: 'react', emoji }
//        | { id, action: 'live_update', lat, lng } | { id, action: 'live_end' }
export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'Message id required' }, { status: 400 });
  const me = senderIdOf(user);

  let res;
  if (body.action === 'edit') res = await editMessage(body.id, me, body.text);
  else if (body.action === 'react') res = await reactToMessage(body.id, me, body.emoji);
  else if (body.action === 'live_update') res = await updateLiveLocation(body.id, me, Number(body.lat), Number(body.lng));
  else if (body.action === 'live_end') res = await endLiveLocation(body.id, me);
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  if (res?.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE: { id, mode: 'everyone' | 'me' }
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'Message id required' }, { status: 400 });
  const res = await deleteMessage(body.id, senderIdOf(user), body.mode === 'everyone' ? 'everyone' : 'me');
  if (res?.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
