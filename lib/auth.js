import { cookies } from 'next/headers';
import { getAssignments, getSettings } from './db.js';

// ADMIN_PASSWORD can hold multiple passwords separated by commas.
// e.g. in Vercel: ADMIN_PASSWORD=finnwolfhard,Danetgar
// Each password is a DIFFERENT admin person with their own profile.
function envAdminPasswords() {
  const raw = process.env.ADMIN_PASSWORD || '';
  return raw.split(',').map((p) => p.trim()).filter(Boolean);
}

// Admin passwords can be changed in-app (Settings -> Admin passwords). If the
// saved list is non-empty it replaces the env var entirely; otherwise env.
async function getAdminPasswords() {
  try {
    const settings = await getSettings();
    const list = settings?.security?.adminPasswords;
    if (Array.isArray(list)) {
      const clean = list.map((p) => String(p).trim()).filter(Boolean);
      if (clean.length > 0) return clean;
    }
  } catch { /* fall back to env */ }
  return envAdminPasswords();
}

export const ADMIN_COOKIE = 'wmd_admin';
export const USER_COOKIE = 'wmd_user';

export async function getCurrentUser() {
  const store = await cookies();

  // --- Admin: identify WHICH password was used, then load that admin's profile ---
  const adminC = store.get(ADMIN_COOKIE);
  if (adminC?.value) {
    const passwords = await getAdminPasswords();
    const idx = passwords.indexOf(adminC.value);
    if (idx >= 0) {
      const adminId = `admin${idx}`;
      let profile = null;
      try {
        const settings = await getSettings();
        profile = settings?.adminProfiles?.[adminId] || null;
      } catch {}
      return {
        role: 'admin',
        adminId,
        name: (profile && profile.name) || 'Admin',
        photo: (profile && profile.photo) || null,
        bio: (profile && profile.bio) || null,
        phone: (profile && profile.phone) || null,
        email: (profile && profile.email) || null,
      };
    }
  }

  // --- Surveyor ---
  const userC = store.get(USER_COOKIE);
  if (userC?.value) {
    const idx = userC.value.indexOf('::');
    if (idx > 0) {
      const name = userC.value.slice(0, idx);
      const token = userC.value.slice(idx + 2);
      try {
        const list = await getAssignments();
        const user = list.find((u) => u.person === name);
        if (user && user.password && user.password === token) {
          return {
            role: 'user', name: user.person, villages: user.villages || [],
            phone: user.phone || null, email: user.email || null,
            photo: user.photo || null, bio: user.bio || null, password: user.password,
          };
        }
      } catch {}
    }
  }
  return null;
}

export async function isAdmin() {
  const u = await getCurrentUser();
  return u?.role === 'admin';
}

export async function checkAdminPassword(pw) {
  const passwords = await getAdminPasswords();
  return passwords.length > 0 && passwords.includes(pw);
}
