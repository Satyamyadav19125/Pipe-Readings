'use client';

import { useEffect, useRef, useState } from 'react';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_HEAT_JS = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';

const TILE_LAYERS = {
  street: { name: '🗺️ Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' },
  satellite: { name: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri' },
  topo: { name: '⛰️ Topo', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenTopoMap' },
};

function escapeHtml(s) {
  return String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MARKER_SHADOW = 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-shadow.png';
function pinIcon(L, color) {
  return L.icon({
    iconUrl: `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-${color}.png`,
    shadowUrl: MARKER_SHADOW,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

function loadScript(id, src) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = id; script.src = src; script.async = true;
    script.onload = () => { script.dataset.loaded = '1'; resolve(); };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

// showFlagFilter (default true): admins see the Clean/Flagged segmented
// control above the map and a "View submission" link in each popup.
// Surveyors don't — every pin is plain blue, the strip is hidden, and the
// admin-only "View submission" link is hidden too.

// If openstreetmap.org tiles fail repeatedly (blocked network, outage), swap
// the street layer to Carto Voyager so the map never stays blank.
function attachStreetFallback(L, map, tileLayerRef) {
  const t = tileLayerRef.current;
  if (!t || !t._url || !t._url.includes('openstreetmap.org')) return;
  let errors = 0;
  t.on('tileerror', () => {
    errors += 1;
    if (errors === 4 && map.hasLayer(t)) {
      map.removeLayer(t);
      tileLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap © CARTO',
      }).addTo(map);
    }
  });
}

export default function MapView({ points = [], showFlagFilter = true }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef([]);
  const heatRef = useRef(null);
  const myMarkerRef = useRef(null);
  const [layer, setLayer] = useState('street');
  const [filterMode, setFilterMode] = useState('all');
  const [viewMode, setViewMode] = useState('pins');
  const [locating, setLocating] = useState(false);

  const flaggedCount = points.filter((p) => p.isFlagged).length;
  const cleanCount = points.length - flaggedCount;

  useEffect(() => {
    let cancelled = false;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    (async () => {
      try {
        await loadScript('leaflet-js', LEAFLET_JS);
        await loadScript('leaflet-heat-js', LEAFLET_HEAT_JS);
        const L = window.L;
        if (cancelled || !containerRef.current || !L) return;
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        const map = L.map(containerRef.current, { zoomControl: true }).setView([30.9, 75.8], 9);
        mapRef.current = map;
        const conf = TILE_LAYERS[layer];
        tileLayerRef.current = L.tileLayer(conf.url, { maxZoom: 19, attribution: conf.attribution }).addTo(map);
        attachStreetFallback(L, map, tileLayerRef);
        // Container size can settle after fonts/layout — recalc so tiles
        // actually draw instead of leaving a blank map.
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 300);
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 1200);

        const redIcon = pinIcon(L, 'red');
        const blueIcon = pinIcon(L, 'blue');
        markersRef.current = [];

        for (const p of points) {
          // If flag UI is hidden (surveyor view), every pin is blue regardless.
          const icon = (showFlagFilter && p.isFlagged) ? redIcon : blueIcon;
          const m = L.marker([p.lat, p.lng], { icon });
          const dir = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
          const showRed = showFlagFilter && p.isFlagged;
          const flagHtml = (showRed && p.flagTypes?.length)
            ? `<div style="margin-top:6px;padding:6px 8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:11px;color:#991b1b;">🚩 ${escapeHtml(p.flagTypes.join(', '))}</div>`
            : '';
          // "View submission" link is admin-only — kobo-view itself is
          // already gated server-side, but no point showing surveyors a
          // link that takes them to an "Admin only" panel.
          const viewLink = showFlagFilter
            ? `<a target="_blank" href="/kobo-view?id=${encodeURIComponent(p.id)}" style="background:#0ea5e9;color:white;font-size:11px;padding:5px 10px;border-radius:5px;text-decoration:none;">View submission</a>`
            : '';
          const popup = `
            <div style="min-width: 210px; font-family: system-ui, sans-serif;">
              <div style="font-weight: 600; color: ${showRed ? '#991b1b' : '#0c4a6e'}; margin-bottom: 4px;">
                ${showRed ? '🚩' : '📍'} ${escapeHtml(p.village)}
              </div>
              <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${new Date(p.time).toLocaleString()}</div>
              <table style="width: 100%; font-size: 12px;">
                <tr><td style="color:#64748b;padding:1px 0;">Pipe</td><td style="font-family:monospace;">${escapeHtml(p.serial)}</td></tr>
                <tr><td style="color:#64748b;padding:1px 0;">Water level</td><td style="font-weight:600;">${escapeHtml(p.reading)} mm</td></tr>
                <tr><td style="color:#64748b;padding:1px 0;">Outside height</td><td>${escapeHtml(p.validation ?? '—')} mm</td></tr>
                <tr><td style="color:#64748b;padding:1px 0;">Form date</td><td>${escapeHtml(p.date ?? '—')}</td></tr>
                <tr><td style="color:#64748b;padding:1px 0;">Surveyor</td><td>${escapeHtml(p.surveyor)}</td></tr>
                <tr><td style="color:#64748b;padding:1px 0;">Photos</td><td>${escapeHtml(String(p.photoCount ?? 0))} 📷</td></tr>
                <tr><td style="color:#64748b;padding:1px 0;">GPS</td><td style="font-family:monospace;font-size:11px;">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</td></tr>
              </table>
              ${flagHtml}
              <div style="margin-top: 8px; display:flex; gap:6px; flex-wrap:wrap;">
                ${viewLink}
                <a target="_blank" href="${dir}" style="background:#16a34a;color:white;font-size:11px;padding:5px 10px;border-radius:5px;text-decoration:none;">🧭 Directions</a>
              </div>
            </div>`;
          m.bindPopup(popup);
          markersRef.current.push({ marker: m, isFlagged: !!p.isFlagged, lat: p.lat, lng: p.lng });
        }
        applyView(map);
      } catch (e) { console.error('Leaflet load failed', e); }
    })();

    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, showFlagFilter]);

  function matchesFilter(isFlagged) {
    if (!showFlagFilter) return true;
    return filterMode === 'all' || (filterMode === 'flagged' && isFlagged) || (filterMode === 'clean' && !isFlagged);
  }

  function applyView(map) {
    const m = map || mapRef.current;
    const L = window.L;
    if (!m || !L) return;
    if (heatRef.current) { m.removeLayer(heatRef.current); heatRef.current = null; }
    const shown = [];
    for (const item of markersRef.current) {
      const show = viewMode === 'pins' && matchesFilter(item.isFlagged);
      if (show) { item.marker.addTo(m); shown.push(item.marker); }
      else { m.removeLayer(item.marker); }
    }
    if (viewMode === 'heat' && typeof L.heatLayer === 'function') {
      const heatPts = markersRef.current
        .filter((i) => matchesFilter(i.isFlagged))
        .map((i) => [i.lat, i.lng, i.isFlagged ? 1.0 : 0.5]);
      if (heatPts.length) {
        heatRef.current = L.heatLayer(heatPts, { radius: 28, blur: 18, maxZoom: 17, minOpacity: 0.35 }).addTo(m);
      }
    }
    const boundsSrc = viewMode === 'pins'
      ? shown
      : markersRef.current.filter((i) => matchesFilter(i.isFlagged)).map((i) => i.marker);
    if (boundsSrc.length > 0) {
      try { m.fitBounds(L.featureGroup(boundsSrc).getBounds().pad(0.2)); } catch {}
    }
  }

  useEffect(() => { applyView(); /* eslint-disable-next-line */ }, [filterMode, viewMode]);

  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current) return;
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    const conf = TILE_LAYERS[layer];
    tileLayerRef.current = L.tileLayer(conf.url, { maxZoom: 19, attribution: conf.attribution }).addTo(mapRef.current);
    attachStreetFallback(L, mapRef.current, tileLayerRef);
  }, [layer]);

  function goToMyLocation() {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!navigator.geolocation) { alert('Location is not available on this device/browser.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        if (myMarkerRef.current) { map.removeLayer(myMarkerRef.current); }
        const dot = L.circleMarker([latitude, longitude], {
          radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1,
        }).addTo(map).bindPopup('📍 You are here');
        const circle = L.circle([latitude, longitude], { radius: Math.min(accuracy || 30, 200), color: '#2563eb', weight: 1, fillOpacity: 0.1 });
        circle.addTo(map);
        myMarkerRef.current = L.featureGroup([dot, circle]);
        map.setView([latitude, longitude], 16);
        dot.openPopup();
      },
      () => { setLocating(false); alert('Could not get your location. Allow location access and try again.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="relative">
      {showFlagFilter && (
        <div className="absolute top-2 left-12 sm:left-14 z-[450] bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs">
          <FilterBtn active={filterMode === 'all'} onClick={() => setFilterMode('all')}>All ({points.length})</FilterBtn>
          <FilterBtn active={filterMode === 'clean'} onClick={() => setFilterMode('clean')} color="text-sky-700">● Clean ({cleanCount})</FilterBtn>
          <FilterBtn active={filterMode === 'flagged'} onClick={() => setFilterMode('flagged')} color="text-red-700">🚩 ({flaggedCount})</FilterBtn>
        </div>
      )}

      <div className={`absolute ${showFlagFilter ? 'top-12' : 'top-2'} left-12 sm:left-14 z-[450] bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs`}>
        <FilterBtn active={viewMode === 'pins'} onClick={() => setViewMode('pins')}>📍 Pins</FilterBtn>
        <FilterBtn active={viewMode === 'heat'} onClick={() => setViewMode('heat')} color="text-orange-700">🔥 Heat map</FilterBtn>
      </div>

      <div className="absolute top-2 right-2 z-[450] bg-white rounded-lg shadow flex flex-col p-1 gap-0.5">
        {Object.entries(TILE_LAYERS).map(([k, v]) => (
          <button key={k} onClick={() => setLayer(k)}
            className={`text-[11px] sm:text-xs px-2 py-1 rounded text-left whitespace-nowrap ${layer === k ? 'bg-brand-100 text-brand-900 font-semibold' : 'hover:bg-slate-100'}`}>
            {v.name}
          </button>
        ))}
      </div>

      <button onClick={goToMyLocation} title="Go to my location"
        className="absolute bottom-6 right-2 z-[450] w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-slate-50 active:scale-95 transition">
        {locating ? <span className="animate-spin text-base">⏳</span> : '🎯'}
      </button>

      <div ref={containerRef} style={{ height: '70vh', minHeight: 420, width: '100%' }} />
    </div>
  );
}

function FilterBtn({ active, onClick, children, color = 'text-slate-700' }) {
  return (
    <button onClick={onClick}
      className={`px-2 py-1 rounded whitespace-nowrap ${active ? 'bg-brand-100 font-semibold ' + color : 'hover:bg-slate-100 ' + color}`}>
      {children}
    </button>
  );
}
