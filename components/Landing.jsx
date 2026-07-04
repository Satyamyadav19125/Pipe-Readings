import Link from 'next/link';
import { getSettings } from '@/lib/db';

export default async function Landing() {
  let settings;
  try { settings = await getSettings(); } catch { settings = null; }
  const project = settings?.project;
  const contact = settings?.contact;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 via-brand-700 to-field-700 text-white shadow-xl">
        {/* Decorative SVG: water droplets + wheat */}
        <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <path d="M0,400 Q200,350 400,400 T800,400 L800,500 L0,500 Z" fill="white"/>
          <path d="M0,430 Q200,380 400,430 T800,430 L800,500 L0,500 Z" fill="white" opacity="0.5"/>
          {/* Wheat stalks */}
          {[100, 250, 400, 550, 700].map((x, i) => (
            <g key={i} transform={`translate(${x}, 430)`}>
              <line x1="0" y1="0" x2="0" y2="-80" stroke="white" strokeWidth="2"/>
              {[-50, -40, -30, -20, -10].map((y, j) => (
                <g key={j}>
                  <ellipse cx="-6" cy={y} rx="4" ry="6" fill="white" transform={`rotate(-30 -6 ${y})`}/>
                  <ellipse cx="6" cy={y} rx="4" ry="6" fill="white" transform={`rotate(30 6 ${y})`}/>
                </g>
              ))}
            </g>
          ))}
          {/* Water droplets */}
          <path d="M150,80 q-10,20 0,30 q10,-10 0,-30 z" fill="white"/>
          <path d="M650,120 q-15,25 0,40 q15,-15 0,-40 z" fill="white"/>
        </svg>

        <div className="relative p-6 sm:p-10 md:p-14">
          <div className="text-5xl mb-4">💧🌾</div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-3">
            {project?.name || 'Digital Village Project'}
          </h1>
          <p className="text-base sm:text-lg text-white/90 mb-2 max-w-2xl">
            {project?.tagline || 'PVC pipe water-level monitoring for AWD'}
          </p>
          <div className="flex items-center gap-2 text-sm text-white/80 mb-6 flex-wrap">
            <span>🏛️ Tel Aviv University, Israel</span>
            <span className="opacity-50">·</span>
            <span>🏛️ Thapar Institute, Patiala India</span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-brand-900 px-6 py-3 rounded-lg font-semibold shadow-lg hover:bg-brand-50 transition"
          >
            🔑 Log in to dashboard
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </section>

      {/* About */}
      <section className="bg-white rounded-2xl shadow p-6 sm:p-8">
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
          <span className="text-2xl">🌱</span> About the project
        </h2>
        <p className="text-slate-700 leading-relaxed">
          {project?.description ||
            'A joint research project between Tel Aviv University (Israel) and Thapar Institute of Engineering and Technology (Patiala, India). We monitor water usage across Punjab farms to drive water-saving practices in paddy irrigation through the Alternate Wetting and Drying (AWD) method.'}
        </p>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FeatureCard icon="💧" title="Real-time monitoring" body="Track PVC pipe water-level readings across hundreds of AWD farms, with red-flag detection for missing photos and stale readings." />
        <FeatureCard icon="📊" title="Field analytics" body="Submissions by village, by surveyor, and over time — with quality metrics and trend analysis." />
        <FeatureCard icon="🗺️" title="Geo mapping" body="See every reading on the map and export to KML, KMZ, GeoJSON, CSV, or a standalone HTML page." />
      </section>

      {/* Contact */}
      {contact?.showOnLanding && (
        <section className="bg-white rounded-2xl shadow p-6 sm:p-8">
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <span className="text-2xl">📬</span> Get in touch
          </h2>
          {Array.isArray(contact.people) && contact.people.filter((p) => p.name).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {contact.people.filter((p) => p.name).map((p, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4">
                  <div className="font-semibold">{p.name}</div>
                  {p.designation && <div className="text-xs text-brand-700 font-medium mb-1.5">{p.designation}</div>}
                  <div className="space-y-1 text-sm">
                    {contact.showPhone !== false && p.phone && (
                      <p>📞 <a href={`tel:${p.phone}`} className="text-brand-600 hover:underline">{p.phone}</a></p>
                    )}
                    {contact.showEmails !== false && p.email && (
                      <p>✉️ <a href={`mailto:${p.email}`} className="text-brand-600 hover:underline break-all">{p.email}</a></p>
                    )}
                    {p.whatsapp && (
                      <p>💬 <a href={`https://wa.me/${String(p.whatsapp).replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="text-field-700 hover:underline">WhatsApp</a></p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {contact.showEmails && contact.leadEmail && (
                <p>
                  <span className="text-slate-500 inline-block w-36">Lead Researcher:</span>
                  <a href={`mailto:${contact.leadEmail}`} className="text-brand-600 hover:underline">{contact.leadEmail}</a>
                </p>
              )}
              {contact.showEmails && contact.adminEmail && (
                <p>
                  <span className="text-slate-500 inline-block w-36">Research Assistant:</span>
                  <a href={`mailto:${contact.adminEmail}`} className="text-brand-600 hover:underline">{contact.adminEmail}</a>
                </p>
              )}
              {contact.showPhone && contact.adminPhone && (
                <p>
                  <span className="text-slate-500 inline-block w-32">Phone:</span>
                  <a href={`tel:${contact.adminPhone}`} className="text-brand-600 hover:underline">{contact.adminPhone}</a>
                </p>
              )}
              {contact.showPhone && contact.adminWhatsapp && (
                <p>
                  <span className="text-slate-500 inline-block w-32">WhatsApp:</span>
                  <a href={`https://wa.me/${String(contact.adminWhatsapp).replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="text-field-700 hover:underline">{contact.adminWhatsapp}</a>
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FeatureCard({ icon, title, body }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-slate-600">{body}</p>
    </div>
  );
}
