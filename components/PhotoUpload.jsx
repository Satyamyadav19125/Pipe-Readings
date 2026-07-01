'use client';

import { useEffect, useState, useRef } from 'react';
import Lightbox from '@/components/Lightbox';

// Resize an image file using admin-configured resolution. Photo type can be
// 'profile' (small, ~600 px default) or 'meter' (HD, ~1600 px default).
function resizeImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        // 'high' is the sharpest setting modern browsers offer
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoUpload({ value, onChange, label = 'Photo', kind = 'profile' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [view, setView] = useState(false);
  const [maxDim, setMaxDim] = useState(kind === 'profile' ? 600 : 1600);
  const [quality, setQuality] = useState(kind === 'profile' ? 0.88 : 0.85);
  const fileRef = useRef(null);

  // Pull admin-configured photo settings (one fetch per mount).
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      const r = d?.settings?.reading;
      if (!r) return;
      if (kind === 'profile') {
        setMaxDim(Number(r.profilePhotoMaxPx) || 600);
        setQuality(Number(r.profilePhotoQuality) || 0.88);
      } else {
        setMaxDim(Number(r.photoMaxPx) || 1600);
        setQuality(Number(r.photoQuality) || 0.85);
      }
    }).catch(() => {});
  }, [kind]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      const dataUrl = await resizeImage(file, maxDim, quality);
      const res = await fetch('/api/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onChange(data.url);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          <button type="button" onClick={() => setView(true)} title="Tap to view photo">
            <img src={value} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-brand-200 cursor-zoom-in" onError={(e) => { e.target.style.display = 'none'; }} />
          </button>
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-100 to-field-100 flex items-center justify-center text-xl">👤</div>
        )}
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:bg-slate-300">
            {busy ? 'Uploading…' : value ? 'Change photo' : '📷 Upload photo'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange('')} className="px-3 py-1.5 text-xs text-red-600 hover:underline text-left">Remove</button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      <p className="text-[10px] text-slate-400 mt-1">Tap the photo to view it full size. Resized to {maxDim} px to balance HD and database space.</p>
      {view && <Lightbox src={value} onClose={() => setView(false)} label={label} />}
    </div>
  );
}
