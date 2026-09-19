# 05 — Token Management: Storage, Expiry, Logout and Cross-Tab Behaviour

> **Part 14 · Authentication · File 5 of 6**

Why this file exists: everything in files 01–04 assumes a session exists somewhere. This file is that somewhere — the store — and it is where the security trade-offs of the whole part come to rest. It covers the lab's implementation (`src/auth/tokenStore.ts`) with its measured tests, the storage comparison with real consequences, expiry handling (including the corrupt-data and clock cases people forget), logout that actually logs out, what happens with multiple tabs, and a review checklist you can apply to any auth implementation in twenty minutes.

Measured from this lab: `npx vitest run src/auth/session.test.tsx` → **6 tests, 1.73 s**, including `treats an expired stored session as no session at all` (1 ms) and `shows a message for wrong credentials and does not store anything` (117 ms).

---

## 1. The store, line by line

```ts
// src/auth/tokenStore.ts
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
```

Five decisions worth defending in review:

1. **One key, one object.** The session (token, refresh token, user, expiry) is a single value. Storing them separately invites half-states ("token present, user missing").
2. **`read()` validates on every read** — expiry is checked, not assumed. The measured test writes a session with `expiresAt: Date.now() - 1`, reads it, and asserts both that `null` is returned **and** that the key was removed — so an expired session cannot be resurrected by a later read.
3. **Corrupt data is deleted, not thrown.** A `try/catch` around `JSON.parse` plus a typed accessor means a truncated value from another version of the app cannot white-screen the user. (Deleting is also the honest move: you cannot migrate what you cannot parse.)
4. **Expiry is data, not inference.** The API returns `expiresAt`, and the client stores it; you never guess from `token.length`.
5. **`clear()` is one function** so logout, a failed refresh, and a 403 can all call the same thing (file 03).

⚠️ **A version field is worth adding in a real app**: `{ v: 2, … }` plus a migration step. The day you change the session shape, users with the old shape in storage are either migrated or cleared deliberately — not accidentally.

---

## 2. Where to store it: the decision, with consequences

| Storage | Readable by injected JS? | Survives refresh | Sent automatically | The realistic risk |
| --- | --- | --- | --- | --- |
| `HttpOnly` cookie | ❌ no | ✅ | ✅ (same origin) | CSRF (mitigated by `SameSite` + tokens) |
| `localStorage` | ✅ **yes** | ✅ | ❌ (you attach it) | any XSS steals the session |
| `sessionStorage` | ✅ yes | ❌ (per tab) | ❌ | same as `localStorage`, smaller window |
| In memory (module/state) | ✅ yes, but not stored | ❌ | ❌ | lost on refresh; requires refresh-token cookie to stay logged in |

```ts
// The memory + cookie pattern: access token in memory, refresh token in a cookie
let accessToken: string | null = null;      // module scope: gone on refresh, invisible to storage scrapers (not to XSS)

export async function login(credentials: Credentials): Promise<void> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',                 // ← the refresh cookie, if the API is cross-origin
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const { token, expiresAt, user } = (await response.json()) as LoginResponse;
  accessToken = token;                      // never written to storage
  setUser(user);                            // React state (Part 9)
  // The refresh token arrived as an HttpOnly cookie; JS cannot see it, and does not need to.
}
```

The honest summary of the trade-off, in one sentence to give a reviewer: **`localStorage` is convenient and turns any XSS into full session theft; cookies remove the theft-by-scraping risk at the cost of CSRF care; memory is safest but needs a refresh cookie to survive a refresh.**

💡 If you must use `localStorage` (very common in SPAs against a separate API), reduce the blast radius: 5–15 minute access tokens, refresh rotation, a strict CSP (Part 15, file 06), a short session lifetime, an "active sessions" screen the user can revoke, and monitoring for impossible-travel style anomalies on the server.

---

## 3. Expiry: the four cases

| Case | Behaviour | Test |
| --- | --- | --- |
| Valid | read returns the session | trivial, but write it |
| Expired | read returns `null` **and deletes the entry** | measured (`1 ms`) |
| Corrupt/other version | read returns `null`, deletes | write garbage, read, assert `null` |
| Clock ahead/behind | treat `expiresAt` as a hint; still handle 401 | inject a fake `Date.now` and assert both directions |

