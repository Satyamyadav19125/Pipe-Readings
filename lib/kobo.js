import { getActiveForm } from './db.js';

// How long (seconds) to reuse Kobo data before re-fetching.
// This is the big speed win: pages share one cached fetch instead of
// hitting Kobo on every single visit. The webhook busts it on new data.
const KOBO_TTL = 30;

function cleanToken(raw) {
  let t = (raw || '').trim();
  if (t.toLowerCase().startsWith('token ')) t = t.slice(6).trim();
  t = t.replace(/^["']|["']$/g, '');
  return t;
}

async function getConfig() {
  try {
    const form = await getActiveForm();
    const token = cleanToken(form.token);
    if (!token) throw new Error('KOBO_API_TOKEN is not set.');
    if (!form.assetUid) throw new Error('KOBO_ASSET_UID is not set.');
    return {
      base: (form.baseUrl || 'https://kf.kobotoolbox.org').replace(/\/$/, ''),
      asset: form.assetUid, token, formName: form.name,
    };
  } catch (e) {
    const base = (process.env.KOBO_BASE_URL || 'https://kf.kobotoolbox.org').trim().replace(/\/$/, '');
    const token = cleanToken(process.env.KOBO_API_TOKEN || '');
    const asset = (process.env.KOBO_ASSET_UID || '').trim();
    if (!token) throw new Error('KOBO_API_TOKEN is not set.');
    if (!asset) throw new Error('KOBO_ASSET_UID is not set.');
    return { base, asset, token, formName: 'env-default' };
  }
}

export async function fetchSubmissions({ limit = 5000 } = {}) {
  const { base, asset, token } = await getConfig();
  const url = `${base}/api/v2/assets/${asset}/data/?format=json&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
    next: { revalidate: KOBO_TTL, tags: ['kobo'] },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kobo API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.results || [];
}

export async function fetchAssetDefinition() {
  const { base, asset, token } = await getConfig();
  const url = `${base}/api/v2/assets/${asset}/?format=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
    next: { revalidate: 300, tags: ['kobo'] },
  });
  if (!res.ok) throw new Error(`Kobo asset fetch failed: ${res.status}`);
  return res.json();
}

export function findAttachmentUrl(submission, photoFilename) {
  if (!submission?._attachments || !photoFilename) return null;
  const target = String(photoFilename).replace(/\s+/g, '_');
  const att = submission._attachments.find((a) => (a.filename || '').endsWith(target));
  return att?.download_url || att?.download_large_url || null;
}

export async function fetchAttachmentStream(downloadUrl) {
  const { token } = await getConfig();
  const res = await fetch(downloadUrl, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`Attachment fetch ${res.status}`);
  return res;
}
