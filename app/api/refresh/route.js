import { NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Manual refresh trigger. Same effect as a fresh Kobo webhook landing —
// but triggered by the user tapping the 🔄 button in the top bar.
//
// Why this is needed even though Kobo POSTs a webhook on every new
// submission: the webhook only fires for NEW submissions. If a surveyor
// edits an existing submission in Kobo (or you change the active form,
// or delete a row), the webhook does NOT fire and the dashboard keeps
// serving the 30-second cache. This endpoint forces a fresh fetch.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  // The Kobo cache lives behind the 'kobo' tag (see lib/kobo.js). Busting
  // it forces the next call to fetchSubmissions() to hit Kobo fresh.
  revalidateTag('kobo');

  // Re-render the data-driven pages so the next render uses fresh data.
  // The client also calls router.refresh() after this returns, which
  // actually swaps the new HTML in.
  revalidatePath('/');
  revalidatePath('/submissions');
  revalidatePath('/usage');
  revalidatePath('/map');
  revalidatePath('/kobo-view');
  revalidatePath('/missed');
  revalidatePath('/team');

  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
