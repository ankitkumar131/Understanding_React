# Project 5 — Authentication App: Register, Login, JWT and Protected Routes

> **Part 17 · Projects · Project 5 of 6**

Why this project exists: almost every real app has a login. Part 14 explained the concepts
(sessions vs tokens, JWT structure, storage trade-offs, guards, roles); this project builds the
whole flow end to end against a real API, with the pieces that are easy to get wrong:
refresh-on-401, return-to redirects, cross-tab logout, and UI that reflects permissions instead
of guessing them.

**Concepts used:** auth context, JWT decode and expiry, token storage, an HTTP client with
refresh, protected routes with `returnTo`, role-gated UI, cross-tab synchronisation, tests.

**Time:** 4–6 hours.

---

## 1. The goal

```text
/register   → create an account, auto-login
/login      → email + password → session
/           → public landing page (shows the user's name when logged in)
/dashboard  → PROTECTED: redirects to /login?returnTo=/dashboard when anonymous
/admin      → PROTECTED + role 'admin' only
```

Requirements: access token in memory + refresh token in an `HttpOnly` cookie **or** both in
`localStorage` (you choose — section 4 explains the trade-off); automatic refresh on 401;
logout everywhere; a "you need permission X" message rather than a silent redirect; roles
driving the UI.

---

## 2. Set up

```bash
npm create vite@latest auth-app -- --template react-ts
cd auth-app
npm install react-router @tanstack/react-query react-hook-form zod @hookform/resolvers
npm install -D json-server
```

`json-server` does not do auth, so we run a **tiny real API** with Node's built-in HTTP server
— no framework, ~60 lines, and you can read every part of it.

```js
// server.mjs  (project root)  →  node server.mjs
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';

const users = new Map();      // email → { id, email, passwordHash, roles }
const refreshTokens = new Set();

const hash = (value) => createHash('sha256').update(value).digest('hex');
const now = () => Math.floor(Date.now() / 1000);

/** A real JWT would be signed with a secret. This one is unsigned-but-shaped, for teaching. */
function makeToken(user, ttlSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email, roles: user.roles,
    iat: now(), exp: now() + ttlSeconds,
  })).toString('base64url');
  return `${header}.${payload}.`;      // empty signature section
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': 'http://localhost:5173',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://localhost:8000');
  const body = await readBody(req);

  if (url.pathname === '/auth/register' && req.method === 'POST') {
    const { email, password, name } = body;
    if (!email || !password) return send(res, 422, { errors: { email: 'Required', password: 'Required' } });
    if (users.has(email)) return send(res, 422, { errors: { email: 'Already registered' } });
    const user = { id: randomUUID(), email, name: name ?? email, passwordHash: hash(password), roles: ['user'] };
    users.set(email, user);
    return login(res, user);
  }

  if (url.pathname === '/auth/login' && req.method === 'POST') {
    const user = users.get(body.email);
    // Same message for "no such user" and "wrong password" — never reveal which accounts exist
    if (!user || user.passwordHash !== hash(body.password ?? '')) {
      return send(res, 401, { message: 'Email or password is incorrect' });
    }
    return login(res, user);
  }

  if (url.pathname === '/auth/refresh' && req.method === 'POST') {
    if (!refreshTokens.has(body.refreshToken)) return send(res, 401, { message: 'Invalid refresh token' });
    const user = [...users.values()].find((u) => u.id === body.userId);
    if (!user) return send(res, 401, { message: 'Unknown user' });
    return login(res, user);
  }

  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    refreshTokens.delete(body.refreshToken);
    return send(res, 204, {});
  }

  if (url.pathname === '/auth/me' && req.method === 'GET') {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    const payload = decode(token);
    if (!payload) return send(res, 401, { message: 'Missing or invalid token' });
    const user = [...users.values()].find((u) => u.id === payload.sub);
    if (!user) return send(res, 401, { message: 'Unknown user' });
    return send(res, 200, { id: user.id, email: user.email, name: user.name, roles: user.roles });
  }

  if (url.pathname === '/admin/stats' && req.method === 'GET') {
    const payload = decode((req.headers.authorization ?? '').replace('Bearer ', ''));
    if (!payload) return send(res, 401, { message: 'Sign in first' });
    if (!payload.roles.includes('admin')) return send(res, 403, { message: 'Admins only' });
    return send(res, 200, { users: users.size });
  }

  send(res, 404, { message: 'Not found' });
}).listen(8000, () => console.log('auth api on http://localhost:8000'));

function login(res, user) {
  const refreshToken = randomUUID();
  refreshTokens.add(refreshToken);
  send(res, 200, {
    token: makeToken(user, 15 * 60),          // 15-minute access token
    refreshToken,                              // in a real app: an HttpOnly cookie, not JSON
    expiresAt: (now() + 15 * 60) * 1000,
    user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
  });
}

function decode(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    return payload.exp > now() ? payload : null;      // expired tokens are not tokens
  } catch { return null; }
}
```

