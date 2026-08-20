import { getCurrentUser } from './auth.js';
import { getField } from './fieldMap.js';
import { readingDate } from './weekly.js';
import { getDisabledRegistry } from './db.js';
import { getDemoSubmissions, getDemoAssignments } from './demoData.js';

const lc = (v) => String(v || '').trim().toLowerCase();

/**
 * Villages this user may see. null = all (admin).
 */
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
  // Guest (read-only viewer): NEVER real readings — a self-contained safe demo
  // set. But we DO borrow a few REAL pipe photos from the project's own Kobo
  // data so the demo forms show actual field photos (admin asked for this).
  if (user.role === 'guest') {
    const pool = [];
    for (const s of (submissions || [])) {
      for (const a of (s._attachments || [])) {
        if (a.is_deleted) continue;
        const url = a.download_url || a.download_large_url;
        if (!url) continue;
        pool.push({
          filename: a.filename || 'photo.jpg',
          download_url: url,
          download_small_url: a.download_small_url || url,
          question_xpath: a.question_xpath || 'group_2/Photo_reading',
          media_file_basename: a.media_file_basename || a.filename || url,
        });
        if (pool.length >= 20) break;
      }
      if (pool.length >= 20) break;
    }
    return getDemoSubmissions(user.maxReadings || 10, pool);
  }
  const me = lc(user.name);
  if (!me) return [];
  const allowed = Array.isArray(user.villages) && user.villages.length > 0
    ? new Set(user.villages.map(lc))
    : null;
  const reg = await getDisabledRegistry();
  const offFarms = new Set((reg.farms || []).map(lc));
  const offPipes = new Set((reg.pipes || []).map(lc));
  return submissions.filter((s) => {
    if (s._dead) return false; // readings marked "dead" by an admin are hidden
    if (lc(getField(s, 'surveyor')) !== me) return false;
    if (allowed && !allowed.has(lc(getField(s, 'village')))) return false;
    // Disabled farms/pipes are hidden from surveyors entirely.
    if (offFarms.has(lc(getField(s, 'farm')))) return false;
    if (offPipes.has(lc(getField(s, 'serial')))) return false;
    return true;
  });
}

// Filter out submissions belonging to disabled farms/pipes, AND readings an
// admin marked "dead" (submitted by mistake). Used by the red-flag pass,
// coverage, map and analytics so those readings never flag, count as missed,
// or distort the data — while still existing on Kobo and in the admin list.
export async function excludeDisabled(submissions) {
  const reg = await getDisabledRegistry();
  const offFarms = new Set((reg.farms || []).map(lc));
  const offPipes = new Set((reg.pipes || []).map(lc));
  const noReg = offFarms.size === 0 && offPipes.size === 0;
  return submissions.filter((s) => {
    if (s._dead) return false;
    if (noReg) return true;
    return !offFarms.has(lc(getField(s, 'farm'))) && !offPipes.has(lc(getField(s, 'serial')));
  });
}

export async function filterAssignmentsForUser(assignments) {
  const user = await getCurrentUser();
  if (!user) return [];
  if (user.role === 'admin') return assignments;
  if (user.role === 'guest') return getDemoAssignments(); // safe demo team
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
    if (!Number.isNaN(fromTs)) result = result.filter((s) => readingDate(s).getTime() >= fromTs);
  }
  if (to) {
    const toTs = Date.parse(to);
    if (!Number.isNaN(toTs)) {
      const endOfDay = toTs + 24 * 60 * 60 * 1000 - 1;
      // Use the reading's form date, same as `from`, so a date range is
      // consistent (was mixing form date with upload time).
      result = result.filter((s) => readingDate(s).getTime() <= endOfDay);
    }
  }
  return result;
}
