import { NextResponse } from 'next/server';
import { fetchSubmissions } from '@/lib/kobo';
import { getCurrentUser } from '@/lib/auth';
import { filterSubmissionsForUser } from '@/lib/filter';
import { getDisabledRegistry } from '@/lib/db';
import { getField } from '@/lib/fieldMap';

export const dynamic = 'force-dynamic';

// Feeds the Surveyor / Village filter dropdowns and the assignments page.
// Surveyors only see THEIR own data scoped — without this filter, every
// surveyor would see every other surveyor's name and every village in the
// project inside the filter dropdowns (which they could never match
// anyway, since the data is server-side scoped). For admins,
// filterSubmissionsForUser is a no-op so they still see everything.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  try {
    let subs = await fetchSubmissions();
    subs = await filterSubmissionsForUser(subs);
    const reg = await getDisabledRegistry();
    const lc = (x) => String(x || '').trim().toLowerCase();
    const offFarms = new Set((reg.farms || []).map(lc));
    const offPipes = new Set((reg.pipes || []).map(lc));

    const names = new Set();
    const villages = new Set();
    const surveyorByVillage = {};

    for (const s of subs) {
      const name = getField(s, 'surveyor');
      const village = getField(s, 'village');
      // Don't surface villages that belong to a switched-off farm/pipe.
      const pipeOff = offPipes.has(lc(getField(s, 'serial'))) || offFarms.has(lc(getField(s, 'farm')));
      if (name) names.add(name);
      if (village && !pipeOff) villages.add(village);
      if (name && village && !pipeOff) {
        if (!surveyorByVillage[name]) surveyorByVillage[name] = new Set();
        surveyorByVillage[name].add(village);
      }
    }

    return NextResponse.json({
      surveyors: Array.from(names).sort((a, b) => a.localeCompare(b)),
      villages: Array.from(villages).sort((a, b) => a.localeCompare(b)),
      pairings: Object.fromEntries(
        Object.entries(surveyorByVillage).map(([k, v]) => [k, Array.from(v).sort()])
      ),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
