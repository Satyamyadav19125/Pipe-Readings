import { MongoClient, ObjectId } from 'mongodb';

// ---------------------------------------------------------------------------
// Self-contained task storage.
// Uses its OWN MongoDB client with a SHORT server-selection timeout so that a
// slow or unreachable database can never freeze the Tasks page. This file is
// intentionally independent of lib/db.js: nothing here can affect the existing
// pages, the 20s cache, or the circuit breaker in lib/db.js.
// ---------------------------------------------------------------------------

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'watermeter';
const COLLECTION = 'tasks';

let _clientPromise = null;

function getClientPromise() {
  if (!MONGODB_URI) return null;
  if (!_clientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    _clientPromise = client.connect().catch((e) => {
      _clientPromise = null; // allow a retry on the next call
      throw e;
    });
  }
  return _clientPromise;
}

async function getCollection() {
  const cp = getClientPromise();
  if (!cp) return null;
  const client = await cp;
  return client.db(DB_NAME).collection(COLLECTION);
}

function toPlain(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

export async function getTasks() {
  try {
    const col = await getCollection();
    if (!col) return [];
    const docs = await col.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(toPlain);
  } catch {
    return [];
  }
}

export async function getTasksForPerson(name) {
  if (!name) return [];
  const all = await getTasks();
  const lower = String(name).toLowerCase();
  return all.filter((t) => String(t.assignedTo || '').toLowerCase() === lower);
}

export async function createTask(data) {
  try {
    const col = await getCollection();
    if (!col) return null;
    const doc = {
      title: data.title || 'Untitled task',
      description: data.description || '',
      assignedTo: data.assignedTo || '',
      dueType: data.dueType || 'week', // 'week' | 'month' | 'date'
      dueDate: data.dueDate || null,
      notes: data.notes || '',
      done: false,
      doneAt: null,
      doneBy: null,
      createdAt: new Date().toISOString(),
    };
    const res = await col.insertOne(doc);
    return { id: res.insertedId.toString(), ...doc };
  } catch {
    return null;
  }
}

export async function updateTask(id, updates) {
  try {
    const col = await getCollection();
    if (!col) return null;
    let _id;
    try { _id = new ObjectId(id); } catch { return null; }
    const allowed = ['title', 'description', 'assignedTo', 'dueType', 'dueDate', 'notes', 'done', 'doneAt', 'doneBy'];
    const set = {};
    for (const k of allowed) {
      if (k in (updates || {})) set[k] = updates[k];
    }
    if (Object.keys(set).length === 0) {
      const existing = await col.findOne({ _id });
      return toPlain(existing);
    }
    await col.updateOne({ _id }, { $set: set });
    const doc = await col.findOne({ _id });
    return toPlain(doc);
  } catch {
    return null;
  }
}

export async function deleteTask(id) {
  try {
    const col = await getCollection();
    if (!col) return false;
    let _id;
    try { _id = new ObjectId(id); } catch { return false; }
    await col.deleteOne({ _id });
    return true;
  } catch {
    return false;
  }
}
