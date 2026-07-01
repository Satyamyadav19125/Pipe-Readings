'use client';

import { useState } from 'react';
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

      <div className={tab === 'assignments' ? '' : 'hidden'}><AssignmentsPage /></div>
      {tab === 'tasks' && <TasksPage />}
      {tab === 'missed' && <MissedPage />}
    </div>
  );
}
