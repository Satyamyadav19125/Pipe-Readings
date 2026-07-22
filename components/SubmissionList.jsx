'use client';

import { useState } from 'react';
import { getField } from '@/lib/fieldMap';
import Lightbox from '@/components/Lightbox';

export default function SubmissionList({ submissions, flags, allSubmissions, canVerify = false, verifiedIds = [] }) {
  const [openId, setOpenId] = useState(null);
  const [verified, setVerified] = useState(() => new Set(verifiedIds.map(String)));
  const [busyId, setBusyId] = useState(null);

  const byId = {};
  for (const s of (allSubmissions || submissions)) byId[s._id] = s;

  async function toggleVerify(id, makeVerified) {
    setBusyId(id);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, verified: makeVerified }),
      });
      if (res.ok) {
        setVerified((prev) => {
          const next = new Set(prev);
          if (makeVerified) next.add(String(id)); else next.delete(String(id));
          return next;
        });
      }
    } catch {}
    finally { setBusyId(null); }
  }

  if (submissions.length === 0) {
    return <p className="text-slate-500 bg-white rounded-lg shadow p-6 text-center">No submissions match the current filter.</p>;
  }

  return (
    <div className="space-y-2">
      {submissions.map((s) => {
        const isOpen = openId === s._id;
        const flag = flags[s._id];
        const isVerified = verified.has(String(s._id));
        return (
          <SubmissionCard
            key={s._id}
            submission={s}
            isOpen={isOpen}
            flag={flag}
            isVerified={isVerified}
            canVerify={canVerify}
            busy={busyId === s._id}
            onToggleVerify={toggleVerify}
            onToggle={() => setOpenId(isOpen ? null : s._id)}
            byId={byId}
          />
        );
      })}
    </div>
  );
}

