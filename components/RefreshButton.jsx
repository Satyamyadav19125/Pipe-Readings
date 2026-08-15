'use client';

import { useState } from 'react';

// Sits in the top nav next to the theme toggle. Tapping it busts the
// Kobo cache and hard-reloads the current page with fresh data.
//
// Visual feedback states:
//   idle  → 🔄  (default)
//   busy  → 🔄 spinning
//   done  → ✓   (1.5s flash, then back to idle)
//   error → ⚠   (2s flash, then back to idle)
export default function RefreshButton() {
  const [state, setState] = useState('idle');

  async function handleClick() {
    if (state === 'busy') return;
    setState('busy');
    try {
      const res = await fetch('/api/refresh', { method: 'POST', cache: 'no-store' });
      if (!res.ok) throw new Error('refresh failed');
      // The soft router.refresh() sometimes swapped in only part of the tree,
      // so refresh felt like it "didn't work". A hard reload AFTER the cache is
      // busted guarantees every page re-fetches fresh Kobo data.
      window.location.reload();
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  }

  const title =
    state === 'busy' ? 'Refreshing data from Kobo…' :
    state === 'done' ? 'Data refreshed ✓' :
    state === 'error' ? 'Refresh failed — tap to try again' :
    'Refresh data from Kobo';

  return (
    <button
      onClick={handleClick}
      disabled={state === 'busy'}
      title={title}
      aria-label={title}
      className="p-2 rounded hover:bg-white/15 text-base transition disabled:opacity-70"
    >
      {state === 'busy' ? (
        <span className="inline-block animate-spin">🔄</span>
      ) : state === 'done' ? (
        <span className="text-green-300">✓</span>
      ) : state === 'error' ? (
        <span className="text-amber-200">⚠</span>
      ) : (
        <span>🔄</span>
      )}
    </button>
  );
}
