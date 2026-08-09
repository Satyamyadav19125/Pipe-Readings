'use client';

import { useEffect, useRef, useState } from 'react';

// Tiny embedded Leaflet map with a pin for the pipe/reading, and (optionally) a
// second marker for the viewer's own GPS position — so "how far am I?" shows
// WHERE you are standing, with a dashed line to the pipe, not just a number.
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

export default function MiniMap({ lat, lng, label = '', me = null, route = null }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const meLayerRef = useRef(null);
  const [ready, setReady] = useState(false);

  // ---- Create the map + the pipe/reading pin once. ----
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
      if (!cancelled) setReady(true);
      // Modal opens with an animation — recalc size once it settles.
      setTimeout(() => map.invalidateSize(), 250);
      setTimeout(() => map.invalidateSize(), 800);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      meLayerRef.current = null;
      setReady(false);
    };
  }, [lat, lng, label]);

  // ---- Add / update the "you are here" marker + the route line whenever the
  // user's position or the road route changes. If a road `route` (array of
  // [lat,lng] following the streets) is supplied, we draw that; otherwise a
  // dashed straight line as a fallback. ----
  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L || !ready) return;
    if (meLayerRef.current) { map.removeLayer(meLayerRef.current); meLayerRef.current = null; }
    if (!me || me.lat == null || me.lng == null) return;
    const group = L.layerGroup();
    L.circleMarker([me.lat, me.lng], { radius: 8, color: '#1d4ed8', weight: 3, fillColor: '#3b82f6', fillOpacity: 0.9 })
      .bindPopup('📍 You are here').addTo(group);
    const hasRoute = Array.isArray(route) && route.length >= 2;
    if (hasRoute) {
      L.polyline(route, { color: '#1d4ed8', weight: 4, opacity: 0.85 }).addTo(group); // follows the roads
    } else {
      L.polyline([[lat, lng], [me.lat, me.lng]], { color: '#1d4ed8', weight: 2, dashArray: '5 5', opacity: 0.8 }).addTo(group);
    }
    group.addTo(map);
    meLayerRef.current = group;
    const bounds = hasRoute ? L.latLngBounds(route) : L.latLngBounds([[lat, lng], [me.lat, me.lng]]);
    bounds.extend([lat, lng]); bounds.extend([me.lat, me.lng]);
    try { map.fitBounds(bounds.pad(0.2)); } catch {}
    setTimeout(() => map.invalidateSize(), 100);
  }, [me, route, ready, lat, lng]);

  if (lat == null || lng == null) return null;
  return <div ref={ref} className="w-full h-44 rounded-lg border border-slate-200 overflow-hidden" />;
}
