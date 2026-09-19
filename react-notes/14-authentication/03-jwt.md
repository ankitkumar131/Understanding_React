# 03 — JWT: Access Tokens, Refresh Tokens and the Retry That Makes Expiry Invisible

> **Part 14 · Authentication · File 3 of 5**

Why this file exists: "we use JWT" is stated as if it answered the hard questions, and it answers none of them. A JWT is just a signed, base64-encoded blob with an expiry — the real engineering is in the lifecycle around it: which token is short-lived, where each one is stored, what happens when the access token expires mid-session, how you avoid a request storm when ten calls all get 401 at once, what to do when the refresh token is rejected, and how to test any of it. This file covers exactly that, plus the parts people get wrong about the token itself (it is readable, it is not revocable, and its `exp` is a promise the server must keep).

---

## 1. What is actually inside a JWT

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiJ1MSIsInJvbGVzIjpbImFkbWluIl0sImV4cCI6MTc2MDAwMDAwMH0 . 5m3k…
        header (algorithm)                     payload (claims)                        signature
```

```json
// The payload — base64url, NOT encrypted. Anyone can decode it.
{ "sub": "u1", "roles": ["admin"], "exp": 1760000000, "iat": 1759999700 }
```

| Claim | Meaning | Why it matters to the client |
| --- | --- | --- |
| `sub` | subject (the user id) | what you key the UI's user data on |
| `exp` | expiry (seconds since epoch) | when to refresh *before* calling an API |
| `iat` / `nbf` | issued at / not before | clock-skew and replay reasoning |
| `roles` / `scope` | authorisation claims | the client can *show* what the token claims — the server must still verify |
| `aud` / `iss` | audience / issuer | the server's validation; the client rarely reads them |

Three facts that decide most designs:

1. **The signature protects integrity, not confidentiality.** Never put secrets, passwords, or personal data you would not show the user into a JWT.
2. **A JWT is stateless: it cannot be revoked before `exp`.** Logout deletes the client's copy, but a stolen token stays valid until it expires — which is the entire reason access tokens are short-lived and refresh tokens exist.
3. **The client can read `exp` without verifying** — useful for proactive refresh, never for security decisions.

```tsx
// src/auth/jwt.ts — reading claims for *scheduling*, not for authorisation
export function decodeExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { exp?: number };
    return claims.exp === undefined ? null : claims.exp * 1000;    // → ms
  } catch {
    return null;
  }
}
```

⚠️ Do **not** trust decoded claims for access control. Anyone can craft `{ "roles": ["admin"] }` — the thing that makes it trustworthy is the server's signature check, which only the server can do.

---

## 2. Access token + refresh token: the two-token model

| | Access token | Refresh token |
| --- | --- | --- |
| Lifetime | minutes (5–15) | days to weeks |
| Sent to | every API request | only the refresh endpoint |
| Storage | memory ideally; `localStorage` if you must | `HttpOnly` cookie if possible |
| If stolen | attacker has minutes | attacker has a long session — protect it hard, rotate it |
| Revocable | no (until expiry) | yes (server-side record, rotation) |

```text
     login ─────────► access (15 min) + refresh (14 days)
       │
       ├─ API call with access ──► 200 OK
       │
       ├─ access expires
       │     │
       │     ├─ API call ──► 401
       │     └─ POST /auth/refresh (refresh token) ──► new access (+ rotated refresh)
       │           └─ retry the original request with the new access token
       │
       └─ refresh rejected (revoked/expired) ──► clear session, redirect to login, keep destination
