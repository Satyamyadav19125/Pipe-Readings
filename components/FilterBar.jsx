'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export default function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [villages, setVillages] = useState([]);
  const [meters, setMeters] = useState([]);
  const [surveyors, setSurveyors] = useState([]);
  const [metersByVillage, setMetersByVillage] = useState({});
  const [surveyorVillages, setSurveyorVillages] = useState({});
  const [open, setOpen] = useState(false);

  const village = sp.get('village') || '';
  const meter = sp.get('meter') || '';
  const surveyor = sp.get('surveyor') || '';
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const flag = sp.get('flag') || '';

  const activeCount = [village, meter, surveyor, from, to].filter(Boolean).length;

  useEffect(() => {
    Promise.all([
      fetch('/api/villages').then((r) => r.json()).catch(() => ({})),
      fetch('/api/surveyors').then((r) => r.json()).catch(() => ({})),
    ]).then(([v, s]) => {
      setVillages(v.villages || []);
      setMeters(v.meters || []);
      setMetersByVillage(v.metersByVillage || {});
      setSurveyors(s.surveyors || []);
      setSurveyorVillages(s.pairings || {});
    });
  }, []);

  function update(key, value) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === 'village') params.delete('meter');
    if (key === 'surveyor') params.delete('meter');
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    if (flag) params.set('flag', flag);
    router.push(`${pathname}?${params.toString()}`);
  }

  let availableMeters = meters;
  if (village) availableMeters = metersByVillage[village] || [];
  if (surveyor) {
    const villagesForSurveyor = surveyorVillages[surveyor] || [];
    const set = new Set();
    for (const v of villagesForSurveyor) {
      for (const m of (metersByVillage[v] || [])) set.add(m);
    }
    availableMeters = village ? availableMeters.filter((m) => set.has(m)) : Array.from(set).sort();
  }

  let availableVillages = villages;
  if (surveyor && surveyorVillages[surveyor]) availableVillages = surveyorVillages[surveyor];

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2.5 flex items-center justify-between text-sm hover:bg-slate-50 rounded-xl">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span className="font-medium">Filters</span>
          {activeCount > 0 && <span className="bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full text-xs font-semibold">{activeCount} active</span>}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <div className="p-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Field label={`Surveyor (${surveyors.length})`}>
            <select value={surveyor} onChange={(e) => update('surveyor', e.target.value)} className="filter-input">
              <option value="">All surveyors</option>
              {surveyors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label={`Village (${availableVillages.length})`}>
            <select value={village} onChange={(e) => update('village', e.target.value)} className="filter-input">
              <option value="">All villages</option>
              {availableVillages.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label={`Pipe ID (${availableMeters.length})`}>
            <select value={meter} onChange={(e) => update('meter', e.target.value)} className="filter-input">
              <option value="">All pipes</option>
              {availableMeters.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="From date"><input type="date" value={from} onChange={(e) => update('from', e.target.value)} className="filter-input" /></Field>
          <Field label="To date"><input type="date" value={to} onChange={(e) => update('to', e.target.value)} className="filter-input" /></Field>
          <div className="flex items-end">
            <button onClick={clearAll} disabled={activeCount === 0}
              className="w-full px-3 py-2 text-sm rounded border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed">
              Clear filters
            </button>
          </div>
        </div>
      )}
      <style jsx>{`
        :global(.filter-input) { width: 100%; padding: 0.5rem 0.625rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.875rem; background: white; }
        :global(.filter-input:focus) { outline: 2px solid #0ea5e9; outline-offset: -1px; }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
