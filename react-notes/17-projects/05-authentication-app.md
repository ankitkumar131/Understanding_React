# 05 — Project: Authentication App (Register, Session, Guards, Roles)

> **Part 17 · Projects · File 5 of 7**

Why this project: authentication is the first feature that changes *every other screen*. Who is the user? Is the answer still loading? What happens when a route needs a signed-in user and there is none? What may an admin see that a viewer may not? This project builds the whole flow against a mock API — register, sign in, restore a stored session, guard a route while remembering where the visitor was going, gate a page by role, sign out, and treat an expired token as "signed out" — and then tests the failures, because authentication is mostly about the failure paths.

⚠️ **The single most important sentence in this file**, repeated from Part 15, file 06 because it is load-bearing: **anything enforced only in the browser is not security.** A route guard prevents a *confusing experience*; the API's authorization check prevents *data loss*. Every guard you write here is UX, and the tests prove the API is the real boundary.

Measured: the project's tests run in **1.3 s** (7 tests) in this lab's suite — [`react-lab/evidence/part17-projects.txt`](../../react-lab/evidence/part17-projects.txt).

---

## 1. Requirements

| # | Requirement | The skill |
| --- | --- | --- |
| 1 | Register with name, email, password | a form action with server errors |
| 2 | A successful registration signs the user in | adopting a session the app obtained outside `login()` |
| 3 | A duplicate email shows a *field* error, not a crash | mapping 409 to a field, 400 to a form message |
| 4 | Sign in, sign out, and stay signed in across a reload | session in `localStorage` with an expiry |
| 5 | A protected route redirects anonymous visitors to `/login` and **returns them** afterwards | redirect with remembered destination |
| 6 | An admin-only page refuses a viewer with an explanation | role-based UI (and no `role="alert"` shrugs) |
| 7 | An expired stored session counts as signed out | expiry checked on read |
| 8 | A 403 from the API shows a readable message | the server is the authority |
| 9 | Three statuses, not a boolean | `loading` / `anonymous` / `authenticated` |
| 10 | Nothing is stored when a request fails | "clean up after a failed write" |

---

## 2. The file tree

```text
src/auth/                          # the session primitives (built in Part 14 — reused here)
├── tokenStore.ts                  # Session type, read/write/clear, hasRole(), expiry check
├── AuthContext.tsx                # status + session + login/logout/adoptSession, useAuth()
├── ProtectedRoute.tsx             # the guard: loading, anonymous → redirect, role check
├── LoginPage.tsx                  # the sign-in form
└── session.test.tsx               # Part 14's tests for the context and store

src/projects/auth-app/
├── RegisterPage.tsx               # useActionState: pending state, field errors, adoptSession
├── AdminPage.tsx                  # a role-gated page calling a protected endpoint
├── App.tsx                        # routes, layout, nested guards
└── auth-app.test.tsx              # 7 tests for the flows below
```

The `auth/` folder stays outside `projects/` because authentication is *shared infrastructure*, not a feature of one screen — the capstone project (file 06) imports the very same `AuthProvider` and `ProtectedRoute`.

---

## 3. The session: what is stored, and when it stops mattering

```ts
// src/auth/tokenStore.ts
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
```

Four decisions worth defending in a review:

| Decision | Why |
| --- | --- |
| An **absolute expiry timestamp**, not "expires in 3600 s" | the stored value must still be meaningful after the app was closed for a week |
| Checking expiry **on read**, and deleting the entry | otherwise an expired session looks valid until the first API call fails |
| Corrupt JSON → delete and return `null` | the same defensive rule as the todo app's storage |
| `hasRole(session, role)` as a function | one place that knows the shape of roles, and it handles the `null` session case |

