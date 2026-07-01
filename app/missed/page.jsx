'use client';

import { useEffect, useState } from 'react';
import MeterStatusTable from '@/components/MeterStatusTable';

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export default function MissedPage() {
  const [user, setUser] = useState(undefined);
  const [date, setDate] = useState('');
  const [periodDays, setPeriodDays] = useState(7);
  const [periodLabel, setPeriodLabel] = useState('week');

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
        <h2 className="text-xl font-semibold">📌 Missed readings</h2>
        <p className="text-sm text-slate-500">
          Meters that didn't hit their target in the selected {periodLabel}. Pick any date — you'll see the whole {periodLabel} containing it.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-2 flex-wrap">
        <label className="text-xs font-medium text-slate-600">📅 Show {periodLabel} of:</label>
        <input type="date" value={date} max={isoDaysAgo(0)} onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
        <div className="flex gap-1.5 ml-auto">
          <QuickBtn active={!date} onClick={() => setDate('')}>Last {periodLabel}</QuickBtn>
          <QuickBtn active={date === isoDaysAgo(step * 2)} onClick={() => setDate(isoDaysAgo(step * 2))}>2 {periodLabel}s ago</QuickBtn>
          <QuickBtn active={date === isoDaysAgo(step * 3)} onClick={() => setDate(isoDaysAgo(step * 3))}>3 {periodLabel}s ago</QuickBtn>
        </div>
      </div>

      <MeterStatusTable week="last" date={date} />
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
