'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getField } from '@/lib/fieldMap';
import Lightbox from '@/components/Lightbox';
import MiniMap from '@/components/MiniMap';

// Parse a Kobo location value ("lat lng alt acc" string, or _geolocation array)
// into { lat, lng } for the mini-map. Returns null when there's no usable GPS.
function parseSubLoc(submission) {
  const raw = getField(submission, 'location');
  if (typeof raw === 'string') {
    const p = raw.trim().split(/\s+/).map(Number);
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) return { lat: p[0], lng: p[1] };
  }
  const geo = submission._geolocation;
  if (Array.isArray(geo) && geo.length >= 2 && Number.isFinite(Number(geo[0])) && Number.isFinite(Number(geo[1]))) {
    return { lat: Number(geo[0]), lng: Number(geo[1]) };
  }
  return null;
}

// Fields already shown on the collapsed card (village, farm, pipe id) — hidden
// from the expanded "Form data" list so the detail doesn't repeat the header.
const DETAIL_SKIP_SEGMENTS = new Set([
  'village', 'village_name', 'q2', 'farm', 'farm_id', 'pipes', 'pipe', 'pipe_id', 'serial', 'meter_id',
]);

export default function SubmissionList({ submissions, flags, allSubmissions, canVerify = false, verifiedIds = [], duplicates = {} }) {
  const router = useRouter();
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
        // Soft refresh so the Verified / Flagged / Clean tab counts update.
        router.refresh();
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
            dupOthers={duplicates[s._id] || null}
          />
        );
      })}
    </div>
  );
}

function SubmissionCard({ submission, isOpen, flag, isVerified, canVerify, busy, onToggleVerify, onToggle, byId, dupOthers }) {
  const s = submission;
  const village = getField(s, 'village');
  const serial = getField(s, 'serial');
  const endR = getField(s, 'endReading');
  const surveyor = getField(s, 'surveyor');
  const time = new Date(s._submission_time);
  const showRed = flag && !isVerified;
  const corr = s._correction || null;
  const isDead = corr && corr.field === 'dead';
  const dupCount = Array.isArray(dupOthers) ? dupOthers.length : 0;
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
            {dupCount > 0 && <span title={`This pipe was read ${dupCount + 1}× on this date — open to compare`}>👯</span>}
            <span className={`font-medium truncate ${isDead ? 'line-through text-slate-500' : ''}`}>{village || '—'}</span>
            {surveyor && <span className="text-xs text-slate-500 truncate">· {surveyor}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
            <span className="font-mono">{serial || '—'}</span>
            {getField(s, 'farm') && <span className="font-mono text-[11px] text-slate-400">🌾 {getField(s, 'farm')}</span>}
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
          busy={busy} onToggleVerify={onToggleVerify} byId={byId} dupOthers={dupOthers}
        />
      )}
    </div>
  );
}

function SubmissionDetail({ submission, flag, isVerified, canVerify, busy, onToggleVerify, byId, dupOthers }) {
  // Show the side-by-side comparison whenever a duplicate partner exists —
  // either flagged (rollback/huge-jump/duplicate) or detected as a same-day
  // duplicate, so both forms are always reviewable even with flags turned off.
  const flagTarget = flag?.flags.find((f) => f.previousSubmissionId)?.previousSubmissionId;
  const dupIds = Array.isArray(dupOthers) ? dupOthers : [];
  // All partners to compare against — the flagged "previous" plus every same-day
  // duplicate — so 3+ readings on one day are all shown together (N-way).
  const otherIds = Array.from(new Set([flagTarget, ...dupIds].filter(Boolean)))
    .filter((id) => String(id) !== String(submission._id));
  const others = otherIds.map((id) => byId[id]).filter(Boolean);
  const isSameDayDup = !flagTarget && others.length > 0;

  return (
    <div className="border-t border-slate-200/60 p-3 sm:p-4 space-y-4">
      {isSameDayDup && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-indigo-900 text-sm">
          <span className="font-semibold">👯 Read {others.length + 1} times on this date.</span> All {others.length + 1} forms are shown below — decide which is correct, then correct the value or mark the mistaken one(s) as deleted. A deleted one stays here for reference and the kept one moves to Clean.
        </div>
      )}
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

      {others.length > 0 ? (
        <DuplicateCompare current={submission} others={others} canVerify={canVerify} />
      ) : (
        <SubmissionPanel label="Form data" submission={submission} />
      )}

      {canVerify && <FullFormEditor submission={submission} />}
    </div>
  );
}

