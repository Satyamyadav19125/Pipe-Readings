'use client';

import { useState, useEffect } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      const wa = d.settings?.contact?.adminWhatsapp;
      if (wa) setWhatsapp(wa);
    }).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      window.location.href = '/';
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hi, I forgot my PVC Pipe Readings password. Could you please reset it for me? Thank you.')}`
    : null;

  return (
    <div className="max-w-sm mx-auto mt-6 sm:mt-8">
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-7">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">💧🌾</div>
          <h1 className="text-2xl font-bold">Log in</h1>
          <p className="text-sm text-slate-500 mt-1">Just enter your password — we'll figure out who you are.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Password</label>
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" required />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800">{error}</div>}

          <button type="submit" disabled={loading || !password}
            className="w-full bg-gradient-to-r from-brand-600 to-field-600 text-white py-2.5 rounded-lg font-medium hover:opacity-90 disabled:bg-slate-300 transition">
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 text-center space-y-2">
          {whatsappLink && (
            <a href={whatsappLink} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1">
              <span>💬</span> Forgot password? Message admin on WhatsApp
            </a>
          )}
          <p className="text-[11px] text-slate-400">
            Admin uses the master password.<br/>
            Surveyors use the password assigned to them.
          </p>
        </div>
      </div>
    </div>
  );
}
