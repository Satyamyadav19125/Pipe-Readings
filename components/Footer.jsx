import { getSettings } from '@/lib/db';

export default async function Footer() {
  let settings;
  try { settings = await getSettings(); } catch { settings = null; }
  const c = settings?.contact;

  const showContact = c && c.showInFooter && (c.showEmails || c.showPhone);

  return (
    <footer className="mt-12 py-6 border-t border-slate-200/60 bg-white/50">
      <div className="max-w-3xl mx-auto px-4 flex flex-col items-center gap-2 text-center">
        <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap justify-center">
          <span className="text-base">💧</span>
          <span>Digital Village Project</span>
          <span className="text-slate-300">·</span>
          <span>Tel Aviv University × Thapar Institute</span>
        </p>

        {showContact && (
          <div className="text-[11px] text-slate-400 flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-1">
            {c.showEmails && c.leadEmail && (
              <span className="flex items-center gap-1.5 justify-center">
                <span className="text-slate-400">Lead Researcher:</span>
                <a href={`mailto:${c.leadEmail}`} className="text-brand-600 hover:underline">{c.leadEmail}</a>
              </span>
            )}
            {c.showEmails && c.adminEmail && (
              <span className="flex items-center gap-1.5 justify-center">
                <span className="text-slate-400">Research Assistant:</span>
                <a href={`mailto:${c.adminEmail}`} className="text-brand-600 hover:underline">{c.adminEmail}</a>
              </span>
            )}
            {c.showPhone && c.adminPhone && (
              <span className="flex items-center gap-1.5 justify-center">
                <span className="text-slate-400">Phone:</span>
                <a href={`tel:${c.adminPhone}`} className="text-brand-600 hover:underline">{c.adminPhone}</a>
              </span>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
