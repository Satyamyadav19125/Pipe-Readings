import { NextResponse } from 'next/server';
import { checkAdminPassword, ADMIN_COOKIE, USER_COOKIE } from '@/lib/auth';
import { getAssignments } from '@/lib/db';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { password, action } = body;

  if (action === 'logout') {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, '', { maxAge: 0, path: '/' });
    res.cookies.set(USER_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  if (!password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  const cookieOpts = {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  };

  if (checkAdminPassword(password)) {
    const res = NextResponse.json({ ok: true, role: 'admin' });
    res.cookies.set(ADMIN_COOKIE, password, cookieOpts);
    res.cookies.set(USER_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  try {
    const list = await getAssignments();
    const user = list.find((u) => u.password && u.password === password);
    if (user) {
      const res = NextResponse.json({ ok: true, role: 'user', name: user.person });
      res.cookies.set(USER_COOKIE, `${user.person}::${password}`, cookieOpts);
      res.cookies.set(ADMIN_COOKIE, '', { maxAge: 0, path: '/' });
      return res;
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
}
