'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ExportButton({ extraParams = {} }) {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function url(format) {
    const params = new URLSearchParams(sp.toString());
    params.set('format', format);
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
    }
    return `/api/export?${params.toString()}`;
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Export
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-20 min-w-[160px]">
          <a href={url('csv')} className="block px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setOpen(false)}>
            📊 Excel / CSV
          </a>
          <a href={url('json')} className="block px-3 py-2 text-sm hover:bg-slate-50 border-t border-slate-100" onClick={() => setOpen(false)}>
            📄 JSON
          </a>
        </div>
      )}
    </div>
  );
}
