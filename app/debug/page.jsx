import { fetchSubmissions } from '@/lib/kobo';
import { isAdmin } from '@/lib/auth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DebugPage() {
  const admin = await isAdmin();

  // SECURITY: raw submission JSON contains GPS points, names and phone-like
  // fields. Only the admin may see this page's contents.
  if (!admin) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">Admin only</p>
        <p>This page shows raw form data and connection diagnostics. Please <Link href="/login" className="underline font-medium">log in as admin</Link> to view it.</p>
      </div>
    );
  }

  let submissions = [];
  let error = null;
  try { submissions = await fetchSubmissions({ limit: 3 }); }
  catch (e) { error = e.message; }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Debug & Diagnostics</h1>

      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
        <p className="font-semibold mb-1">If Kobo returns "bad auth":</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs">
          <li>Click the <em>Run Kobo diagnostic</em> link below — it'll show exactly which env vars are set, what token prefix/suffix the server sees, and which Kobo URL it's calling</li>
          <li>Common causes: wrong KOBO_BASE_URL (your account might be on a different Kobo instance), token belongs to a different user/account, or token still pasted with hidden whitespace</li>
        </ol>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="font-semibold mb-2">Kobo connection test</h2>
        <p className="text-sm text-slate-600 mb-3">
          Opens raw diagnostic JSON in a new tab. Shows token prefix/suffix (safe), tests connection, and reports HTTP status.
        </p>
        <Link
          href="/api/diag"
          target="_blank"
          className="inline-block px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700"
        >
          Run Kobo diagnostic →
        </Link>
      </div>

      <h2 className="text-lg font-semibold pt-2">Raw submission JSON</h2>
      <p className="text-sm text-slate-600">
        Use this to find your form's exact field names. Put them in <code>lib/fieldMap.js</code> if defaults don't match.
      </p>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Error: {error}</p>
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-slate-500">No submissions yet.</p>
      ) : (
        submissions.map((s) => (
          <details key={s._id} className="bg-white rounded shadow">
            <summary className="cursor-pointer p-3 font-mono text-sm">
              #{s._id} — {new Date(s._submission_time).toLocaleString()}
            </summary>
            <pre className="p-3 text-xs overflow-x-auto bg-slate-50">{JSON.stringify(s, null, 2)}</pre>
          </details>
        ))
      )}
    </div>
  );
}
