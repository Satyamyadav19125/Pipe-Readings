'use client';

import { useEffect } from 'react';

// Light deterrents for the read-only guest viewer: disables the right-click
// context menu (Save-as / Copy) and text selection, and shows a small
// "read-only demo" marker. NOTE: a browser cannot truly block screenshots —
// this only discourages casual copying; the real protection is that guests
// can't download, edit, reach raw Kobo, or see more than a few readings.
export default function GuestGuard() {
  useEffect(() => {
    const noCtx = (e) => e.preventDefault();
    document.addEventListener('contextmenu', noCtx);
    document.body.classList.add('guest-noselect');
    return () => {
      document.removeEventListener('contextmenu', noCtx);
      document.body.classList.remove('guest-noselect');
    };
  }, []);

  return (
    <>
      <style>{`
        .guest-noselect, .guest-noselect * { -webkit-user-select: none; user-select: none; }
        .guest-noselect input, .guest-noselect textarea, .guest-noselect select { -webkit-user-select: text; user-select: text; }
        .guest-noselect img { -webkit-user-drag: none; }
      `}</style>
      <div className="fixed bottom-2 left-2 z-[900] pointer-events-none select-none text-[10px] font-medium text-slate-500 bg-white/70 dark:bg-black/50 px-2 py-0.5 rounded border border-slate-200/60">
        👁️ Read-only demo
      </div>
    </>
  );
}
