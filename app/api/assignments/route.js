import { NextResponse } from 'next/server';
import { getAssignments, saveAssignments, isDbConfigured } from '@/lib/db';
import { isAdmin, getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// SECURITY: this list contains login passwords and phone numbers.
// - Admin: full list.
// - Surveyor: only their OWN record, with the password stripped.
// - Not logged in: nothing.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured. Add MONGODB_URI in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }
  try {
    const list = await getAssignments();
    if (user.role === 'admin') return NextResponse.json({ assignments: list });
    const own = list
      .filter((a) => a.person === user.name)
      .map(({ password, ...rest }) => rest);
    return NextResponse.json({ assignments: own });
  } catch (e) {
    return NextResponse.json({ error: e.message, assignments: [] }, { status: 200 });
  }
}

export async function PUT(request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Not authorized. Please log in.' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body?.assignments)) {
    return NextResponse.json({ error: 'Expected { assignments: [...] }' }, { status: 400 });
  }
  try {
    await saveAssignments(body.assignments);
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/usage');
    return NextResponse.json({ ok: true, count: body.assignments.length });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not save: ${e.message}. This usually means the database password in MONGODB_URI is wrong.` },
      { status: 500 }
    );
  }
}
