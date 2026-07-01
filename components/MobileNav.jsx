'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import RefreshButton from '@/components/RefreshButton';

// Links every logged-in user sees. Kobo View is admin-only and lives in the
// admin block below, so surveyors don't see it here.
const baseLinks = [
  { href: '/', label: 'Overview', icon: '🏠' },
  { href: '/submissions', label: 'Submissions', icon: '📋' },
  { href: '/usage', label: 'Water level', icon: '💧' },
  { href: '/map', label: 'Map', icon: '🗺️' },
  { href: '/team', label: 'Team', icon: '👥' },
  { href: '/chat', label: 'Chat', icon: '💬' },
];

export default function MobileNav({ user, formUploadUrl }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isAdmin = user?.role === 'admin';
  const loggedIn = !!user;
  const badge = user?.name || (isAdmin ? 'Admin' : '');

  const links = loggedIn
    ? (isAdmin
        ? [...baseLinks,
            { href: '/kobo-view', label: 'Kobo View', icon: '🪞' },
            { href: '/settings', label: 'Settings', icon: '⚙️' },
            { href: '/profile', label: 'My profile', icon: '👤' },
            { href: '/debug', label: 'Debug', icon: '🔧' }]
        : [...baseLinks, { href: '/profile', label: 'My profile', icon: '👤' }])
    : [];

  const desktopLinks = links.filter((l) => l.href !== '/profile');

  return (
    <>
      <header className="bg-gradient-to-r from-brand-900 via-brand-700 to-field-700 text-white sticky top-0 z-[1000] shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-semibold text-base flex-1 min-w-0">
            <span className="text-xl">💧🌾</span>
            <span className="truncate hidden sm:inline">PVC Pipe Readings</span>
            <span className="truncate sm:hidden">PipeReadings</span>
          </Link>

          {loggedIn && (
            <nav className="hidden xl:flex items-center gap-0.5 text-sm">
              {desktopLinks.map((l) => (
                <Link key={l.href} href={l.href} className={`px-2 py-1.5 rounded transition whitespace-nowrap ${pathname === l.href ? 'bg-white/20' : 'hover:bg-white/10'}`}>
                  {l.label}
                </Link>
              ))}
            </nav>
          )}

          {loggedIn && formUploadUrl && (
            <a href={formUploadUrl} target="_blank" rel="noreferrer" title="Open the Kobo form to submit a new reading" className="hidden sm:inline-flex items-center gap-1 bg-field-500 hover:bg-field-600 px-3 py-1.5 rounded text-sm font-medium shadow">
              ➕ <span className="hidden md:inline">New reading</span>
            </a>
          )}

          {loggedIn && <RefreshButton />}
          <ThemeToggle />

          {loggedIn ? (
            <>
              <Link href="/profile" title="Open my profile"
                className="px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 text-sm font-medium flex items-center gap-1.5 transition max-w-[120px]">
                {user?.photo
                  ? <img src={user.photo} alt="" className="w-5 h-5 rounded-full object-cover border border-white/50" />
                  : <span>👤</span>}
                <span className="hidden sm:inline truncate">{badge}</span>
              </Link>
              <button onClick={doLogout} title="Log out"
                className="p-2 rounded hover:bg-red-500/40 text-sm transition" aria-label="Log out">⏻</button>
            </>
          ) : (
            <Link href="/login" className="px-4 py-1.5 rounded bg-white text-brand-900 hover:bg-brand-50 text-sm font-semibold">
              Log in
            </Link>
          )}

          {loggedIn && (
            <button className="xl:hidden p-2 -mr-2 rounded hover:bg-white/10" onClick={() => setOpen(!open)} aria-label="Menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {open ? <path d="M6 18L18 6M6 6l12 12"/> : <path d="M3 6h18M3 12h18M3 18h18"/>}
              </svg>
            </button>
          )}
        </div>
      </header>

      {open && loggedIn && (
        <div className="xl:hidden fixed inset-0 z-[1100] bg-black/40" onClick={() => setOpen(false)}>
          <div className="absolute top-14 right-0 w-72 bg-white shadow-xl rounded-bl-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <Link href="/profile" onClick={() => setOpen(false)} className="px-4 py-3 bg-gradient-to-r from-brand-50 to-field-50 text-brand-900 text-sm border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                {user?.photo ? (
                  <img src={user.photo} alt="" className="w-8 h-8 rounded-full object-cover border border-white" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-brand-200 flex items-center justify-center text-base">
                    {isAdmin ? '👑' : '👤'}
                  </span>
                )}
                <div>
                  <div className="font-semibold leading-tight">{badge}</div>
                  <div className="text-[10px] text-slate-500">{isAdmin ? 'Administrator · tap for profile' : 'Surveyor · tap for profile'}</div>
                </div>
              </div>
              <span className="text-slate-400">›</span>
            </Link>

            {formUploadUrl && (
              <a href={formUploadUrl} target="_blank" rel="noreferrer" className="px-4 py-3 bg-field-50 text-field-900 font-medium border-b border-slate-100 flex items-center gap-3">
                <span className="text-lg">➕</span>
                <span>New reading (Kobo form)</span>
              </a>
            )}

            <nav className="flex flex-col">
              {links.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`px-4 py-3 border-b border-slate-100 flex items-center gap-3 ${pathname === l.href ? 'bg-brand-50 text-brand-900 font-medium' : ''}`}>
                  <span>{l.icon}</span>
                  <span>{l.label}</span>
                </Link>
              ))}
              <button onClick={doLogout} className="px-4 py-3 flex items-center gap-3 text-red-600 text-left">
                <span>⏻</span><span>Log out</span>
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

async function doLogout() {
  if (!confirm('Log out?')) return;
  await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logout' }),
  });
  window.location.href = '/';
}
