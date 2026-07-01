'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Sits in the top nav next to the theme toggle. Tapping it busts the
// 30-second Kobo cache and re-renders the current page with fresh data.
//
// Visual feedback states:
//   idle  → 🔄  (default)
//   busy  → 🔄 spinning
//   done  → ✓   (1.5s flash, then back to idle)
//   error → ⚠   (2s flash, then back to idle)
export default function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState('idle');

  async function handleClick() {
    if (state === 'busy') return;
    setState('busy');
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('refresh failed');
      // Refresh server components — the busted Kobo cache means the next
      // fetch inside fetchSubmissions() will go to Kobo fresh.
      router.refresh();
      // Brief delay so the user actually sees the spinner.
      setTimeout(() => {
        setState('done');
        setTimeout(() => setState('idle'), 1500);
      }, 500);
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