function SubmissionCard({ submission, isOpen, flag, isVerified, canVerify, busy, onToggleVerify, onToggle, byId }) {
  const s = submission;
  const village = getField(s, 'village');
  const serial = getField(s, 'serial');
  const endR = getField(s, 'endReading');
  const surveyor = getField(s, 'surveyor');
  const time = new Date(s._submission_time);
  const showRed = flag && !isVerified;
  const corr = s._correction || null;
  const isDead = corr && corr.field === 'dead';
  const cardClass = isDead ? 'bg-slate-100 border-slate-300 opacity-75'
    : showRed ? 'bg-red-50 border-red-200' : isVerified && flag ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200';

  return (
    <div className={`rounded-lg shadow-sm border overflow-hidden ${cardClass}`}>
      <button onClick={onToggle} className="w-full text-left p-3 sm:p-4 flex items-center gap-3 hover:bg-black/[0.02]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isDead && <span title="Dead reading — ignored by the tool">🗑️</span>}
            {!isDead && showRed && <span className="text-red-600">🚩</span>}
            {!isDead && corr && <span title="Reading corrected">✎</span>}
            {isVerified && flag && <span className="text-emerald-600" title="Marked correct by admin">✓</span>}
            <span className={`font-medium truncate ${isDead ? 'line-through text-slate-500' : ''}`}>{village || '—'}</span>
            {surveyor && <span className="text-xs text-slate-500 truncate">· {surveyor}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
            <span className="font-mono">{serial || '—'}</span>
            <span>{time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-base font-bold tabular-nums ${isDead ? 'line-through text-slate-400' : ''}`}>{endR ?? '—'}</div>
          <div className="text-xs text-slate-500">mm</div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {isOpen && (
        <SubmissionDetail
          submission={s} flag={flag} isVerified={isVerified} canVerify={canVerify}
          busy={busy} onToggleVerify={onToggleVerify} byId={byId}
        />
      )}
    </div>
  );
}

function SubmissionDetail({ submission, flag, isVerified, canVerify, busy, onToggleVerify, byId }) {
  const compareTarget = flag?.flags.find((f) => f.previousSubmissionId)?.previousSubmissionId;
  const previous = compareTarget ? byId[compareTarget] : null;

  return (
    <div className="border-t border-slate-200/60 p-3 sm:p-4 space-y-4">
      {flag && isVerified && (
        <div className="bg-emerald-100 border border-emerald-300 rounded-lg p-3 text-emerald-900">
          <div className="font-semibold mb-1 flex items-center gap-2">✓ Marked correct by admin</div>
          <p className="text-sm">This submission was flagged automatically but an admin reviewed it and confirmed it's fine, so it no longer counts as a red flag.</p>
          {canVerify && (
            <button onClick={() => onToggleVerify(submission._id, false)} disabled={busy}
              className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-emerald-400 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
              {busy ? 'Working…' : '↺ Undo — flag it again'}
            </button>
          )}
        </div>
      )}

      {flag && !isVerified && (
        <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-red-900">
          <div className="font-semibold mb-1.5 flex items-center gap-2">🚩 Red flag</div>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {flag.flags.map((f, i) => <li key={i}><strong className="capitalize">{(f.type || '').replace(/_/g, ' ')}:</strong> {f.message}</li>)}
          </ul>
          {canVerify && (
            <button onClick={() => onToggleVerify(submission._id, true)} disabled={busy}
              className="mt-2.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
              {busy ? 'Working…' : '✓ Mark this submission as correct'}
            </button>
          )}
        </div>
      )}

      {canVerify && <ReadingCorrection submission={submission} />}

      {previous ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SubmissionPanel label="Previous reading" submission={previous} highlight="emerald" />
          <SubmissionPanel label="Current reading" submission={submission} highlight={isVerified ? 'emerald' : 'red'} />
        </div>
      ) : (
        <SubmissionPanel label="Form data" submission={submission} />
      )}
    </div>
  );
}

// Admin-only reading review. Two independent actions on a submission:
//  1. CORRECT the value — raw Kobo untouched; tool uses the corrected number
//     everywhere so the wrong value stops triggering red flags. Shows old→new.
//  2. Mark as a DEAD reading — submitted by mistake (e.g. a duplicate where the
//     OTHER reading is the correct one). The row stays on Kobo but the tool
//     ignores it entirely: no flags, not counted, off the map/analytics.
function ReadingCorrection({ submission }) {
  const existing = submission._correction || null;
  const isDead = existing && existing.field === 'dead';
  const rawValue = existing && existing.field !== 'dead'
    ? existing.oldValue
    : (submission['group_2/Readings_mm'] ?? submission.reading ?? '');
  const [mode, setMode] = useState(null); // null | 'value'
  const [newValue, setNewValue] = useState(existing && !isDead ? existing.newValue : '');
  const [note, setNote] = useState(existing ? (existing.note || '') : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function post(body) {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: submission._id, ...body }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok || !data.ok) throw new Error(data.error || `Save failed (HTTP ${res.status})`);
      window.location.reload();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  const saveValue = () => {
    if (String(newValue).trim() === '') { setErr('Enter the corrected reading.'); return; }
    post({ field: 'reading', oldValue: rawValue, newValue: String(newValue).trim(), note });
  };
  const markDead = () => post({ field: 'dead', oldValue: rawValue, note });
  async function revert() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/corrections?id=${encodeURIComponent(submission._id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Revert failed');
      window.location.reload();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  // --- Already marked dead ---
  if (isDead) {
    return (
      <div className="bg-slate-100 border border-slate-300 rounded-lg p-3">
        <div className="text-sm font-semibold text-slate-700">🗑️ Marked as a dead reading (submitted by mistake)</div>
        <div className="text-xs text-slate-500 mt-0.5">
          Raw value {existing.oldValue ?? '—'} mm is still on Kobo but the tool ignores this reading everywhere — no flags, not counted, off the map.
          {existing.note ? ` Note: ${existing.note}.` : ''} by {existing.by || 'admin'}{existing.at ? ` · ${new Date(existing.at).toLocaleDateString()}` : ''}
        </div>
        {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
        <button onClick={revert} disabled={busy} className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-400 text-slate-700 hover:bg-white disabled:opacity-50">
          ↺ Restore this reading
        </button>
      </div>
    );
  }

  // --- Already value-corrected ---
  if (existing) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="text-sm"><span className="font-semibold text-amber-900">✎ Reading corrected</span></div>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
          <span className="line-through text-slate-500">{existing.oldValue ?? '—'}</span>
          <span className="text-slate-400">→</span>
          <span className="font-bold text-emerald-700">{existing.newValue} mm</span>
        </div>
        {existing.note && <div className="text-xs text-slate-600 mt-1">Note: {existing.note}</div>}
        <div className="text-[11px] text-slate-500 mt-0.5">by {existing.by || 'admin'}. Tool uses the corrected value everywhere; raw Kobo data untouched.</div>
        {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={() => { setMode('value'); setNewValue(existing.newValue); }} className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-100">✎ Edit</button>
          <button onClick={revert} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">↺ Revert to raw ({existing.oldValue ?? '—'})</button>
        </div>
        {mode === 'value' && (
          <ValueForm rawValue={rawValue} newValue={newValue} setNewValue={setNewValue} note={note} setNote={setNote} err={err} busy={busy} onSave={saveValue} onCancel={() => setMode(null)} />
        )}
      </div>
    );
  }

  // --- No correction yet: offer both actions ---
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      {mode !== 'value' ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-600 mr-1">Reading looks wrong?</span>
          <button onClick={() => setMode('value')} className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-100">✎ Correct the value</button>
          <button onClick={markDead} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-slate-400 text-slate-700 hover:bg-slate-100 disabled:opacity-50">🗑️ Mark as dead (mistake / duplicate)</button>
        </div>
      ) : (
        <ValueForm rawValue={rawValue} newValue={newValue} setNewValue={setNewValue} note={note} setNote={setNote} err={err} busy={busy} onSave={saveValue} onCancel={() => setMode(null)} />
      )}
      {err && mode !== 'value' && <div className="text-xs text-red-600 mt-1">{err}</div>}
    </div>
  );
}

function ValueForm({ rawValue, newValue, setNewValue, note, setNote, err, busy, onSave, onCancel }) {
  return (
    <div className="space-y-2 mt-2">
      <div className="text-xs text-slate-600">Raw Kobo reading: <b>{rawValue || '—'}</b> mm — enter the corrected value:</div>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. 2000" className="w-28 px-2 py-1.5 rounded border border-slate-300 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" className="flex-1 min-w-[140px] px-2 py-1.5 rounded border border-slate-300 text-sm" />
      </div>
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save correction'}</button>
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

function SubmissionPanel({ label, submission, highlight }) {
  const [lb, setLb] = useState(null);
  const photos = uniquePhotos(submission._attachments);
  const borderClass = highlight === 'red'
    ? 'border-red-300 bg-red-50'
    : highlight === 'emerald'
      ? 'border-emerald-300 bg-emerald-50'
      : 'border-slate-200 bg-slate-50';

  return (
    <div className={`rounded-lg border ${borderClass} p-3`}>
      <div className="text-xs uppercase tracking-wide text-slate-600 font-semibold mb-2">{label}</div>
      <div className="text-xs text-slate-500 mb-2">
        #{submission._id} · {new Date(submission._submission_time).toLocaleString()}
      </div>
      <dl className="space-y-1 mb-3">
        {Object.entries(submission)
          .filter(([k]) => !k.startsWith('_') && !k.includes('/uuid') && !k.includes('/instanceID'))
          .slice(0, 10)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-2 text-xs">
              <dt className="text-slate-500 truncate">{prettyKey(k)}</dt>
              <dd className="text-slate-900 break-all">{renderVal(v)}</dd>
            </div>
          ))}
      </dl>
      {photos.length > 0 && (
        <div className={`grid ${photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          {photos.slice(0, 2).map((a) => (
            <figure key={a.uid || a.id || a.filename} className="m-0">
              <button type="button" onClick={() => setLb(`/api/photo?url=${encodeURIComponent(a.download_url)}`)} className="block w-full">
                <img
                  src={`/api/photo?url=${encodeURIComponent(a.download_small_url || a.download_url)}`}
                  alt={labelForPhoto(a)}
                  className="w-full h-36 object-cover rounded border border-slate-200 cursor-zoom-in"
                />
              </button>
              <figcaption className="text-[10px] text-slate-500 mt-1 text-center">{labelForPhoto(a)}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {lb && <Lightbox src={lb} onClose={() => setLb(null)} label="Pipe photo" />}
    </div>
  );
}


// Two photos per pipe submission: the reading close-up and the wider field
// shot. Label each so they read as two distinct photos, and dedupe by filename.
function labelForPhoto(a) {
  const q = String(a.question_xpath || a.filename || '').toLowerCase();
  if (q.includes('photo_reading')) return 'Reading photo';
  if (q.includes('field_photo')) return 'Field photo';
  return 'Photo';
}
function uniquePhotos(atts) {
  const seen = new Set(); const out = [];
  for (const a of (atts || [])) {
    const base = a.media_file_basename || a.filename || a.download_url || '';
    if (seen.has(base)) continue;
    seen.add(base); out.push(a);
  }
  return out;
}

function prettyKey(k) {
  return k.replace(/^group_\d+\//, '').replace(/_/g, ' ');
}

function renderVal(v) {
  if (v === null || v === undefined || v === '') return <em className="text-slate-400">empty</em>;
  if (typeof v === 'object') return <code className="text-xs">{JSON.stringify(v)}</code>;
  return String(v);
}