```

💡 **Rotation** is the security upgrade worth asking the backend for: every refresh returns a *new* refresh token and invalidates the old one. If a stolen refresh token is used, the legitimate client's next refresh fails — which surfaces the theft instead of hiding it.

---

## 3. The interceptor: 401 → refresh → retry

The behaviour users expect is "it just works"; the implementation is one function in the HTTP client (Part 7), not logic scattered through components.

```tsx
// src/api/http.ts — the auth-aware client
import { tokenStore } from '../auth/tokenStore';

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = tokenStore.read();
  if (session === null) return null;
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!response.ok) {
    tokenStore.clear();                    // the session is over; let the app react
    return null;
  }
  const next = (await response.json()) as { token: string; expiresAt: number };
  tokenStore.write({ ...session, token: next.token, expiresAt: next.expiresAt });
  return next.token;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = tokenStore.read();
  const withAuth = (token: string | null): RequestInit => ({
    ...init,
    headers: { ...init.headers, ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
  });

  let response = await fetch(path, withAuth(session?.token ?? null));
  if (response.status !== 401) return response;

  // One refresh for many concurrent 401s: share the in-flight promise.
  refreshPromise ??= refreshAccessToken().finally(() => { refreshPromise = null; });
  const token = await refreshPromise;
  if (token === null) return response;     // caller decides: log out, or show a message
  return fetch(path, withAuth(token));     // retry once
}
```

**Line by line, the four decisions that matter:**

1. **`refreshPromise` is module-level and shared.** Without it, ten parallel requests that all get 401 fire ten refresh calls — which, with rotation, invalidates nine of them and logs the user out. This single line is the difference between a robust and a broken refresh flow.
2. **One retry, not a loop.** If the retried request also 401s, return it. Retrying in a loop turns an auth problem into an infinite request storm.
3. **`tokenStore.clear()` on a failed refresh**, and return `null` — the *client* code decides the UX (redirect, message), the client library decides the mechanics.
4. **The original `init` is preserved** (method, body, headers), so a retried `POST` still sends its payload. Note the caveat: retrying a non-idempotent request after a 401 is safe **only** because the first attempt was rejected before doing any work — that is what a 401 means. Retrying after a timeout is a different problem (Part 11, file 04's idempotency keys).

💡 **Proactive refresh** is a nice-to-have: if `session.expiresAt - Date.now() < 60_000`, refresh *before* the request. It avoids the extra round trip and the 401 entirely, but the interceptor must still exist (clocks drift, tabs sleep, tokens get revoked).

---

## 4. Timeouts, clock skew and tabs

| Problem | Symptom | Handling |
| --- | --- | --- |
| Client clock is wrong | refreshes too early or too late | treat `exp` as a hint; always handle a 401 |
| Long-lived tab | the token expired while the user was away | refresh on focus, or check `expiresAt` before each request |
| Many tabs | each has its own memory, one session in storage | refresh in one tab and broadcast (a `storage` event, or refresh in the tab making the request) |
| Refresh revoked elsewhere | the app keeps retrying | clear on a failed refresh and route to login |
| Network offline during refresh | an error that looks like a logout | distinguish network failure (retry/message) from 401/403 (session problem) |

```tsx
// Refresh when the user comes back to a sleeping tab
useEffect(() => {
  const onFocus = () => { if (window.document.visibilityState === 'visible') void apiFetch('/api/me'); };
  window.addEventListener('visibilitychange', onFocus);
  return () => { window.removeEventListener('visibilitychange', onFocus); };
}, []);
```

⚠️ This is deliberately a small `apiFetch` call: it exercises the same interceptor path as everything else, so the "am I still logged in?" question has exactly one implementation.

---

## 5. Testing the lifecycle

Token handling is pure enough to unit-test, and the 401 path is testable end-to-end with MSW (Part 13, file 05):

```tsx
it('refreshes once, retries the failed request and shares the refresh across parallel calls', async () => {
  let refreshCalls = 0;
  let accessToken = 'expired-token';

  server.use(
    http.get('/api/products', ({ request }) => {
      if (request.headers.get('authorization') !== 'Bearer fresh-token') {
        return HttpResponse.json({ message: 'expired' }, { status: 401 });
      }
      return HttpResponse.json(sampleProducts);
    }),
    http.post('/api/auth/refresh', async () => {
      refreshCalls += 1;
      await delay(20);                                  // ← both requests land inside the window
      accessToken = 'fresh-token';
      return HttpResponse.json({ token: 'fresh-token', expiresAt: Date.now() + 600_000 });
    }),
  );
  tokenStore.write({ ...session, token: accessToken });

  const [a, b] = await Promise.all([apiFetch('/api/products'), apiFetch('/api/products')]);

  expect(refreshCalls).toBe(1);                       // ← the shared promise
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(tokenStore.read()?.token).toBe('fresh-token');
});

