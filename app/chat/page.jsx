'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 200) }; }
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date(); const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function resizeImage(file, maxDim = 1600, quality = 0.85) {
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const MAX_FILE_BYTES = 1500 * 1024; // ~1.5 MB ceiling on the free MongoDB tier

const EMOJI_CATS = [
  { icon: '😀', label: 'Smileys', ranges: [[0x1F600, 0x1F64F], [0x1F910, 0x1F92F], [0x1F970, 0x1F97A]] },
  { icon: '🙏', label: 'Hands', ranges: [[0x1F44A, 0x1F450], [0x1F590, 0x1F596], [0x1F918, 0x1F91F], [0x270A, 0x270D], [0x1F932, 0x1F932]] },
  { icon: '❤️', label: 'Hearts', ranges: [[0x1F493, 0x1F49F], [0x2764, 0x2764], [0x1F5A4, 0x1F5A4], [0x1F90D, 0x1F90F], [0x1F498, 0x1F49C]] },
  { icon: '🐻', label: 'Animals', ranges: [[0x1F400, 0x1F43F], [0x1F980, 0x1F997]] },
  { icon: '🍔', label: 'Food', ranges: [[0x1F345, 0x1F37F], [0x1F950, 0x1F96B]] },
  { icon: '⚽', label: 'Sport', ranges: [[0x1F3A0, 0x1F3C9], [0x1F94A, 0x1F94F], [0x26BD, 0x26BE]] },
  { icon: '🚗', label: 'Travel', ranges: [[0x1F680, 0x1F6A4], [0x1F6B0, 0x1F6C5], [0x2600, 0x2604], [0x26C4, 0x26C5], [0x2614, 0x2614]] },
  { icon: '💡', label: 'Objects', ranges: [[0x1F4A0, 0x1F4FC], [0x1F511, 0x1F53D], [0x2705, 0x2705], [0x274C, 0x274C], [0x2757, 0x2757], [0x26A0, 0x26A1]] },
];
function emojisFor(cat) {
  const out = [];
  for (const [a, b] of cat.ranges) {
    for (let c = a; c <= b; c++) {
      const s = String.fromCodePoint(c);
      out.push(c < 0x1F000 ? s + '\uFE0F' : s);
    }
  }
  return out;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function ChatPage() {
  const [user, setUser] = useState(undefined);
  const [channels, setChannels] = useState([]);
  const [unread, setUnread] = useState({}); // channel -> count
  const [notifState, setNotifState] = useState('unsupported');
  const [active, setActive] = useState('group');
  const [messages, setMessages] = useState([]);
  const [me, setMe] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showPlus, setShowPlus] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [docView, setDocView] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [liveShare, setLiveShare] = useState(null);
  const [photoMaxPx, setPhotoMaxPx] = useState(1600);
  const [photoQuality, setPhotoQuality] = useState(0.85);
  const scrollRef = useRef(null);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const audioRef = useRef(null);
  const docRef = useRef(null);
  const recRef = useRef(null);
  const liveTimerRef = useRef(null);

  const emojiList = useMemo(() => emojisFor(EMOJI_CATS[emojiCat]), [emojiCat]);

  useEffect(() => {
    (async () => {
      const [a, asg, st] = await Promise.all([
        fetch('/api/auth/check').then((r) => r.json()).catch(() => ({})),
        fetch('/api/assignments').then((r) => r.json()).catch(() => ({})),
        fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
      ]);
      const r = st?.settings?.reading;
      if (r) {
        setPhotoMaxPx(Number(r.photoMaxPx) || 1600);
        setPhotoQuality(Number(r.photoQuality) || 0.85);
      }
      const u = a && a.user ? a.user : null;
      setUser(u);
      if (!u) return;
      const list = [{ id: 'group', label: 'Everyone', icon: '👥' }];
      if (u.role === 'admin') {
        const people = Array.isArray(asg?.assignments) ? asg.assignments : [];
        for (const p of people) if (p.person) list.push({ id: `dm:${p.person}`, label: p.person, icon: '👤' });
      } else {
        list.push({ id: `dm:${u.name}`, label: 'Admins (private)', icon: '🛡️' });
      }
      setChannels(list);
    })();
    return () => { if (liveTimerRef.current) clearInterval(liveTimerRef.current); };
  }, []);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setNotifState(Notification.permission);
  }, []);
  function enableNotifications() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then((p) => setNotifState(p));
  }

  const refreshUnread = useCallback(async () => {
    try {
      const r = await fetch('/api/chat/unread');
      if (!r.ok) return;
      const d = await r.json();
      setUnread(d.counts || {});
    } catch {}
  }, []);

  const markRead = useCallback((channel) => {
    fetch('/api/chat/unread', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    }).catch(() => {});
    setUnread((u) => { const n = { ...u }; delete n[channel]; return n; });
  }, []);

  const load = useCallback(async (channel) => {
    try {
      const res = await fetch(`/api/chat?channel=${encodeURIComponent(channel)}`);
      const d = await parseJsonSafe(res);
      if (!res.ok) { setError(d.error || 'Could not load chat'); return; }
      setError('');
      setMe(d.me || '');
      setMessages(Array.isArray(d.messages) ? d.messages : []);
    } catch { setError('Could not load chat'); }
  }, []);

  useEffect(() => {
    if (!user) return;
    load(active);
    markRead(active);
    refreshUnread();
    const t = setInterval(() => { load(active); markRead(active); }, 4000);
    const tu = setInterval(refreshUnread, 10000);
    return () => { clearInterval(t); clearInterval(tu); };
  }, [user, active, load]);

  const msgCount = messages.length;
  useEffect(() => { scrollToBottom(); }, [msgCount, active]);

  function closePanels() { setShowPlus(false); setShowEmoji(false); setSelectedId(null); }

  async function postMessage(payload) {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: active, ...payload }),
    });
    const d = await parseJsonSafe(res);
    if (!res.ok) { setError(d.error || 'Could not send'); return null; }
    await load(active);
    return d.message || null;
  }

  async function send() {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true); setError(''); closePanels();
    if (editing) {
      const res = await fetch('/api/chat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, action: 'edit', text: clean }),
      });
      const d = await parseJsonSafe(res);
      if (!res.ok) setError(d.error || 'Could not edit');
      setEditing(null); setText('');
      await load(active);
    } else {
      setText('');
      await postMessage({ text: clean });
    }
    setSending(false);
  }

  async function uploadDataUrl(dataUrl) {
    const res = await fetch('/api/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Upload failed');
    return d.url;
  }

  async function sendImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setSending(true); closePanels();
    try {
      const dataUrl = await resizeImage(file, photoMaxPx, photoQuality);
      const url = await uploadDataUrl(dataUrl);
      await postMessage({ kind: 'image', mediaUrl: url, text: text.trim() });
      setText('');
    } catch (e2) { setError(e2.message); }
    finally { setSending(false); e.target.value = ''; }
  }

  async function sendRawFile(e, kind) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); closePanels();
    if (file.size > MAX_FILE_BYTES) {
      setError(`File is too big (${Math.round(file.size / 1024)} KB). Maximum is ${Math.round(MAX_FILE_BYTES / 1024)} KB on our free database — for bigger files please use WhatsApp/email.`);
      e.target.value = '';
      return;
    }
    setSending(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const url = await uploadDataUrl(dataUrl);
      await postMessage({ kind, mediaUrl: url, fileName: file.name });
    } catch (e2) { setError(e2.message); }
    finally { setSending(false); e.target.value = ''; }
  }

  // --- Camera (laptop/desktop): live getUserMedia preview + snap. Phones
  // keep the native camera via the file input if getUserMedia fails. ---
  const [camOpen, setCamOpen] = useState(false);
  const videoRef = useRef(null);
  const camStreamRef = useRef(null);

  async function openCamera() {
    setError(''); closePanels();
    if (!window.isSecureContext) { setError('Camera needs HTTPS.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { cameraRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1600 } }, audio: false,
      });
      camStreamRef.current = stream;
      setCamOpen(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 50);
    } catch (e2) {
      if (e2?.name === 'NotAllowedError') setError('Camera permission was blocked. Allow it in the browser address bar and try again.');
      cameraRef.current?.click();
    }
  }
  function closeCamera() {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    setCamOpen(false);
  }
  async function snapPhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    closeCamera();
    setSending(true);
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
      if (!blob) throw new Error('Could not capture the photo.');
      const dataUrl = await fileToDataUrl(blob);
      const url = await uploadDataUrl(dataUrl);
      await postMessage({ kind: 'image', mediaUrl: url, fileName: `camera-${Date.now()}.jpg` });
    } catch (e2) { setError(e2.message); }
    finally { setSending(false); }
  }

  async function startRecording() {
    setError(''); closePanels();
    if (!navigator.mediaDevices?.getUserMedia) { setError('Microphone is not available in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (typeof MediaRecorder === 'undefined') { setError('Voice notes are not supported in this browser.'); return; }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
      const chunks = [];
      rec.onerror = (ev) => setError('Recording failed: ' + (ev.error && ev.error.message ? ev.error.message : 'unknown error'));
      rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (rec._cancelled) return;
        // rec.mimeType can be 'audio/webm;codecs=opus' — strip the codecs
        // part so the upload data-URL is a plain, accepted audio type.
        const blob = new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] });
        if (blob.size > MAX_FILE_BYTES) { setError('Voice note too long — keep it under ~1 minute.'); return; }
        setSending(true);
        try {
          const dataUrl = await fileToDataUrl(blob);
          const url = await uploadDataUrl(dataUrl);
          await postMessage({ kind: 'audio', mediaUrl: url, fileName: 'voice-note' });
        } catch (e2) { setError(e2.message); }
        finally { setSending(false); }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true); setRecSecs(0);
      const t0 = Date.now();
      const tick = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setRecSecs(s);
        if (s >= 60) { clearInterval(tick); if (recRef.current?.state === 'recording') recRef.current.stop(); }
        if (recRef.current?.state !== 'recording') clearInterval(tick);
      }, 500);
    } catch (e2) { setError(e2 && e2.name === 'NotAllowedError' ? 'Microphone permission was blocked. Allow it in the browser address bar and try again.' : 'Could not access the microphone. Allow mic permission and try again.'); }
  }
  function stopRecording(cancel = false) {
    const rec = recRef.current;
    if (rec && rec.state === 'recording') { rec._cancelled = cancel; rec.stop(); }
    setRecording(false);
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new Error('Could not get your location. Allow location access and try again.')),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function sendCurrentLocation() {
    setError(''); closePanels(); setSending(true);
    try {
      const { lat, lng } = await getPosition();
      await postMessage({ text: `📍 My location: https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}` });
    } catch (e2) { setError(e2.message); }
    finally { setSending(false); }
  }

  async function startLiveLocation() {
    setError(''); closePanels(); setSending(true);
    try {
      const { lat, lng } = await getPosition();
      const msg = await postMessage({ kind: 'live', live: { lat, lng } });
      if (msg?.id) {
        setLiveShare({ id: msg.id });
        const started = Date.now();
        liveTimerRef.current = setInterval(async () => {
          if (Date.now() - started > EDIT_WINDOW_MS) { stopLiveLocation(msg.id); return; }
          try {
            const p = await getPosition();
            await fetch('/api/chat', {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: msg.id, action: 'live_update', lat: p.lat, lng: p.lng }),
            });
          } catch {}
        }, 30000);
      }
    } catch (e2) { setError(e2.message); }
    finally { setSending(false); }
  }
  async function stopLiveLocation(id) {
    if (liveTimerRef.current) { clearInterval(liveTimerRef.current); liveTimerRef.current = null; }
    setLiveShare(null);
    await fetch('/api/chat', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'live_end' }),
    }).catch(() => {});
    load(active);
  }

  async function react(id, emoji) {
    setSelectedId(null);
    await fetch('/api/chat', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'react', emoji }),
    }).catch(() => {});
    load(active);
  }

  function beginEdit(m) {
    setSelectedId(null);
    setEditing({ id: m.id });
    setText(m.text || '');
  }

  async function doDelete(id, mode) {
    setSelectedId(null);
    const label = mode === 'everyone' ? 'Delete this message for EVERYONE?' : 'Delete this message for you only?';
    if (!confirm(label)) return;
    const res = await fetch('/api/chat', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, mode }),
    });
    const d = await parseJsonSafe(res);
    if (!res.ok) setError(d.error || 'Could not delete');
    load(active);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function renderText(t) {
    const parts = String(t).split(/(https?:\/\/[^\s]+)/g);
    return parts.map((p, i) =>
      /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" className="underline break-all">{p}</a>
        : <span key={i}>{p}</span>
    );
  }

  if (user === undefined) return <div className="h-64 bg-white rounded-xl shadow-sm animate-pulse" />;
  if (!user) return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
      <a href="/login" className="underline font-medium">Log in</a> to use chat.
    </div>
  );

  const activeLabel = channels.find((c) => c.id === active)?.label || 'Chat';
  const activeIcon = channels.find((c) => c.id === active)?.icon || '💬';

  const groups = [];
  let lastDay = null;
  for (const m of messages) {
    const dl = dayLabel(m.ts);
    if (dl !== lastDay) { groups.push({ day: dl, items: [] }); lastDay = dl; }
    groups[groups.length - 1].items.push(m);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {notifState === 'default' && (
          <button onClick={enableNotifications} className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
            🔔 Enable notifications
          </button>
        )}
        {channels.map((c) => (
          <button key={c.id} onClick={() => { setActive(c.id); closePanels(); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition flex items-center gap-1.5 ${
              active === c.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
            }`}>
            <span>{c.icon}</span>{c.label}
            {unread[c.id] > 0 && active !== c.id && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                {unread[c.id] > 99 ? '99+' : unread[c.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 rounded p-2 text-sm text-amber-900">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ height: 'calc(100dvh - 168px)', minHeight: 300 }}>
        <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-brand-700 to-field-700 text-white flex items-center gap-2 shrink-0">
          <span className="text-lg">{activeIcon}</span>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{activeLabel}</div>
            <div className="text-[10px] text-white/70">{active === 'group' ? 'Everyone can read this' : 'You + all admins'}</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 chat-bg">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-slate-400 text-sm">
              No messages yet. Say hello 👋
            </div>
          ) : groups.map((g, gi) => (
            <div key={gi} className="space-y-2">
              <div className="flex justify-center">
                <span className="text-[11px] bg-white/80 text-slate-500 px-2 py-0.5 rounded-full shadow-sm">{g.day}</span>
              </div>
              {g.items.map((m) => {
                const mine = m.senderId === me;
                const canModify = mine && !m.deleted && (Date.now() - new Date(m.ts).getTime() <= EDIT_WINDOW_MS);
                const reactions = m.reactions || {};
                const liveActive = m.kind === 'live' && m.live && !m.live.ended && Date.now() < new Date(m.live.until).getTime();
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <button onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}
                      className={`max-w-[80%] text-left rounded-2xl px-3 py-2 shadow-sm ${mine ? 'bg-field-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm'}`}>
                      {!mine && (
                        <div className={`text-[11px] font-semibold mb-0.5 ${m.senderRole === 'admin' ? 'text-brand-700' : 'text-field-700'}`}>
                          {m.senderName}{m.senderRole === 'admin' ? ' · admin' : ''}
                        </div>
                      )}

                      {m.deleted ? (
                        <div className={`text-sm italic ${mine ? 'text-white/70' : 'text-slate-400'}`}>🚫 This message was deleted</div>
                      ) : (
                        <>
                          {m.kind === 'image' && m.mediaUrl && (
                            <span onClick={(e) => { e.stopPropagation(); setLightbox(m.mediaUrl); }} className="block mb-1 cursor-zoom-in">
                              <img src={m.mediaUrl} alt="" className="rounded-lg max-h-56 w-auto" loading="lazy" />
                            </span>
                          )}
                          {m.kind === 'audio' && m.mediaUrl && (
                            <audio controls src={m.mediaUrl} className="w-52 sm:w-64 my-1" onClick={(e) => e.stopPropagation()} />
                          )}
                          {m.kind === 'file' && m.mediaUrl && (
                            <span onClick={(e) => { e.stopPropagation(); setDocView({ url: `${m.mediaUrl}?name=${encodeURIComponent(m.fileName || 'file')}`, name: m.fileName || 'Document' }); }}
                              className={`flex items-center gap-2 my-1 px-3 py-2 rounded-lg cursor-pointer ${mine ? 'bg-white/15' : 'bg-slate-100'}`}>
                              <span className="text-2xl">📄</span>
                              <span className="text-sm font-medium break-all">{m.fileName || 'Document'}</span>
                            </span>
                          )}
                          {m.kind === 'live' && m.live && (
                            <span className="block my-1">
                              <a href={`https://www.google.com/maps?q=${m.live.lat},${m.live.lng}`} target="_blank" rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${mine ? 'bg-white/15' : 'bg-slate-100'}`}>
                                <span className="text-2xl">{liveActive ? '📡' : '📍'}</span>
                                <span className="text-sm">
                                  <b>{liveActive ? 'Live location' : 'Live location (ended)'}</b><br />
                                  <span className={`text-xs ${mine ? 'text-white/70' : 'text-slate-500'}`}>
                                    {liveActive ? `Updating until ${timeLabel(m.live.until)} · tap to open map` : 'Tap to see last position'}
                                  </span>
                                </span>
                              </a>
                              {liveActive && mine && liveShare?.id === m.id && (
                                <span onClick={(e) => { e.stopPropagation(); stopLiveLocation(m.id); }}
                                  className="inline-block mt-1 text-xs underline cursor-pointer">⏹ Stop sharing</span>
                              )}
                            </span>
                          )}
                          {m.text && <div className="text-sm whitespace-pre-wrap break-words">{renderText(m.text)}</div>}
                        </>
                      )}

                      <div className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                        {m.editedAt ? 'edited · ' : ''}{timeLabel(m.ts)}
                      </div>
                    </button>

                    {Object.keys(reactions).length > 0 && (
                      <div className={`flex gap-1 mt-0.5 ${mine ? 'justify-end' : ''}`}>
                        {Object.entries(reactions).map(([e, who]) => (
                          <button key={e} onClick={() => react(m.id, e)}
                            className={`text-xs px-1.5 py-0.5 rounded-full border shadow-sm ${who.includes(me) ? 'bg-brand-100 border-brand-300' : 'bg-white border-slate-200'}`}>
                            {e} {who.length}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedId === m.id && !m.deleted && (
                      <div className="mt-1 bg-white rounded-xl shadow-lg border border-slate-200 p-2 flex flex-col gap-1.5 z-10">
                        <div className="flex gap-1">
                          {QUICK_REACTIONS.map((e) => (
                            <button key={e} onClick={() => react(m.id, e)} className="text-xl px-1 hover:scale-125 transition">{e}</button>
                          ))}
                        </div>
                        <div className="flex gap-1.5 flex-wrap text-xs">
                          {canModify && m.kind === 'text' && (
                            <button onClick={() => beginEdit(m)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">✏️ Edit</button>
                          )}
                          {canModify && (
                            <button onClick={() => doDelete(m.id, 'everyone')} className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">🗑 Delete for everyone</button>
                          )}
                          <button onClick={() => doDelete(m.id, 'me')} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">🙈 Delete for me</button>
                        </div>
                        {mine && !canModify && (
                          <div className="text-[10px] text-slate-400">Edit & delete-for-everyone work for 15 minutes after sending.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {showEmoji && (
          <div className="border-t border-slate-100 bg-white shrink-0">
            <div className="flex gap-1 px-2 pt-1.5 overflow-x-auto">
              {EMOJI_CATS.map((c, i) => (
                <button key={c.label} onClick={() => setEmojiCat(i)}
                  className={`px-2 py-1 rounded-lg text-lg ${emojiCat === i ? 'bg-brand-100' : 'hover:bg-slate-100'}`} title={c.label}>{c.icon}</button>
              ))}
            </div>
            <div className="h-36 overflow-y-auto px-2 py-1.5 grid grid-cols-8 sm:grid-cols-12 gap-0.5">
              {emojiList.map((e, i) => (
                <button key={i} onClick={() => setText((t) => t + e)} className="text-xl py-0.5 hover:bg-slate-100 rounded">{e}</button>
              ))}
            </div>
          </div>
        )}

        {showPlus && (
          <div className="border-t border-slate-100 px-3 py-2 flex gap-2 flex-wrap bg-white shrink-0">
            <button onClick={() => galleryRef.current?.click()} className="attach-btn">🖼️<span>Gallery</span></button>
            <button onClick={openCamera} className="attach-btn">📸<span>Camera</span></button>
            <button onClick={startRecording} className="attach-btn">🎤<span>Voice</span></button>
            <button onClick={() => audioRef.current?.click()} className="attach-btn">🎵<span>Audio</span></button>
            <button onClick={() => docRef.current?.click()} className="attach-btn">📄<span>Document</span></button>
            <button onClick={sendCurrentLocation} className="attach-btn">📍<span>Location</span></button>
            <button onClick={startLiveLocation} className="attach-btn">📡<span>Live (15m)</span></button>
          </div>
        )}

        {recording && (
          <div className="border-t border-red-100 bg-red-50 px-3 py-2 flex items-center gap-3 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-800 flex-1">Recording voice note… {recSecs}s / 60s</span>
            <button onClick={() => stopRecording(true)} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-300 text-red-700">Cancel</button>
            <button onClick={() => stopRecording(false)} className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-medium">⏹ Send</button>
          </div>
        )}

        {editing && (
          <div className="border-t border-amber-100 bg-amber-50 px-3 py-1.5 flex items-center gap-2 text-xs text-amber-900 shrink-0">
            ✏️ Editing message…
            <button onClick={() => { setEditing(null); setText(''); }} className="ml-auto underline">Cancel</button>
          </div>
        )}

        <div className="border-t border-slate-100 p-2 flex items-end gap-1.5 bg-white shrink-0">
          <button onClick={() => { setShowPlus(!showPlus); setShowEmoji(false); }} title="Attach"
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xl transition ${showPlus ? 'bg-brand-100 text-brand-700 rotate-45' : 'text-slate-500 hover:bg-slate-100'}`}>+</button>
          <button onClick={() => { setShowEmoji(!showEmoji); setShowPlus(false); }} title="Emoji"
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg ${showEmoji ? 'bg-brand-100' : 'hover:bg-slate-100'}`}>😀</button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={editing ? 'Edit your message…' : 'Type a message…'}
            className="flex-1 resize-none px-3 py-2 text-sm border border-slate-300 rounded-2xl max-h-32 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <button onClick={send} disabled={sending || !text.trim()}
            className="shrink-0 w-10 h-10 rounded-full bg-field-600 text-white flex items-center justify-center hover:bg-field-700 disabled:bg-slate-300">
            {editing
              ? <span className="text-base">✓</span>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>}
          </button>
          <input ref={galleryRef} type="file" accept="image/*" onChange={sendImage} className="hidden" />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={sendImage} className="hidden" />
          <input ref={audioRef} type="file" accept="audio/*" onChange={(e) => sendRawFile(e, 'audio')} className="hidden" />
          <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => sendRawFile(e, 'file')} className="hidden" />
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[1300] bg-black/85 flex flex-col" onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium">← Back</button>
            <a href={lightbox} target="_blank" rel="noreferrer" className="text-xs text-white/80 underline">Open original ↗</a>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}

      {docView && (
        <div className="fixed inset-0 z-[1300] bg-black/85 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <button onClick={() => setDocView(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium">← Back</button>
            <span className="text-sm truncate px-2">{docView.name}</span>
            <a href={`${docView.url}&dl=1`} className="text-xs text-white/80 underline whitespace-nowrap">⬇ Download</a>
          </div>
          <iframe src={docView.url} title={docView.name} className="flex-1 bg-white rounded-t-xl" />
        </div>
      )}

      {camOpen && (
        <div className="fixed inset-0 z-[1400] bg-black/90 flex flex-col items-center justify-center p-4">
          <video ref={videoRef} playsInline muted className="max-w-full max-h-[70vh] rounded-xl bg-black" />
          <div className="flex gap-3 mt-4">
            <button onClick={snapPhoto} className="px-5 py-2.5 bg-white text-slate-900 rounded-full font-semibold text-sm">📸 Snap & send</button>
            <button onClick={closeCamera} className="px-5 py-2.5 bg-white/20 text-white rounded-full text-sm">Cancel</button>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.attach-btn) {
          display: flex; align-items: center; gap: 0.375rem;
          font-size: 0.8rem; padding: 0.5rem 0.875rem; border-radius: 9999px;
          border: 1px solid #cbd5e1; background: white;
        }
        :global(.attach-btn:hover) { background: #f8fafc; }
        :global(.dark .attach-btn) { background: #1e293b; border-color: #334155; color: #e2e8f0; }
        :global(.dark .attach-btn:hover) { background: #2b3a55; }
      `}</style>
    </div>
  );
}
