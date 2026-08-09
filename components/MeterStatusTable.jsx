'use client';

import { useEffect, useState, useMemo } from 'react';
import { buildPrefillUrl } from '@/lib/prefill';
import MiniMap from '@/components/MiniMap';

const STATUS = {
  done:    { label: '✓ Done',         dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', row: 'bg-emerald-50/40' },
  partial: { label: 'In progress',    dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-800 border-amber-200',       row: 'bg-amber-50/40' },
  pending: { label: 'Needs reading',  dot: 'bg-rose-500',    chip: 'bg-rose-100 text-rose-800 border-rose-200',          row: 'bg-rose-50/40' },
};

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 200) }; }
}

// week = 'this' (default) | 'last'
// date = 'YYYY-MM-DD' -> overrides week, shows the period containing that date
export default function MeterStatusTable({ week = 'this', date = '' }) {
  const isLast = week === 'last' && !date;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('todo'); // todo | all | done
  const [q, setQ] = useState('');
  const [openCheat, setOpenCheat] = useState({});
  const [openVillages, setOpenVillages] = useState({}); // village -> bool (collapsed by default)

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        let url = '/api/meter-status';
        if (date) url += `?date=${encodeURIComponent(date)}`;
        else if (week === 'last') url += '?week=last';
        const res = await fetch(url);
        const d = await parseJsonSafe(res);
        if (!res.ok) throw new Error(d.error || 'Failed to load pipes');
        if (alive) { setData(d); setError(null); }
      } catch (e) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [week, date]);

  const villages = useMemo(() => {
    if (!data?.villages) return [];
    const needle = q.trim().toLowerCase();
    return data.villages
      .map((v) => {
        let meters = v.meters;
        if (filter === 'todo') meters = meters.filter((m) => m.status !== 'done');
        else if (filter === 'done') meters = meters.filter((m) => m.status === 'done');
        if (needle) meters = meters.filter((m) => m.serial.toLowerCase().includes(needle));
        return { ...v, shownMeters: meters };
      })
      .filter((v) => v.shownMeters.length > 0 || (!needle && filter === 'all'));
  }, [data, filter, q]);

  if (loading) return <div className="h-40 bg-white rounded-xl shadow-sm animate-pulse" />;
  if (error) return <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">Couldn't load pipe list: {error}</div>;
  if (!data || data.totals.total === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 text-center text-slate-500 text-sm">
        No pipes found for this period.
      </div>
    );
  }

  const t = data.totals;
  const target = data.target || 2;
  const periodLabel = data.periodLabel || 'week';
  const missed = t.partial + t.pending;
  const pastWeek = !data.isCurrentWeek;
  const weekStart = new Date(data.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekEndShown = new Date(new Date(data.weekEnd).getTime() - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const pct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;

  const title = pastWeek
    ? (isLast ? `📌 Last ${periodLabel} — missed readings` : `📌 Selected ${periodLabel} — missed readings`)
    : `📋 This ${periodLabel}\u2019s pipe readings`;

  return (
    <div className="space-y-3">
      <div className={`border rounded-xl p-4 ${pastWeek ? 'bg-rose-50 border-rose-100' : 'bg-gradient-to-br from-brand-50 to-field-50 border-brand-100'}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">{title}</div>
            <div className="text-xs text-slate-600 mt-0.5">
              {weekStart} – {weekEndShown} · each pipe needs <b>{target} reading{target === 1 ? '' : 's'}</b>
              {!pastWeek && <> · {data.daysLeft} day{data.daysLeft === 1 ? '' : 's'} left</>}
            </div>
          </div>
          <div className="text-right">
            {pastWeek ? (
              <>
                <div className="text-2xl font-bold tabular-nums leading-none text-rose-700">{missed}</div>
                <div className="text-[11px] text-slate-500">pipes missed</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums leading-none">{t.done}/{t.total}</div>
                <div className="text-[11px] text-slate-500">pipes done</div>
              </>
            )}
          </div>
        </div>
        {!pastWeek && (
          <div className="mt-3 h-2.5 bg-white/70 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="flex gap-3 mt-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {t.done} done</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {t.partial} in progress</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> {t.pending} not read</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-white rounded-lg shadow-sm p-0.5 text-sm">
          <FilterBtn active={filter === 'todo'} onClick={() => setFilter('todo')}>{pastWeek ? `Missed (${missed})` : `To do (${missed})`}</FilterBtn>
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>All ({t.total})</FilterBtn>
          <FilterBtn active={filter === 'done'} onClick={() => setFilter('done')}>Done ({t.done})</FilterBtn>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pipe…"
          className="flex-1 min-w-[140px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white" />
      </div>

      {villages.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-emerald-700 text-sm">
          {pastWeek ? '🎉 Nothing was missed — every pipe hit its target!' : `🎉 Nothing left to do — every pipe has been read ${target} time${target === 1 ? '' : 's'} this ${periodLabel}!`}
        </div>
      ) : villages.map((v) => {
        const isOpen = !!openVillages[v.village] || !!q; // searching auto-expands
        return (
        <div key={v.village} className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button type="button"
            onClick={() => setOpenVillages((o) => ({ ...o, [v.village]: !o[v.village] }))}
            className="w-full px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2 text-left hover:bg-slate-100 transition">
            <div className="font-semibold text-sm flex items-center gap-2">
              <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span> 🏘️ {v.village}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap justify-end">
              <span className="text-emerald-600 font-medium">{v.done} taken</span>
              {v.partial > 0 && <span className="text-amber-600 font-medium">{v.partial} partial</span>}
              <span className={`${v.pending > 0 ? 'text-rose-600' : 'text-slate-400'} font-medium`}>{v.pending} to take</span>
              <span>· {v.total} pipes</span>
            </div>
          </button>
          {isOpen && (
          <ul className="divide-y divide-slate-100">
            {v.shownMeters.map((m) => {
              const st = STATUS[m.status];
              return (
                <li key={m.serial} className={`px-4 py-2.5 ${st.row}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm truncate">{m.serial}</div>
                      {m.farm && <div className="text-[10px] text-slate-400 font-mono truncate">🌾 {m.farm}</div>}
                      <div className="text-[11px] text-slate-500 truncate">
                        {m.lastDate
                          ? <>last: {m.lastReading ?? '—'} · {new Date(m.lastDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{m.lastSurveyor ? ` · ${m.lastSurveyor}` : ''}</>
                          : 'no readings yet'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setOpenCheat((o) => ({ ...o, [m.serial]: !o[m.serial] }))}
                        className="text-[11px] px-2 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100"
                        title="Show farm ID, GPS and a mini map for this pipe">
                        📋 details
                      </button>
                      {/* Pre-filled Kobo web-form link (for those not using the app) */}
                      {data.formUploadUrl && m.status !== 'done' && (
                        <a
                          href={buildPrefillUrl(data.formUploadUrl,
                            { village: v.village, farm: m.farm, pipe: m.serial, name: data.userName },
                            { paths: data.prefillPaths || undefined })}
                          target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-field-600 text-white font-medium hover:bg-field-700 whitespace-nowrap"
                          title="Open the Kobo web form with this pipe's details pre-filled">
                          ➕ Take reading
                        </a>
                      )}
                      <div className="text-right">
                        <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border font-medium ${st.chip}`}>{st.label}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{Math.min(m.countThisPeriod, target)}/{target}</div>
                      </div>
                    </div>
                  </div>

                  {/* KoboCollect cheat-sheet: the details to type into the app,
                      each with a copy button. For surveyors who use the native
                      KoboCollect app (which can't be pre-filled by a link). */}
                  {openCheat[m.serial] && (
                    <div className="mt-2 ml-5 bg-white border border-slate-200 rounded-lg p-2.5 text-xs space-y-1.5">
                      <div className="text-[11px] text-slate-500">Type these into the KoboCollect app for this pipe:</div>
                      <CopyRow label="Village" value={v.village} />
                      <CopyRow label="Farm ID" value={m.farm} />
                      <CopyRow label="Pipe ID" value={m.serial} />
                      {m.refLoc && <CopyRow label="Reference GPS" value={m.refLoc} />}
                      <div className="text-[10px] text-slate-400 pt-0.5">Then just fill the outside height, water level, GPS and photos.</div>
                      {m.lat != null && m.lng != null && (
                        <PipeDetailMap lat={m.lat} lng={m.lng} serial={m.serial} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          )}
        </div>
      );})}
    </div>
  );
}

function FilterBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md whitespace-nowrap transition ${active ? 'bg-brand-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
      {children}
    </button>
  );
}


// Mini map of where the pipe sits (reference GPS, or the median of its
// readings) plus a "how far am I?" button that uses the phone's location to
// show the distance from here to the pipe.
function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function PipeDetailMap({ lat, lng, serial }) {
  const [state, setState] = useState('idle'); // idle | locating | done | error
  const [dist, setDist] = useState(null);
  const [err, setErr] = useState('');

  function howFar() {
    setErr(''); setState('locating');
    if (!('geolocation' in navigator)) { setErr('This device can’t share location.'); setState('error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = haversineM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat, lng });
        setDist(d); setState('done');
      },
      (geoErr) => {
        setErr(geoErr.code === 1 ? 'Location permission denied.' : 'Couldn’t get a GPS fix — try again in open sky.');
        setState('error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  const pretty = dist == null ? '' : dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;

  return (
    <div className="pt-1.5 space-y-1.5">
      <div className="text-[10px] text-slate-400">📍 Where this pipe is (most-common reading location):</div>
      <MiniMap lat={lat} lng={lng} label={serial} />
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={howFar} disabled={state === 'locating'}
          className="text-[11px] px-2.5 py-1 rounded-full bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50">
          {state === 'locating' ? 'Locating…' : '📍 How far am I?'}
        </button>
        {state === 'done' && <span className="text-[11px] text-slate-700 font-medium">You are <b>{pretty}</b> from this pipe.</span>}
        <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
          className="text-[11px] px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100">🧭 Directions</a>
      </div>
      {state === 'error' && <div className="text-[11px] text-red-600">{err}</div>}
    </div>
  );
}

// One label:value row with a copy button, for the KoboCollect cheat-sheet.
function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { /* clipboard may be blocked; value is still visible to type */ }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 w-24 shrink-0">{label}</span>
      <span className="font-mono flex-1 truncate">{value}</span>
      <button onClick={copy} className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 shrink-0">
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}
