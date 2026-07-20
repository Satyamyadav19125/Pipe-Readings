'use client';
import { useState } from 'react';

// Per-farm submission counts with a search box. Farms with zero forms are
// shown too (they exist in the Kobo form but haven't been read yet).
export default function FarmBreakdown({ rows = [] }) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filtered = rows.filter((r) => !q || r.farm.toLowerCase().includes(q.toLowerCase()));
  const shown = showAll ? filtered : filtered.slice(0, 12);
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search farm ID…"
        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm bg-transparent" />
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {shown.map((r) => (
          <div key={r.farm} className="flex items-center gap-2">
            <div className="w-40 sm:w-52 shrink-0 font-mono text-[11px] truncate" title={r.farm}>{r.farm}</div>
            <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
              <div className="h-full bg-lime-500/70 rounded" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
            <div className={`w-8 text-right text-xs tabular-nums ${r.count === 0 ? 'text-slate-400' : 'font-medium'}`}>{r.count}</div>
          </div>
        ))}
        {shown.length === 0 && <div className="text-sm text-slate-500 py-2">No farms match "{q}".</div>}
      </div>
      {filtered.length > 12 && (
        <button onClick={() => setShowAll((v) => !v)} className="text-xs text-brand-600 hover:underline">
          {showAll ? 'Show less' : `Show all ${filtered.length} farms`}
        </button>
      )}
    </div>
  );
}
