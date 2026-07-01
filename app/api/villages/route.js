import { NextResponse } from 'next/server';
import { fetchSubmissions } from '@/lib/kobo';
import { getCurrentUser } from '@/lib/auth';
import { filterSubmissionsForUser } from '@/lib/filter';
import { getField } from '@/lib/fieldMap';

export const dynamic = 'force-dynamic';

// Feeds the Village / Meter filter dropdowns. Scoped to the current user
// so surveyors don't see villages and meters they have no relation to.
// Admins see everything because filterSubmissionsForUser is a no-op for them.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  try {
    let subs = await fetchSubmissions();
    subs = await filterSubmissionsForUser(subs);

    const villages = new Set();
    const meters = new Set();
    const metersByVillage = {};
    for (const s of subs) {
      const village = getField(s, 'village');
      const serial = getField(s, 'serial');
      if (village) villages.add(village);
      if (serial) meters.add(serial);
      if (village && serial) {
        if (!metersByVillage[village]) metersByVillage[village] = new Set();
        metersByVillage[village].add(serial);
      }
    }
    return NextResponse.json({
      villages: Array.from(villages).sort(),
      meters: Array.from(meters).sort(),
      metersByVillage: Object.fromEntries(
        Object.entries(metersByVillage).map(([k, v]) => [k, Array.from(v).sort()])
      ),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