it('clears the session when the refresh is rejected', async () => {
  server.use(
    http.get('/api/products', () => HttpResponse.json({ message: 'expired' }, { status: 401 })),
    http.post('/api/auth/refresh', () => HttpResponse.json({ message: 'no' }, { status: 401 })),
  );
  tokenStore.write({ ...session, token: 'expired-token' });

  const response = await apiFetch('/api/products');
  expect(response.status).toBe(401);
  expect(tokenStore.read()).toBeNull();               // ← the session is over
});
```

Two tests, two properties: **parallel 401s cause exactly one refresh**, and **a rejected refresh ends the session**. Both are invisible in manual testing until they break in production.

---

## 6. What the client should *not* do with a JWT

| Anti-pattern | Why | Instead |
| --- | --- | --- |
| Verify the signature in the browser | you would need the secret or the public key, and it proves nothing the server did not already prove | decode only for scheduling |
| Decode `roles` and treat it as authorisation | a forged token's claims are readable too | render based on data the **server** returned about the current user |
| Store a token in `localStorage` "because it is signed" | the signature does not stop XSS exfiltration | cookies, or short tokens + CSP + short sessions |
| Put a whole user profile in the token | it is readable by anyone and stale forever | keep `sub` + roles, fetch the profile |
| Allow long-lived access tokens | theft window is proportional to lifetime | 5–15 minute access tokens + refresh |
| Skip the 401 path because "tokens last an hour" | tabs sleep, users go to lunch | the interceptor in section 3 |
| Refresh on every request | a refresh storm and unnecessary rotation | refresh only on 401 (or near expiry) |

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Ten parallel 401s → ten refreshes | rotation logs the user out | share one in-flight refresh promise |
| 2 | Retrying in a loop | request storm | retry once, then surface the failure |
| 3 | No refresh at all | users are logged out mid-session | implement the interceptor (or the backend session) |
| 4 | Refreshing *after* the request fails, in every component | duplicated logic, inconsistent behaviour | one HTTP client |
| 5 | Storing tokens where XSS reads them, with no other mitigation | session theft | cookies, short TTL, CSP |
| 6 | Treating decoded claims as permissions | forged claims render admin UI (harmless) or grant actions (not, if the server checks) | server-derived permissions |
| 7 | Ignoring `exp` until a 401 | a burst of failures at the wrong moment | proactive refresh near expiry |
| 8 | Treating a network error during refresh as a logout | offline users get signed out | distinguish status codes from transport errors |
| 9 | Forgetting to clear tokens on logout and on refresh failure | the old token lingers | clear both, always |
| 10 | Putting secrets or PII in the payload | readable by anyone | minimal claims |
| 11 | One long-lived token "for simplicity" | theft window is weeks | access + refresh |
| 12 | No test for the 401 path | it breaks silently in production | the two tests in section 5 |

---

## 8. Best practices

1. **Treat tokens as opaque strings** in most code, and decode only `exp` for scheduling.
2. **Keep access tokens short-lived**, refresh tokens long-lived and rotated, and store each where its risk justifies (memory/cookie over `localStorage`).
3. **Centralise auth in one HTTP client**, with a single in-flight refresh shared across concurrent 401s.
4. **Retry once**, and let the caller decide the UX when the refresh fails.
5. **Distinguish 401 (identity), 403 (permission) and transport errors** in the retry logic.
6. **Clear the session explicitly** on logout, on a failed refresh, and on a 403 that indicates the account is disabled.
7. **Refresh proactively near expiry**, but never depend on it.
8. **Test the interceptor**, including the parallel-401 case — it is the difference between "works on my machine" and "works on a slow network with three tabs open".
9. **Ask the backend for rotation and a refresh endpoint** if it does not have them; the client cannot invent them.
10. **Log auth failures without logging tokens** (a correlation id is enough).

---

## 9. Practice

### Beginner

1. Decode a JWT payload by hand (base64url → JSON) and list its claims. Then say which ones the client may use and which belong to the server.
2. Explain why a JWT cannot be revoked before it expires, and what that implies for token lifetimes.
3. For each token, say where it should be stored and why: a 10-minute access token, a 14-day refresh token.

### Intermediate

1. Implement the interceptor from section 3 and write the two tests (parallel 401 → one refresh; rejected refresh → session cleared).
2. Add proactive refresh (refresh when fewer than 60 seconds remain) and prove with a test that a request near expiry does not return a 401 to the caller.
3. Handle "session expired mid-form": what the user sees, what happens to their input, and how the retry works after a successful re-login.

### Challenge

1. Build a refresh-aware data layer on top of TanStack Query (Part 9): what happens to an in-flight query when the session expires, how to invalidate cached data on logout, and how to avoid refetch storms on a token refresh. Implement and test both.
2. Design multi-tab session behaviour: two tabs, one logs out; one refreshes and rotates the token. Specify the states (who owns the session, how the other tab learns) and implement broadcasting with the `storage` event, then test the logic outside React.
3. Threat-model refresh-token theft with rotation: how the theft is detected, what the user experiences (both the attacker and the victim), and how you would handle the resulting forced logout (a message? a security email? a full sign-out everywhere?).

---

## 10. Solutions

### Beginner

1. Claims from the example: `sub` (user id), `roles`, `exp`, `iat`. The client may use `exp` for scheduling and `sub`/`roles` for *display*; anything security-relevant must come from the server's verification. Note that decoding is trivial (`atob` + `JSON.parse`) — that is the point: readable, not secret.
2. Because validity is determined by the signature and `exp`, and no server-side record exists to mark it dead: any copy remains valid until it expires. Hence short access tokens, and refresh tokens that *are* recorded server-side and can be revoked/rotated.
3. Access token: memory first (React state/module variable) — lost on refresh, so pair it with a refresh token in an `HttpOnly` cookie; `localStorage` only if cookies are impossible, accepting XSS exposure. Refresh token: `HttpOnly`, `Secure`, `SameSite` cookie, because it is long-lived and the most valuable thing on the client.

### Intermediate

1. The two tests in section 5 (`refreshCalls === 1` with `Promise.all`, and `tokenStore.read() === null` after a rejected refresh). The first test fails if you forget the shared promise, which is exactly the bug users hit under a slow network.
2. In `apiFetch`, before the request: `if (session !== null && session.expiresAt - Date.now() < 60_000) { const token = await sharedRefresh(); … }`. The test asserts the handler **never saw a 401** — i.e., the caller got a 200 on the first attempt — by making the *original* token valid server-side and only refreshing the client's copy.
3. Behaviour: keep the user's input (it is in component state), show a modal "Your session expired — sign in to continue", and on success retry the original request automatically. If re-login fails, keep the form filled and offer a copy-to-clipboard/draft save. The implementation stores the pending request in a ref or a small queue in the HTTP client, keyed to a "resume" callback.

### Challenge

1. With Query: on logout, `queryClient.clear()` (not just a manual state reset) so no cached data survives to the next user; on a successful refresh, do **not** invalidate everything — the data is still valid, only the token changed, so only refetch what fails. Refetch storms are avoided by (a) the shared refresh promise and (b) letting the interceptor retry the individual failed requests rather than invalidating every key. Test: two queries mounted, token expires, assert exactly one refresh and that both queries end up with data.
2. States: the session lives in `localStorage` (shared across tabs); logging out removes it and sets a `session-ended` marker; each tab listens to `storage` events and reacts (clear state, redirect). Rotation: the tab that refreshes writes the new token; other tabs see the `storage` event and update their copy — but a tab that was *idle* may still hold the old token in memory, so the read must go through `tokenStore.read()` on each request rather than a captured variable. Testing outside React: call the store and the interceptor directly with a mocked `localStorage` and `storage` event.
3. Rotation-based theft detection: when a rotated (already-used) refresh token is presented, the server treats it as compromise, revokes the whole token family, and both parties are logged out. The victim sees "For your security, please sign in again" (plus a security email if the product supports it); the attacker's session dies too. The client's part is to handle the forced logout gracefully (no infinite retry, clear storage, keep the destination) and to never retry a refresh that returned 401.

---

## 11. Summary

- **A JWT is a signed, readable, expiring blob.** Base64-decode the payload for `exp` (scheduling), never for authorisation; never put secrets in it; it cannot be revoked before expiry.
- **The two-token model exists because of that limit**: a 5–15 minute access token (low theft value, no revocation needed) plus a long-lived, server-recorded, rotated refresh token.
- **The client's critical piece is one interceptor**: on 401, refresh **once** (sharing a single in-flight promise across concurrent requests), retry the original request **once**, and on a failed refresh clear the session and let the UI decide.
- **The shared refresh promise is the detail that separates working code from a production incident**: without it, parallel 401s become parallel refreshes, rotation revokes the older ones, and users are logged out at random.
- **Handle clocks, sleeping tabs and offline refresh** — treat `exp` as a hint, distinguish transport errors from status codes, and refresh proactively near expiry without depending on it.
- **Test the lifecycle**: this lab's pattern is MSW + two assertions (`refreshCalls === 1` with `Promise.all`, and the session cleared when refresh fails).
- **What the client must not do**: verify signatures, trust decoded claims, keep long-lived access tokens, or store refresh tokens where XSS can read them.

---

**What's next →** [`04-protected-routes.md`](./04-protected-routes.md) builds the routing side with React Router (Part 6): guard components and layout routes, the `from` state that powers return-to, role gates, nested protected sections, the "loading" state that prevents login-page flashes, and how guards interact with data loaders and redirects.
