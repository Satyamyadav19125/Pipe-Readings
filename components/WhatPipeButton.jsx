'use client';
import { useState } from 'react';
import { buildPrefillUrl } from '@/lib/prefill';

// "What pipe am I on?" — reads the phone's GPS in the browser, asks the server
// for the nearest pipe within the geofence radius, and hands the surveyor a
// pre-filled reading link for that exact pipe. This is the GPS-identifies-the-
// farm flow: they walk onto the 2-acre plot, tap once, and the farm/village/
// pipe are resolved for them.
export default function WhatPipeButton() {
  const [state, setState] = useState('idle'); // idle | locating | done | error
  const [matches, setMatches] = useState([]);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');

  function findPipe() {
    setErr(''); setMatches([]); setState('locating');
    if (!('geolocation' in navigator)) {
      setErr('This phone/browser can’t share location.'); setState('error'); return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`/api/nearest-pipe?lat=${latitude}&lng=${longitude}`);
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Lookup failed');
          if (d.reason === 'no-locations') {
            setErr('No pipe locations are loaded yet. An admin can add them in Settings → Pipe locations.');
            setState('error'); return;
          }
          setMeta(d);
          setMatches(d.matches || []);
          setState('done');
        } catch (e) { setErr(e.message); setState('error'); }
      },
      (geoErr) => {
        setErr(geoErr.code === 1
          ? 'Location permission was denied. Allow location for this site and try again.'
          : 'Couldn’t get a GPS fix. Move to open sky and try again.');
        setState('error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium text-sm">📍 What pipe am I on?</div>
          <div className="text-[11px] text-slate-500">Use your location to find the pipe you’re standing at.</div>
        </div>
        <button onClick={findPipe} disabled={state === 'locating'}
          className="px-3 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50">
          {state === 'locating' ? 'Locating…' : '📍 Find my pipe'}
        </button>
      </div>

      {state === 'error' && <div className="mt-2 text-xs text-red-600">{err}</div>}

      {state === 'done' && matches.length === 0 && (
        <div className="mt-2 text-xs text-slate-600">
          No pipe found within {meta?.radius ?? 50} m of you. You may be between pipes, or this pipe’s location
          isn’t in the sheet yet. Move closer to the pipe and try again.
        </div>
      )}

      {state === 'done' && matches.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {matches.map((m) => {
            const link = meta?.formUploadUrl
              ? buildPrefillUrl(meta.formUploadUrl,
                  { village: m.village, farm: m.farm, pipe: m.serial, name: meta.userName },
                  { paths: meta.prefillPaths || undefined })
              : null;
            return (
              <li key={m.serial} className="flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="font-mono text-sm">{m.serial} <span className="text-[11px] text-slate-400">· {m.distance} m away</span></div>
                  {m.farm && <div className="text-[11px] text-slate-500 font-mono truncate">🌾 {m.farm}{m.village ? ` · ${m.village}` : ''}</div>}
                </div>
                {link && (
                  <a href={link} target="_blank" rel="noreferrer"
                    className="shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-field-600 text-white font-medium hover:bg-field-700 whitespace-nowrap">
                    ➕ Take reading
                  </a>
                )}
              </li>
            );
          })}
          <li className="text-[10px] text-slate-400 pt-0.5">Closest pipe is first. Not the right one? Pick another, or read it from the list below.</li>
        </ul>
      )}
    </div>
  );
}
