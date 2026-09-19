// Part 14 — the session as React state, with a status that distinguishes
// "loading", "anonymous" and "authenticated" (file 01 explains why that matters).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tokenStore, type Session } from './tokenStore';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthValue {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  /** Adopt a session the app obtained another way (e.g. after registration). */
  adoptSession: (session: Session) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children, initialSession }: { children: ReactNode; initialSession?: Session | null }) {
  const [session, setSession] = useState<Session | null>(initialSession ?? null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  // Restore the stored session once, on mount (never during render — Part 4).
  useEffect(() => {
    const stored = initialSession !== undefined ? initialSession : tokenStore.read();
    setSession(stored);
    setStatus(stored === null ? 'anonymous' : 'authenticated');
  }, [initialSession]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? 'Wrong email or password.' : `Sign-in failed (${response.status}).`);
        return false;
      }
      const session = (await response.json()) as Session;
      tokenStore.write(session);
      setSession(session);
      setStatus('authenticated');
      return true;
    } catch {
      setError('Network error — check your connection and try again.');
      return false;
    }
  }, []);

  const adoptSession = useCallback((session: Session) => {
    tokenStore.write(session);
    setSession(session);
    setStatus('authenticated');
    setError(null);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setSession(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, session, error, login, adoptSession, logout }),
    [status, session, error, login, adoptSession, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
