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
      const map = L.map(ref.current, { zoomControl: true, attributionControl: false, scrollWheelZoom: true })
        .setView([lat, lng], 16);
      // Same three base maps as the main Map tab. If OSM street tiles fail
      // (blocked network, outage), we swap to Carto automatically.
      const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
      const streetAlt = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
      const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 });
      let streetErrors = 0;
      street.on('tileerror', () => {
        streetErrors += 1;
        if (streetErrors === 4 && map.hasLayer(street)) { map.removeLayer(street); streetAlt.addTo(map); }
      });
      street.addTo(map);
      L.control.layers({ '🗺️ Street': street, '🛰️ Satellite': satellite, '⛰️ Topo': topo }, {}, { position: 'topright' }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      mapRef.current = map;
      // Modal opens with an animation — recalc size once it settles.
      setTimeout(() => map.invalidateSize(), 250);
      setTimeout(() => map.invalidateSize(), 800);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng, label]);

  if (lat == null || lng == null) return null;
  return <div ref={ref} className="w-full h-44 rounded-lg border border-slate-200 overflow-hidden" />;
}
