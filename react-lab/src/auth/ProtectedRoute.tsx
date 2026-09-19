// Part 14 — a client-side guard. It is UX, not security (file 04 says why, loudly).
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { hasRole } from './tokenStore';

export function ProtectedRoute({ role }: { role?: string }) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'anonymous') {
    // Remember where the user was going so login can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role !== undefined && !hasRole(session, role)) {
    return (
      <p role="alert">You do not have permission to view this page.</p>
    );
  }
  return <Outlet />;
}
