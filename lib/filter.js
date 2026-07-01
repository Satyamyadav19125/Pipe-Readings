import { getCurrentUser } from './auth.js';
import { getField } from './fieldMap.js';

const lc = (v) => String(v || '').trim().toLowerCase();

/**
 * Villages this user may see. null = all (admin).
 */
export async function getAllowedVillages() {
  const user = await getCurrentUser();
  if (!user) return new Set();
  if (user.role === 'admin') return null;
  if (Array.isArray(user.villages) && user.villages.length > 0) {
    return new Set(user.villages.map(lc));
  }
  return new Set();
}

/**
 * Data views.
 * - NOT logged in: sees NOTHING.
 * - Admin: sees EVERYTHING.
 * - Field assistant: sees only their OWN readings (surveyor name match),
 *   AND only inside their ASSIGNED villages. A reading they made in a
 *   village that is not assigned to them (e.g. helping out elsewhere)
 *   stays visible to the admin but is hidden from their own dashboard.
 */
export async function filterSubmissionsForUser(submissions) {
  const user = await getCurrentUser();
  if (!user) return [];
  if (user.role === 'admin') return submissions;
  const me = lc(user.name);
  if (!me) return [];
  const allowed = Array.isArray(user.villages) && user.villages.length > 0
    ? new Set(user.villages.map(lc))
    : null;
  return submissions.filter((s) => {
    if (lc(getField(s, 'surveyor')) !== me) return false;
    if (allowed && !allowed.has(lc(getField(s, 'village')))) return false;
    return true;
  });
}

export async function filterAssignmentsForUser(assignments) {
  const user = await getCurrentUser();
  if (!user) return [];
  if (user.role === 'admin') return assignments;
  return assignments.filter((a) => a.person === user.name);
}

export function applyUrlFilters(submissions, searchParams) {
  if (!searchParams) return submissions;
  const get = (k) => {
    if (typeof searchParams.get === 'function') return searchParams.get(k);
    return searchParams[k];
  };
  const id = (get('id') || '').trim();
  const village = (get('village') || '').trim();
  const meter = (get('meter') || '').trim();
  const surveyor = (get('surveyor') || '').trim();
  const from = (get('from') || '').trim();
  const to = (get('to') || '').trim();

  let result = submissions;
  if (id) result = result.filter((s) => String(s._id) === id);
  if (village) result = result.filter((s) => getField(s, 'village') === village);
  if (meter) result = result.filter((s) => getField(s, 'serial') === meter);
  if (surveyor) result = result.filter((s) => getField(s, 'surveyor') === surveyor);
  if (from) {
    const fromTs = Date.parse(from);
    if (!Number.isNaN(fromTs)) result = result.filter((s) => new Date(s._submission_time).getTime() >= fromTs);
  }
  if (to) {
    const toTs = Date.parse(to);
    if (!Number.isNaN(toTs)) {
      const endOfDay = toTs + 24 * 60 * 60 * 1000 - 1;
      result = result.filter((s) => new Date(s._submission_time).getTime() <= endOfDay);
    }
  }
  return result;
}
