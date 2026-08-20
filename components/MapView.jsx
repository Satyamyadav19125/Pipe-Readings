'use client';

import { useEffect, useRef, useState } from 'react';
import { IRRIGATION_META } from '@/lib/irrigation';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_HEAT_JS = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';

const TILE_LAYERS = {
  // maxNativeZoom caps the deepest tile actually fetched; Leaflet UPSCALES past
  // it instead of asking for tiles that don't exist (which showed "map data not
  // available"). Esri imagery over rural areas often stops around z17-18.
  street: { name: '🗺️ Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap', maxNativeZoom: 19 },
  satellite: { name: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri', maxNativeZoom: 17 },
  topo: { name: '⛰️ Topo', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenTopoMap', maxNativeZoom: 17 },
};

const stopMapGestures = {
  onClick: (e) => e.stopPropagation(),
  onDoubleClick: (e) => e.stopPropagation(),
  onMouseDown: (e) => e.stopPropagation(),
  onTouchStart: (e) => e.stopPropagation(),
  onWheel: (e) => e.stopPropagation(),
};

function escapeHtml(s) {
  return String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Coloured teardrop pin icons, served from a CDN and cached after the first load.
const MARKER_SHADOW = 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-shadow.png';
function pinIcon(L, color) {
  return L.icon({
    iconUrl: `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-${color}.png`,
    shadowUrl: MARKER_SHADOW,
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
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
function loadCss(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet'; link.href = href;
  document.head.appendChild(link);
}

function popupHtml(p, { showFlagFilter, colorMode, irrigation, allowKoboLink }) {
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const showRed = showFlagFilter && p.isFlagged;
  const flagHtml = (showRed && p.flagTypes?.length)
    ? `<div style="margin-top:6px;padding:6px 8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:11px;color:#991b1b;">🚩 ${escapeHtml(p.flagTypes.join(', '))}</div>`
    : '';
  const viewLink = allowKoboLink
    ? `<a target="_blank" href="/kobo-view?id=${encodeURIComponent(p.id)}" style="background:#0ea5e9;color:white;font-size:11px;padding:5px 10px;border-radius:5px;text-decoration:none;">View submission</a>`
    : '';
  return `
    <div style="min-width: 210px; font-family: system-ui, sans-serif;">
      <div style="font-weight: 600; color: ${showRed ? '#991b1b' : '#0c4a6e'}; margin-bottom: 4px;">
        ${showRed ? '🚩' : '📍'} ${escapeHtml(p.village)}
      </div>
      <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${new Date(p.time).toLocaleString()}</div>
      <table style="width: 100%; font-size: 12px;">
        <tr><td style="color:#64748b;padding:1px 0;">Pipe</td><td style="font-family:monospace;">${escapeHtml(p.serial)}</td></tr>
        <tr><td style="color:#64748b;padding:1px 0;">Water level</td><td style="font-weight:600;">${escapeHtml(p.reading)} mm</td></tr>
        ${(colorMode === 'irrigation' && irrigation && p.isLatest) ? `<tr><td style="color:#64748b;padding:1px 0;">Status</td><td style="font-weight:600;color:${IRRIGATION_META[p.irrStatus || 'na'].color};">${IRRIGATION_META[p.irrStatus || 'na'].emoji} ${IRRIGATION_META[p.irrStatus || 'na'].label}</td></tr>` : ''}
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
}

export default function MapView({ points = [], showFlagFilter = true, irrigation = null, allowKoboLink = true }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const layerGroupRef = useRef(null);   // holds every pin (no clustering)
  const heatRef = useRef(null);
  const heatTapRef = useRef([]);
  const myMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState('satellite');
  const [filterMode, setFilterMode] = useState('all');
  const [viewMode, setViewMode] = useState('pins');   // pins | heat
  const [colorMode, setColorMode] = useState('flags'); // flags | irrigation
  const [irrFilter, setIrrFilter] = useState('all');
  const [locating, setLocating] = useState(false);

  const flaggedCount = points.filter((p) => p.isFlagged).length;
  const cleanCount = points.length - flaggedCount;
  const dupCount = points.filter((p) => p.isDuplicate).length;
  const irrCount = (st) => points.filter((p) => p.isLatest && p.irrStatus === st).length;

  // ---- Create the map ONCE. ----
  useEffect(() => {
    let cancelled = false;
    loadCss('leaflet-css', LEAFLET_CSS);
    (async () => {
      try {
        await loadScript('leaflet-js', LEAFLET_JS);
        await loadScript('leaflet-heat-js', LEAFLET_HEAT_JS);
        const L = window.L;
        if (cancelled || !containerRef.current || !L || mapRef.current) return;
        const map = L.map(containerRef.current, { zoomControl: true }).setView([30.9, 75.8], 9);
        mapRef.current = map;
        const conf = TILE_LAYERS[layer];
        tileLayerRef.current = L.tileLayer(conf.url, { maxZoom: 19, maxNativeZoom: conf.maxNativeZoom || 19, attribution: conf.attribution }).addTo(map);
        attachStreetFallback(L, map, tileLayerRef);
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 900);
        if (!cancelled) setReady(true);
      } catch (e) { console.error('Leaflet load failed', e); }
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Rebuild markers whenever the data / colouring changes. ----
  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L || !ready) return;
    const icons = { red: pinIcon(L, 'red'), blue: pinIcon(L, 'blue'), orange: pinIcon(L, 'orange'), grey: pinIcon(L, 'grey') };
    const built = [];
    for (const p of points) {
      let pin = 'blue';
      if (colorMode === 'irrigation' && irrigation) pin = IRRIGATION_META[p.irrStatus || 'na'].pin || 'grey';
      else if (showFlagFilter && p.isFlagged) pin = 'red';
      const m = L.marker([p.lat, p.lng], { icon: icons[pin] || icons.blue });
      m.bindPopup(popupHtml(p, { showFlagFilter, colorMode, irrigation, allowKoboLink }));
      built.push({ marker: m, isFlagged: !!p.isFlagged, lat: p.lat, lng: p.lng, point: p });
    }
    map._pipeMarkers = built;
    applyView(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, colorMode, showFlagFilter, ready, irrigation, allowKoboLink]);

  function matchesFilter(item) {
    const p = item && item.point ? item.point : null;
    if (colorMode === 'irrigation' && irrigation) {
      if (irrFilter === 'all') return true;
      return p ? p.irrStatus === irrFilter : true;
    }
    if (filterMode === 'duplicates') return p ? !!p.isDuplicate : false;
    const isFlagged = p ? p.isFlagged : false;
    if (!showFlagFilter) return true;
    return filterMode === 'all' || (filterMode === 'flagged' && isFlagged) || (filterMode === 'clean' && !isFlagged);
  }

  function applyView(mapArg) {
    const map = mapArg || mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L) return;
    const all = map._pipeMarkers || [];
    // clear heat + taps + the pin layer
    if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }
    for (const t of heatTapRef.current) map.removeLayer(t);
    heatTapRef.current = [];
    if (layerGroupRef.current) { map.removeLayer(layerGroupRef.current); layerGroupRef.current = null; }

    const shownItems = all.filter(matchesFilter);

    if (viewMode === 'pins') {
      // Every pin, drawn directly (no clustering).
      const grp = L.layerGroup(shownItems.map((i) => i.marker));
      grp.addTo(map);
      layerGroupRef.current = grp;
    } else if (viewMode === 'heat' && typeof L.heatLayer === 'function') {
      const heatPts = shownItems.map((i) => [i.lat, i.lng, i.isFlagged ? 1.0 : 0.5]);
      if (heatPts.length) heatRef.current = L.heatLayer(heatPts, { radius: 28, blur: 18, maxZoom: 17, minOpacity: 0.35 }).addTo(map);
      for (const it of shownItems) {
        const tap = L.circleMarker([it.lat, it.lng], { radius: 13, stroke: false, fillColor: '#f97316', fillOpacity: 0.06, interactive: true, bubblingMouseEvents: false });
        const content = it.marker.getPopup()?.getContent?.();
        if (content) tap.bindPopup(content);
        tap.addTo(map); heatTapRef.current.push(tap);
      }
    }

    if (shownItems.length > 0) {
      try { map.fitBounds(L.featureGroup(shownItems.map((i) => i.marker)).getBounds().pad(0.25), { maxZoom: 13 }); } catch {}
    }
  }

  useEffect(() => { applyView(); /* eslint-disable-next-line */ }, [filterMode, viewMode, irrFilter, colorMode]);

  useEffect(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!L || !mapRef.current) return;
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    const conf = TILE_LAYERS[layer];
    tileLayerRef.current = L.tileLayer(conf.url, { maxZoom: 19, maxNativeZoom: conf.maxNativeZoom || 19, attribution: conf.attribution }).addTo(mapRef.current);
    attachStreetFallback(L, mapRef.current, tileLayerRef);
  }, [layer]);

  function goToMyLocation() {
    const L = window.L; const map = mapRef.current;
    if (!L || !map) return;
    if (!navigator.geolocation) { alert('Location is not available on this device/browser.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        if (myMarkerRef.current) map.removeLayer(myMarkerRef.current);
        const dot = L.circleMarker([latitude, longitude], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map).bindPopup('📍 You are here');
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

  // Clicking an irrigation status auto-switches to irrigation colouring.
  function pickIrr(st) { setColorMode('irrigation'); setIrrFilter(st); }

  return (
    <div className="relative">
      {showFlagFilter && colorMode === 'flags' && (
        <div className="absolute top-2 left-12 sm:left-14 z-[450] bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs" {...stopMapGestures}>
          <FilterBtn active={filterMode === 'all'} onClick={() => setFilterMode('all')}>All ({points.length})</FilterBtn>
          <FilterBtn active={filterMode === 'clean'} onClick={() => setFilterMode('clean')} color="text-sky-700">● Clean ({cleanCount})</FilterBtn>
          <FilterBtn active={filterMode === 'flagged'} onClick={() => setFilterMode('flagged')} color="text-red-700">🚩 ({flaggedCount})</FilterBtn>
          {dupCount > 0 && <FilterBtn active={filterMode === 'duplicates'} onClick={() => setFilterMode('duplicates')} color="text-indigo-700">👯 ({dupCount})</FilterBtn>}
        </div>
      )}

      <div className={`absolute ${showFlagFilter ? 'top-12' : 'top-2'} left-12 sm:left-14 z-[450] flex gap-1 flex-wrap`} {...stopMapGestures}>
        <div className="bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs">
          <FilterBtn active={viewMode === 'pins'} onClick={() => setViewMode('pins')}>📍 Pins</FilterBtn>
          <FilterBtn active={viewMode === 'heat'} onClick={() => setViewMode('heat')} color="text-orange-700">🔥 Heat</FilterBtn>
        </div>
        {irrigation && (
          <div className="bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs">
            <FilterBtn active={colorMode === 'flags'} onClick={() => setColorMode('flags')}>🚩 Flags</FilterBtn>
            <FilterBtn active={colorMode === 'irrigation'} onClick={() => setColorMode('irrigation')} color="text-emerald-700">💧 Irrigation</FilterBtn>
          </div>
        )}
      </div>

      {/* Irrigation status filters — ALWAYS visible when irrigation is on. */}
      {irrigation && (
        <div className={`absolute ${showFlagFilter ? 'top-[5.5rem]' : 'top-12'} left-12 sm:left-14 z-[450] bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs flex-wrap`} {...stopMapGestures}>
          <FilterBtn active={colorMode === 'irrigation' && irrFilter === 'all'} onClick={() => pickIrr('all')} color="text-emerald-700">💧 All pipes</FilterBtn>
          <FilterBtn active={colorMode === 'irrigation' && irrFilter === 'dry'} onClick={() => pickIrr('dry')} color="text-red-700">🔴 Irrigate ({irrCount('dry')})</FilterBtn>
          <FilterBtn active={colorMode === 'irrigation' && irrFilter === 'low'} onClick={() => pickIrr('low')} color="text-amber-700">🟠 Low ({irrCount('low')})</FilterBtn>
          <FilterBtn active={colorMode === 'irrigation' && irrFilter === 'wet'} onClick={() => pickIrr('wet')} color="text-blue-700">🔵 Wet ({irrCount('wet')})</FilterBtn>
        </div>
      )}

      <div className="absolute top-2 right-2 z-[450] bg-white rounded-lg shadow flex flex-col p-1 gap-0.5" {...stopMapGestures}>
        {Object.entries(TILE_LAYERS).map(([k, v]) => (
          <button key={k} onClick={() => setLayer(k)}
            className={`text-[11px] sm:text-xs px-2 py-1 rounded text-left whitespace-nowrap ${layer === k ? 'bg-brand-100 text-brand-900 font-semibold' : 'hover:bg-slate-100'}`}>
            {v.name}
          </button>
        ))}
      </div>

      <button onClick={goToMyLocation} title="Go to my location"
        className="absolute bottom-6 right-2 z-[450] w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-slate-50 active:scale-95 transition" onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        {locating ? <span className="animate-spin text-base">⏳</span> : '🎯'}
      </button>

      <div ref={containerRef} style={{ height: '70vh', minHeight: 420, width: '100%' }} />
    </div>
  );
}

function attachStreetFallback(L, map, tileLayerRef) {
  const t = tileLayerRef.current;
  if (!t || !t._url || !t._url.includes('openstreetmap.org')) return;
  let errors = 0;
  t.on('tileerror', () => {
    errors += 1;
    if (errors === 4 && map.hasLayer(t)) {
      map.removeLayer(t);
      tileLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap © CARTO' }).addTo(map);
    }
  });
}

function FilterBtn({ active, onClick, children, color = 'text-slate-700' }) {
  return (
    <button onClick={onClick}
      className={`px-2 py-1 rounded whitespace-nowrap ${active ? 'bg-brand-100 font-semibold ' + color : 'hover:bg-slate-100 ' + color}`}>
      {children}
    </button>
  );
}