```ts
it('treats a corrupt stored session as no session at all', () => {
  localStorage.setItem('react-lab:session', '{"token": "abc"');     // truncated JSON
  expect(tokenStore.read()).toBeNull();
  expect(localStorage.getItem('react-lab:session')).toBeNull();
});

it('tolerates a client clock that is behind the server', () => {
  const spy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  tokenStore.write({ ...session, expiresAt: 1_700_000_100_000 });   // valid for 100 s
  expect(tokenStore.read()).not.toBeNull();
  spy.mockRestore();
});
```

⚠️ **Proactive vs reactive expiry.** Reading `expiresAt` before a request avoids an avoidable 401 round trip, but the 401 path must exist anyway: clocks drift, tokens get revoked, and a tab can sleep through the proactive check. Treat proactive refresh as an optimisation (file 03, section 3).

---

## 4. Logout that actually logs out

```tsx
const logout = useCallback(() => {
  tokenStore.clear();                    // 1. remove the proof
  setSession(null);                      // 2. clear React state
  setStatus('anonymous');                // 3. tell the guards
  queryClient.clear();                   // 4. drop cached server data (Part 9)
}, [queryClient]);
```

| Step | Why it is necessary |
| --- | --- |
| Clear storage | otherwise a refresh logs the user back in |
| Clear React state | otherwise the UI still shows the user's name |
| Update the status | otherwise guards keep rendering protected routes |
| **Clear caches** | otherwise the next user (on a shared machine) sees the previous user's data |
| Revoke server-side (if supported) | a stolen refresh token stays valid otherwise |
| Navigate with `replace` | Back should not return to a protected page |

