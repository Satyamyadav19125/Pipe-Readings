'use client';

import { useState } from 'react';
import { getField } from '@/lib/fieldMap';
import Lightbox from '@/components/Lightbox';

// `hideFlags` (true for surveyors): suppresses the red colouring and the 🚩
// prefix. The numerical difference is still shown — it's just data.
export default function UsageRow({ entry, previous, current, flag, hideFlags = false }) {
  const [open, setOpen] = useState(false);
  const c = entry;
  const isFlagged = !hideFlags && (c.flagged || !!flag);

  return (
    <li className={isFlagged ? 'bg-red-50/60' : ''}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-sm hover:bg-black/[0.02] text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium tabular-nums">{c.fromReading} → {c.toReading}</div>
          <div className="text-xs text-slate-500 truncate">
            {new Date(c.fromDate).toLocaleDateString()} → {new Date(c.toDate).toLocaleDateString()}
            {c.toSurveyor && <> · {c.toSurveyor}</>}
          </div>
        </div>
        <div className={`text-right font-semibold tabular-nums shrink-0 ${isFlagged ? 'text-red-700' : 'text-slate-900'}`}>
          {isFlagged && '🚩 '}
          {c.used > 0 ? '+' : ''}{c.used}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`ml-2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (previous || current) && (
        <div className="border-t border-slate-200/60 p-3 bg-slate-50/50">
          {!hideFlags && flag && (
            <div className="bg-red-100 border border-red-300 rounded p-2.5 mb-3 text-sm text-red-900">
              <strong>🚩 Red flag:</strong>
              <ul className="list-disc pl-5 mt-1 text-xs">
                {flag.flags.map((f, i) => (
                  <li key={i}><strong className="capitalize">{(f.type || '').replace(/_/g, ' ')}:</strong> {f.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Panel label="Previous reading" submission={previous} color="emerald" />
            <Panel label={`Current reading${isFlagged ? ' (flagged)' : ''}`} submission={current} color={isFlagged ? 'red' : 'sky'} />
          </div>
        </div>
      )}
    </li>
  );
}

function Panel({ label, submission, color }) {
  const [lb, setLb] = useState(null);
  if (!submission) {
    return <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-400">Not found</div>;
  }
  const palette = {
    emerald: 'border-emerald-300 bg-emerald-50',
    red: 'border-red-300 bg-red-50',
    sky: 'border-sky-300 bg-sky-50',
  }[color] || 'border-slate-200 bg-white';

  const reading = getField(submission, 'endReading');
  const surveyor = getField(submission, 'surveyor');
  const photos = submission._attachments || [];

  return (
    <div className={`rounded border ${palette} p-3`}>
      <div className="text-xs uppercase tracking-wide text-slate-600 font-semibold mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums mb-1">{reading ?? '—'}</div>
      <div className="text-xs text-slate-600 mb-2">
        {new Date(submission._submission_time).toLocaleString()}<br/>
        by {surveyor || '—'} · #{submission._id}
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {photos.slice(0, 2).map((a) => (
            <button key={a.id} type="button" onClick={() => setLb(`/api/photo?url=${encodeURIComponent(a.download_url)}`)}>
              <img
                src={`/api/photo?url=${encodeURIComponent(a.download_small_url || a.download_url)}`}
                alt={a.filename}
                className="w-full h-28 object-cover rounded border border-slate-200 cursor-zoom-in"
              />
            </button>
          ))}
        </div>
      )}
      {lb && <Lightbox src={lb} onClose={() => setLb(null)} label="Pipe photo" />}
    </div>
  );
}
