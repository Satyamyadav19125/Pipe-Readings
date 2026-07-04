'use client';

import { useEffect, useState } from 'react';

const COLORS = {
  media: '#0ea5e9', messages: '#22c55e', tasks: '#f59e0b',
  verifications: '#8b5cf6', assignments: '#ef4444', settings: '#64748b',
};
const NICE = {
  media: '📷 Photos', messages: '💬 Chat', tasks: '✅ Tasks',
  verifications: '✓ Verifications', assignments: '👥 Assignments', settings: '⚙️ Settings',
};

function fmtBytes(b) {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function lastNMonths(n = 12) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    out.push({ label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), from, to });
    d.setMonth(m - 1);
  }
  return out;
}

// iOS-style storage gauge + monthly archives + cleanup.
// Lives inside the admin Settings page.
export default function DataStorage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [before, setBefore] = useState('');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/storage');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setStats(d);
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function cleanup(what, label) {
    if (!before) { setMessage(null); setError('Pick a date first — everything OLDER than that date will be deleted.'); return; }
    if (!confirm(`Delete all ${label} from before ${before}? This cannot be undone.`)) return;
    setBusy(what); setError(null); setMessage(null);
    try {
      const res = await fetch('/api/storage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ what, before }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Cleanup failed');
      setMessage(`Deleted ${d.deleted} ${label} ✓`);
      load();
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />;
  if (error && !stats) return <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{error}</div>;

  // Defensive: if /api/storage ever returns the wrong shape, fall back to safe
  // defaults instead of crashing the whole Settings page.
  const used = Number(stats?.dataSize) || 0;
  const limit = Number(stats?.limitBytes) || 512 * 1024 * 1024;
  const pct = Math.min(100, (used / limit) * 100);
  const cols = Array.isArray(stats?.collections)
    ? [...stats.collections].sort((a, b) => b.size - a.size)
    : [];
  if (!Array.isArray(stats?.collections)) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
        Storage info unavailable. The Settings page is fine; this section just couldn't load stats.
      </div>
    );
  }
  const months = lastNMonths(12);

  return (
    <div className="space-y-4">
      {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-2 text-sm">{message}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded p-2 text-sm">{error}</div>}

      {/* iOS-style storage bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-medium text-slate-700">Database storage</span>
          <span className="text-sm text-slate-600"><b>{fmtBytes(used)}</b> of {fmtBytes(limit)} used</span>
        </div>
        <div className="h-5 w-full rounded-full bg-slate-100 overflow-hidden flex">
          {cols.map((c) => {
            const w = limit > 0 ? (c.size / limit) * 100 : 0;
            if (w <= 0) return null;
            return <div key={c.name} title={`${c.name}: ${fmtBytes(c.size)}`} style={{ width: `${Math.max(w, 0.4)}%`, background: COLORS[c.name] || '#94a3b8' }} className="h-full first:rounded-l-full" />;
          })}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">{pct.toFixed(2)}% of the free MongoDB Atlas (M0) tier</div>
        <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
          {cols.map((c) => (
            <li key={c.name} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[c.name] || '#94a3b8' }} />
              <span className="text-slate-700 truncate">{NICE[c.name] || c.name}</span>
              <span className="text-slate-400 text-xs ml-auto tabular-nums">{fmtBytes(c.size)}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-400 mt-3">
          Your pipe <b>readings are stored in KoboToolbox</b>, not here — this database only holds app data (photos, chat, tasks, settings). Deleting things here never deletes any reading.
        </p>
      </div>

      {/* Monthly downloads */}
      <div className="border-t border-slate-100 pt-3">
        <div className="text-sm font-medium text-slate-700 mb-1">Monthly downloads</div>
        <p className="text-xs text-slate-500 mb-2">Archive each month before cleaning up: all readings, flagged-only, and the GPS map file.</p>
        <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
          {months.map((m) => (
            <li key={m.from} className="py-2 flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm flex-1 min-w-[110px]">{m.label}</span>
              <a className="dl-btn" href={`/api/export?format=xlsx&from=${m.from}&to=${m.to}`}>📗 XLSX</a>
              <a className="dl-btn" href={`/api/export?format=csv&from=${m.from}&to=${m.to}`}>📊 All CSV</a>
              <a className="dl-btn" href={`/api/export?format=csv&flag=flagged&from=${m.from}&to=${m.to}`}>🚩 Flags CSV</a>
              <a className="dl-btn" href={`/api/export-map?format=csv&from=${m.from}&to=${m.to}`}>🗺️ Map CSV</a>
            </li>
          ))}
        </ul>
      </div>

      {/* Cleanup */}
      <div className="border-t border-slate-100 pt-3">
        <div className="text-sm font-medium text-slate-700 mb-1">🧹 Free up space</div>
        <p className="text-xs text-slate-500 mb-2">Pick a date, then delete app data OLDER than it. Download your archives first!</p>
        <input type="date" value={before} onChange={(e) => setBefore(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2 block" />
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => cleanup('messages', 'chat messages')} disabled={busy}
            className="px-3 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50">
            {busy === 'messages' ? 'Deleting…' : '💬 Old chat messages'}
          </button>
          <button type="button" onClick={() => cleanup('tasks', 'finished tasks')} disabled={busy}
            className="px-3 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50">
            {busy === 'tasks' ? 'Deleting…' : '✅ Finished tasks'}
          </button>
          <button type="button" onClick={() => cleanup('verifications', 'old verifications')} disabled={busy}
            className="px-3 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50">
            {busy === 'verifications' ? 'Deleting…' : '✓ Old verifications'}
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(.dl-btn) {
          font-size: 0.72rem; padding: 0.3rem 0.55rem; border-radius: 0.5rem;
          border: 1px solid #cbd5e1; background: white; white-space: nowrap;
        }
        :global(.dl-btn:hover) { background: #f8fafc; }
        :global(.dark .dl-btn) { background: #1e293b; border-color: #334155; color: #e2e8f0; }
        :global(.dark .dl-btn:hover) { background: #2b3a55; }
      `}</style>
    </div>
  );
}
