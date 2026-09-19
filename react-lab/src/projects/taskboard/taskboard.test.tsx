// Project 6 tests — the capstone: query, form, optimistic update, lazy route, failure states.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import type { Session } from '../../auth/tokenStore';
import { App, taskboardRoutes } from './App';
import type { Task } from './types';

const session: Session = {
  token: 'token-1',
  refreshToken: 'refresh-1',
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com', roles: ['admin'] },
  expiresAt: Date.now() + 3_600_000,
};

const seed: Task[] = [
  { id: 't1', title: 'Write the outline', status: 'todo', assignee: 'Asha', points: 3 },
  { id: 't2', title: 'Draft the chapters', status: 'doing', assignee: 'Vik', points: 8 },
];

function renderApp(initialPath = '/', initialSession: Session | null = session) {
  const router = createMemoryRouter(taskboardRoutes, { initialEntries: [initialPath] });
  render(<App initialSession={initialSession} router={router} />);
  return router;
}

/** A small in-memory API that behaves like the real one, including failures. */
function useTaskApi(startWith: Task[] = seed) {
  // A single mutable store that every handler (including per-test overrides) shares,
  // so a refetch after a mutation sees the change — exactly like a real server.
  const store = { tasks: [...startWith] };
  server.use(
    http.get('/api/tasks', () => HttpResponse.json(store.tasks)),
    http.post('/api/tasks', async ({ request }) => {
      const draft = (await request.json()) as Omit<Task, 'id' | 'status'>;
      const created: Task = { ...draft, id: `t${store.tasks.length + 1}`, status: 'todo' };
      store.tasks = [...store.tasks, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch('/api/tasks/:id', async ({ params, request }) => {
      const { status } = (await request.json()) as { status: Task['status'] };
      const updated = store.tasks.map((task) => (task.id === params.id ? { ...task, status } : task));
      store.tasks = updated;
      return HttpResponse.json(updated.find((task) => task.id === params.id));
    }),
    http.delete('/api/tasks/:id', ({ params }) => {
      store.tasks = store.tasks.filter((task) => task.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return store;
}

describe('taskboard', () => {
  it('loads tasks and shows the signed-in user', async () => {
    useTaskApi();
    renderApp();

    expect(await screen.findByRole('list', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Write the outline')).toBeInTheDocument();
    expect(screen.getByText(/Signed in as Asha/)).toBeInTheDocument();
  });

  it('shows a loading state, then an empty state when there is nothing', async () => {
    useTaskApi([]);
    server.use(
      http.get('/api/tasks', async () => {
        await delay(30);
        return HttpResponse.json([]);
      }),
    );
    renderApp();

    expect(screen.getByRole('status')).toHaveTextContent('Loading tasks…');
    expect(await screen.findByTestId('empty')).toBeInTheDocument();
  });

  it('creates a task through the form and clears the inputs', async () => {
    const api = useTaskApi();
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('list', { name: 'Tasks' });
    await user.type(screen.getByLabelText('Title'), 'Review the PRs');
    await user.type(screen.getByLabelText('Assignee'), 'Meera');
    await user.clear(screen.getByLabelText('Points'));
    await user.type(screen.getByLabelText('Points'), '5');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByText('Review the PRs')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(api.tasks).toHaveLength(3);
  });

  it('refuses invalid input and does not call the API', async () => {
    const api = useTaskApi();
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('list', { name: 'Tasks' });
    await user.type(screen.getByLabelText('Title'), 'ab');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByText('Give the task a title of at least 3 characters.')).toBeInTheDocument();
    expect(api.tasks).toHaveLength(2);
  });

  it('moves a task optimistically, and rolls back when the server refuses', async () => {
    const store = useTaskApi();
    let allow = false;
    server.use(
      http.patch('/api/tasks/:id', async ({ params, request }) => {
        if (!allow) {
          await delay(50);                       // slow enough that the optimistic state is observable
          return HttpResponse.json({ message: 'Nope' }, { status: 500 });
        }
        const { status } = (await request.json()) as { status: Task['status'] };
        const updated = store.tasks.map((task) => (task.id === params.id ? { ...task, status } : task));
        store.tasks = updated;
        return HttpResponse.json(updated.find((task) => task.id === params.id));
      }),
    );
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('list', { name: 'Tasks' });
    await user.click(screen.getByRole('button', { name: /Move Draft the chapters/ }));

    // Optimistic: the label flips immediately…
    expect(await screen.findByRole('button', { name: /Move Draft the chapters from Done to To do/ })).toBeInTheDocument();

    // …then the failure rolls it back and explains itself.
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update that task: Nope');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Move Draft the chapters from In progress to Done/ })).toBeInTheDocument();
    });

    allow = true;                                  // a retry now succeeds
    await user.click(screen.getByRole('button', { name: /Move Draft the chapters from In progress to Done/ }));
    expect(await screen.findByRole('button', { name: /Move Draft the chapters from Done to To do/ })).toBeInTheDocument();
  });

  it('deletes a task', async () => {
    const api = useTaskApi();
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('list', { name: 'Tasks' });
    await user.click(screen.getByRole('button', { name: 'Delete Write the outline' }));

    await waitFor(() => { expect(screen.queryByText('Write the outline')).not.toBeInTheDocument(); });
    expect(api.tasks).toHaveLength(1);
  });

  it('renders the error state with a retry when the list request fails', async () => {
    let attempts = 0;
    server.use(
      http.get('/api/tasks', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ message: 'Server exploded' }, { status: 500 })
          : HttpResponse.json(seed);
      }),
    );
    const user = userEvent.setup();
    renderApp();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server exploded');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Tasks' })).toBeInTheDocument();
  });

  it('loads the report route lazily and computes the numbers from the cache', async () => {
    useTaskApi();
    const user = userEvent.setup();
    renderApp();                                    // start on the task list

    await screen.findByRole('list', { name: 'Tasks' });
    await user.click(screen.getByRole('link', { name: 'Reports' }));   // the lazy chunk loads here

    // 3 + 8 = 11 points total, none of them done yet → 0%
    expect(await screen.findByTestId('completion')).toHaveTextContent('0% of points complete');
    expect(screen.getByText('To do: 1')).toBeInTheDocument();
    expect(screen.getByText('In progress: 1')).toBeInTheDocument();
  });
});