```tsx
// Optionally notify the server, but never block the UI on it
const logout = async () => {
  const session = tokenStore.read();
  clearEverything();                                     // do this first: the UI must respond immediately
  if (session !== null) {
    void fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${session.token}` } }).catch(() => {});
  }
};
```

⚠️ **The cache-clearing step is the one people skip**, and it is the one that becomes a security incident on shared devices: with TanStack Query, `queryClient.clear()`; with Zustand/Redux, reset the user-related slices (Part 9); with a router, drop any loader data. If you have ever clicked "log out" and briefly seen the previous account's name, you have met this bug.

---

## 5. Two tabs, one session

| Scenario | What happens | Handling |
| --- | --- | --- |
| Tab A logs out | Tab B still has React state saying "authenticated" | listen to the `storage` event and sync status |
| Tab A refreshes (rotation) | Tab B's in-memory token is stale | always read the token from storage at request time, or broadcast the new token |
| Tab B is asleep for hours | it wakes with an expired token | check `expiresAt` (and the 401 path) — do not cache the token in a variable that never re-reads |

```tsx
// Sync auth status across tabs (storage events fire in *other* tabs, not the writer)
useEffect(() => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== 'react-lab:session') return;
    const next = event.newValue === null ? null : (JSON.parse(event.newValue) as Session);
    setSession(next);
    setStatus(next === null ? 'anonymous' : 'authenticated');
  };
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener('storage', onStorage); };
}, []);
```

💡 The rule that avoids most multi-tab bugs: **read the session from the store at request time** (as file 03's `apiFetch` does) rather than capturing it once into a long-lived variable. Then the worst case is a stale *UI* for a moment, not stale *credentials* forever.

---

## 6. Testing token management

The tests that pay for themselves, in the order to write them:

| Test | Asserts |
| --- | --- |
| Round-trip | `write` then `read` returns the same session |
| Expired | `read` returns `null` **and** removes the key (measured) |
| Corrupt | `read` returns `null` and does not throw |
| Nothing stored | `read` returns `null` |
| Logout | after `clear()`, `read()` is `null` and the cache is empty |
| Login failure stores nothing | measured: `expect(tokenStore.read()).toBeNull()` after a 401 (117 ms) |
| Cross-tab | a simulated `StorageEvent` flips the provider's status |

```tsx
it('clears the session and the query cache on logout', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['products'], sampleProducts);
  tokenStore.write(session);

  render(<LogoutButton queryClient={queryClient} />);      // or exercise the provider's logout
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  expect(tokenStore.read()).toBeNull();
  expect(queryClient.getQueryData(['products'])).toBeUndefined();   // ← the leak nobody tests
});
```

⚠️ In tests, `localStorage` persists between test *files* only if you let it — this lab clears it in `beforeEach` (`localStorage.clear()`), which is what keeps the auth tests independent. Do the same for `sessionStorage` and cookies if you use them.

---

## 7. A twenty-minute security review checklist

| # | Check | Passing looks like |
| --- | --- | --- |
| 1 | No tokens in URLs, logs, or analytics | grep for `token=` in the codebase and in your logging calls |
| 2 | One storage location, one key, one shape | a single `tokenStore`-like module, not five `localStorage` calls |
| 3 | Expiry is checked on read and on 401 | the measured test exists |
| 4 | Refresh is shared (no parallel refreshes) | a module-level in-flight promise (file 03) |
| 5 | Logout clears storage, state, and caches | the test above |
| 6 | Caches are cleared on logout and on account switch | `queryClient.clear()` / store resets |
| 7 | 401 and 403 are distinguished | different messages, different actions |
| 8 | Roles come from the server, not from decoded claims | `can()` reads server-provided user data |
| 9 | Every protected endpoint enforces on the server | API tests with a non-admin token (403) |
| 10 | Cookies (if used) are `HttpOnly; Secure; SameSite` | inspect the `Set-Cookie` header |
| 11 | Sensitive fields are absent from unauthorised responses | not merely hidden in the UI |
| 12 | XSS surface is minimised: no unsanitised `dangerouslySetInnerHTML`, a CSP in place | grep + response headers |

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Tokens in several keys | half-states, inconsistent logout | one session object, one key |
| 2 | Not checking expiry on read | an expired session looks valid until the first request fails | validate on read (measured) |
| 3 | Throwing on corrupt storage | a white screen from stale data | catch, delete, return `null` |
| 4 | Caching the token in a variable for the session's lifetime | stale credentials after rotation in another tab | read at request time |
| 5 | Logout that clears only React state | a refresh logs the user back in | clear storage too |
| 6 | Logout that leaves cached queries | the next user sees previous data | `queryClient.clear()` |
| 7 | Ignoring the `storage` event | tabs disagree about who is signed in | sync status |
| 8 | `localStorage` with no compensating controls | XSS = session theft | cookies, short TTL, CSP, rotation |
| 9 | Storing the user's password or PII in the session object | leaked to anyone who can read storage | keep the session minimal |
| 10 | Never rotating/revoking on the server | stolen tokens live for weeks | ask for rotation; add a sessions screen |
| 11 | Trusting `expiresAt` blindly | a wrong client clock refreshes too late or too early | treat it as a hint; handle 401 |
| 12 | Not testing any of this | the first incident is in production | the seven tests in section 6 |

---

## 9. Best practices

1. **One module owns the session** (`tokenStore`), and everything else asks it — no scattered `localStorage` calls.
2. **Validate on read**: expiry and parse errors are normal, not exceptional.
3. **Keep the session minimal** (`token`, `refreshToken`, `user` identity + roles, `expiresAt`, `v`).
4. **Prefer `HttpOnly` cookies** when the backend supports them; if using `localStorage`, document the trade-off and compensate.
5. **Read credentials at request time**, never from a long-lived captured variable.
6. **Logout is a multi-step operation** (storage → state → guards → caches → optional server call) and must be tested.
7. **Sync across tabs** with the `storage` event, and treat "another tab logged out" as a real event.
8. **Test expiry, corruption and logout-cache-clearing** — three cheap tests with high value.
9. **Version the stored shape** so future changes are migrations, not surprises.
10. **Re-read this file's checklist before shipping** any change that touches the session.

---

## 10. Practice

### Beginner

1. Implement `tokenStore` with `read`/`write`/`clear`, including expiry and corrupt-data handling. Write the four storage tests.
2. Log the difference in behaviour between a valid, an expired and a corrupt value stored under the key.
3. Add a `logout()` that clears storage and state, and verify with a test that a subsequent `read()` returns `null`.

### Intermediate

1. Add cache clearing to logout (`queryClient.clear()` or your store's reset) and write the leak test from section 6.
2. Implement cross-tab sync and test it by dispatching a `StorageEvent` manually. Then verify with two real browser tabs.
3. Add a `v` field and a migration: on read, if `v` is old, either upgrade the shape or clear it. Test both branches.

### Challenge

1. Migrate an app from `localStorage` tokens to the memory + refresh-cookie pattern. Write the plan: what changes on the client, what you need from the backend, how you keep users logged in during the switch, and how you verify (including the 401 path).
2. Build an "active sessions" screen: list the user's sessions from the server, revoke one, and handle the case where the revoked session is the current one. Include the client-side flow and the tests.
3. Write the security review for a token-in-`localStorage` app you know: run the checklist in section 7, mark each item pass/fail, and produce a prioritised remediation plan with effort estimates and the compensating controls you would add first.

---

## 11. Solutions

### Beginner

1. Store as in section 1; tests: round-trip, expired (also asserting removal), corrupt (`'{"token": "abc"'`), and missing. The expired and corrupt tests both assert `localStorage.getItem(KEY) === null` afterwards, which is the part that prevents resurrection.
2. Valid → the session object; expired → `null` and the key is gone; corrupt → `null`, the key is gone, and no exception escapes `read()`.
3. `logout()` calls `tokenStore.clear()` and sets state to `null`/`'anonymous'`; the test asserts `read()` is `null` and that a rerender shows the login screen.

### Intermediate

1. The leak test in section 6: seed the cache, log out, assert `getQueryData` is `undefined`. It fails if logout only clears the store — which is exactly the bug it exists to catch.
2. `window.dispatchEvent(new StorageEvent('storage', { key: 'react-lab:session', newValue: null }))` inside `act()`; assert the provider's status becomes `anonymous`. In two real tabs, log out in one and watch the other redirect.
3. On read: `if (parsed.v !== CURRENT_VERSION) { migrate or clear }`. Migration for additive changes (fill defaults); clear for breaking ones. Two tests: an old-but-compatible value is upgraded in place; an incompatible value results in `null` and a fresh login.

### Challenge

1. Plan: add the refresh endpoint + `HttpOnly` cookie on the backend; keep the access token in memory; change `tokenStore` to a memory store plus a `hasSession` flag derived from a cheap `GET /api/me` on boot; keep the old `localStorage` read for one release with a migration path (exchange the stored refresh token for a cookie, then delete the key); verify by testing the 401/refresh path and by confirming no token appears in storage after login. Rollout: a feature flag, then remove the old path.
2. Server side: `GET /api/auth/sessions` returns `{ id, device, ip, lastUsedAt, current }`; `DELETE /api/auth/sessions/:id` revokes. Client: a table, a revoke button with confirmation, and — if the revoked session is the current one — clear local state, show "you signed out of this device", and navigate to login with `replace`. Tests cover listing, revoking another session (the list updates) and revoking the current one (the app logs out).
3. Typical findings, in priority order: (1) tokens in `localStorage` with no CSP — add CSP and shorten TTLs (highest risk, moderate effort); (2) no refresh sharing → users logged out under load (high impact, small fix); (3) caches not cleared on logout (medium, small fix); (4) roles read from claims (medium, needs a server change); (5) no revocation story (medium, backend work). Each item should state its *residual* risk even after the fix — that honesty is what makes a security review useful rather than reassuring.

---

## 12. Summary

- **One module owns the session** with a single key and a typed shape; `read()` validates expiry (measured: `1 ms` test) and survives corrupt data by deleting it, so a bad value cannot white-screen the app.
- **Storage is a trade-off with named risks**: cookies remove XSS-scraping but need CSRF care; `localStorage` is convenient and turns any XSS into session theft; memory is safest and needs a refresh cookie to survive a refresh.
- **Expiry has four cases** — valid, expired, corrupt, wrong clock — and the last two are the ones nobody tests.
- **Logout is multi-step**: storage → state → guards → **caches** → optional server revocation, with `replace` navigation. The cache step is the one that leaks data on shared devices, and it is measurable (`expect(queryClient.getQueryData(['products'])).toBeUndefined()`).
- **Multiple tabs are a real environment**: sync status via the `storage` event, and read credentials at request time so rotation cannot leave a tab with stale tokens.
- **Seven tests cover the whole store** (round-trip, expired, corrupt, missing, logout, login-failure-stores-nothing, cross-tab), and the measured suite runs in under two seconds.
- **The twenty-item checklist in section 7** is the deliverable of this file: run it before shipping anything that touches sessions.

---

**What's next →** [`06-role-based-ui.md`](./06-role-based-ui.md) closes the part with authorisation in the interface: roles versus permissions, a single `can()` source of truth, conditional rendering patterns that stay readable, role-aware navigation, why hiding is never protecting, how to test permission-gated UI, and what to do when the server and the client disagree.
