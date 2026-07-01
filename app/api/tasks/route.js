import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTasks, getTasksForPerson, createTask, updateTask, deleteTask } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

// GET — admin sees all tasks; a surveyor sees only the tasks assigned to them.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  if (user.role === 'admin') {
    const tasks = await getTasks();
    return NextResponse.json({ tasks, role: 'admin' });
  }
  const tasks = await getTasksForPerson(user.name);
  return NextResponse.json({ tasks, role: 'user', name: user.name });
}

// POST — admin only — create a task.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.title || !body.assignedTo) {
    return NextResponse.json({ error: 'Title and assignee are required' }, { status: 400 });
  }
  const task = await createTask(body);
  if (!task) {
    return NextResponse.json({ error: 'Could not save task (database unavailable)' }, { status: 503 });
  }
  return NextResponse.json({ task });
}

// PATCH — admin can edit any field of any task; a surveyor can only toggle the
// done state of their OWN task.
export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'Task id required' }, { status: 400 });

  if (user.role === 'admin') {
    const { id, ...updates } = body;
    const task = await updateTask(id, updates);
    if (!task) return NextResponse.json({ error: 'Could not update task' }, { status: 503 });
    return NextResponse.json({ task });
  }

  // Surveyor: must own the task, and may only change done/doneAt/doneBy.
  const own = await getTasksForPerson(user.name);
  const target = own.find((t) => t.id === body.id);
  if (!target) return NextResponse.json({ error: 'Not your task' }, { status: 403 });

  const done = Boolean(body.done);
  const task = await updateTask(body.id, {
    done,
    doneAt: done ? new Date().toISOString() : null,
    doneBy: done ? user.name : null,
  });
  if (!task) return NextResponse.json({ error: 'Could not update task' }, { status: 503 });
  return NextResponse.json({ task });
}

// DELETE — admin only.
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  let id = searchParams.get('id');
  if (!id) {
    const body = await request.json().catch(() => ({}));
    id = body.id;
  }
  if (!id) return NextResponse.json({ error: 'Task id required' }, { status: 400 });
  const ok = await deleteTask(id);
  return NextResponse.json({ ok });
}