⚠️ **Where the token lives is a security trade-off, not a detail.** `localStorage` is readable by any script that runs on the page (XSS → token theft); an `HttpOnly` cookie is not readable by JavaScript but needs CSRF protection and same-site configuration. This project uses `localStorage` because it is a teaching app with a mock API; Part 15, file 06 lays out the alternatives. What you should *never* do is claim that one is safe and the other is not — they trade one attack for another.

---

## 4. The context: a status, not a boolean

```tsx
// src/auth/AuthContext.tsx (the parts that matter)
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export function AuthProvider({ children, initialSession }: { children: ReactNode; initialSession?: Session | null }) {
  const [session, setSession] = useState<Session | null>(initialSession ?? null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = initialSession !== undefined ? initialSession : tokenStore.read();
    setSession(stored);
    setStatus(stored === null ? 'anonymous' : 'authenticated');
  }, [initialSession]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
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

  const logout = useCallback(() => { tokenStore.clear(); setSession(null); setStatus('anonymous'); }, []);

  const value = useMemo<AuthValue>(() => ({ status, session, error, login, adoptSession, logout }), [status, session, error, login, adoptSession, logout]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
```

**Why three statuses and not `isLoggedIn: boolean`?** Because on the first render the app genuinely does not know yet: reading `localStorage` happens in an effect *after* the first paint. With a boolean, that moment has to be guessed — usually as "not signed in" — and the app flashes the sign-in page at a signed-in user every time they refresh. With `loading`, the guard can render "Checking your session…" and no wrong screen is ever shown. This is the same union-type reasoning as the weather app's four states (file 03), applied to identity.

**`adoptSession` exists because registration is a login.** `login()` posts to `/api/auth/login`; registration returns a session too, but through a different endpoint. Rather than duplicating the "store the session and flip the status" logic inside `RegisterPage`, the context exposes one method that means exactly that — *adopt this session*. The lab measured the alternative: duplicating the three lines in the page worked, but then the register flow forgot to clear a stale `error` from a previous failed sign-in, and the UI showed a ghost error. One method, one place, one behaviour.

---

## 5. The guard: redirect *and remember*

```tsx
// src/auth/ProtectedRoute.tsx
export function ProtectedRoute({ role }: { role?: string }) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'anonymous') {
    // Remember where the user was going so login can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role !== undefined && !hasRole(session, role)) {
    return <p role="alert">You do not have permission to view this page.</p>;
  }
  return <Outlet />;
}
```

```tsx
// src/projects/auth-app/App.tsx (the route table, which reads as prose)
<Routes>
  <Route path="/" element={<p>Welcome, {session?.user.name ?? 'friend'}.</p>} />

  {/* Nested guards: signed in first, then the role. */}
  <Route element={<ProtectedRoute />}>
    <Route element={<ProtectedRoute role="admin" />}>
      <Route path="/admin" element={<AdminPage />} />
    </Route>
  </Route>

  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="*" element={<p role="alert">Page not found.</p>} />
</Routes>
```

