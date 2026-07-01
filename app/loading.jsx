// Shown INSTANTLY by Next.js while a tab's server data loads.
// This is what makes navigation feel fast even on a cold start — the user
// sees a skeleton + a clear "loading" hint instead of a blank screen.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-center gap-2 text-brand-700 text-sm font-medium py-2">
        <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Loading your dashboard… please wait
      </div>
      <div className="h-20 bg-white rounded-xl shadow-sm" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-xl shadow-sm" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="h-56 bg-white rounded-xl shadow-sm" />
        <div className="h-56 bg-white rounded-xl shadow-sm" />
      </div>
    </div>
  );
}
