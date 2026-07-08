'use client';

import MiniMap from '@/components/MiniMap';

import { useMemo, useState } from 'react';

// `mobile: false` columns are hidden on phones so the table fits the screen
// without left-right scrolling; tap the row number (👁) to see everything.
// Every question the surveyor fills, as a column — the table slides
// horizontally to show the whole form without opening the detail view.
const COLUMNS = [
  { key: 'date', label: 'Date', width: 100, mobile: true },
  { key: 'start', label: 'Start', width: 120, mobile: false },
  { key: 'end', label: 'End', width: 120, mobile: false },
  { key: 'surveyor', label: 'Surveyor', width: 110, mobile: false },
  { key: 'village', label: 'Village', width: 90, mobile: true },
  { key: 'farm', label: 'Farm ID', width: 200, mobile: false },
  { key: 'meter', label: 'Pipe ID', width: 110, mobile: true },
  { key: 'reading', label: 'Level (mm)', width: 90, mobile: true },
  { key: 'validation', label: 'Outside (mm)', width: 100, mobile: false },
  { key: 'gps', label: 'GPS', width: 170, mobile: false },
];
const hideCls = (c) => (c.mobile ? '' : 'hidden md:table-cell');

const PAGE_SIZES = [30, 50, 100];

// Body cells are generated from COLUMNS — the same array that renders the
// header and search row — so the three can never drift out of alignment
// again. Formatting per key lives here.
function cellClass(c) {
  const base = 'px-2 md:px-3 py-2 ' + hideCls(c);
  switch (c.key) {
    case 'date': return base + ' whitespace-nowrap text-xs md:text-sm';
    case 'start':
    case 'end': return base + ' text-xs text-slate-600 whitespace-nowrap';
    case 'surveyor': return base + ' whitespace-nowrap';
    case 'village': return base + ' whitespace-nowrap text-xs md:text-sm';
    case 'farm':
    case 'meter': return base + ' font-mono text-xs whitespace-nowrap';
    case 'reading': return base + ' font-semibold tabular-nums text-xs md:text-sm';
    case 'gps': return base + ' font-mono text-xs text-slate-500 whitespace-nowrap';
    default: return base + ' text-xs whitespace-nowrap';
  }
}
function cellValue(c, r, std) {
  const v = r[c.key];
  const num = (x) => (x === '' || x == null ? NaN : Number(x));
  if (c.key === 'validation') {
    if (!v) return <span className="text-slate-300">–</span>;
    // Outside height: green chip when it matches the standard (± tolerance),
    // red when it doesn't — same rule as the red-flag engine.
    const sVal = num(std?.outsideStandardMm);
    const tol = Number.isFinite(num(std?.outsideToleranceMm)) ? num(std?.outsideToleranceMm) : 0;
    const bad = Number.isFinite(sVal) && Number.isFinite(num(v)) && Math.abs(num(v) - sVal) > tol;
    return <span className={`text-xs px-1.5 py-0.5 rounded ${bad ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{v}</span>;
  }
  if (c.key === 'reading') {
    if (v === undefined || v === null || v === '') return <span className="text-slate-300">–</span>;
    const min = Number.isFinite(num(std?.insideMinMm)) ? num(std?.insideMinMm) : 0;
    const max = num(std?.insideMaxMm);
    const bad = Number.isFinite(max) && Number.isFinite(num(v)) && (num(v) < min || num(v) > max);
    return bad ? <span className="text-rose-600">{v} ⚠</span> : v;
  }
  if (v === undefined || v === null || v === '' || v === 'Unknown') return <span className="text-slate-300">–</span>;
  return v;
}


export default function KoboTable({ rows = [], standards = null }) {
  const [search, setSearch] = useState({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [detail, setDetail] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      COLUMNS.every((c) => {
        const q = (search[c.key] || '').trim().toLowerCase();
        if (!q) return true;
        return String(r[c.key] ?? '').toLowerCase().includes(q);
      })
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function setCol(key, val) { setSearch((s) => ({ ...s, [key]: val })); setPage(0); }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm">
          <span className="font-semibold text-brand-700">{filtered.length.toLocaleString()}</span>
          <span className="text-slate-500"> results{filtered.length !== rows.length ? ` (of ${rows.length.toLocaleString()})` : ''}</span>
        </div>
        {Object.keys(search).some((k) => search[k]) && (
          <button onClick={() => { setSearch({}); setPage(0); }} className="text-xs text-brand-600 hover:underline">Clear all column searches</button>
        )}
      </div>

      <div className="overflow-auto scrollbar-thin max-h-[65vh] overscroll-contain">
        <table className="text-sm border-collapse w-full md:min-w-max">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              <th className="sticky left-0 bg-slate-50 px-2 py-2 text-left text-xs font-semibold text-slate-600 w-12">#</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`px-2 md:px-3 py-2 text-left text-xs font-semibold text-slate-600 align-top bg-slate-50 ${hideCls(c)}`} style={{ minWidth: c.width }}>
                  <div className="flex items-center gap-1 mb-1">{c.label}</div>
                  <input
                    value={search[c.key] || ''}
                    onChange={(e) => setCol(c.key, e.target.value)}
                    placeholder="Search"
                    className="w-full px-2 py-1 text-xs font-normal border border-slate-300 rounded bg-white"
                  />
                </th>
              ))}
              <th className="px-2 md:px-3 py-2 text-left text-xs font-semibold text-slate-600 bg-slate-50">📷</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 2} className="px-3 py-8 text-center text-slate-400">No matching submissions</td></tr>
            ) : pageRows.map((r, i) => (
              <tr key={r.id} className="hover:bg-brand-50/40">
                <td className="sticky left-0 bg-white px-2 py-2 text-slate-400 text-xs">
                  <button onClick={() => setDetail(r)} className="text-brand-600 hover:underline" title="View full submission">
                    {safePage * pageSize + i + 1} 👁
                  </button>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={cellClass(c)}>{cellValue(c, r, standards)}</td>
                ))}
                <td className="px-2 md:px-3 py-2 whitespace-nowrap">
                  {r.photo
                    ? <button onClick={() => setLightbox(r.photo)} className="text-brand-600 text-xs hover:underline">
                        📷 {r.photosCount > 1 ? `×${r.photosCount} ` : ''}view
                      </button>
                    : <span className="text-slate-300 text-xs">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination bar (Kobo style) */}
      <div className="px-3 py-2.5 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap text-sm">
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(0)} disabled={safePage === 0} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40 text-xs">« First</button>
          <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40 text-xs">‹ Prev</button>
          <span className="text-slate-600 text-xs px-1">Page {safePage + 1} of {pageCount}</span>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40 text-xs">Next ›</button>
          <button onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40 text-xs">Last »</button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Rows:
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="border border-slate-300 rounded px-1.5 py-1">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-[1200] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setDetail(null)}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-brand-700 to-field-700 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-semibold">{detail.village === 'Unknown' ? 'Submission' : detail.village}</div>
                <div className="text-xs text-white/80">#{detail.id}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-white/90 text-xl leading-none">×</button>
            </div>
            <div className="p-4 space-y-2 text-sm">
              {(detail.photos?.length ? detail.photos : (detail.photo ? [{ url: detail.photo, label: 'Photo' }] : [])).length > 0 && (
                <div className={`grid ${((detail.photos?.length || 1) > 1) ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mb-2`}>
                  {(detail.photos?.length ? detail.photos : [{ url: detail.photo, label: 'Photo' }]).map((p, i) => (
                    <figure key={i} className="m-0">
                      <button onClick={() => setLightbox(p.url)} className="block w-full">
                        <img src={p.url} alt={p.label} className="w-full h-36 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                      </button>
                      <figcaption className="text-[10px] text-slate-500 mt-0.5 text-center">{p.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {Array.isArray(detail.rows) && detail.rows.length > 0
                ? detail.rows.map(([k, v], i) => (
                    <Row key={i} k={k} v={v}
                      mono={/GPS|ID/i.test(k)}
                      bold={/Water level/i.test(k)} />
                  ))
                : (<>
                    <Row k="Surveyor" v={detail.surveyor} />
                    <Row k="Village" v={detail.village} />
                    <Row k="Pipe ID" v={detail.meter} mono />
                    <Row k="Reading" v={detail.reading} bold />
                  </>)}
              <Row k="Submitted" v={detail.submitted} />
              {detail.lat != null && detail.lng != null && (
                <div className="pt-1">
                  <MiniMap lat={detail.lat} lng={detail.lng} label={detail.meter || detail.village} />
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {detail.lat && (
                  <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${detail.lat},${detail.lng}`}
                    className="inline-block px-3 py-2 bg-field-600 text-white rounded-lg text-xs">🧭 Directions to this pipe</a>
                )}
                <a target="_blank" rel="noreferrer" href={`/api/kobo-open?id=${detail.id}`}
                  className="inline-block px-3 py-2 bg-brand-600 text-white rounded-lg text-xs">🔗 Open in KoboToolbox ↗</a>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Photo lightbox — stays in-app, with a clear Back button */}
      {lightbox && (
        <div className="fixed inset-0 z-[1300] bg-black/85 flex flex-col" onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Back
            </button>
            <a href={lightbox} target="_blank" rel="noreferrer" className="text-xs text-white/80 hover:text-white underline">Open original ↗</a>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="pipe photo" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
          <div className="text-center text-white/50 text-xs pb-3">Tap anywhere to go back</div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono, bold }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-slate-50">
      <span className="text-slate-500">{k}</span>
      <span className={`text-right ${mono ? 'font-mono text-xs' : ''} ${bold ? 'font-semibold' : ''}`}>{v || '–'}</span>
    </div>
  );
}
