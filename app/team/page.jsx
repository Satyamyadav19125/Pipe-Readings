'use client';

import { Component, useEffect, useState } from 'react';
import AssignmentsPage from '../assignments/page';
import TasksPage from '../tasks/page';
import MissedPage from '../missed/page';

// One tab holding the per-village Assignment view, Team management and Tasks.
// Order + visibility depend on role:
//   admin:    📌 Assignment · 👥 Team · ✅ Tasks
//   surveyor: 📌 Assignment · ✅ Tasks   (no Team management)
// The old routes (/assignments, /tasks, /missed) still work for deep links.

class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <p className="font-medium">⚠️ This tab hit an error on your device.</p>
          <p className="mt-1 break-all font-mono text-xs">{String(this.state.error?.message || this.state.error)}</p>
          <button onClick={() => this.setState({ error: null })}
            className="mt-2 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TeamPage() {
  const [tab, setTab] = useState('missed'); // Assignment view opens first
  const [isAdmin, setIsAdmin] = useState(null); // null = still checking

  useEffect(() => {
    fetch('/api/auth/check')
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.user?.role === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  const tabs = [
    { key: 'missed', label: '📌 Assignment' },
    ...(isAdmin ? [{ key: 'assignments', label: '👥 Team' }] : []),
    { key: 'tasks', label: '✅ Tasks' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 sticky top-[60px] z-[500] bg-transparent">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition shadow-sm ${
              tab === t.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <TabErrorBoundary>
        {/* All panes stay mounted — switching is instant, no refetch. */}
        <div className={tab === 'missed' ? '' : 'hidden'}><MissedPage /></div>
        {isAdmin && <div className={tab === 'assignments' ? '' : 'hidden'}><AssignmentsPage /></div>}
        <div className={tab === 'tasks' ? '' : 'hidden'}><TasksPage /></div>
      </TabErrorBoundary>
    </div>
  );
}
