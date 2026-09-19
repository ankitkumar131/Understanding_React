// Part 17 — a dev-only in-memory API so the capstone project runs without a backend.
// It patches window.fetch for /api/tasks and leaves every other request untouched.
import type { Task } from '../projects/taskboard/types';

const seed: Task[] = [
  { id: 't1', title: 'Write the outline', status: 'todo', assignee: 'Asha', points: 3 },
  { id: 't2', title: 'Draft the chapters', status: 'doing', assignee: 'Vik', points: 8 },
  { id: 't3', title: 'Collect reader feedback', status: 'done', assignee: 'Meera', points: 2 },
];

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function installMockApi(): void {
  if (!import.meta.env.DEV) return;                    // never in a production build

  let tasks: Task[] = [...seed];
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/tasks')) return realFetch(input, init);

    await new Promise((resolve) => setTimeout(resolve, 250));         // pretend there is a network
    const method = (init?.method ?? 'GET').toUpperCase();
    const id = url.split('/api/tasks/')[1];

    if (method === 'GET' && id === undefined) return json(tasks);

    if (method === 'POST') {
      const draft = JSON.parse(String(init?.body ?? '{}')) as Omit<Task, 'id' | 'status'>;
      const created: Task = { ...draft, id: `t${tasks.length + 1}`, status: 'todo' };
      tasks = [...tasks, created];
      return json(created, 201);
    }

    if (method === 'PATCH' && id !== undefined) {
      const patch = JSON.parse(String(init?.body ?? '{}')) as Partial<Task>;
      tasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
      return json(tasks.find((task) => task.id === id));
    }

    if (method === 'DELETE' && id !== undefined) {
      tasks = tasks.filter((task) => task.id !== id);
      return new Response(null, { status: 204 });
    }

    return json({ message: 'Not found' }, 404);
  };
}
