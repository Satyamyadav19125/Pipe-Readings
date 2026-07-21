'use client';

import { useEffect, useState, useRef } from 'react';
import DataStorage from '@/components/DataStorage';

const FLAG_LABELS = {
  // ON by default for pipes
  missing_photo: 'Missing photo on a submission',
  stale_no_reading: 'Stale — no reading for 7+ days',
  stale_unchanged: 'Stuck — 3 identical water-level readings in a row',
  future_date: 'Future-dated reading',
  out_of_sequence: 'Reading date earlier than the previous one',
  inside_out_of_range: 'Inside reading outside the valid range (see Pipe parameters)',
  outside_out_of_range: 'Outside height differs from the standard (see Pipe parameters)',
  missing_times: 'Start or end time missing on a submission',
  // Advanced — usually OFF for AWD pipes, because water levels naturally rise
  // and fall. Turn on only if your protocol expects levels to only increase.
  rollback: 'Water level dropped vs the previous reading',
  huge_jump: 'Water level jumped by a huge amount (likely extra digit)',
  growth_anomaly: 'Water level rose far faster than usual for this pipe',
  reverse: 'End reading lower than start reading (within one submission)',
  // Opt-in extras (off by default)
  duplicate_same_day: 'Duplicate — same pipe read twice in one day',
  gps_outlier: "GPS far from this pipe's usual spot",
  identical_gps: 'Same GPS used by different pipes',
  digit_count: 'Digit-count jump in the reading (likely typo)',
  fabrication_speed: 'Readings logged impossibly fast (<15s apart)',
  night_reading: 'Reading taken at night (10pm–5am)',
};