| Detail | Why it matters |
| --- | --- |
| `state={{ from: location.pathname }}` | after signing in, `LoginPage` reads `location.state?.from ?? '/'` and navigates back — the "return to where you were" behaviour every user expects |
| `replace` on the redirect | the guarded URL must not stay in history, or the back button bounces the user into another redirect |
| Nested guards | the outer one answers "is anybody signed in?"; the inner one answers "may *this* user see it?" — two questions, two components, and the failure messages differ (redirect versus permission) |
| A permission message that is not a redirect | redirecting a signed-in viewer away from a page they can see a link to is more confusing than saying why |
| `*` route last | a typo shows a real not-found screen (file 04's rule) |

⚠️ **The guard is not security.** `curl /api/admin/users` with a valid viewer token must return **403 from the server** — and that is exactly what test 7 asserts, and what the `AdminPage` handles:

```tsx
if (response.status === 403) throw new Error('Your account does not have admin access.');
if (!response.ok) throw new Error(`Could not load members (${response.status}).`);
```

---

## 6. Registration with `useActionState`

```tsx
// src/projects/auth-app/RegisterPage.tsx (abridged to the interesting half)
const [state, submit, isPending] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
  const body = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  };

  try {
    const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    if (response.status === 201) {
      const session = (await response.json()) as Session;
      adoptSession(session);                       // the registration response *is* a login
      void navigate('/', { replace: true });
      return initialState;
    }

    if (response.status === 409) {
      return { formError: null, fieldErrors: { email: 'That email is already registered. Sign in instead?' } };
    }

    const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
    return { formError: errorBody.message ?? `Registration failed (${response.status}).`, fieldErrors: errorBody.errors ?? {} };
  } catch {
    return { formError: 'Network error — check your connection and try again.', fieldErrors: {} };
  }
}, initialState);

return (
  <form>
    {state.formError !== null && <p role="alert">{state.formError}</p>}
    <label htmlFor="email">Email</label>
    <input id="email" name="email" type="email" autoComplete="email" aria-invalid={state.fieldErrors.email !== undefined} />
    {state.fieldErrors.email !== undefined && <p role="alert">{state.fieldErrors.email}</p>}
    {/* …name, password… */}
    <button type="submit" formAction={submit} disabled={isPending}>
      {isPending ? 'Creating account…' : 'Create account'}
    </button>
  </form>
);
```

What `useActionState` buys you here, concretely:

| Without it | With it |
| --- | --- |
| `const [pending, setPending] = useState(false)` and a `try/finally` around the fetch | `isPending` comes from React, and it is correct even if the component re-renders mid-flight |
| `const [fieldErrors, setFieldErrors] = useState({})` plus the same for a form error | one `state` object returned by the action |
| `event.preventDefault()` and manual `new FormData(event.target)` | the action receives the `FormData` |
| A `useEffect` to navigate after success | navigate inside the action, where the success is known |
| Uncontrolled inputs whose values you read only at submit (fine!) | the same, plus automatic **form reset** after a successful action when the inputs are uncontrolled |

Note what did **not** change: the inputs are still uncontrolled (`name` + `formData.get`), so React does not re-render the form on every keystroke — a genuine advantage for a long form, and the reason `useActionState` pairs naturally with `name`-based fields (Part 11, file 04).

⚠️ **The version-agnostic alternative** if you cannot use React 19's actions: `onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); … }}` with your own `isPending` state. The behaviour is the same; you write the four pieces React now provides. Do not let anyone tell you the `onSubmit` pattern is wrong — it is *documented*, just more manual (Part 11's `<form action>` reference work is the source here).

---

## 7. Run it

```bash
npm install
npm run dev        # sign in at /login, register at /register, try /admin as a viewer
npm test -- --run src/projects/auth-app
```