```bash
node server.mjs     # terminal 1
npm run dev         # terminal 2
```

⚠️ **This server is for learning, not for production.** It hashes passwords with plain SHA-256
(real apps use bcrypt/argon2), the JWT is unsigned (real apps sign with a secret), and the
refresh token is returned in JSON (real apps set an `HttpOnly` cookie). Every one of those
shortcuts is deliberate, so you can see the shape of the protocol — and section 9 lists exactly
what to change for production.

---

## 3. Project shape

```text
src/
├── config.ts
├── app/{router.tsx, providers.tsx, main.tsx}
├── features/auth/
│   ├── types.ts
│   ├── tokenStore.ts
│   ├── api/authApi.ts
│   ├── AuthProvider.tsx        # context + the useSession hook
│   ├── permissions.ts          # can(session, 'x:y')
│   ├── components/{LoginForm, RegisterForm, UserMenu}.tsx
│   ├── routes/{RequireAuth, RequireRole}.tsx
│   └── index.ts
├── features/dashboard/{DashboardPage, AdminPage}.tsx
└── shared/lib/{http.ts, apiError.ts}
```

---

## 4. Step 1 — Types and the token store

```ts
// src/features/auth/types.ts
export type Role = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

export interface Session {
  token: string;
  refreshToken: string;
  expiresAt: number;        // epoch ms
  user: User;
}

export interface Credentials {
  email: string;
  password: string;
}
```

```ts
// src/features/auth/tokenStore.ts
import type { Session } from './types';

const KEY = 'auth-app:session';

export const tokenStore = {
  read(): Session | null {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as Session;
      if (typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) {
        localStorage.removeItem(KEY);       // expired → gone, not "probably fine"
        return null;
      }
      return session;
    } catch {
      localStorage.removeItem(KEY);         // corrupt or from an older version
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
```

**Three decisions to defend in a review** (all from Part 14 file 05):

1. **Expiry is checked on every read**, not assumed.
2. **Corrupt data is deleted, not thrown** — a truncated value from an older release must not
   white-screen the app.
3. **One key, one object** — no half-states like "token present, user missing".

💡 **The production version** keeps the access token in a module variable (never in storage)
and the refresh token in an `HttpOnly` cookie. The `localStorage` version here is the common
SPA compromise; section 9 lists what it costs you.

---

## 5. Step 2 — The API module

