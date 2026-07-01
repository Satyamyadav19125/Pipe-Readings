'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const FORMATS = [
  { key: 'csv', label: '📊 Excel / CSV' },
  { key: 'geojson', label: '🌐 GeoJSON' },
  { key: 'kml', label: '🌍 KML (Google Earth)' },
  { key: 'kmz', label: '🗜️ KMZ (zipped KML)' },
  { key: 'html', label: '🗺️ Standalone HTML map' },
];

export default function MapExportButton() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function url(format) {
    const params = new URLSearchParams(sp.toString());
    params.set('format', format);
    return `/api/export-map?${params.toString()}`;
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 shadow-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Export map
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-[500] w-56 max-w-[80vw]">
          {FORMATS.map((f) => (
            <a key={f.key} href={url(f.key)}
              className="block px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              onClick={() => setOpen(false)}>
              {f.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
