'use client';

import { useEffect, useRef } from 'react';

// Tiny embedded Leaflet map with a single pin — used inside the Kobo View
// detail modal so every submission shows exactly where it was taken.
// Loads Leaflet from the same CDN the main /map page already uses.
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.id = 'leaflet-js'; s.src = LEAFLET_JS;
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function MiniMap({ lat, lng, label = '' }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (lat == null || lng == null) return;
    loadLeaflet().then((L) => {
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: true, attributionControl: false, scrollWheelZoom: false })
        .setView([lat, lng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      mapRef.current = map;
      // Modal opens with an animation — recalc size once it settles.
      setTimeout(() => map.invalidateSize(), 250);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng, label]);

  if (lat == null || lng == null) return null;
  return <div ref={ref} className="w-full h-44 rounded-lg border border-slate-200 overflow-hidden" />;
}