// Side-by-side comparison of two submissions (e.g. a duplicate pair), with the
// differing fields highlighted, so the admin can see WHY one is wrong. Also
// lets the admin pick which of the two is the mistake and mark it dead.
const COMPARE_FIELDS = [
  ['date', 'Date'], ['startTime', 'Start'], ['endTime', 'End'], ['surveyor', 'Surveyor'],
  ['village', 'Village'], ['farm', 'Farm ID'], ['serial', 'Pipe ID'],
  ['validation', 'Outside (mm)'], ['reading', 'Water level (mm)'], ['location', 'GPS'],
];
function DuplicateCompare({ current, others, canVerify }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const columns = [current, ...others]; // N-way: this reading + every same-day partner
  const val = (sub, key) => {
    if (key === 'reading') return getField(sub, 'endReading') ?? getField(sub, 'reading') ?? '';
    return getField(sub, key) ?? '';
  };
  const isDeadSub = (sub) => sub._correction && sub._correction.field === 'dead';
  const isCorrectedSub = (sub) => sub._correction && sub._correction.field !== 'dead';
  const nameOf = (i) => (i === 0 ? 'This one' : `Other ${i}`);
  async function markDead(sub) {
    // Ask for a reason so the deleted reading records WHY. Cancel aborts.
    const note = window.prompt('Why is this reading a mistake? (short note — optional)', '');
    if (note === null) return;
    setBusy(sub._id);
    try {
      const res = await fetch('/api/corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: sub._id, field: 'dead', oldValue: val(sub, 'reading'), note }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      router.refresh(); // soft update — no full page reload
      setBusy('');
    } catch (e) { alert(e.message); setBusy(''); }
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">⚖️ Comparison — {columns.length} readings, differences highlighted</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-slate-200 rounded-lg">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left px-2 py-1.5 font-medium text-slate-500 whitespace-nowrap">Field</th>
              {columns.map((sub, i) => (
                <th key={sub._id} className="text-left px-2 py-1.5 font-medium whitespace-nowrap">
                  {nameOf(i)} <span className="font-mono text-[10px] text-slate-400">#{String(sub._id).slice(-5)}</span>
                  {isDeadSub(sub) && <span className="ml-1 text-[10px] text-slate-500">🗑️ deleted</span>}
                  {isCorrectedSub(sub) && <span className="ml-1 text-[10px] text-emerald-600">✎ corrected</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_FIELDS.map(([key, label]) => {
              const vals = columns.map((sub) => String(val(sub, key)));
              const allSame = vals.every((x) => x === vals[0]);
              return (
                <tr key={key} className={`border-t border-slate-100 ${allSame ? '' : 'bg-amber-50'}`}>
                  <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{label}</td>
                  {vals.map((x, i) => (
                    <td key={i} className={`px-2 py-1 ${allSame ? '' : 'font-semibold text-amber-800'}`}>{x || '—'}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canVerify && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500">Mark the mistaken reading(s) as deleted:</span>
          {columns.map((sub, i) => (
            isDeadSub(sub) ? (
              <span key={sub._id} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
                {nameOf(i)} already deleted
              </span>
            ) : (
              <button key={sub._id} onClick={() => markDead(sub)} disabled={!!busy}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-400 text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                🗑️ {nameOf(i)} is the mistake
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}

// Full-form editor: admin edits ANY field of a submission. Saved as an override
// (raw Kobo untouched); the edited values flow through the whole tool. This is
// how you fix a submission where something other than the reading is wrong.
const EDITABLE = [
  ['group_1/Date', 'Date', 'date'], ['group_1/Start', 'Start time', 'startTime'],
  ['End_time', 'End time', 'endTime'], ['group_1/name', 'Surveyor name', 'name'],
  ['group_1/village', 'Village', 'village'], ['group_2/farm', 'Farm ID', 'farm'],
  ['group_2/pipes', 'Pipe ID', 'serial'], ['group_2/Outside_validation', 'Outside height (mm)', 'validation'],
  ['group_2/Readings_mm', 'Water level (mm)', 'reading'], ['group_2/Location', 'GPS (lat lng)', 'location'],
];
// Which input control each field uses in the editor.
function fieldKind(logical) {
  if (logical === 'date') return 'date';
  if (logical === 'startTime' || logical === 'endTime') return 'time';
  if (logical === 'name') return 'surveyor';
  if (logical === 'reading' || logical === 'validation') return 'number';
  return 'text';
}
// Kobo time "16:00:00.000+05:30" <-> the <input type=time> "16:00" value.
function toTimeInput(v) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(v || ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}
function fromTimeInput(hhmm) {
  return hhmm ? `${hhmm}:00.000+05:30` : '';
}
// Kobo date is already YYYY-MM-DD (strip any time part just in case).
function toDateInput(v) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(v || ''));
  return m ? m[1] : '';
}

function FullFormEditor({ submission }) {
  const existing = submission._correction && submission._correction.field === 'fields'
    ? (submission._correction.fields || {}) : {};
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [surveyors, setSurveyors] = useState([]);
  const router = useRouter();

  function currentVal(path, logical) {
    if (path in existing) return existing[path];
    if (path in submission) return submission[path];
    return getField(submission, logical) ?? '';
  }
  function begin() {
    const seed = {};
    for (const [path, , logical] of EDITABLE) seed[path] = String(currentVal(path, logical) ?? '');
    setVals(seed); setOpen(true); setErr('');
    // Load the list of surveyor names for the dropdown.
    fetch('/api/surveyors').then((r) => r.json()).then((d) => setSurveyors(Array.isArray(d.surveyors) ? d.surveyors : [])).catch(() => {});
  }
  async function save() {
    // Only send fields that actually changed from the raw value.
    const changed = {};
    for (const [path, , logical] of EDITABLE) {
      const raw = String(submission[path] ?? getField(submission, logical) ?? '');
      if (String(vals[path] ?? '') !== raw) changed[path] = vals[path];
    }
    if (Object.keys(changed).length === 0) { setErr('Nothing changed.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: submission._id, field: 'fields', fields: changed, note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || `Save failed (HTTP ${res.status})`);
      router.refresh();
      setBusy(false); setOpen(false);
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  async function revert() {
    setBusy(true);
    try {
      const res = await fetch(`/api/corrections?id=${encodeURIComponent(submission._id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      router.refresh();
      setBusy(false); setOpen(false);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={begin} className="text-xs px-3 py-1.5 rounded-lg border border-sky-400 text-sky-700 hover:bg-sky-50">
          ✏️ Edit full form
        </button>
        {Object.keys(existing).length > 0 && (
          <>
            <span className="text-xs text-emerald-700">✎ {Object.keys(existing).length} field(s) edited</span>
            <button onClick={revert} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">↺ Revert all</button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-2">
      <div className="text-sm font-semibold text-sky-900">✏️ Edit full form <span className="font-normal text-xs text-slate-500">— raw Kobo data stays untouched; the tool uses your edits everywhere</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {EDITABLE.map(([path, label, logical]) => {
          const raw = String(submission[path] ?? getField(submission, logical) ?? '');
          const changed = String(vals[path] ?? '') !== raw;
          const kind = fieldKind(logical);
          const cls = `w-full px-2 py-1.5 rounded border text-sm ${changed ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`;
          let control;
          if (kind === 'date') {
            control = <input type="date" value={toDateInput(vals[path])} onChange={(e) => setVals({ ...vals, [path]: e.target.value })} className={cls} />;
          } else if (kind === 'time') {
            control = <input type="time" value={toTimeInput(vals[path])} onChange={(e) => setVals({ ...vals, [path]: fromTimeInput(e.target.value) })} className={cls} />;
          } else if (kind === 'surveyor') {
            const cur = String(vals[path] ?? '');
            const opts = Array.from(new Set([cur, ...surveyors].filter(Boolean)));
            control = (
              <select value={cur} onChange={(e) => setVals({ ...vals, [path]: e.target.value })} className={cls}>
                {!cur && <option value="">— choose surveyor —</option>}
                {opts.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            );
          } else if (kind === 'number') {
            control = <input type="number" value={vals[path] ?? ''} onChange={(e) => setVals({ ...vals, [path]: e.target.value })} className={cls} />;
          } else {
            control = <input value={vals[path] ?? ''} onChange={(e) => setVals({ ...vals, [path]: e.target.value })} className={cls} />;
          }
          return (
            <label key={path} className="block">
              <span className="text-[11px] text-slate-500">{label}{changed && <span className="text-amber-600"> ●</span>}</span>
              {control}
            </label>
          );
        })}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the edit (optional)"
        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save edits'}</button>
        <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">Cancel</button>
      </div>
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
  const [mode, setMode] = useState(null); // null | 'value' | 'dead'
  const [newValue, setNewValue] = useState(existing && !isDead ? existing.newValue : '');
  const [note, setNote] = useState(existing ? (existing.note || '') : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const router = useRouter();
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
      // Soft refresh (no full page reload): the server re-renders with the new
      // correction overlaid, so this row moves into Corrected/Clean/Deleted.
      router.refresh();
      setBusy(false); setMode(null);
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  const saveValue = () => {
    if (String(newValue).trim() === '') { setErr('Enter the corrected reading.'); return; }
    post({ field: 'reading', oldValue: rawValue, newValue: String(newValue).trim(), note });
  };
  const markDead = () => post({ field: 'dead', oldValue: rawValue, note });
  const beginDead = () => { setErr(''); setNote(existing ? (existing.note || '') : ''); setMode('dead'); };
  async function revert() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/corrections?id=${encodeURIComponent(submission._id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Revert failed');
      router.refresh();
      setBusy(false); setMode(null);
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
      {mode === null && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-600 mr-1">Reading looks wrong?</span>
          <button onClick={() => setMode('value')} className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-100">✎ Correct the value</button>
          <button onClick={beginDead} className="text-xs px-3 py-1.5 rounded-lg border border-slate-400 text-slate-700 hover:bg-slate-100">🗑️ Mark as dead (mistake / duplicate)</button>
        </div>
      )}
      {mode === 'value' && (
        <ValueForm rawValue={rawValue} newValue={newValue} setNewValue={setNewValue} note={note} setNote={setNote} err={err} busy={busy} onSave={saveValue} onCancel={() => setMode(null)} />
      )}
      {mode === 'dead' && (
        <DeadForm note={note} setNote={setNote} err={err} busy={busy} onConfirm={markDead} onCancel={() => setMode(null)} />
      )}
      {err && mode === null && <div className="text-xs text-red-600 mt-1">{err}</div>}
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

// Note field shown before a reading is marked dead, so the admin records WHY
// (mistake, duplicate, wrong pipe, etc.). The note is saved and displayed on
// the dead reading afterwards.
function DeadForm({ note, setNote, err, busy, onConfirm, onCancel }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-600">Why is this reading dead? (mistake, duplicate, wrong pipe…). This note is saved with the dead reading.</div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="e.g. Duplicate of the reading taken the same day — this one is the mistake."
        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-white font-medium hover:bg-slate-800 disabled:opacity-50">{busy ? 'Saving…' : '🗑️ Confirm dead reading'}</button>
        <button onClick={onCancel} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-50">Cancel</button>
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
          // Don't repeat village / farm / pipe ID — they're already on the card.
          .filter(([k]) => !DETAIL_SKIP_SEGMENTS.has(k.split('/').pop().toLowerCase()))
          .slice(0, 10)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-2 text-xs">
              <dt className="text-slate-500 truncate">{prettyKey(k)}</dt>
              <dd className="text-slate-900 break-all">{renderVal(v)}</dd>
            </div>
          ))}
      </dl>
      {(() => {
        const loc = parseSubLoc(submission);
        if (!loc) return null;
        return (
          <div className="mb-3">
            <div className="text-[11px] text-slate-500 mb-1">📍 Where this reading was taken</div>
            <MiniMap lat={loc.lat} lng={loc.lng} label={getField(submission, 'serial') || 'Reading location'} />
            <a target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
              className="inline-block mt-1.5 text-[11px] px-2.5 py-1 rounded-full bg-field-600 text-white font-medium hover:bg-field-700">
              🧭 Directions
            </a>
          </div>
        );
      })()}
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
