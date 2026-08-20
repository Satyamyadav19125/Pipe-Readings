'use client';

import { useEffect, useRef, useState } from 'react';
import { IRRIGATION_META } from '@/lib/irrigation';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_HEAT_JS = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
const CLUSTER_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
const CLUSTER_CSS2 = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const GLOBE_JS = 'https://unpkg.com/globe.gl';
const GLOBE_EARTH = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const GLOBE_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const GLOBE_SKY = 'https://unpkg.com/three-globe/example/img/night-sky.png';

const TILE_LAYERS = {
  street: { name: '🗺️ Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap', maxNativeZoom: 19 },
  satellite: { name: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri', maxNativeZoom: 19 },
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

// Coloured teardrop pin icons (the original look), served from a CDN and cached
// by the browser after the first load. Marker clustering keeps 1000+ of them
// fast because only visible clusters are drawn.
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

// Tile URL for the 3D globe, matching the flat map's layer choice, so the user
// can spin the Earth in Street / Satellite / Topo just like the 2D map.
function globeTileUrl(layer, x, y, l) {
  if (layer === 'satellite') return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`;
  if (layer === 'topo') return `https://a.tile.opentopomap.org/${l}/${x}/${y}.png`;
  return `https://a.tile.openstreetmap.org/${l}/${x}/${y}.png`;
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
  const globeRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const clusterRef = useRef(null);     // marker cluster group (pins)
  const heatRef = useRef(null);
  const heatTapRef = useRef([]);
  const myMarkerRef = useRef(null);
  const globeInstRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState('street');
  const [filterMode, setFilterMode] = useState('all');
  const [viewMode, setViewMode] = useState('pins');  // pins | heat | globe
  const [colorMode, setColorMode] = useState('flags');
  const [irrFilter, setIrrFilter] = useState('all');
  const [locating, setLocating] = useState(false);
  const [globeError, setGlobeError] = useState('');

  const flaggedCount = points.filter((p) => p.isFlagged).length;
  const cleanCount = points.length - flaggedCount;
  const dupCount = points.filter((p) => p.isDuplicate).length;
  const irrCount = (st) => points.filter((p) => p.isLatest && p.irrStatus === st).length;

  // ---- Create the Leaflet map ONCE (never destroyed on filter/points change,
  //      which is what left the map blank before). ----
  useEffect(() => {
    let cancelled = false;
    loadCss('leaflet-css', LEAFLET_CSS);
    loadCss('cluster-css', CLUSTER_CSS);
    loadCss('cluster-css2', CLUSTER_CSS2);
    (async () => {
      try {
        await loadScript('leaflet-js', LEAFLET_JS);
        await Promise.all([loadScript('leaflet-heat-js', LEAFLET_HEAT_JS), loadScript('leaflet-cluster-js', CLUSTER_JS)]);
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

  // ---- Rebuild markers whenever the data / colouring changes (map persists). ----
  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L || !ready) return;
    const icons = { red: pinIcon(L, 'red'), blue: pinIcon(L, 'blue'), orange: pinIcon(L, 'orange'), grey: pinIcon(L, 'grey') };
    // fresh cluster group
    if (clusterRef.current) { map.removeLayer(clusterRef.current); clusterRef.current = null; }
    const useCluster = typeof L.markerClusterGroup === 'function';
    const group = useCluster ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 45, spiderfyOnMaxZoom: true }) : L.layerGroup();
    const built = [];
    for (const p of points) {
      let pin = 'blue';
      if (colorMode === 'irrigation' && irrigation) pin = IRRIGATION_META[p.irrStatus || 'na'].pin || 'grey';
      else if (showFlagFilter && p.isFlagged) pin = 'red';
      const m = L.marker([p.lat, p.lng], { icon: icons[pin] || icons.blue });
      m.bindPopup(popupHtml(p, { showFlagFilter, colorMode, irrigation, allowKoboLink }));
      built.push({ marker: m, isFlagged: !!p.isFlagged, lat: p.lat, lng: p.lng, point: p });
    }
    clusterRef.current = group;
    // markersRef holds the records; applyView decides which to actually show
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
    // clear heat + taps + cluster
    if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }
    for (const t of heatTapRef.current) map.removeLayer(t);
    heatTapRef.current = [];
    if (clusterRef.current && map.hasLayer(clusterRef.current)) map.removeLayer(clusterRef.current);

    const shownItems = all.filter(matchesFilter);

    if (viewMode === 'pins') {
      const grp = clusterRef.current;
      if (grp) {
        grp.clearLayers?.();
        for (const it of shownItems) grp.addLayer ? grp.addLayer(it.marker) : it.marker.addTo(map);
        map.addLayer(grp);
      }
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
      // Cap the zoom so we never land deeper than the satellite/topo tiles go
      // (which is what showed "Map data not available" over rural fields).
      try { map.fitBounds(L.featureGroup(shownItems.map((i) => i.marker)).getBounds().pad(0.25), { maxZoom: 13 }); } catch {}
    }
  }

  useEffect(() => { if (viewMode !== 'globe') applyView(); /* eslint-disable-next-line */ }, [filterMode, viewMode, irrFilter, colorMode]);

  // ---- Globe (Google-Earth-style) mode ----
  useEffect(() => {
    if (viewMode !== 'globe') {
      if (globeInstRef.current) { try { globeInstRef.current._destructor?.(); } catch {} globeInstRef.current = null; if (globeRef.current) globeRef.current.innerHTML = ''; }
      return;
    }
    let cancelled = false;
    setGlobeError('');
    (async () => {
      try {
        await loadScript('globe-gl-js', GLOBE_JS);
        const Globe = window.Globe;
        if (cancelled || !globeRef.current || !Globe) { if (!Globe) setGlobeError('Could not load the 3D globe library.'); return; }
        globeRef.current.innerHTML = '';
        const shown = (mapRef.current?._pipeMarkers || []).filter(matchesFilter).map((i) => i.point);
        const g = Globe()(globeRef.current)
          .backgroundImageUrl(GLOBE_SKY)          // starfield
          .pointsData(shown)
          .pointLat((d) => d.lat).pointLng((d) => d.lng)
          .pointColor((d) => (showFlagFilter && d.isFlagged) ? '#ef4444' : '#38bdf8')
          .pointAltitude(0.008).pointRadius(0.28)
          .pointLabel((d) => `<div style="font:12px system-ui;color:#fff;background:rgba(0,0,0,.7);padding:4px 6px;border-radius:4px">${escapeHtml(d.village)} · ${escapeHtml(d.serial)}<br/>${escapeHtml(d.reading)} mm</div>`)
          .width(globeRef.current.clientWidth).height(globeRef.current.clientHeight);
        // Real map tiles on the globe if this build supports it; else a texture.
        if (typeof g.globeTileEngineUrl === 'function') {
          g.globeTileEngineUrl((x, y, l) => globeTileUrl(layer, x, y, l));
        } else {
          g.globeImageUrl(GLOBE_EARTH).bumpImageUrl(GLOBE_BUMP);
        }
        globeInstRef.current = g;
        // Fly to the data, then let the user zoom out to see the whole earth + stars.
        if (shown.length) {
          const lat = shown.reduce((a, b) => a + b.lat, 0) / shown.length;
          const lng = shown.reduce((a, b) => a + b.lng, 0) / shown.length;
          setTimeout(() => { try { g.pointOfView({ lat, lng, altitude: 1.6 }, 1200); } catch {} }, 200);
        }
        g.controls().autoRotate = false;
        const onResize = () => { try { g.width(globeRef.current.clientWidth).height(globeRef.current.clientHeight); } catch {} };
        window.addEventListener('resize', onResize);
        g._onResize = onResize;
      } catch (e) { if (!cancelled) setGlobeError('The 3D globe failed to load. Check your connection and try again.'); }
    })();
    return () => {
      cancelled = true;
      if (globeInstRef.current?._onResize) window.removeEventListener('resize', globeInstRef.current._onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, points, colorMode, filterMode, irrFilter]);

  useEffect(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    if (L && mapRef.current) {
      if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
      const conf = TILE_LAYERS[layer];
      tileLayerRef.current = L.tileLayer(conf.url, { maxZoom: 19, maxNativeZoom: conf.maxNativeZoom || 19, attribution: conf.attribution }).addTo(mapRef.current);
      attachStreetFallback(L, mapRef.current, tileLayerRef);
    }
    // Also swap the globe's tiles live when the layer changes.
    const g = globeInstRef.current;
    if (g && viewMode === 'globe' && typeof g.globeTileEngineUrl === 'function') {
      try { g.globeTileEngineUrl((x, y, l) => globeTileUrl(layer, x, y, l)); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const showGlobe = viewMode === 'globe';

  return (
    <div className="relative">
      {showFlagFilter && colorMode === 'flags' && !showGlobe && (
        <div className="absolute top-2 left-12 sm:left-14 z-[450] bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs" {...stopMapGestures}>
          <FilterBtn active={filterMode === 'all'} onClick={() => setFilterMode('all')}>All ({points.length})</FilterBtn>
          <FilterBtn active={filterMode === 'clean'} onClick={() => setFilterMode('clean')} color="text-sky-700">● Clean ({cleanCount})</FilterBtn>
          <FilterBtn active={filterMode === 'flagged'} onClick={() => setFilterMode('flagged')} color="text-red-700">🚩 ({flaggedCount})</FilterBtn>
          {dupCount > 0 && <FilterBtn active={filterMode === 'duplicates'} onClick={() => setFilterMode('duplicates')} color="text-indigo-700">👯 ({dupCount})</FilterBtn>}
        </div>
      )}

      <div className={`absolute ${showFlagFilter && !showGlobe ? 'top-12' : 'top-2'} left-12 sm:left-14 z-[450] flex gap-1 flex-wrap`} {...stopMapGestures}>
        <div className="bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs">
          <FilterBtn active={viewMode === 'pins'} onClick={() => setViewMode('pins')}>📍 Pins</FilterBtn>
          <FilterBtn active={viewMode === 'heat'} onClick={() => setViewMode('heat')} color="text-orange-700">🔥 Heat</FilterBtn>
          <FilterBtn active={viewMode === 'globe'} onClick={() => setViewMode('globe')} color="text-indigo-700">🌍 Globe</FilterBtn>
        </div>
        {irrigation && !showGlobe && (
          <div className="bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs">
            <FilterBtn active={colorMode === 'flags'} onClick={() => setColorMode('flags')}>🚩 Flags</FilterBtn>
            <FilterBtn active={colorMode === 'irrigation'} onClick={() => setColorMode('irrigation')} color="text-emerald-700">💧 Irrigation</FilterBtn>
          </div>
        )}
      </div>

      {irrigation && colorMode === 'irrigation' && !showGlobe && (
        <div className="absolute top-[5.5rem] left-12 sm:left-14 z-[450] bg-white rounded-lg shadow flex p-0.5 text-[11px] sm:text-xs flex-wrap" {...stopMapGestures}>
          <FilterBtn active={irrFilter === 'all'} onClick={() => setIrrFilter('all')}>All pipes</FilterBtn>
          <FilterBtn active={irrFilter === 'dry'} onClick={() => setIrrFilter('dry')} color="text-red-700">🔴 Irrigate ({irrCount('dry')})</FilterBtn>
          <FilterBtn active={irrFilter === 'low'} onClick={() => setIrrFilter('low')} color="text-amber-700">🟠 Low ({irrCount('low')})</FilterBtn>
          <FilterBtn active={irrFilter === 'wet'} onClick={() => setIrrFilter('wet')} color="text-blue-700">🔵 Wet ({irrCount('wet')})</FilterBtn>
        </div>
      )}

      {/* Layer picker — shown for both the flat map AND the globe. */}
      <div className="absolute top-2 right-2 z-[450] bg-white rounded-lg shadow flex flex-col p-1 gap-0.5" {...stopMapGestures}>
        {Object.entries(TILE_LAYERS).map(([k, v]) => (
          <button key={k} onClick={() => setLayer(k)}
            className={`text-[11px] sm:text-xs px-2 py-1 rounded text-left whitespace-nowrap ${layer === k ? 'bg-brand-100 text-brand-900 font-semibold' : 'hover:bg-slate-100'}`}>
            {v.name}
          </button>
        ))}
      </div>

      {!showGlobe && (
        <button onClick={goToMyLocation} title="Go to my location"
          className="absolute bottom-6 right-2 z-[450] w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-slate-50 active:scale-95 transition" onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          {locating ? <span className="animate-spin text-base">⏳</span> : '🎯'}
        </button>
      )}

      {/* Leaflet map (hidden while the globe is showing so both keep their size) */}
      <div ref={containerRef} style={{ height: '70vh', minHeight: 420, width: '100%', display: showGlobe ? 'none' : 'block' }} />

      {/* Globe */}
      {showGlobe && (
        <div className="relative" style={{ height: '70vh', minHeight: 420, width: '100%', background: '#000' }}>
          <div ref={globeRef} style={{ width: '100%', height: '100%' }} />
          {globeError
            ? <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80 p-6">{globeError}</div>
            : <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-white/70 bg-black/40 px-3 py-1 rounded-full pointer-events-none">🌍 Drag to spin · scroll/pinch to zoom out to the whole Earth</div>}
        </div>
      )}
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
