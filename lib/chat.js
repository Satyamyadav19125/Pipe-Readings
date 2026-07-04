import { MongoClient, ObjectId } from 'mongodb';

// Self-contained chat store. Own client + short timeout so a slow DB can never
// freeze the chat page. Independent of lib/db.js.
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'pipe_readings';
const COLLECTION = 'messages';

export const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

let _clientPromise = null;
function getClientPromise() {
  if (!MONGODB_URI) return null;
  if (!_clientPromise) {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 });
    _clientPromise = client.connect().catch((e) => { _clientPromise = null; throw e; });
  }
  return _clientPromise;
}
async function getCollection() {
  const cp = getClientPromise();
  if (!cp) return null;
  const client = await cp;
  return client.db(DB_NAME).collection(COLLECTION);
}

function oid(id) { try { return new ObjectId(String(id)); } catch { return null; } }

function toPlain(doc, viewerId) {
  if (!doc) return null;
  const { _id, deletedFor, ...rest } = doc;
  const m = { id: _id.toString(), ...rest };
  if (m.deleted) {
    // Deleted for everyone -> scrub content, keep a placeholder.
    m.text = ''; m.mediaUrl = ''; m.fileName = ''; m.kind = 'text';
    m.live = null; m.reactions = {};
  }
  return m;
}

// Returns oldest-first, capped to the most recent `limit`.
// Messages the viewer deleted "for me" are skipped entirely.
export async function getMessages(channel, viewerId, limit = 200) {
  if (!channel) return [];
  try {
    const col = await getCollection();
    if (!col) return [];
    const docs = await col.find({ channel }).sort({ ts: -1 }).limit(limit).toArray();
    const me = String(viewerId || '');
    return docs
      .filter((d) => !(Array.isArray(d.deletedFor) && d.deletedFor.includes(me)))
      .map((d) => toPlain(d, me))
      .reverse();
  } catch { return []; }
}

// kind: 'text' | 'image' | 'audio' | 'file' | 'live'
export async function sendMessage({ channel, senderId, senderName, senderRole, text, kind, mediaUrl, fileName, live }) {
  try {
    const col = await getCollection();
    if (!col) return null;
    const clean = String(text || '').slice(0, 4000).trim();
    const media = typeof mediaUrl === 'string' && mediaUrl.startsWith('/api/media/') ? mediaUrl : '';
    const k = ['image', 'audio', 'file', 'live'].includes(kind) ? kind : 'text';
    const liveData = k === 'live' && live && Number.isFinite(live.lat) && Number.isFinite(live.lng)
      ? { lat: live.lat, lng: live.lng, until: new Date(Date.now() + EDIT_WINDOW_MS).toISOString(), ended: false }
      : null;
    if (!clean && !media && !liveData) return null;
    const doc = {
      channel: String(channel),
      senderId: String(senderId || ''),
      senderName: String(senderName || 'Unknown'),
      senderRole: senderRole === 'admin' ? 'admin' : 'user',
      kind: k,
      text: clean,
      mediaUrl: media,
      fileName: String(fileName || '').slice(0, 120),
      live: liveData,
      reactions: {},
      deleted: false,
      deletedFor: [],
      editedAt: null,
      ts: new Date().toISOString(),
    };
    const res = await col.insertOne(doc);
    return { id: res.insertedId.toString(), ...doc };
  } catch { return null; }
}

function within15(doc) {
  return Date.now() - new Date(doc.ts).getTime() <= EDIT_WINDOW_MS;
}

// Edit own text within 15 minutes.
export async function editMessage(id, senderId, newText) {
  const col = await getCollection(); const _id = oid(id);
  if (!col || !_id) return { error: 'Not found' };
  const doc = await col.findOne({ _id });
  if (!doc) return { error: 'Message not found' };
  if (doc.senderId !== String(senderId)) return { error: 'You can only edit your own messages' };
  if (doc.deleted) return { error: 'Message was deleted' };
  if (!within15(doc)) return { error: 'Messages can only be edited within 15 minutes' };
  const clean = String(newText || '').slice(0, 4000).trim();
  if (!clean && !doc.mediaUrl) return { error: 'Message cannot be empty' };
  await col.updateOne({ _id }, { $set: { text: clean, editedAt: new Date().toISOString() } });
  return { ok: true };
}

