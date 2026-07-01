'use client';

// Fullscreen image viewer with a clear Back button — used everywhere a photo
// can be tapped, so the user never gets "lost" outside the tool.
export default function Lightbox({ src, onClose, label = '' }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[1300] bg-black/85 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        {label && <span className="text-sm truncate px-2">{label}</span>}
        <a href={src} target="_blank" rel="noreferrer" className="text-xs text-white/80 hover:text-white underline">Open original ↗</a>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
        <img src={src} alt={label || 'photo'} className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
      </div>
      <div className="text-center text-white/50 text-xs pb-3">Tap anywhere to go back</div>
    </div>
  );
}
