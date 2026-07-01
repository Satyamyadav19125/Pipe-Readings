// =====================================================================
// Photo proxy: Kobo attachments need the API token for access.
// We can't put the token in <img src=...>, so we proxy via this route.
// =====================================================================

import { fetchAttachmentStream } from '@/lib/kobo';

const ALLOWED_HOSTS = new Set([
  'kc.kobotoolbox.org',
  'kf.kobotoolbox.org',
  'kobo.humanitarianresponse.info',
]);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  if (!target) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response('Host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetchAttachmentStream(target);
    const headers = new Headers();
    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    headers.set('content-type', ct);
    headers.set('cache-control', 'public, max-age=3600');
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return new Response(`Upstream error: ${e.message}`, { status: 502 });
  }
}
