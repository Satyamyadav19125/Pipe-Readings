import { getMedia } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') || '').replace(/[^\w.\- ]/g, '').slice(0, 100);
  const download = searchParams.get('dl') === '1';
  try {
    const m = await getMedia(id);
    if (!m) return new Response('Not found', { status: 404 });
    const headers = {
      'Content-Type': m.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (name) headers['Content-Disposition'] = `${download ? 'attachment' : 'inline'}; filename="${name}"`;
    return new Response(m.buffer, { headers });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}