// mode 'everyone': only own messages, only within 15 minutes.
// mode 'me': any message, any time — hides it for this viewer only.
export async function deleteMessage(id, viewerId, mode) {
  const col = await getCollection(); const _id = oid(id);
  if (!col || !_id) return { error: 'Not found' };
  const doc = await col.findOne({ _id });
  if (!doc) return { error: 'Message not found' };
  if (mode === 'everyone') {
    if (doc.senderId !== String(viewerId)) return { error: 'You can only delete your own messages for everyone' };
    if (!within15(doc)) return { error: 'After 15 minutes you can only delete it for yourself' };
    await col.updateOne({ _id }, { $set: { deleted: true, text: '', mediaUrl: '', fileName: '', live: null, reactions: {} } });
    return { ok: true };
  }
  await col.updateOne({ _id }, { $addToSet: { deletedFor: String(viewerId) } });
  return { ok: true };
}

// Toggle an emoji reaction by this viewer.
export async function reactToMessage(id, viewerId, emoji) {
  const col = await getCollection(); const _id = oid(id);
  if (!col || !_id) return { error: 'Not found' };
  const e = String(emoji || '').slice(0, 8);
  if (!e) return { error: 'No emoji' };
  const doc = await col.findOne({ _id });
  if (!doc || doc.deleted) return { error: 'Message not found' };
  const reactions = doc.reactions || {};
  const me = String(viewerId);
  const list = Array.isArray(reactions[e]) ? reactions[e] : [];
  const next = list.includes(me) ? list.filter((x) => x !== me) : [...list, me];
  if (next.length === 0) delete reactions[e]; else reactions[e] = next;
  await col.updateOne({ _id }, { $set: { reactions } });
  return { ok: true };
}

// Sharer pushes new coordinates to their own live-location message.
export async function updateLiveLocation(id, senderId, lat, lng) {
  const col = await getCollection(); const _id = oid(id);
  if (!col || !_id) return { error: 'Not found' };
  const doc = await col.findOne({ _id });
  if (!doc || doc.kind !== 'live' || !doc.live) return { error: 'Not a live location' };
  if (doc.senderId !== String(senderId)) return { error: 'Not your share' };
  if (doc.live.ended || Date.now() > new Date(doc.live.until).getTime()) {
    await col.updateOne({ _id }, { $set: { 'live.ended': true } });
    return { error: 'Live share has ended' };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Bad coordinates' };
  await col.updateOne({ _id }, { $set: { 'live.lat': lat, 'live.lng': lng } });
  return { ok: true };
}

export async function endLiveLocation(id, senderId) {
  const col = await getCollection(); const _id = oid(id);
  if (!col || !_id) return { error: 'Not found' };
  const doc = await col.findOne({ _id });
  if (!doc || doc.kind !== 'live') return { error: 'Not a live location' };
  if (doc.senderId !== String(senderId)) return { error: 'Not your share' };
  await col.updateOne({ _id }, { $set: { 'live.ended': true } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Unread tracking. 'chat_reads' stores, per viewer+channel, when they last
// opened it. Unread = messages newer than that, sent by someone else.
// ---------------------------------------------------------------------------
async function getReadsCollection() {
  const cp = getClientPromise();
  if (!cp) return null;
  const client = await cp;
  return client.db(DB_NAME).collection('chat_reads');
}

export async function markChannelRead(viewerId, channel) {
  try {
    const col = await getReadsCollection();
    if (!col) return { ok: false };
    await col.updateOne(
      { viewerId: String(viewerId), channel: String(channel) },
      { $set: { lastReadAt: new Date().toISOString() } },
      { upsert: true },
    );
    return { ok: true };
  } catch { return { ok: false }; }
}

export async function getUnreadCounts(viewerId, channels) {
  const out = { counts: {}, total: 0 };
  try {
    const msgs = await getCollection();
    const reads = await getReadsCollection();
    if (!msgs || !reads) return out;
    const me = String(viewerId || '');
    const readDocs = await reads.find({ viewerId: me, channel: { $in: channels } }).toArray();
    const lastRead = Object.fromEntries(readDocs.map((d) => [d.channel, d.lastReadAt]));
    for (const ch of channels) {
      const q = {
        channel: ch,
        senderId: { $ne: me },
        deleted: { $ne: true },
        deletedFor: { $ne: me },
      };
      if (lastRead[ch]) q.ts = { $gt: lastRead[ch] };
      const n = await msgs.countDocuments(q);
      if (n > 0) out.counts[ch] = n;
      out.total += n;
    }
  } catch { /* stay silent — badge just shows nothing */ }
  return out;
}