```ts
// src/features/auth/api/authApi.ts
import { config } from '@/config';
import type { Credentials, Session, User } from '../types';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string; errors?: Record<string, string>;
    };
    throw new AuthApiError(response.status, payload.message ?? 'Request failed', payload.errors ?? {});
  }
  return (await response.json()) as T;
}

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string>,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export const authApi = {
  register: (input: Credentials & { name: string }) => post<Session>('/auth/register', input),
  login: (credentials: Credentials) => post<Session>('/auth/login', credentials),
  refresh: (refreshToken: string, userId: string) => post<Session>('/auth/refresh', { refreshToken, userId }),
  logout: (refreshToken: string) => post<unknown>('/auth/logout', { refreshToken }).catch(() => undefined),
  me: async (token: string): Promise<User> => {
    const response = await fetch(`${config.apiUrl}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new AuthApiError(response.status, 'Session invalid', {});
    return (await response.json()) as User;
  },
};
```

⚠️ **`logout` swallows its own errors.** A logout that fails server-side must still log the
user out locally — otherwise a network blip traps them in a session they cannot leave.

---

## 6. Step 3 — The auth provider

```tsx
// src/features/auth/AuthProvider.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from './api/authApi';
import { tokenStore } from './tokenStore';
import type { Credentials, Session, User } from './types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: Status;
  session: Session | null;
  login: (credentials: Credentials) => Promise<void>;
  register: (input: Credentials & { name: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Called by the HTTP client when a request gets a 401 it could not refresh. */
  forceLogout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  // On boot: restore a stored session, then verify it against the API
  useEffect(() => {
    const stored = tokenStore.read();
    if (!stored) { setStatus('anonymous'); return; }

    let cancelled = false;
    authApi.me(stored.token)
      .then((user) => { if (!cancelled) { setSession({ ...stored, user }); setStatus('authenticated'); } })
      .catch(() => { if (!cancelled) { tokenStore.clear(); setStatus('anonymous'); } });

    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((next: Session) => {
    tokenStore.write(next);
    setSession(next);
    setStatus('authenticated');
  }, []);

  const login = useCallback(async (credentials: Credentials) => {
    persist(await authApi.login(credentials));
  }, [persist]);

  const register = useCallback(async (input: Credentials & { name: string }) => {
    persist(await authApi.register(input));
  }, [persist]);

  const logout = useCallback(async () => {
    const current = tokenStore.read();
    tokenStore.clear();                 // clear locally FIRST — the user is out immediately
    setSession(null);
    setStatus('anonymous');
    if (current) await authApi.logout(current.refreshToken);
  }, []);

  const forceLogout = useCallback(() => {
    tokenStore.clear();
    setSession(null);
    setStatus('anonymous');
  }, []);

  // Cross-tab logout: another tab logged out → this tab follows (Part 14 file 05)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'auth-app:session' && event.newValue === null) forceLogout();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [forceLogout]);

  const value = useMemo(
    () => ({ status, session, login, register, logout, forceLogout }),
    [status, session, login, register, logout, forceLogout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useSession must be used inside <AuthProvider>');
  return context;
}
```

**Line by line**

- **`status: 'loading'` on boot.** This is the detail most tutorials skip: while you are
  checking the stored token, you do not yet know whether the user is logged in. A route guard
  that treats "loading" as "anonymous" flashes the login page for a signed-in user on every
  refresh.
- **Verify the stored token with `/auth/me`.** Storage can hold a token the server has revoked.
  Trusting storage alone means a revoked session looks valid until its first API call fails.
- **`cancelled` flag in the effect** — the standard cleanup for an async effect (Part 4 file 03).
- **Clear locally, then call the API** in `logout`. The user's experience must not depend on
  the network.
- **`useMemo` on the context value** — without it, a new object identity on every render
  re-renders every consumer (Part 10 file 03).
- **The `storage` event** fires in *other* tabs, not the one that made the change — which is
  exactly what you want for cross-tab logout.

⚠️ **`throw` when the context is missing** turns "I forgot the provider" from a confusing
`Cannot read properties of null` into an error that names the fix.

---

## 7. Step 4 — Protected routes

```tsx
// src/features/auth/routes/RequireAuth.tsx
import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useSession } from '../AuthProvider';
import { Spinner } from '@/shared/ui/Spinner';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();

  // 1. Still checking the stored token → wait, do not flash the login page
  if (status === 'loading') return <Spinner label="Checking your session" />;

  // 2. Not signed in → login, remembering where they were going
  if (status === 'anonymous') {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}
```

```tsx
// src/features/auth/routes/RequireRole.tsx
import type { ReactNode } from 'react';
import { useSession } from '../AuthProvider';
import { can } from '../permissions';

interface RequireRoleProps {
  permission: string;
  children: ReactNode;
}

export function RequireRole({ permission, children }: RequireRoleProps) {
  const { session } = useSession();

  // A signed-in user who lacks the permission gets an EXPLANATION, not a silent redirect.
  if (!can(session, permission)) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h1>You do not have access</h1>
        <p>
          This page needs the <code>{permission}</code> permission. Ask an administrator if you
          believe you should have it.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
```

```ts
// src/features/auth/permissions.ts
import type { Session } from './types';

type Check = (session: Session | null) => boolean;

/** `satisfies` keeps the record typed AND catches a typo'd permission name at compile time. */
const rules = {
  'dashboard:view': (s) => s !== null,
  'admin:view': (s) => s?.user.roles.includes('admin') ?? false,
} satisfies Record<string, Check>;

export type Permission = keyof typeof rules;

export function can(session: Session | null, permission: Permission): boolean {
  return rules[permission](session);
}
```

**Line by line**

- `returnTo` — after login the user goes **where they were trying to go**, not to a fixed
  page. `encodeURIComponent` matters: a path with a query string would otherwise break the
  redirect (Part 6 file 07).
- The three-way branch on `status` is the whole guard. Getting "loading" wrong is the most
  common auth UX bug in React.
- `RequireRole` renders a *reason* instead of redirecting. "You cannot see this" is a support
  ticket; "You need permission `admin:view`" is a solved problem (Part 14 file 06).
- `satisfies Record<string, Check>` — a typo in a permission name is now a compile error, and
  `Permission` is derived from the rules so the UI cannot ask for a permission that does not
  exist.

---

## 8. Step 5 — Login, the router, and the HTTP client

```tsx
// src/features/auth/components/LoginForm.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { Link } from 'react-router';
import { z } from 'zod';
import { AuthApiError } from '../api/authApi';
import { useSession } from '../AuthProvider';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues): Promise<void> {
    try {
      await login(values);
      // Never trust returnTo blindly — an absolute URL is an open redirect
      const returnTo = searchParams.get('returnTo');
      const safe = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
      navigate(safe, { replace: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 401) {
        setError('root', { message: error.message });
      } else {
        setError('root', { message: 'Something went wrong. Please try again.' });
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h1>Sign in</h1>

      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="email" {...register('email')} aria-invalid={!!errors.email} />
      {errors.email && <p role="alert">{errors.email.message}</p>}

      <label htmlFor="password">Password</label>
      <input id="password" type="password" autoComplete="current-password"
             {...register('password')} aria-invalid={!!errors.password} />
      {errors.password && <p role="alert">{errors.password.message}</p>}

      {errors.root && <p role="alert">{errors.root.message}</p>}

      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
      <p>No account? <Link to="/register">Register</Link></p>
    </form>
  );
}
```

⚠️ **The open-redirect check is not paranoia.** Without it, an attacker sends
`/login?returnTo=https://evil.example` and your app, after a successful login, navigates the
user to a phishing site that looks like it came from you. Requiring a single leading `/` and
rejecting `//` closes it.

```tsx
// src/app/router.tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RequireAuth } from '@/features/auth/routes/RequireAuth';
import { RequireRole } from '@/features/auth/routes/RequireRole';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { AppLayout } from './AppLayout';

const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const Admin = lazy(() => import('@/features/dashboard/AdminPage'));

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/login', element: <LoginForm /> },
      { path: '/register', element: <RegisterForm /> },
      {
        path: '/dashboard',
        element: (
          <RequireAuth>
            <RequireRole permission="dashboard:view">
              <Suspense fallback={<p>Loading…</p>}><Dashboard /></Suspense>
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequireAuth>
            <RequireRole permission="admin:view">
              <Suspense fallback={<p>Loading…</p>}><Admin /></Suspense>
            </RequireRole>
          </RequireAuth>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function Home() {
  return <main style={{ padding: '2rem' }}><h1>Welcome</h1><p>A demo app with real auth.</p></main>;
}
```

```ts
// src/shared/lib/http.ts — with automatic refresh on 401
import { config } from '@/config';
import { ApiError } from './apiError';
import { tokenStore } from '@/features/auth/tokenStore';
import { authApi } from '@/features/auth/api/authApi';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const first = await send<T>(path, init);
  if (first.status !== 401) return first.body as T;

  // One refresh attempt, then give up
  const session = tokenStore.read();
  if (!session) throw new ApiError('auth', 'Sign in to continue', 401);

  try {
    const refreshed = await authApi.refresh(session.refreshToken, session.user.id);
    tokenStore.write(refreshed);
    const retry = await send<T>(path, init);
    if (!retry.ok) throw new ApiError('auth', 'Session expired', retry.status);
    return retry.body as T;
  } catch {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent('auth:expired'));   // the provider listens and logs out
    throw new ApiError('auth', 'Your session has ended. Please sign in again.', 401);
  }
}

async function send<T>(path: string, init: RequestInit) {
  const session = tokenStore.read();
  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        ...init.headers,
      },
    });
    return { ok: response.ok, status: response.status, body: response.ok ? await response.json() as T : null };
  } catch {
    throw new ApiError('network', 'Cannot reach the server.', null);
  }
}
```

⚠️ **One refresh, not a loop.** Retrying the refresh repeatedly on a persistently-401ing
endpoint produces an infinite request loop that will take your API down. Refresh once, then
fail loudly and log the user out.

---

## 9. Run it, and what to change for production

```bash
node server.mjs    # terminal 1
npm run dev        # terminal 2
```

```text
/register  → create an account → auto-logged-in, /dashboard works
/dashboard → works; the nav shows your name and a Logout button
/admin     → "You do not have access — needs admin:view"
Logout     → /dashboard now redirects to /login?returnTo=%2Fdashboard
Log back in → you land on /dashboard, not on /
```

Try the expiry path: in `server.mjs` change the access-token TTL from `15 * 60` to `10`, wait,
then hit `/dashboard` — the client refreshes transparently.

```bash
npx tsc -b --noEmit && npm run lint
```

**What to change before this touches real users**

| Teaching shortcut | Production replacement |
| --- | --- |
| SHA-256 password hash | `argon2id` or `bcrypt` with a per-user salt |
| Unsigned JWT (`alg: none`) | Signed (HS256) or better, asymmetric (RS256/EdDSA) |
| Refresh token in JSON | `HttpOnly`, `Secure`, `SameSite=Lax` cookie |
| Access token in `localStorage` | In-memory + refresh cookie (Part 14 file 05) |
| In-memory user map | A real database, with unique constraints |
| No rate limiting | Rate-limit `/auth/login` and `/auth/register` |
| CORS allows one origin, hardcoded | Configured per environment |
| No refresh rotation | Rotate the refresh token on every use; reuse = revoke |

🏭 **And the sentence that matters in every interview:** client-side route guards are a UX
feature. Every protected endpoint on the server must check the token and the role again,
because the client is fully under the attacker's control (Part 15 file 06).

---

## 10. Exercises

### Beginner
1. Add a `UserMenu` that shows the user's name, their roles, and a Logout button.
2. Hide the "Admin" nav link when `can(session, 'admin:view')` is false.

### Intermediate
1. Add proactive refresh: a timer that refreshes 60 seconds before `expiresAt`.
2. Make an admin: add a `POST /auth/promote` endpoint (guarded) and a button only admins see.
   Write down what the server must check.

### Challenge
1. Implement the memory + cookie variant: access token in a module variable, refresh token in
   an `HttpOnly` cookie. What breaks on a page refresh, and how do you fix it?
2. Write tests: an anonymous user hitting `/dashboard` lands on `/login?returnTo=…`; a
   signed-in user does not; a `user`-role session sees the "no access" message on `/admin`.

---

## 11. Solutions

### Beginner
1. ```tsx
   const { session, logout } = useSession();
   if (!session) return <Link to="/login">Sign in</Link>;
   return <span>{session.user.name} <button onClick={() => void logout()}>Log out</button></span>;
   ```
2. `navItems.filter((item) => can(session, item.permission))` — the same rules drive the nav
   and the routes, so they cannot disagree.

### Intermediate
1. ```ts
   useEffect(() => {
     if (!session) return;
     const ms = session.expiresAt - Date.now() - 60_000;
     if (ms <= 0) return;
     const timer = setTimeout(() => void refresh(), ms);
     return () => clearTimeout(timer);
   }, [session]);
   ```
   Proactive refresh is an *optimisation* — the 401 path must still exist, because clocks
   drift and tokens get revoked (Part 14 file 03).
2. The server must check that the *caller's* token has an admin role — not that the request
   body says `role: 'admin'`. Accepting a role from the client is the classic privilege
   escalation bug.

### Challenge
1. On refresh, the in-memory access token is gone, so the app boots "anonymous". The fix is
   the boot sequence in section 6: call `/auth/me` (the browser attaches the `HttpOnly` cookie
   automatically) and rebuild the session from the response. That call is also what makes
   revocation effective.
2. ```tsx
   it('redirects an anonymous user and remembers where they were going', () => {
     renderWithRouter('/dashboard');
     expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
     expect(window.location.search).toContain('returnTo=%2Fdashboard');
   });
   ```
   Test the *loading* state too: a signed-in user must see the spinner, not the login form.

---

## 12. What you proved you can do

- [ ] Model a session as one typed object with an expiry.
- [ ] Restore, verify and clear a session, handling corrupt and expired data.
- [ ] Build an auth context with a three-state status, including `loading`.
- [ ] Guard routes with `returnTo`, and validate the redirect target.
- [ ] Refresh once on 401 and log out cleanly when that fails.
- [ ] Drive the UI from a typed permission map instead of inline role checks.
- [ ] Explain why client guards are UX and server checks are security.
- [ ] List exactly what you would change to make a demo auth server production-safe.

---

**What's next →** [`06-production-react-app.md`](./06-production-react-app.md) — the final
project. Everything from Parts 1–16 in one application: feature architecture, auth, routing,
server state, forms, error handling, logging, tests, environment configuration, and a
deployment you can put on your CV.
