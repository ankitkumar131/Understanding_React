// Part 14 — where the session lives on the client, and when it expires.
export interface Session {
  token: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; roles: string[] };
  /** Absolute ms timestamp when `token` stops being valid. */
  expiresAt: number;
}

const KEY = 'react-lab:session';

export const tokenStore = {
  read(): Session | null {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    try {
      const session = JSON.parse(raw) as Session;
      if (session.expiresAt <= Date.now()) {
        localStorage.removeItem(KEY);
        return null;                       // expired sessions are not sessions
      }
      return session;
    } catch {
      localStorage.removeItem(KEY);        // corrupt data must not crash the app
      return null;
    }
  },
  write(session: Session): void {
    localStorage.setItem(KEY, JSON.stringify(session));
  },
  clear(): void {
    localStorage.removeItem(KEY);
  },
};

export function hasRole(session: Session | null, role: string): boolean {
  return session?.user.roles.includes(role) ?? false;
}
