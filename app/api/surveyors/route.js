import { NextResponse } from 'next/server';
import { fetchSubmissions } from '@/lib/kobo';
import { getCurrentUser } from '@/lib/auth';
import { filterSubmissionsForUser } from '@/lib/filter';
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

    const names = new Set();
    const villages = new Set();
    const surveyorByVillage = {};

    for (const s of subs) {
      const name = getField(s, 'surveyor');
      const village = getField(s, 'village');
      if (name) names.add(name);
      if (village) villages.add(village);
      if (name && village) {
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
