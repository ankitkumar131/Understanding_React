// Project 5 tests — registration, sign-in, role gating, sign-out, expired sessions.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { tokenStore, type Session } from '../../auth/tokenStore';
import { App } from './App';

const asha: Session = {
  token: 'token-asha',
  refreshToken: 'refresh-asha',
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com', roles: ['admin'] },
  expiresAt: Date.now() + 60 * 60 * 1000,
};

const viewer: Session = {
  ...asha,
  token: 'token-viewer',
  user: { id: 'u2', name: 'Vik', email: 'vik@example.com', roles: ['viewer'] },
};

function renderApp(initialPath = '/', initialSession?: Session | null) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App initialSession={initialSession} />
    </MemoryRouter>,
  );
}

describe('auth app', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('registers a new user, adopts the session and lands on the dashboard', async () => {
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ ...asha, user: { ...asha.user, name: body.name } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(screen.getByLabelText('Name'), 'Asha');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Welcome, Asha.')).toBeInTheDocument();
    expect(tokenStore.read()?.token).toBe('token-asha');
  });

  it('shows a field error when the email is already registered and stores nothing', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ message: 'Email already registered' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('That email is already registered. Sign in instead?')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(tokenStore.read()).toBeNull();
  });

  it('blocks the team page for an anonymous visitor and returns there after sign-in', async () => {
    server.use(
      http.post('/api/auth/login', () => HttpResponse.json(asha)),
      http.get('/api/admin/users', ({ request }) =>
        request.headers.get('authorization') === `Bearer ${asha.token}`
          ? HttpResponse.json([{ id: 'u1', name: 'Asha', email: 'asha@example.com', roles: ['admin'] }])
          : HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin');

    // 1. redirected to the login screen instead of seeing the page
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    // 2. sign in
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // 3. back where we were, with data behind a token
    expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(await screen.findByText('Asha — asha@example.com (admin)')).toBeInTheDocument();
  });

  it('lets an admin in but denies a viewer with an explanation', async () => {
    // Viewer: the guard refuses before any request is sent.
    renderApp('/admin', viewer);
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to view this page.');

    // Admin: the page loads.
    server.use(
      http.get('/api/admin/users', () => HttpResponse.json([{ id: 'u1', name: 'Asha', email: 'asha@example.com', roles: ['admin'] }])),
    );
    renderApp('/admin', asha);
    expect(await screen.findByRole('list')).toBeInTheDocument();
  });

  it('signs out, clearing storage and returning to the sign-in screen', async () => {
    const user = userEvent.setup();
    renderApp('/', asha);

    expect(await screen.findByText('Welcome, Asha.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(tokenStore.read()).toBeNull();
    expect(await screen.findByText('Welcome, friend.')).toBeInTheDocument();
  });

  it('treats an expired stored session as signed out', async () => {
    tokenStore.write({ ...asha, expiresAt: Date.now() - 1 });
    renderApp('/');

    // No initialSession prop: the provider reads storage, finds it expired and clears it.
    expect(await screen.findByText('Welcome, friend.')).toBeInTheDocument();
    expect(localStorage.getItem('react-lab:session')).toBeNull();
  });

  it('shows a readable message when the admin endpoint rejects the token', async () => {
    server.use(http.get('/api/admin/users', () => HttpResponse.json({ message: 'Unauthorized' }, { status: 403 })));
    renderApp('/admin', asha);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account does not have admin access.');
  });
});