// All sections, in the order shown on the page. Order matters: this is the
// new order — Kobo forms first (the critical season switch), then project
// info, then the rest, with Data & storage at the very bottom.
const SECTIONS = [
  { id: 'forms',    icon: '📋', label: 'Kobo forms',      hint: 'Switch seasons' },
  { id: 'project',  icon: '🌱', label: 'Project info',    hint: 'Name & description' },
  { id: 'reading',  icon: '🎯', label: 'Reading targets', hint: 'Count & period' },
  { id: 'pipe',     icon: '📏', label: 'Pipe parameters', hint: 'Valid mm ranges' },
  { id: 'geofence', icon: '📍', label: 'Pipe locations', hint: 'Geofence & Sheet' },
  { id: 'registry', icon: '🎚️', label: 'Farms & pipes',  hint: 'Turn on/off' },
  { id: 'security', icon: '🔐', label: 'Admin passwords', hint: 'Change admin login' },
  { id: 'photo',    icon: '🖼️', label: 'Photo quality',  hint: 'HD vs space' },
  { id: 'contact',  icon: '📬', label: 'Contact info',    hint: 'Emails & phone' },
  { id: 'flags',    icon: '🚩', label: 'Red flag rules',  hint: 'What to detect' },
  { id: 'storage',  icon: '🗄️', label: 'Data & storage', hint: 'DB usage' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [flagSearch, setFlagSearch] = useState('');
  const [activeForm, setActiveForm] = useState(null);
  const [adminInfo, setAdminInfo] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const dirtyRef = useRef(false);

  useEffect(() => { load(); }, []);

  // Warn before closing the tab if there are unsaved changes
  useEffect(() => {
    function beforeUnload(e) {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  function setS(updater) {
    setDirty(true);
    dirtyRef.current = true;
    setSettings((prev) => typeof updater === 'function' ? updater(prev) : updater);
  }

  async function load() {
    setLoading(true);
    let data = {};
    try {
      const res = await fetch('/api/settings');
      data = await res.json();
      if (!res.ok) throw new Error(data.error || `Settings failed to load (HTTP ${res.status})`);
    } catch (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    if (data.settings) {
      // Defensive: legacy DB documents may be missing newer sub-objects.
      // Fill them with safe defaults so the page never crashes on access.
      setSettings({
        contact: {}, redFlags: {}, project: {}, forms: [],
        pipe: { insideMinMm: 50, insideMaxMm: 250, outsideStandardMm: 150, outsideToleranceMm: 0, irrigateAtOrBelowMm: 50 },
        security: { adminPasswords: [] },
        reading: {
          target: 2, periodLabel: 'week', periodDays: 7,
          photoMaxPx: 1600, photoQuality: 0.85,
          profilePhotoMaxPx: 600, profilePhotoQuality: 0.88,
        },
        ...data.settings,
        contact: { ...(data.settings.contact || {}) },
        redFlags: { ...(data.settings.redFlags || {}) },
        project: { ...(data.settings.project || {}) },
        forms: Array.isArray(data.settings.forms) ? data.settings.forms : [],
        pipe: {
          insideMinMm: 50, insideMaxMm: 250, outsideStandardMm: 150, outsideToleranceMm: 0, irrigateAtOrBelowMm: 50,
          ...(data.settings.pipe || {}),
        },
        security: {
          adminPasswords: (data.settings.security?.adminPasswords?.length
            ? data.settings.security.adminPasswords
            : (data.adminInfo?.passwords || [])),
        },
        reading: {
          target: 2, periodLabel: 'week', periodDays: 7,
          photoMaxPx: 1600, photoQuality: 0.85,
          profilePhotoMaxPx: 600, profilePhotoQuality: 0.88,
          ...(data.settings.reading || {}),
        },
      });
      setActiveForm(data.activeForm || null);
      setAdminInfo(data.adminInfo || null);
      setDirty(false);
      dirtyRef.current = false;
    } else {
      setError(data.error || 'Failed to load');
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setError(null); setMessage(null);
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Save failed'); return; }
    setMessage('Saved ✓');
    setLastSavedAt(new Date());
    setDirty(false);
    dirtyRef.current = false;
    setTimeout(() => setMessage(null), 2500);
  }

  function updateContact(k, v) { setS({ ...settings, contact: { ...settings.contact, [k]: v } }); }
  function updateFlag(k, v) { setS({ ...settings, redFlags: { ...settings.redFlags, [k]: v } }); }
  function updatePipe(k, v) { setS({ ...settings, pipe: { ...(settings.pipe || {}), [k]: v } }); }
  function updateGeofence(k, v) { setS({ ...settings, pipe: { ...(settings.pipe || {}), geofence: { ...((settings.pipe || {}).geofence || {}), [k]: v } } }); }
  function updateSecurity(list) { setS({ ...settings, security: { ...(settings.security || {}), adminPasswords: list } }); }
  function updateProject(k, v) { setS({ ...settings, project: { ...settings.project, [k]: v } }); }

  function addForm() {
    const list = [...(settings.forms || [])];
    list.push({
      name: `Form ${list.length + 1}`,
      baseUrl: 'https://kf.kobotoolbox.org',
      assetUid: '',
      token: '',
      isActive: list.length === 0,
    });
    setS({ ...settings, forms: list });
  }

  function updateForm(i, k, v) {
    const list = [...settings.forms];
    list[i] = { ...list[i], [k]: v };
    if (k === 'isActive' && v) list.forEach((f, idx) => { if (idx !== i) f.isActive = false; });
    setS({ ...settings, forms: list });
  }

  function deleteForm(i) {
    if (!confirm(`Delete form "${settings.forms[i].name}"?`)) return;
    const list = settings.forms.filter((_, idx) => idx !== i);
    setS({ ...settings, forms: list });
  }

  function jumpTo(id) {
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!settings) return <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{error || 'Not authorized — admin only'}</div>;

  const filteredFlagKeys = Object.entries(FLAG_LABELS).filter(([k, label]) => {
    const q = flagSearch.trim().toLowerCase();
    if (!q) return true;
    return k.includes(q) || label.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Sticky title + save bar — always visible while scrolling */}
      <div className="sticky top-[60px] z-40 -mx-3 sm:mx-0 bg-slate-100/95 backdrop-blur px-3 sm:px-0 py-2 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">⚙️ Settings</h1>
            {lastSavedAt && !dirty && (
              <p className="text-[11px] text-slate-500">Last saved {lastSavedAt.toLocaleTimeString()}</p>
            )}
            {dirty && (
              <p className="text-[11px] text-amber-700 font-medium">● You have unsaved changes</p>
            )}
          </div>
          <button onClick={save} disabled={saving || !dirty}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              !dirty ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'}`}>
            {saving ? 'Saving…' : dirty ? '💾 Save changes' : 'Saved'}
          </button>
        </div>
        {message && <div className="mt-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-1.5 text-xs">{message}</div>}
        {error && <div className="mt-1.5 bg-red-50 border border-red-200 text-red-800 rounded p-1.5 text-xs">{error}</div>}
      </div>

      {/* Jump-to nav — tap any section to scroll there instantly */}
      <div className="bg-white rounded-xl shadow-sm p-2 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => jumpTo(s.id)}
            className="text-xs px-2.5 py-1.5 rounded-full border border-slate-200 hover:border-brand-400 hover:bg-brand-50 transition text-slate-700 inline-flex items-center gap-1"
            title={s.hint}>
            <span>{s.icon}</span><span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Kobo forms — moved to top: the most important admin action */}
      <Section id="forms" title="📋 Kobo forms" subtitle="Switch between seasonal forms (Kharif, Rabi, etc). Mark exactly one as active.">
        <div className="space-y-3">
          {activeForm && (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-2.5 text-xs space-y-0.5">
              <div className="font-semibold text-brand-900">🔗 Currently active form</div>
              <div className="text-slate-600">Name: <b>{activeForm.name}</b></div>
              <div className="text-slate-600">Server: <span className="font-mono">{activeForm.baseUrl}</span></div>
              <div className="text-slate-600">Unique ID (asset UID): <span className="font-mono select-all bg-white/70 px-1 rounded border border-brand-100">{activeForm.assetUid || '—'}</span></div>
            </div>
          )}
          {(settings.forms || []).length === 0 && (
            <p className="text-xs text-slate-500 italic">No forms saved yet — using env vars as default. Add a form below to override.</p>
          )}
          {(settings.forms || []).map((form, i) => (
            <div key={i} className={`border rounded-lg p-3 space-y-2 ${form.isActive ? 'border-field-400 bg-field-50/50' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <input value={form.name || ''} onChange={(e) => updateForm(i, 'name', e.target.value)} placeholder="Form name (e.g. Kharif 2026)" className="input flex-1 font-medium"/>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={!!form.isActive} onChange={(e) => updateForm(i, 'isActive', e.target.checked)}/>
                  Active
                </label>
                <button onClick={() => deleteForm(i)} className="text-red-600 text-sm">🗑️</button>
              </div>
              <input value={form.baseUrl || ''} onChange={(e) => updateForm(i, 'baseUrl', e.target.value)} placeholder="Base URL (e.g. https://kf.kobotoolbox.org)" className="input"/>
              <input value={form.assetUid || ''} onChange={(e) => updateForm(i, 'assetUid', e.target.value)} placeholder="Asset UID" className="input font-mono text-xs"/>
              <input value={form.token || ''} onChange={(e) => updateForm(i, 'token', e.target.value)} placeholder="API token (keep secret)" type="password" className="input font-mono text-xs"/>
            </div>
          ))}
          <button onClick={addForm} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-brand-500">
            + Add new Kobo form
          </button>
        </div>
      </Section>

      {/* Project info */}
      <Section id="project" title="🌱 Project info">
        <Field label="Project name">
          <input value={settings.project.name || ''} onChange={(e) => updateProject('name', e.target.value)} className="input"/>
        </Field>
        <Field label="Tagline">
          <input value={settings.project.tagline || ''} onChange={(e) => updateProject('tagline', e.target.value)} className="input"/>
        </Field>
        <Field label="Description (shown on landing)">
          <textarea value={settings.project.description || ''} onChange={(e) => updateProject('description', e.target.value)} rows="3" className="input"/>
        </Field>
        <Field label="Kobo form upload URL (the 'New reading' button)">
          <input value={settings.project.formUploadUrl || ''} onChange={(e) => updateProject('formUploadUrl', e.target.value)} placeholder="https://ee.kobotoolbox.org/x/..." className="input"/>
        </Field>
      </Section>

      {/* Reading targets */}
      <Section id="reading" title="🎯 Reading targets" subtitle="How many readings each pipe needs, and how often">
        <ReadingTargets settings={settings} setSettings={setS} />
      </Section>

      {/* Pipe parameters — standards for the two measurement questions */}
      <Section id="pipe" title="📏 Pipe parameters"
        subtitle="Standards for the two measurement questions on the Kobo form, in millimetres. Answers outside these standards get red-flagged.">
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">💧 "Measure water level inside the PVC pipe — millimeter mm"</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid from (mm)">
              <input type="number" min="0" value={settings.pipe?.insideMinMm ?? ''} placeholder="50"
                onChange={(e) => updatePipe('insideMinMm', e.target.value === '' ? '' : Number(e.target.value))} className="input"/>
            </Field>
            <Field label="Valid to (mm)">
              <input type="number" min="0" value={settings.pipe?.insideMaxMm ?? ''} placeholder="250"
                onChange={(e) => updatePipe('insideMaxMm', e.target.value === '' ? '' : Number(e.target.value))} className="input"/>
            </Field>
          </div>
          <p className="text-[11px] text-slate-500">Example: 50–250 means a water level of 40 or 260 raises <i>Inside reading outside the valid range</i>.</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">📐 "Measure the pipe from the outside, from ground level to top of the pipe — millimeter mm"</div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Standard value (mm)">
              <input type="number" min="0" value={settings.pipe?.outsideStandardMm ?? ''} placeholder="150"
                onChange={(e) => updatePipe('outsideStandardMm', e.target.value === '' ? '' : Number(e.target.value))} className="input"/>
            </Field>
            <Field label="Tolerance ± (mm)">
              <input type="number" min="0" value={settings.pipe?.outsideToleranceMm ?? ''} placeholder="0"
                onChange={(e) => updatePipe('outsideToleranceMm', e.target.value === '' ? '' : Number(e.target.value))} className="input"/>
            </Field>
          </div>
          <p className="text-[11px] text-slate-500">Example: standard 150 with tolerance 0 means 140 or 160 raises <i>Outside height differs from the standard</i>. Set tolerance 10 to accept 140–160.</p>
        </div>
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">💧 AWD irrigation trigger</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Irrigate at or below (mm)">
              <input type="number" min="0" value={settings.pipe?.irrigateAtOrBelowMm ?? ''} placeholder="50"
                onChange={(e) => updatePipe('irrigateAtOrBelowMm', e.target.value === '' ? '' : Number(e.target.value))} className="input"/>
            </Field>
          </div>
          <p className="text-[11px] text-slate-500">A pipe whose <b>latest</b> inside water level is at or below this is marked <b style={{color:'#dc2626'}}>🔴 Irrigate now</b> on the Map (Irrigation mode) and Overview. Just above it shows <b style={{color:'#f59e0b'}}>🟠 Getting low</b>; higher is <b style={{color:'#2563eb'}}>🔵 Wet</b>. Clear the box to hide the irrigation view.</p>
        </div>
        <p className="text-[11px] text-slate-500">Clear any box to disable that check without touching the red-flag toggles.</p>
      </Section>

      {/* Pipe locations — geofence radius + Google Sheet of reference points */}
      <Section id="geofence" title="📍 Pipe locations & geofence"
        subtitle="Set a fixed reference location per pipe. A submission whose GPS is farther than the radius gets the 'outside set location' red flag.">
        <GeofencePanel settings={settings} setSettings={setS} />
      </Section>

      {/* Farms & pipes on/off registry */}
      <Section id="registry" title="🎚️ Turn farms & pipes on/off"
        subtitle="Disabled farms and pipes disappear from the surveyor's view, are never counted as missed, and never raise red flags.">
        <RegistryPanel />
      </Section>

      {/* Admin passwords — change admin login without touching Vercel */}
      <Section id="security" title="🔐 Admin passwords"
        subtitle="Passwords that log someone in as an ADMIN. Surveyor passwords are managed per person in Assignment → Team.">
        {adminInfo && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-2.5 text-xs mb-2">
            <b>{adminInfo.count} admin{adminInfo.count === 1 ? '' : 's'}</b> configured
            {adminInfo.source === 'env' ? ' (from the ADMIN_PASSWORD env var — edit below and Save to manage them here instead)' : ' (managed here)'}.
            {' '}Logged in as: <b>{adminInfo.names[adminInfo.youIndex] || 'Admin'}</b>
          </div>
        )}
        <div className="space-y-2">
          {(settings.security?.adminPasswords || []).map((pw, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-24 truncate">
                {(adminInfo?.names?.[i]) || `Admin ${i + 1}`}{adminInfo?.youIndex === i ? ' (you)' : ''}
              </span>
              <input value={pw} onChange={(e) => updateSecurity((settings.security?.adminPasswords || []).map((x, j) => j === i ? e.target.value : x))}
                placeholder="At least 4 characters" className="input flex-1 font-mono"/>
              <button onClick={() => updateSecurity((settings.security?.adminPasswords || []).filter((_, j) => j !== i))} className="text-red-600 text-sm px-1">🗑️</button>
            </div>
          ))}
          <button onClick={() => updateSecurity([...(settings.security?.adminPasswords || []), ''])}
            className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-brand-500 text-sm">
            + Add admin password
          </button>
        </div>
        <div className="text-xs text-slate-500 space-y-1 mt-2">
          <p>• If this list has at least one password, it <b>replaces</b> the <span className="font-mono">ADMIN_PASSWORD</span> env var on Vercel. Leave it empty to keep using the env var.</p>
          <p>• Each password = one admin (Admin 1, Admin 2…), matching the profile order in <span className="font-mono">adminProfiles</span>.</p>
          <p>• ⚠️ After saving a change to your own password you will be logged out — log back in with the new one. Passwords shorter than 4 characters are ignored.</p>
        </div>
      </Section>

      {/* Photo quality */}
      <Section id="photo" title="🖼️ Photo quality" subtitle="Larger photos = more HD, but use more database space">
        <PhotoQuality settings={settings} setSettings={setS} />
      </Section>

      {/* Contact */}
      <Section id="contact" title="📬 Contact info">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Admin email"><input value={settings.contact.adminEmail || ''} onChange={(e) => updateContact('adminEmail', e.target.value)} className="input"/></Field>
          <Field label="Lead researcher email"><input value={settings.contact.leadEmail || ''} onChange={(e) => updateContact('leadEmail', e.target.value)} className="input"/></Field>
          <Field label="Admin phone"><input value={settings.contact.adminPhone || ''} onChange={(e) => updateContact('adminPhone', e.target.value)} className="input"/></Field>
          <Field label="Admin WhatsApp (with country code, e.g. +919876543210)"><input value={settings.contact.adminWhatsapp || ''} onChange={(e) => updateContact('adminWhatsapp', e.target.value)} placeholder="+91…" className="input"/></Field>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Toggle label="Show emails" checked={settings.contact.showEmails} onChange={(v) => updateContact('showEmails', v)}/>
          <Toggle label="Show phone" checked={settings.contact.showPhone} onChange={(v) => updateContact('showPhone', v)}/>
          <Toggle label="Show on landing page" checked={settings.contact.showOnLanding} onChange={(v) => updateContact('showOnLanding', v)}/>
          <Toggle label="Show in footer" checked={settings.contact.showInFooter} onChange={(v) => updateContact('showInFooter', v)}/>
        </div>

        {/* People shown on the landing page — each with a designation */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="text-sm font-medium text-slate-700 mb-1">👥 People on the landing page</div>
          <p className="text-xs text-slate-500 mb-2">Add as many people as you want — name, designation, and contact details. They appear in "Get in touch" on the landing page in this order. If this list is empty, the two email/phone fields above are shown instead.</p>
          <div className="space-y-2">
            {(settings.contact.people || []).map((person, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">Person {i + 1}</span>
                  <button onClick={() => updateContact('people', (settings.contact.people || []).filter((_, j) => j !== i))} className="text-red-600 text-sm">🗑️</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={person.name || ''} onChange={(e) => updateContact('people', (settings.contact.people || []).map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name (e.g. Satyam Yadav)" className="input"/>
                  <input value={person.designation || ''} onChange={(e) => updateContact('people', (settings.contact.people || []).map((x, j) => j === i ? { ...x, designation: e.target.value } : x))} placeholder="Designation (e.g. Lead Research Assistant)" className="input"/>
                  <input value={person.phone || ''} onChange={(e) => updateContact('people', (settings.contact.people || []).map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} placeholder="Phone (optional)" className="input"/>
                  <input value={person.email || ''} onChange={(e) => updateContact('people', (settings.contact.people || []).map((x, j) => j === i ? { ...x, email: e.target.value } : x))} placeholder="Email (optional)" className="input"/>
                  <input value={person.whatsapp || ''} onChange={(e) => updateContact('people', (settings.contact.people || []).map((x, j) => j === i ? { ...x, whatsapp: e.target.value } : x))} placeholder="WhatsApp with country code (optional)" className="input sm:col-span-2"/>
                </div>
              </div>
            ))}
            <button onClick={() => updateContact('people', [...(settings.contact.people || []), { name: '', designation: '', phone: '', email: '', whatsapp: '' }])}
              className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-brand-500 text-sm">
              + Add person
            </button>
          </div>
        </div>
      </Section>

      {/* Red flags */}
      <Section id="flags" title="🚩 Red flag rules" subtitle="Toggle which checks should fire">
        <input value={flagSearch} onChange={(e) => setFlagSearch(e.target.value)} placeholder="🔎 Search flag rules…"
          className="input mb-2" />
        <div className="space-y-1">
          {filteredFlagKeys.length === 0 ? (
            <p className="text-xs text-slate-400 italic px-1 py-2">No flag rules match "{flagSearch}".</p>
          ) : filteredFlagKeys.map(([k, label]) => (
            <Toggle key={k} label={label} checked={settings.redFlags[k] !== false} onChange={(v) => updateFlag(k, v)}/>
          ))}
        </div>
      </Section>

      {/* Data & storage — at the bottom (heaviest section, least frequently used) */}
      <Section id="storage" title="🗄️ Data & storage" subtitle="MongoDB usage, monthly downloads, and old-data cleanup">
        <DataStorage />
      </Section>

      <style jsx>{`
        :global(.input) {
          width: 100%; padding: 0.5rem 0.625rem; border: 1px solid #cbd5e1;
          border-radius: 0.5rem; font-size: 0.875rem; background: white;
        }
        :global(.input:focus) { outline: 2px solid #0ea5e9; outline-offset: -1px; }
      `}</style>
    </div>
  );
}

function Section({ id, title, subtitle, children }) {
  return (
    <div id={`section-${id}`} className="bg-white rounded-xl shadow-sm p-4 sm:p-5 scroll-mt-32">
      <div className="mb-3">
        <h2 className="font-semibold text-base">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4"/>
    </label>
  );
}

const PERIOD_PRESETS = [
  { label: 'Week (7 days)', periodDays: 7, periodLabel: 'week' },
  { label: '10 days',       periodDays: 10, periodLabel: '10-day' },
  { label: 'Month (30 days)', periodDays: 30, periodLabel: 'month' },
  { label: 'Custom…',       periodDays: -1, periodLabel: 'period' },
];

function ReadingTargets({ settings, setSettings }) {
  const r = settings.reading || {};
  const isCustom = ![7, 10, 30].includes(Number(r.periodDays) || 7);
  function set(k, v) { setSettings({ ...settings, reading: { ...r, [k]: v } }); }
  function pickPreset(p) {
    if (p.periodDays === -1) { set('periodDays', Math.max(1, Number(r.periodDays) || 14)); set('periodLabel', 'period'); return; }
    setSettings({ ...settings, reading: { ...r, periodDays: p.periodDays, periodLabel: p.periodLabel } });
  }
  const example = (Number(r.target) || 2) === 1
    ? `Each pipe needs 1 reading every ${r.periodLabel || 'week'} (${r.periodDays || 7} days).`
    : `Each pipe needs ${r.target || 2} readings every ${r.periodLabel || 'week'} (${r.periodDays || 7} days).`;

  return (
    <div className="space-y-3">
      <Field label="How many readings per period?">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="number" min="1" max="50" value={r.target ?? 2}
            onChange={(e) => set('target', Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="input w-24 tabular-nums" />
          <span className="text-sm text-slate-600">reading{(r.target || 2) === 1 ? '' : 's'} per pipe</span>
        </div>
      </Field>

      <Field label="How long is one period?">
        <div className="flex gap-1.5 flex-wrap">
          {PERIOD_PRESETS.map((p) => {
            const active = p.periodDays === -1 ? isCustom : Number(r.periodDays) === p.periodDays;
            return (
              <button key={p.label} type="button" onClick={() => pickPreset(p)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}>
                {p.label}
              </button>
            );
          })}
        </div>
      </Field>

      {isCustom && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Days in one period">
            <input type="number" min="1" max="365" value={r.periodDays ?? 7}
              onChange={(e) => set('periodDays', Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className="input tabular-nums" />
          </Field>
          <Field label="Period name (what the dashboard calls it)">
            <input value={r.periodLabel || 'period'} onChange={(e) => set('periodLabel', e.target.value.slice(0, 20))} placeholder="period" className="input" />
          </Field>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-900">
        <b>Effect:</b> {example} The Overview, Assignments, Team and Missed Readings pages all use this target to decide when a pipe is "Done".
      </div>
    </div>
  );
}

function PhotoQuality({ settings, setSettings }) {
  const r = settings.reading || {};
  function set(k, v) { setSettings({ ...settings, reading: { ...r, [k]: v } }); }
  const meterKB = Math.round(((r.photoMaxPx || 1600) ** 2 * (r.photoQuality || 0.85) * 0.18) / 1024);
  const profileKB = Math.round(((r.profilePhotoMaxPx || 600) ** 2 * (r.profilePhotoQuality || 0.88) * 0.18) / 1024);
  return (
    <div className="space-y-3">
      <Field label="Pipe photo — max width/height (pixels)">
        <input type="range" min="400" max="3000" step="100" value={r.photoMaxPx || 1600}
          onChange={(e) => set('photoMaxPx', Number(e.target.value))} className="w-full" />
        <div className="text-xs text-slate-600 mt-1">{r.photoMaxPx || 1600} px · about {Math.max(20, meterKB)} KB per photo</div>
      </Field>
      <Field label="Pipe photo — JPEG quality">
        <input type="range" min="0.4" max="0.98" step="0.02" value={r.photoQuality || 0.85}
          onChange={(e) => set('photoQuality', Number(e.target.value))} className="w-full" />
        <div className="text-xs text-slate-600 mt-1">{Math.round((r.photoQuality || 0.85) * 100)}% quality</div>
      </Field>
      <div className="border-t border-slate-100 pt-3">
        <Field label="Profile photo — max width/height (pixels)">
          <input type="range" min="200" max="1200" step="50" value={r.profilePhotoMaxPx || 600}
            onChange={(e) => set('profilePhotoMaxPx', Number(e.target.value))} className="w-full" />
          <div className="text-xs text-slate-600 mt-1">{r.profilePhotoMaxPx || 600} px · about {Math.max(8, profileKB)} KB per photo</div>
        </Field>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-900">
        <b>Database budget:</b> the free MongoDB tier is 512 MB total. At 1600 px the pipe photos are sharp and zoom-friendly; at 2400 px they're near-original phone quality. Profile photos are small so 600 px is plenty.
      </div>
    </div>
  );
}

// ---- Geofence panel: radius + toggle + Google Sheet sync of pipe locations ----
function GeofencePanel({ settings, setSettings }) {
  const geo = (settings.pipe || {}).geofence || {};
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/pipe-locations').then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  function upd(k, v) {
    setSettings({ ...settings, pipe: { ...(settings.pipe || {}), geofence: { ...geo, [k]: v } } });
  }

  async function syncNow() {
    setBusy(true); setMsg('');
    try {
      // Save current settings first so the sheet URL is persisted, then pull.
      await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const res = await fetch('/api/pipe-locations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: geo.sheetUrl }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Sync failed');
      setMsg(`✓ Loaded ${d.parsed} pipe locations${d.skipped ? ` · skipped ${d.skipped} unreadable row(s)` : ''}.`);
      setStatus({ count: d.parsed, syncedAt: new Date().toISOString(), sample: d.sample || [] });
    } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <Toggle label="Flag readings taken outside a pipe's set location"
        checked={geo.enabled === true} onChange={(v) => upd('enabled', v)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Radius (metres)">
          <input type="number" min="1" value={geo.radiusMeters ?? 50}
            onChange={(e) => upd('radiusMeters', e.target.value === '' ? '' : Number(e.target.value))} className="input" />
        </Field>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2">
        <Field label="Google Sheet URL (reference locations)">
          <input value={geo.sheetUrl || ''} onChange={(e) => upd('sheetUrl', e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…" className="input" />
        </Field>
        <button onClick={syncNow} disabled={busy || !geo.sheetUrl}
          className="px-3 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Syncing…' : '⟳ Sync locations from sheet now'}
        </button>
        {msg && <div className="text-xs text-slate-700">{msg}</div>}
        {status && (
          <div className="text-xs text-slate-500">
            {status.count > 0
              ? <>Currently {status.count} pipe location{status.count === 1 ? '' : 's'} loaded{status.syncedAt ? ` · synced ${new Date(status.syncedAt).toLocaleString()}` : ''}.</>
              : 'No pipe locations loaded yet.'}
            {Array.isArray(status.sample) && status.sample.length > 0 && (
              <div className="mt-1 font-mono">e.g. {status.sample.map(([k, v]) => `${k}→${v.lat?.toFixed(5)},${v.lng?.toFixed(5)}`).slice(0, 3).join('  ')}</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 text-xs text-sky-900 space-y-1">
        <div className="font-semibold">📄 How to set up the sheet</div>
        <p>Two columns, with a header row:</p>
        <p><b>Column A</b> = Pipe ID (exactly as in Kobo, e.g. <span className="font-mono">MU_10068A</span>). <b>Column B</b> = location as <span className="font-mono">lat, lng</span>.</p>
        <p>Location can be decimal (<span className="font-mono">30.4219, 76.3615</span>) or degrees (<span className="font-mono">30°25'19"N 76°21'41"E</span>) — both are read automatically.</p>
        <p>Share the sheet as <b>Anyone with the link – Viewer</b> (or File → Share → Publish to web), then paste the link above and hit Sync.</p>
      </div>
    </div>
  );
}

// ---- Registry panel: turn farms and pipes on/off ----
function RegistryPanel() {
  const [master, setMaster] = useState(null);      // { villages, pipes:[{serial,farm,village}] }
  const [offFarms, setOffFarms] = useState(new Set());
  const [offPipes, setOffPipes] = useState(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/registry').then((r) => r.json()).catch(() => ({ farms: [], pipes: [], master: null }))
      .then((d) => {
        setOffFarms(new Set((d.farms || []).map(String)));
        setOffPipes(new Set((d.pipes || []).map(String)));
        setMaster(d.master || null);
        setLoaded(true);
      });
  }, []);

  // Group the master pipe list by farm for a compact on/off tree.
  const farms = {};
  if (master?.pipes) {
    for (const p of master.pipes) {
      const farm = p.farm || '(no farm)';
      if (!farms[farm]) farms[farm] = { village: p.village, pipes: [] };
      farms[farm].pipes.push(p.serial);
    }
  }
  const farmList = Object.entries(farms)
    .filter(([farm]) => !q || farm.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a[0].localeCompare(b[0]));

  function toggleSet(setter, set, key) {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  }
  async function save() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/registry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farms: [...offFarms], pipes: [...offPipes] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setMsg('✓ Saved. Disabled farms/pipes are now hidden from surveyors.');
    } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false);
  }

  if (!loaded) return <div className="text-sm text-slate-500">Loading farms & pipes…</div>;
  if (!master?.pipes?.length) return <div className="text-sm text-slate-500">No pipe list available from the Kobo form yet. This reads the form\u2019s village\u2192farm\u2192pipe choice lists; if your form uses a CSV media file for pipes instead of choice lists, this list can\u2019t be built. Tell me and I\u2019ll wire it to read submissions instead.</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search farm ID…"
          className="input flex-1 min-w-[160px]" />
        <span className="text-xs text-slate-500">{offFarms.size} farms · {offPipes.size} pipes off</span>
      </div>

      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[26rem] overflow-y-auto">
        {farmList.map(([farm, info]) => {
          const farmOff = offFarms.has(farm);
          return (
            <div key={farm} className={`p-2.5 ${farmOff ? 'bg-slate-50 opacity-70' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold truncate">{farm}</div>
                  <div className="text-[11px] text-slate-500">{info.village} · {info.pipes.length} pipe(s)</div>
                </div>
                <button onClick={() => toggleSet(setOffFarms, offFarms, farm)}
                  className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${farmOff ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
                  {farmOff ? '○ Off' : '● On'}
                </button>
              </div>
              {!farmOff && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {info.pipes.map((serial) => {
                    const pipeOff = offPipes.has(serial);
                    return (
                      <button key={serial} onClick={() => toggleSet(setOffPipes, offPipes, serial)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded border ${pipeOff ? 'bg-slate-100 text-slate-400 border-slate-200 line-through' : 'bg-white text-slate-700 border-slate-300'}`}>
                        {serial}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy}
          className="px-3 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save farm & pipe settings'}
        </button>
        {msg && <span className="text-xs text-slate-700">{msg}</span>}
      </div>
      <p className="text-[11px] text-slate-500">Tap a farm's <b>On/Off</b> to disable the whole plot, or tap individual pipe codes to disable just those. Disabled units vanish from surveyors, are excluded from red flags, and don't count toward missed readings.</p>
    </div>
  );
}
