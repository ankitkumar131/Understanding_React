// Project 5 — the app shell: routes, a guard, and a navigation that respects the session.
import { Link, Outlet, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { LoginPage } from '../../auth/LoginPage';
import { ProtectedRoute } from '../../auth/ProtectedRoute';
import { AdminPage } from './AdminPage';
import { RegisterPage } from './RegisterPage';
import type { Session } from '../../auth/tokenStore';

function Layout() {
  const { status, session, logout } = useAuth();

  return (
    <>
      <nav aria-label="Main">
        <Link to="/">Dashboard</Link>{' '}
        <Link to="/admin">Team</Link>{' '}
        {status === 'anonymous' ? (
          <><Link to="/login">Sign in</Link>{' '}<Link to="/register">Register</Link></>
        ) : (
          <button type="button" onClick={logout}>Sign out</button>
        )}
      </nav>

      <main>
        <Routes>
          {/* Public: anybody may see the dashboard; the name is simply not there when signed out. */}
          <Route path="/" element={<p>Welcome, {session?.user.name ?? 'friend'}.</p>} />

          {/* Protected: the guard redirects anonymous visitors to /login, remembering the target. */}
          <Route element={<ProtectedRoute />}>
            <Route element={<ProtectedRoute role="admin" />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<p role="alert">Page not found.</p>} />
        </Routes>
      </main>

      <Outlet />
    </>
  );
}

export function App({ initialSession }: { initialSession?: Session | null }) {
  return (
    <AuthProvider initialSession={initialSession}>
      <Layout />
    </AuthProvider>
  );
}
