'use client';

import { useEffect, useState } from 'react';
import MeterStatusTable from '@/components/MeterStatusTable';

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export default function MissedPage() {
  const [user, setUser] = useState(undefined);
  const [date, setDate] = useState('');
  const [week, setWeek] = useState('this'); // 'this' = current period status, 'last' = past periods
  const [periodDays, setPeriodDays] = useState(7);
  const [periodLabel, setPeriodLabel] = useState('week');
  const [cycleDays, setCycleDays] = useState(0); // 0 = use the settings default; 7/14/21 override

  useEffect(() => {
    fetch('/api/auth/check').then((r) => r.json()).then((d) => setUser(d.user || null)).catch(() => setUser(null));
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      const r = d?.settings?.reading;
      if (r) { setPeriodDays(Number(r.periodDays) || 7); setPeriodLabel(String(r.periodLabel || 'week')); }
    }).catch(() => {});
  }, []);

  if (user === undefined) return <div className="h-40 bg-white rounded-xl shadow-sm animate-pulse" />;
  if (!user) return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
      <a href="/login" className="underline font-medium">Log in</a> to view this page.
    </div>
  );

  const step = Math.max(1, periodDays);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">📌 Assignment — readings per village</h2>
        <p className="text-sm text-slate-500">
          Done, left and total readings per village. Tap a village to see its pipes. "This {periodLabel}" shows live progress; past {periodLabel}s show what was missed.
        </p>
      </div>

      {/* ONE control block: pick which period to view, plus (compact) how long
          a reading cycle is. */}
      <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs font-medium text-slate-600">📅 Show {periodLabel} of:</label>
          <div className="flex gap-1.5 flex-wrap">
            <QuickBtn active={week === 'this'} onClick={() => { setWeek('this'); setDate(''); }}>This {periodLabel}</QuickBtn>
            <QuickBtn active={week === 'last' && !date} onClick={() => { setWeek('last'); setDate(''); }}>Last {periodLabel}</QuickBtn>
            <QuickBtn active={week === 'last' && date === isoDaysAgo(step * 2)} onClick={() => { setWeek('last'); setDate(isoDaysAgo(step * 2)); }}>2 {periodLabel}s ago</QuickBtn>
            <QuickBtn active={week === 'last' && date === isoDaysAgo(step * 3)} onClick={() => { setWeek('last'); setDate(isoDaysAgo(step * 3)); }}>3 {periodLabel}s ago</QuickBtn>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-2">
          <label className="text-xs font-medium text-slate-600">🔁 Cycle length:</label>
          <select value={cycleDays} onChange={(e) => setCycleDays(Number(e.target.value))}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs">
            <option value={0}>Default ({periodDays} days)</option>
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
            <option value={21}>3 weeks</option>
          </select>
          <label className="text-xs font-medium text-slate-600 ml-1">or a date:</label>
          <input type="date" value={date} max={isoDaysAgo(0)} onChange={(e) => { setWeek('last'); setDate(e.target.value); }}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
          <span className="text-[11px] text-slate-400 w-full sm:w-auto">Cycle length = how long a pipe has to hit its target before it counts as missed.</span>
        </div>
      </div>

      <MeterStatusTable week={week} date={week === 'this' ? '' : date} days={cycleDays} />
    </div>
  );
}

function QuickBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
      {children}
    </button>
  );
}
