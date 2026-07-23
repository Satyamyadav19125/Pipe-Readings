import Link from 'next/link';
import { fetchSubmissions, fetchFormMaster } from '@/lib/kobo';
import { computeWeeklyStatus, deriveMeters, daysRemaining } from '@/lib/weekly';
import { latestPerPipe, irrigationThreshold } from '@/lib/irrigation';
import { detectFlagsScoped } from '@/lib/flagContext';
import { getAssignments, isDbConfigured, getSettings, getMongoHealth, getVerifiedIds, getDisabledRegistry } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { filterSubmissionsForUser, filterAssignmentsForUser } from '@/lib/filter';
import { getField } from '@/lib/fieldMap';
import { BarChart, DonutChart } from '@/components/SimpleCharts';
import FarmBreakdown from '@/components/FarmBreakdown';
import Landing from '@/components/Landing';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return <Landing />;
  const isAdmin = currentUser.role === 'admin';

  let submissions = [];
  let koboError = null;
  try { submissions = await fetchSubmissions(); }
  catch (e) { koboError = e.message; }
  // Full pipe/village lists from the form definition — lets the KPIs show
  // coverage out of ALL pipes, not just the ones already submitted.
  const master = await fetchFormMaster();

  let assignments = [];
  let settings;
  let dbWarning = null;
  try {
    [assignments, settings] = await Promise.all([
      isDbConfigured() ? getAssignments() : Promise.resolve([]),
      getSettings(),
    ]);
    const health = getMongoHealth();
    if (health.configured && health.down) dbWarning = 'Database connection is failing (check MONGODB_URI password).';
  } catch (e) { dbWarning = e.message; }

  if (koboError) return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold mb-1">Could not load data from Kobo</p>
      <p className="text-sm">{koboError}</p>
      <p className="text-xs mt-2">
        Visit <Link href="/debug" className="underline">/debug</Link> for details · or <Link href="/settings" className="underline">/settings</Link> to switch the active form.
      </p>
    </div>
  );

  submissions = await filterSubmissionsForUser(submissions);
  // Dead (mistake) readings are excluded from all overview stats.
  const liveSubmissions = submissions.filter((s) => !s._dead);
  assignments = await filterAssignmentsForUser(assignments);

  // Quality / red-flag stats are admin-only. Surveyors don't see clean vs
  // flagged counts, "quality rate", or the quality donut chart — their
  // overview stays positive and focused on the work they've done.
  let flaggedTotal = 0;
  let cleanTotal = submissions.length;
  if (isAdmin) {
    let verifiedIds = new Set();
    try { verifiedIds = await getVerifiedIds(); } catch {}
    const rawFlags = await detectFlagsScoped(submissions, settings);
    const flags = {};
    for (const id in rawFlags) { if (!verifiedIds.has(String(id))) flags[id] = rawFlags[id]; }
    flaggedTotal = Object.keys(flags).length;
    cleanTotal = submissions.length - flaggedTotal;
  }

  const villageCounts = {};
  const surveyorCounts = {};
  const farmCounts = {}; // farm ID -> number of submissions
  for (const s of liveSubmissions) {
    const v = getField(s, 'village') || 'Unknown';
    const sv = getField(s, 'surveyor') || 'Unknown';
    const fm = getField(s, 'farm');
    villageCounts[v] = (villageCounts[v] || 0) + 1;
    surveyorCounts[sv] = (surveyorCounts[sv] || 0) + 1;
    if (fm) farmCounts[fm] = (farmCounts[fm] || 0) + 1;
  }
  // "Total farms" = how many DISTINCT farm IDs have at least one reading.
  // A farm with 4 readings counts once. Farms in the Kobo form that have never
  // been read are not counted here (they appear in the list below as 0).
  const totalFarms = Object.keys(farmCounts).length;
  const allFarms = new Set(Object.keys(farmCounts));
  if (master.ok) for (const pm of master.pipes) if (pm.farm) allFarms.add(pm.farm);
  const farmRows = [...allFarms]
    .map((farm) => ({ farm, count: farmCounts[farm] || 0 }))
    .sort((a, b) => b.count - a.count);
  const uniqueVillages = !isAdmin
    ? (currentUser.villages || []).length
    : new Set([...Object.keys(villageCounts).filter((v) => v !== 'Unknown'), ...(master.ok ? master.villages : [])]).size;
  const uniqueSurveyors = Object.keys(surveyorCounts).length;

  const villageBars = Object.entries(villageCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const surveyorBars = Object.entries(surveyorCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const meters = deriveMeters(assignments, submissions);
  // Farms/pipes switched OFF in Settings must not count toward the target.
  const lcx = (x) => String(x || '').trim().toLowerCase();
  const disabledReg = await getDisabledRegistry().catch(() => ({ farms: [], pipes: [] }));
  const offFarmsO = new Set((disabledReg.farms || []).map(lcx));
  const offPipesO = new Set((disabledReg.pipes || []).map(lcx));
  const pipeFarm = new Map();
  if (master.ok) for (const pm of master.pipes) pipeFarm.set(pm.serial, pm.farm);
  const isOffPipe = (serial) => offPipesO.has(lcx(serial)) || offFarmsO.has(lcx(pipeFarm.get(serial)));
  // AWD irrigation: how many pipes' LATEST reading says "irrigate now"
  const irrThreshold = irrigationThreshold(settings?.pipe);
  // Disabled pipes must not appear in the irrigation counts either.
  const { counts: irrCounts } = latestPerPipe(
    liveSubmissions.filter((s) => !isOffPipe(getField(s, 'serial'))), getField, irrThreshold);
  const target = Math.max(1, Number(settings?.reading?.target) || 2);
  const periodDays = Math.max(1, Number(settings?.reading?.periodDays) || 7);
  const periodLabel = String(settings?.reading?.periodLabel || 'week');
  const status = computeWeeklyStatus(meters, submissions, new Date(), { target, periodDays });
  const remaining = daysRemaining();

  const done = status.filter((s) => s.status === 'done' && !isOffPipe(s.serial)).length;
  // Coverage denominator: EVERY pipe from the form definition (surveyors see
  // only their villages), so "done" is measured out of all pipes — including
  // pipes that have never been read at all.
  let pipesTotal = meters.filter((m) => !isOffPipe(m.serial)).length;
  if (master.ok && master.pipes.length > 0) {
    const allowedV = !isAdmin
      ? new Set((currentUser.villages || []).map((v) => String(v).trim().toLowerCase()))
      : null;
    const serialSet = new Set(meters.filter((m) => !isOffPipe(m.serial)).map((m) => m.serial));
    for (const pm of master.pipes) {
      if (allowedV && (!pm.village || !allowedV.has(String(pm.village).trim().toLowerCase()))) continue;
      if (offPipesO.has(lcx(pm.serial)) || offFarmsO.has(lcx(pm.farm))) continue;
      serialSet.add(pm.serial);
    }
    pipesTotal = serialSet.size;
  }
  const partial = status.filter((s) => s.status === 'partial').length;
  const pending = status.filter((s) => s.status === 'pending').length;

  const cleanVsFlagged = [
    { label: 'Clean', value: cleanTotal, color: '#22c55e' },
    { label: 'Flagged', value: flaggedTotal, color: '#ef4444' },
  ];

  return (
    <div className="space-y-4">
      {dbWarning && isAdmin && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          <p className="font-semibold">⚠️ Database not connected (your Kobo data is fine)</p>
          <p className="text-xs mt-1">Assignments, settings and saved profiles won't load until this is fixed. Error: <code className="bg-amber-100 px-1 rounded">{dbWarning}</code></p>
          <p className="text-xs mt-1">This almost always means the password in your Vercel <b>MONGODB_URI</b> is wrong. See <Link href="/debug" className="underline">/debug</Link>.</p>
        </div>
      )}

      <div className="bg-gradient-to-br from-brand-50 to-field-50 border border-brand-100 rounded-xl p-4 sm:p-5 flex items-start gap-3">
        <div className="text-3xl shrink-0">💧</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Welcome, {currentUser.name}!</h2>
          <p className="text-sm text-slate-600">
            {isAdmin
              ? 'Full admin access. Manage assignments, settings, and view all data.'
              : `You're assigned to ${currentUser.villages?.length || 0} village${currentUser.villages?.length === 1 ? '' : 's'}. Thanks for your work!`}
          </p>
        </div>
        <Link href="/profile"
          className="hidden sm:inline-flex items-center gap-1 text-xs bg-white px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
          👤 My profile
        </Link>
      </div>

      {/* KPI grid — admins see 8 (incl. quality stats), surveyors see 4 positive ones */}
      {isAdmin ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <Kpi label="Total submissions" value={submissions.length.toLocaleString()} color="bg-brand-50 text-brand-900" icon="📋" />
          <Kpi label="Clean readings" value={cleanTotal.toLocaleString()} color="bg-field-50 text-field-900" icon="✓" />
          <Kpi label="🚩 Flagged" value={flaggedTotal.toLocaleString()} color={flaggedTotal > 0 ? 'bg-red-50 text-red-900' : 'bg-slate-50 text-slate-700'} icon="" />
          <Kpi label="Quality rate" value={submissions.length > 0 ? `${Math.round((cleanTotal / submissions.length) * 100)}%` : '—'} color="bg-emerald-50 text-emerald-900" icon="📊" />
          {isAdmin && <Kpi label="🌾 Farms with readings" value={totalFarms.toLocaleString()} color="bg-lime-50 text-lime-900" icon="" />}
          <Kpi label="Villages" value={uniqueVillages} color="bg-amber-50 text-amber-900" icon="🏘️" />
          <Kpi label="Active surveyors" value={uniqueSurveyors} color="bg-violet-50 text-violet-900" icon="👤" />
          <Kpi label={`This ${periodLabel}`} value={`${done}/${pipesTotal} done`} color="bg-sky-50 text-sky-900" icon="📅" />
          {irrThreshold != null && (
            <Kpi label="💧 Need irrigation" value={irrCounts.dry.toLocaleString()}
              color={irrCounts.dry > 0 ? 'bg-red-50 text-red-900' : 'bg-slate-50 text-slate-700'} icon="🔴" />
          )}
          <Kpi label={`Days left in ${periodLabel}`} value={remaining} color="bg-slate-100 text-slate-900" icon="⏳" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <Kpi label="My submissions" value={submissions.length.toLocaleString()} color="bg-brand-50 text-brand-900" icon="📋" />
          <Kpi label="My villages" value={uniqueVillages} color="bg-amber-50 text-amber-900" icon="🏘️" />
          <Kpi label={`This ${periodLabel}`} value={`${done}/${pipesTotal} done`} color="bg-sky-50 text-sky-900" icon="📅" />
          <Kpi label={`Days left in ${periodLabel}`} value={remaining} color="bg-slate-100 text-slate-900" icon="⏳" />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <QuickLink href="/submissions" icon="📋" label="Submissions" />
        <QuickLink href="/usage" icon="💧" label="Water level" />
        <QuickLink href="/map" icon="🗺️" label="Map" />
        {isAdmin
          ? <QuickLink href="/kobo-view" icon="🪞" label="Kobo data" />
          : <QuickLink href="/team" icon="👥" label="Assignment" />}
      </div>

      {/* Charts — only admins see quality donut + per-surveyor bars */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card title="Quality at a glance" subtitle={`${cleanTotal} clean · ${flaggedTotal} flagged · ${submissions.length} total`}>
            <DonutChart data={cleanVsFlagged} emptyText="No submissions yet" />
          </Card>
          <Card title="Submissions per surveyor" subtitle={`${uniqueSurveyors} surveyors`}>
            <VerticalBars data={surveyorBars} color="#7c3aed" />
          </Card>
        </div>
      )}

      {/* Farms — how many forms each farm ID has, with on/off in Settings */}
      {isAdmin && (
        <Card title="🌾 Forms per farm" subtitle={`${totalFarms} farms with at least one reading · ${farmRows.length} farms in the form · turn farms on/off in Settings → Farms & pipes`}>
          <FarmBreakdown rows={farmRows} />
        </Card>
      )}

      <Card title={isAdmin ? 'Submissions per village' : 'My submissions per village'} subtitle={isAdmin ? 'Top 8' : 'Your assigned villages'}>
        <BarChart data={villageBars} color="#0284c7" emptyText="No villages yet" />
      </Card>

      {status.length > 0 && (
        <Card title={`This ${periodLabel}'s progress`} subtitle={`${done} done · ${partial} partial · ${pending} pending · ${remaining} day${remaining === 1 ? '' : 's'} left`}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniStat label="Done" value={done} color="bg-field-100 text-field-900" />
            <MiniStat label="Partial" value={partial} color="bg-amber-100 text-amber-900" />
            <MiniStat label="Pending" value={pending} color="bg-rose-100 text-rose-900" />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            <Link href="/submissions" className="text-brand-600 hover:underline">View all submissions →</Link>
          </p>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, color, icon }) {
  return (
    <div className={`rounded-xl p-3 ${color} shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-2xl font-bold leading-tight tabular-nums">{value}</div>
        {icon && <span className="text-lg opacity-50">{icon}</span>}
      </div>
      <div className="text-[11px] opacity-80">{label}</div>
    </div>
  );
}
function QuickLink({ href, icon, label }) {
  return (
    <Link href={href} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition flex items-center gap-2 text-sm">
      <span className="text-xl">{icon}</span><span className="font-medium">{label}</span>
    </Link>
  );
}
function Card({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
      <div className="mb-3"><h3 className="font-semibold text-base">{title}</h3>{subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}</div>
      {children}
    </div>
  );
}
function MiniStat({ label, value, color }) {
  return (
    <div className={`rounded-lg p-3 text-center ${color}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div><div className="text-[11px]">{label}</div>
    </div>
  );
}
function VerticalBars({ data, color = '#0284c7' }) {
  if (!data || data.length === 0) return <div className="text-sm text-slate-400 text-center py-8">No data</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-slate-700 truncate pr-2">{d.label}</span>
            <span className="text-slate-500 tabular-nums shrink-0">{d.value}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }}/>
          </div>
        </li>
      ))}
    </ul>
  );
}