The API is faked in tests with MSW. To click through the app in a browser, add a dev-only mock for `/api/auth/*` (the capstone's `src/dev/mock-api.ts` shows the pattern) or point `VITE_API_URL` at a real backend (Part 16, file 04).

---

## 8. The tests: the flows, and the failures

```text
 ✓ src/projects/auth-app/auth-app.test.tsx (7 tests) 1.3s
```

| # | Test | What it proves |
| --- | --- | --- |
| 1 | registers a new user, adopts the session and lands on the dashboard | the happy path: action → 201 → `adoptSession` → `navigate('/')` |
| 2 | shows a field error when the email is already registered and stores nothing | 409 → the email field's message, **and** `localStorage` stays empty |
| 3 | blocks the team page for an anonymous visitor and returns there after sign-in | guard + `state.from` + redirect back |
| 4 | lets an admin in but denies a viewer with an explanation | nested role guard, two different outcomes |
| 5 | signs out, clearing storage and returning to the sign-in screen | `logout` clears the store *and* the UI |
| 6 | treats an expired stored session as signed out | the expiry check in `tokenStore.read` |
| 7 | shows a readable message when the admin endpoint rejects the token | 403 handled as a message, not a crash |

```tsx
it('shows a field error when the email is already registered and stores nothing', async () => {
  server.use(http.post('/api/auth/register', () => HttpResponse.json({ message: 'Email taken' }, { status: 409 })));
  const user = userEvent.setup();
  render(<App initialSession={null} />, { wrapper: RouterAt('/register') });

  await user.type(screen.getByLabelText('Name'), 'Asha');
  await user.type(screen.getByLabelText('Email'), 'asha@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  expect(await screen.findByText('That email is already registered. Sign in instead?')).toBeInTheDocument();
  expect(localStorage.getItem('react-lab:session')).toBeNull();     // nothing half-written
});
```

💡 Two testing techniques worth stealing. First, **assert the negative side effect** (`localStorage` is still `null`): a failed registration must not leave a partial session behind, and without that line the test passes even if the code writes a session before checking the status. Second, **`initialSession` as a prop** lets a test start *already signed in* (or with an expired session) without mocking `localStorage` — test setup becomes data, not a simulation of a browser.

---

## 9. Common mistakes in this project

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `isLoggedIn: boolean` | the sign-in page flashes on every refresh | `loading` / `anonymous` / `authenticated` |
| 2 | Trusting a guard as security | the API is open to anyone with `curl` | enforce authorization server-side; the guard is UX |
| 3 | Reading `localStorage` during render | different values on the server and the client, plus hydration errors | read it in an effect (or pass it in as `initialSession`) |
| 4 | Not checking expiry | a user appears signed in until the first 403 | absolute `expiresAt`, checked on read |
| 5 | Redirecting without `replace` | the back button loops through the redirect | `<Navigate replace … />` |
| 6 | Not remembering the destination | the user is dumped on the dashboard after signing in | `state={{ from }}` and navigate back to it |
| 7 | One guard doing both jobs | "not signed in" and "not allowed" look identical | nested guards, distinct messages |
| 8 | Storing the token in a way that survives logout | the next request is authenticated as the old user | clear storage in one place (`logout`) |
| 9 | Showing field errors for form-level failures (and vice versa) | the user cannot tell what to fix | map 4xx shapes to the right place |
| 10 | A second copy of the session in a component's `useState` | the header says "signed in" after a logout | the context is the single source |
| 11 | `password` echoed back or logged | credentials in logs and error reports | never log the body; redact in the logger (Part 15, file 05) |
| 12 | Tests that rely on the real `localStorage` contents | order-dependent failures | clear it in `beforeEach`; pass `initialSession` where possible |

---

## 10. Practice (extend the project)

### Beginner

1. Add a "Remember me" checkbox that stores the session in `sessionStorage` when unchecked and `localStorage` when checked, with a test for each.
2. Show the signed-in user's name and roles in the header, and hide the "Team" link for non-admins (remembering that hiding is UX, not protection).
3. Add a password-strength hint under the password field, computed as the user types (controlled input here is fine — one field).

### Intermediate

1. Add refresh-on-401: when a request fails with 401 and a `refreshToken` exists, call `/api/auth/refresh`, adopt the new session and retry the original request once. Test both the success and the "refresh also fails → sign out" paths.
2. Add multi-tab sync: listen for the `storage` event, so signing out in one tab signs out in the others. What does the test look like?
3. Make the register form use `useOptimistic` to show the new user's name immediately while the request is in flight, rolling back on failure.

### Challenge

1. Move the admin page from `fetch`+`useEffect` to TanStack Query (`useQuery({ queryKey: ['admin','users'], queryFn })`), add a global 401 handler that signs the user out, and explain which part became simpler and which part moved (the interceptor/`QueryCache` `onError` hook).
2. Write the security review: for this app, list every way an attacker could act as an admin, and say which layer stops each one — starting with `curl`, not with the UI.
3. Implement route-level `loader`-based protection (React Router data mode, Part 6 file 08) and compare: what changes for a slow API (the redirect happens before the component renders), and what happens to the "remember where you were" behaviour.

---

## 11. Solutions

### Beginner

1. A `storage` parameter inside `tokenStore` reading from the chosen store; the tests assert that the unchecked case leaves `localStorage` empty and the checked case fills it. Note the trap: on sign-in you must *read back* from the same place you wrote.
2. `hasRole(session, 'admin') && <Link to="/admin">Team</Link>`, plus the guard still in place. Add a comment saying the link's absence is a courtesy.
3. A small `scorePassword(value)` returning `weak | fair | strong`, rendered with `aria-live="polite"`. It is a *hint*, not validation — the server decides.

### Intermediate

1. A `request()` wrapper (Part 17, file 04's API module) gains: on 401 with a refresh token, call refresh, adopt, and retry once with a flag to prevent loops. Test 1: 401 → refresh 200 → retry 200 → the data renders and `tokenStore` holds the new token. Test 2: refresh 401 → `logout()` and the sign-in screen appears. This is where a "one place for fetch" design pays for itself.
2. `window.addEventListener('storage', handler)` inside an effect in `AuthProvider`; the handler re-reads the store and updates the state (or logs out when the value is `null`). The test dispatches a `StorageEvent` manually — jsdom does not fire cross-tab events for you.
3. `useOptimistic(session, (current, next) => next)` with the new user object shown while the action runs; on failure the optimistic value reverts automatically. The test asserts the name appears before the response resolves (use a delayed MSW handler) and disappears when the handler returns 400.

### Challenge

1. `useQuery` removes the `useState`/`useEffect`/`AbortController` trio and adds caching across navigations; the 401 handling moves into a `QueryCache` `onError` (the query client's global error path) because you do not want to write it in every `queryFn`. What became simpler: the component. What moved: policy — from the page to the client configuration, where it belongs.
2. The list starts with "send the request directly" (the UI is irrelevant), then cookie/JWT handling, XSS-based token theft, CSRF, a stale token after a role change (fixed by short token lifetimes plus refresh, and by re-checking roles server-side on every request), and finally logging/leaks. Every item that is stopped only by the UI is a finding.
3. With a `loader` that throws `redirect('/login?from=…')`, the redirect happens *before* the component renders, so no "Checking your session…" flash and no double render. The cost: the state you want for "remember where you were" now travels in the URL (or in a cookie), and each protected route needs the loader wired (or a shared one).

---

## 12. Summary

- **Three statuses, never a boolean**: `loading` / `anonymous` / `authenticated` — the flash of the sign-in page at a refreshing user is the bug this prevents.
- **The session is data with an expiry**: an absolute `expiresAt` checked on read, corrupt values deleted, and one `hasRole()` helper.
- **One place owns the session** (`AuthContext`) with `login`, `logout` and `adoptSession`; the register flow reuses `adoptSession` instead of duplicating the three lines that store a session (which had already started to drift).
- **`useActionState` turns a form into an action**: `isPending` for free, `FormData` in, a state object out, navigation inside the action, and uncontrolled inputs that do not re-render per keystroke.
- **The guard redirects and remembers** (`state={{ from }}`, `replace`), and it is **UX, not security** — the 403 from the API is what actually protects the admin data, and the tests assert both layers.
- **Nested guards** separate "signed in?" from "allowed?", which is why an anonymous visitor is redirected while a viewer gets a sentence explaining the refusal.
- **Test the negative side effects**: a failed registration stores nothing; an expired session is treated as signed out; a 403 becomes a message. Seven tests, 1.3 s, all of the failure paths a reviewer would ask about.

---

**What's next →** [`06-production-react-app.md`](./06-production-react-app.md) is the capstone: the task app that combines everything — feature folders, a typed API layer, server state with optimistic updates and rollback, an error boundary, a lazily loaded reports page, the auth context you just built, a dev-only mock backend, and a production build with a measured bundle budget.
