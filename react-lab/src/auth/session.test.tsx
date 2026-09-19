import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from './AuthContext';
import { LoginPage } from './LoginPage';
import { ProtectedRoute } from './ProtectedRoute';
import { tokenStore } from './tokenStore';
import { server } from '../test/server';

const future = Date.now() + 60_000;
const session = {
  token: 'token-123',
  refreshToken: 'refresh-456',
  user: { id: 'u1', name: 'Asha', email: 'asha@shop.test', roles: ['admin'] },
  expiresAt: future,
};

function App({ initialSession }: { initialSession?: typeof session | null }) {
  return (
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider initialSession={initialSession}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<p>Home</p>} />
            <Route element={<ProtectedRoute role="admin" />}>
              <Route path="/admin" element={<p>Admin area</p>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('session handling', () => {
  it('redirects to the login page when there is no session, remembering where the user was going', async () => {
    render(<App initialSession={null} />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders a protected route for an authenticated session', async () => {
    render(<App initialSession={session} />);
    expect(await screen.findByText('Admin area')).toBeInTheDocument();
  });

  it('blocks a route when the user lacks the role', async () => {
    render(<App initialSession={{ ...session, user: { ...session.user, roles: ['viewer'] } }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
  });

  it('signs in, stores the session and returns to the intended route', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/auth/login', () => HttpResponse.json(session)));
    render(<App initialSession={null} />);

    await user.type(await screen.findByLabelText('Email'), 'asha@shop.test');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Admin area')).toBeInTheDocument();
    expect(tokenStore.read()?.token).toBe('token-123');
  });

  it('shows a message for wrong credentials and does not store anything', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ message: 'nope' }, { status: 401 })));
    render(<App initialSession={null} />);

    await user.type(await screen.findByLabelText('Email'), 'asha@shop.test');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    expect(tokenStore.read()).toBeNull();
  });

  it('treats an expired stored session as no session at all', () => {
    localStorage.setItem('react-lab:session', JSON.stringify({ ...session, expiresAt: Date.now() - 1 }));
    expect(tokenStore.read()).toBeNull();
    expect(localStorage.getItem('react-lab:session')).toBeNull();
  });
});
