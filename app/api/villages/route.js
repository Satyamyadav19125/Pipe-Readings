import { NextResponse } from 'next/server';
import { fetchSubmissions, fetchFormMaster } from '@/lib/kobo';
import { getCurrentUser } from '@/lib/auth';
import { filterSubmissionsForUser } from '@/lib/filter';
import { getDisabledRegistry } from '@/lib/db';
import { getField } from '@/lib/fieldMap';

export const dynamic = 'force-dynamic';

// Feeds the Village / Pipe filter dropdowns. Scoped to the current user so
// surveyors don't see villages and pipes they have no relation to. Farms/pipes
// the admin has switched OFF (and villages whose pipes are all off) are dropped
// so a disabled unit never appears as a filter option anywhere.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  try {
    const [subsRaw, master, reg] = await Promise.all([
      fetchSubmissions(), fetchFormMaster(), getDisabledRegistry(),
    ]);
    const subs = await filterSubmissionsForUser(subsRaw);

    const lc = (x) => String(x || '').trim().toLowerCase();
    const offFarms = new Set((reg.farms || []).map(lc));
    const offPipes = new Set((reg.pipes || []).map(lc));
    const pipeOff = (serial, farm) => offPipes.has(lc(serial)) || offFarms.has(lc(farm));

    const meters = new Set();
    const metersByVillage = {};
    const addPipe = (village, serial, farm) => {
      if (!serial || pipeOff(serial, farm)) return; // skip disabled units
      meters.add(serial);
      if (village) {
        if (!metersByVillage[village]) metersByVillage[village] = new Set();
        metersByVillage[village].add(serial);
      }
    };

    for (const s of subs) addPipe(getField(s, 'village'), getField(s, 'serial'), getField(s, 'farm'));

    // Merge the FULL lists from the Kobo form definition so villages and pipes
    // with zero submissions still appear (unless disabled). Surveyors stay
    // scoped to their own assigned villages.
    if (master.ok) {
      const allowed = user.role === 'user'
        ? new Set((user.villages || []).map(lc))
        : null;
      for (const pm of master.pipes) {
        if (allowed && (!pm.village || !allowed.has(lc(pm.village)))) continue;
        addPipe(pm.village, pm.serial, pm.farm);
      }
    }

    // A village only appears if it has at least one ACTIVE pipe.
    const villages = new Set(Object.keys(metersByVillage));

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
