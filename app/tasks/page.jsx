'use client';

import { useEffect, useState } from 'react';

function dueLabel(t) {
  if (t.dueType === 'week') return 'This week';
  if (t.dueType === 'month') return 'This month';
  if (t.dueType === 'date' && t.dueDate) return `By ${t.dueDate}`;
  return 'No due date';
}

export default function TasksPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  // admin create-form fields
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueType, setDueType] = useState('week');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // surveyor filter
  const [tab, setTab] = useState('open'); // 'open' | 'done' | 'all'

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      // All three requests fire AT THE SAME TIME — this is what makes the
      // tab open fast instead of waiting for each call one after another.
      const [a, t, list] = await Promise.all([
        fetch('/api/auth/check').then((r) => r.json()).catch(() => ({})),
        fetch('/api/tasks').then((r) => r.json()).catch(() => ({})),
        fetch('/api/assignments').then((r) => r.json()).catch(() => ({})),
      ]);
      const u = a && a.user ? a.user : null;
      setUser(u);
      if (u) {
        setTasks(Array.isArray(t && t.tasks) ? t.tasks : []);
        if (u.role === 'admin') {
          const arr = Array.isArray(list) ? list : (list && list.assignments) || [];
          const names = arr.map((p) => p.person).filter(Boolean);
          setPeople(names);
          if (names.length && !assignedTo) setAssignedTo(names[0]);
        }
      }
    } catch (e) {
      setError('Could not load tasks. Please refresh.');
    }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleCreate() {
    if (!title.trim() || !assignedTo) { setError('Enter a title and pick a person.'); return; }
    setSaving(true);
    setError('');
    const body = { title: title.trim(), assignedTo, dueType, notes: notes.trim() };
    if (dueType === 'date' && dueDate) body.dueDate = dueDate;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()).catch(() => ({}));
    setSaving(false);
    if (res && res.task) {
      setTasks((prev) => [res.task, ...prev]);
      setTitle('');
      setNotes('');
      setDueDate('');
    } else {
      setError((res && res.error) || 'Could not create task.');
    }
  }

  async function toggleDone(task, done) {
    setBusyId(task.id);
    const res = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, done }),
    }).then((r) => r.json()).catch(() => ({}));
    setBusyId(null);
    if (res && res.task) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? res.task : t)));
    } else {
      setError((res && res.error) || 'Could not update task.');
    }
  }

  async function removeTask(task) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this task?')) return;
    setBusyId(task.id);
    const res = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: 'DELETE' })
      .then((r) => r.json())
      .catch(() => ({}));
    setBusyId(null);
    if (res && res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } else {
      setError('Could not delete task.');
    }
  }

  // ---- loading ----
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-gray-100" />
        <div className="mt-3 h-24 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  // ---- not logged in ----
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-800">Tasks</h1>
        <p className="mt-2 text-gray-500">Please log in to view your tasks.</p>
        <a href="/login" className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700">Go to login</a>
      </div>
    );
  }

  const isAdmin = user.role === 'admin';

  // ============================ SURVEYOR VIEW ============================
  if (!isAdmin) {
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const shown = tab === 'open' ? open : tab === 'done' ? done : tasks;
    const tabs = [
      { key: 'open', label: `To do (${open.length})` },
      { key: 'done', label: `Done (${done.length})` },
      { key: 'all', label: `All (${tasks.length})` },
    ];
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-800">My tasks</h1>
        <p className="mt-1 text-sm text-gray-500">Extra work assigned to you. Tap a task to mark it done.</p>

        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          {tabs.map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === tb.key ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{tb.label}</button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-gray-400">
              {tab === 'done' ? 'No completed tasks yet.' : 'No tasks here. You are all caught up!'}
            </div>
          ) : (
            shown.map((t) => (
              <div key={t.id} className={`rounded-xl border bg-white p-4 ${t.done ? 'border-green-200' : 'border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleDone(t, !t.done)} disabled={busyId === t.id} className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${t.done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 text-transparent hover:border-sky-500'}`} aria-label="toggle done">✓</button>
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${t.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{t.title}</p>
                    {t.notes ? <p className="mt-0.5 text-sm text-gray-500">{t.notes}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{dueLabel(t)}</span>
                      {t.done && t.doneAt ? <span className="text-gray-400">Done {new Date(t.doneAt).toLocaleDateString()}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ============================ ADMIN VIEW ============================
  const open = tasks.filter((t) => !t.done);
  const grouped = {};
  for (const t of tasks) {
    const key = t.assignedTo || 'Unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }
  const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800">Tasks</h1>
      <p className="mt-1 text-sm text-gray-500">Assign extra work to field assistants and track what is done. {open.length} open, {tasks.length} total.</p>

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {/* create task */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">New task</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Re-check pipe MU_10068A GPS" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Assign to</label>
            {people.length > 0 ? (
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none">
                {people.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            ) : (
              <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Surveyor name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Due</label>
            <select value={dueType} onChange={(e) => setDueType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none">
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="date">Specific date</option>
            </select>
          </div>
          {dueType === 'date' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any extra detail for the assistant" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
          </div>
        </div>
        <div className="mt-3">
          <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">{saving ? 'Saving…' : 'Create task'}</button>
        </div>
      </div>

      {/* list grouped by person */}
      <div className="mt-6 space-y-6">
        {groupNames.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-gray-400">No tasks yet. Create one above.</div>
        ) : (
          groupNames.map((name) => (
            <div key={name}>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{name} <span className="font-normal text-gray-400">({grouped[name].filter((t) => !t.done).length} open)</span></h3>
              <div className="space-y-2">
                {grouped[name].map((t) => (
                  <div key={t.id} className={`flex items-start gap-3 rounded-xl border bg-white p-3 ${t.done ? 'border-green-200' : 'border-gray-200'}`}>
                    <button onClick={() => toggleDone(t, !t.done)} disabled={busyId === t.id} className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${t.done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 text-transparent hover:border-sky-500'}`} aria-label="toggle done">✓</button>
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${t.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{t.title}</p>
                      {t.notes ? <p className="mt-0.5 text-sm text-gray-500">{t.notes}</p> : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{dueLabel(t)}</span>
                        {t.done && t.doneAt ? <span className="text-green-600">Done {new Date(t.doneAt).toLocaleDateString()}{t.doneBy ? ` by ${t.doneBy}` : ''}</span> : null}
                      </div>
                    </div>
                    <button onClick={() => removeTask(t)} disabled={busyId === t.id} className="flex-none rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
