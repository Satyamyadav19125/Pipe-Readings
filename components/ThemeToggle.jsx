'use client';

import { useEffect, useState } from 'react';

// Light / dark switch (#10). The chosen theme is remembered on this device.
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('wmd-theme', next ? 'dark' : 'light'); } catch {}
  }

  return (
    <button onClick={toggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded hover:bg-white/15 text-base transition" aria-label="Toggle theme">
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
