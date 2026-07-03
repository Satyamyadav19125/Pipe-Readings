'use client';

import { Component, useState } from 'react';
import AssignmentsPage from '../assignments/page';
import TasksPage from '../tasks/page';
import MissedPage from '../missed/page';

// One tab that holds Assignments, Tasks and Missed readings (#16).
// The old routes (/assignments, /tasks, /missed) still work for deep links.
const TABS = [
  { key: 'assignments', label: '👥 Assignments' },
  { key: 'tasks', label: '✅ Tasks' },
  { key: 'missed', label: '📌 Missed readings' },
];

// If a tab crashes client-side (e.g. on a specific phone browser), show the
// actual error + a retry button instead of a silent blank page. This makes
// mobile-only failures diagnosable from a screenshot.
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
  const [tab, setTab] = useState('assignments');

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 sticky top-[60px] z-[500] bg-transparent">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition shadow-sm ${
              tab === t.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <TabErrorBoundary>
        <div className={tab === 'assignments' ? '' : 'hidden'}><AssignmentsPage /></div>
        {tab === 'tasks' && <TasksPage />}
        {tab === 'missed' && <MissedPage />}
      </TabErrorBoundary>
    </div>
  );
}
