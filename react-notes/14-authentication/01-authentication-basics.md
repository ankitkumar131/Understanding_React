# 01 — Authentication Basics: Sessions, Tokens and What "Logged In" Means

> **Part 14 · Authentication · File 1 of 6**

Why this file exists: authentication is the part of a React app with the highest cost of being wrong and the most confusion about where the truth lives. Three questions have to be answered before any code: **who decides the user is authenticated** (the server), **what the client keeps as proof** (a cookie or a token), and **what the client is allowed to do with that proof** (render a UI, and nothing more). This file answers them, defines the four states a client session can be in (and why "logged in: true/false" is insufficient), walks the full flow from credentials to a protected request, and states the security boundary that the rest of the part keeps returning to: **frontend checks are user experience, never security.**

The lab code for this part lives in `src/auth/` and is tested in file 05 (`6 tests, 1.73 s`).

---

## 1. The three-layer model

```text
   browser (React)                 network                      server (truth)
┌────────────────────┐        ┌──────────────┐        ┌─────────────────────────┐
│ UI state: who am I │  ───►  │  credentials │  ───►  │ verify password (hash)  │
│ token / cookie     │  ◄───  │  session id  │  ◄───  │ create session / issue  │
│ render or redirect │        │  or JWT      │        │ token; enforce access   │
└────────────────────┘        └──────────────┘        └─────────────────────────┘
        UX decisions                                      security decisions
```

| Layer | Owns | Must never |
| --- | --- | --- |
| **Server** | verifying credentials, issuing the session, **authorising every request**, expiry and revocation | trust anything the client sends beyond its credentials/token |
| **Network** | transporting credentials over HTTPS, cookies with `HttpOnly`/`Secure`/`SameSite` | carry secrets in URLs or logs |
| **Client (React)** | storing proof, attaching it to requests, rendering the right UI, redirecting, refreshing | decide who is allowed to do what; hide data it was already sent |

⚠️ The sentence to internalise: **a React route guard stops honest users from seeing a broken page; it stops no attacker at all.** Anyone can open DevTools, edit state, or call the API directly. Every protected endpoint must verify the token on the server, and every sensitive field must be absent from the response the client is not supposed to see. This is why hiding an "Admin" button is a UX nicety and `GET /api/admin/users` returning data to a non-admin is a vulnerability.

---

## 2. Sessions versus tokens

| | **Cookie session** | **Bearer token (JWT)** |
| --- | --- | --- |
| What the client holds | an opaque session id in a cookie | a signed token (often a JWT) in JS storage or a cookie |
| Who stores it | the browser, automatically | you, explicitly (for headers) |
| Sent to the server | automatically with every request to that origin | you attach `Authorization: Bearer …` |
| Revocation | immediate (delete the server-side session) | hard until expiry (that is what refresh tokens and denylists are for) |
| CSRF risk | yes, if `SameSite` is not set correctly | no (a foreign site cannot read the token to send it) |
| XSS risk | low with `HttpOnly` (JS cannot read the cookie) | **high** if stored in `localStorage` (any injected script can exfiltrate it) |
| Typical use | same-origin web apps, server-rendered apps | SPAs calling a separate API, mobile clients, third parties |

Both are legitimate, and the choice is usually made by the backend team. What a React developer must know:

1. **With cookies, you barely write auth code** — the browser attaches the cookie, and your job is CORS/CSRF awareness (Part 15, file 06) and the `credentials: 'include'` option when the API is on another origin.
2. **With tokens, you write the plumbing** — attach the header, handle 401s, refresh before expiry, and choose the storage. Part 7's typed client is where that lives.
3. **A JWT is not encrypted, only signed.** Anyone can decode the payload (base64) and read what you put in it. Never put secrets in a token. The server's signature is what makes it trustworthy.

```tsx
// What the client actually does with a bearer token (Part 7's client, extended)
const response = await fetch('/api/products', {
  headers: { authorization: `Bearer ${session.token}` },
});
```

---

## 3. The four session states (not two)

"Logged in" is not a boolean. The lab's context models three, and a fourth exists in real apps:

| State | Meaning | What the UI must do |
| --- | --- | --- |
| `loading` | we do not know yet (reading storage, validating a token, refreshing) | show a skeleton/spinner, **not** the login page |
| `anonymous` | we know: no valid session | show public UI, redirect protected routes to login |
| `authenticated` | we know: valid session with a user | render the app with the user's data |
| `expired` (optional) | a session existed and lapsed | show login with "session expired", keep the intended destination |

⚠️ The classic bug that this modelling prevents: treating `loading` as `anonymous`. On every refresh, an app with a persisted session briefly redirects the user to `/login` and back — a visible flash, a lost destination, and a confusing history. The fix is a three-state model and rendering nothing (or a skeleton) while loading.

```tsx
// src/auth/AuthContext.tsx (this lab)
const [status, setStatus] = useState<AuthStatus>('loading');
useEffect(() => {
  const stored = initialSession !== undefined ? initialSession : tokenStore.read();
  setSession(stored);
  setStatus(stored === null ? 'anonymous' : 'authenticated');   // ← loading resolves once
}, [initialSession]);
```

💡 Side note for testing: the `initialSession` prop exists so tests can start in a known state without touching `localStorage` (file 05) — the same dependency-injection trick as Part 3's `initial` props.

---

## 4. The full flow, step by step

```text
1. User submits email + password              →  POST /api/auth/login
2. Server verifies (bcrypt/argon2 hash)       →  { token, refreshToken, user, expiresAt }
3. Client stores proof (cookie or token)      →  tokenStore.write(session)
4. Client updates React state                 →  status: 'authenticated'
5. Router renders protected routes            →  <ProtectedRoute> allows or redirects
6. Every API call carries the proof           →  cookie automatically / Authorization header
7. Server authorises EVERY request            →  401 when missing/expired/invalid
8. Client reacts to 401                       →  refresh, or log out and redirect
9. Logout clears proof + state                →  POST /api/auth/logout (optional) + tokenStore.clear()
```

Steps 3–9 are the client's job, and each has a failure mode worth naming:

| Step | Failure mode | Guard |
| --- | --- | --- |
| 3 | storing a token in a place XSS can read | consider cookies; if tokens, accept the trade-off explicitly (file 05) |
| 4 | losing state on refresh | restore from storage on mount (this lab) |
| 5 | flash of the login page while loading | the `loading` state (section 3) |
| 6 | forgetting the header on some calls | centralise in one HTTP client (Part 7) |
| 7 | trusting the client's claims | **server-side authorisation**, always |
| 8 | silent failures after expiry | handle 401 centrally, refresh or log out |
| 9 | leaving the token behind on logout | clear storage *and* state; revoke server-side if possible |

---

## 5. Where the client stores its proof

| Storage | XSS exposure | Refresh survival | Notes |
| --- | --- | --- | --- |
| **`HttpOnly` cookie** | none (JS cannot read it) | yes | needs CSRF protection and correct `SameSite`, `Secure`, `Path` |
| `localStorage` | full (any XSS can read and exfiltrate) | yes | the common SPA choice; only acceptable with a strong XSS posture |
| `sessionStorage` | full | no (per tab) | smaller blast radius, worse UX |
| **In memory** (React state only) | none from storage scraping | no (lost on refresh) | safest, requires a refresh-cookie flow to stay logged in |
| IndexedDB | full | yes | no advantage over localStorage for tokens |

The honest guidance:

1. **If your backend can set cookies, prefer cookies** (`HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`). The XSS question then becomes "can the attacker make requests as the user?" (CSRF), which is addressed with `SameSite` and CSRF tokens.
2. **If you must store tokens in JS, accept the trade-off and reduce the blast radius**: short-lived access tokens (5–15 min), refresh tokens in a cookie if possible, and a strict Content Security Policy (Part 15, file 06). "We use JWTs so it is secure" is not an argument.
3. **Never** store tokens in URLs, in query strings, in `window.name`, in a comment, or in a Redux devtools-visible store without the trade-offs understood. (Part 9's devtools show your store in production too.)

---

## 6. Authorisation: roles, permissions and the honest UI

Authentication answers "who are you?"; **authorisation** answers "what may you do?". The client's role in authorisation is narrow but real:

| Client responsibility | Server responsibility |
| --- | --- |
| Hide actions the user cannot perform (avoid dead ends) | Reject the request if the user may not perform it |
| Show a clear "no permission" message instead of a broken page | Return 403 (not 404, unless you deliberately hide existence) |
| Redirect after login to where the user was going | Issue tokens with the right scopes/claims |
| Disable, not just hide, controls when context changes mid-session | Re-verify on **every** request (the client's state can be stale) |

```tsx
// src/auth/ProtectedRoute.tsx (this lab) — UX gates, in route form
if (role !== undefined && !hasRole(session, role)) {
  return <p role="alert">You do not have permission to view this page.</p>;
}
```

Two design notes from that snippet:

- **Route-level gates** (this) and **element-level gates** (`{can('products:write') && <DeleteButton />}`) are the two places authorization touches the UI. Put both behind one `can()` helper so the rules live in one file.
- **Unguarded UI is a bug in the other direction**: if the server forbids the action, an enabled button that always errors is worse than a hidden one. The client's job is to make the server's rules visible.

---

## 7. What the client can never do

| Claim | Reality |
| --- | --- |
| "The route is protected, so the data is protected." | the API response was already sent; hide it server-side |
| "The token is signed, so it is secret." | signed ≠ encrypted; the payload is readable |
| "We check the role in the UI, so users cannot call the API." | they can (curl, DevTools, Postman) |
| "Short sessions are inconvenient, so we use long ones." | long-lived tokens widen the window after theft; refresh tokens are how you keep UX |
| "HTTPS is enough." | it protects the transport; XSS steals tokens from the page itself |
| "We validate the email on the client." | the client's validation is UX; the server validates |

💡 The way to state it in a review: *"This guard is a UX guard; the endpoint must enforce the same rule."* If the endpoint does not, the PR is not ready.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Treating the client as a security boundary | data leaks, actions performed by unauthorised users | enforce on the server, gate in the UI |
| 2 | `isLoggedIn` as a boolean | login-page flash on refresh; lost destinations | the four-state model |
| 3 | Showing the login page while loading | visible flicker, confusing history | render a skeleton during `loading` |
| 4 | Forgetting to attach the token | 401s only on some endpoints | one HTTP client that always attaches it |
| 5 | Storing a token in `localStorage` without a plan | any XSS steals the session | cookies, or short tokens + refresh + CSP |
| 6 | Logout that only clears React state | the token survives in storage | clear both; revoke server-side |
| 7 | No expiry handling | users hit 401s with no recovery | refresh flow or a graceful re-login (file 03) |
| 8 | Sending users to `/login` for a 401 that was actually a permission problem | wrong messaging | distinguish 401 (identity) from 403 (permission) |
| 9 | Putting secrets in the JWT payload | anyone can read them | keep claims minimal (`sub`, `roles`, `exp`) |
| 10 | Validating passwords with only client rules | the server is the authority | server-side rules + hashing (bcrypt/argon2) |
| 11 | Designing auth without a "session expired" path | silent failures | explicit expired state + return-to |
| 12 | Conflating "no session" with "server error" | a 500 logs everyone out | distinguish status codes centrally |

---

## 9. Best practices

1. **Model three states** (`loading`, `anonymous`, `authenticated`) and render deliberately in each.
2. **Centralise auth in one provider + one HTTP client**, so no component ever invents its own token logic.
3. **Prefer `HttpOnly` cookies when the backend supports them**; otherwise document the token trade-off and keep tokens short-lived.
4. **Handle 401 centrally**: refresh once, retry the original request, then log out if it fails (file 03).
5. **Return users to where they were going** after login (measured in this lab's tests).
6. **Gate routes and elements with one permission helper**, and mirror every rule on the server.
7. **Clear everything on logout** and, if the backend supports it, revoke the session.
8. **Keep the design honest in the UI**: hide what is forbidden, explain why when it matters, and never rely on hiding for security.
9. **Test the four states** — loading, anonymous, authenticated, expired (file 05's six tests are a template).
10. **Write the security boundary down** in the README so the next feature cannot "just check it on the client".

---

## 10. Practice

### Beginner

1. For each item, say whether it is a client responsibility or a server responsibility: verifying a password, deciding whether a user may delete a product, redirecting to login, storing a token, returning 403, hiding the "Delete" button, expiring a session, checking a role before rendering a page.
2. List the four session states and describe what a user sees in each.
3. Explain in one sentence why a protected route does not protect data.

### Intermediate

1. Take an app with `isLoggedIn: boolean` and refactor it to the three-state model. Write down the two behaviours that change (hint: refresh, and where the user lands after login).
2. Implement `can(permission)` in one module, use it in a route guard and in one element-level gate, and list the server endpoints that must enforce the same rules.
3. Design the storage decision for a project: cookie vs token, with the XSS/CSRF trade-offs stated, and what you would need from the backend to choose the safer option.

### Challenge

1. Threat-model a token-in-`localStorage` SPA: three realistic attack paths (a compromised dependency, a reflected XSS via user content, a malicious browser extension), what each can do to the session, and one mitigation per path. Be honest about which mitigations are partial.
2. Write the auth section of a security review checklist for React apps: twelve items covering the client, the API calls, storage, expiry, logout, error handling, logging (never log tokens), dependencies, CSP, and the "server is the authority" rule.
3. Design the flow for a session that expires while the user is filling a long form: what they see, what is preserved, how the request is retried automatically if possible, and what the fallback is (a modal re-login that resubmits vs. losing the input). Then implement the client half.

---

## 11. Solutions

### Beginner

1. Server: verifying a password, deciding whether a user may delete a product, returning 403, expiring a session. Client: redirecting to login, storing a token, hiding the Delete button, checking a role before rendering. Mixed by design: "checking a role before rendering" is a *redundant* client check whose authoritative twin lives on the server.
2. `loading` → a skeleton/placeholder (never the login page); `anonymous` → public UI or the login page; `authenticated` → the app with user data; `expired` → the login page with "your session expired" and the intended destination remembered.
3. Because the API response has already been sent to the browser: a route guard changes what React renders, not what the server released — so the data must be withheld server-side.

### Intermediate

1. Behaviours that change: (a) on refresh with a stored session, the app no longer flashes the login page — it resolves from `loading` to `authenticated`; (b) after login, the user lands on the page they were trying to reach (`location.state.from`) instead of the home page.
2. `can(session, 'products:write')` in `src/auth/permissions.ts`, used by the route guard and by `<DeleteButton />`'s render condition; the endpoints to mirror: `POST/PUT/PATCH/DELETE /api/products*`, plus any `GET` that returns fields a viewer should not see.
3. A defensible design: cookies if the API is same-origin or can be configured with CORS + credentials, because it removes the token from JS's reach; otherwise tokens with a short TTL and refresh tokens in a cookie. What you need from the backend: `Set-Cookie` with `HttpOnly; Secure; SameSite=Lax`, a refresh endpoint, and CSRF protection if you use cookies.

### Challenge

1. A compromised dependency (supply chain): it runs in the page and can read `localStorage` — mitigation: fewer dependencies, lockfiles, `npm audit`/SCA, subresource integrity where applicable, and keeping tokens short-lived. A reflected XSS: an attacker's script executes with your origin's privileges — mitigation: escaping (React does this by default), sanitising any `dangerouslySetInnerHTML`, and a strict CSP. A malicious extension: it can read/modify page content and storage — mitigation: largely outside your control; cookies with `HttpOnly` reduce what storage-scraping yields, and short sessions limit the damage. Honest conclusion: storage choice narrows the blast radius; it does not eliminate the risk.
2. A checklist that works in review: no secrets in `localStorage` if cookies are possible; no tokens in logs or URLs; tokens attached centrally; 401 handled in one place; logout clears storage, state, and (if possible) revokes; expiry handled with a refresh or a clear re-login; roles gated in one helper, enforced on the server; no sensitive fields in responses to unauthorised clients; CSP set; dependencies audited; never trust client-side validation; error messages do not reveal whether an email exists (unless the product decides otherwise).
3. Design: the form's field values live in React state (not the DOM) or are serialised before the request; a 401 triggers one refresh attempt and, if that fails, a modal re-login that keeps the values; on success, the original request is retried automatically and the user sees the result; if refresh is impossible (session revoked), show "your session ended — your draft is saved below" with the values still in the form and a sign-in button. Implementing the client half means: store the pending action, retry once after a successful refresh, and never discard user input on an auth failure.

---

## 12. Summary

- **Three layers, one truth**: the server verifies and authorises, the network transports securely, the client stores proof and renders — and **frontend guards are UX, not security**.
- **Cookies versus tokens** is a trade-off (CSRF versus XSS exposure, revocation versus statelessness), usually decided by the backend; a JWT is signed, not secret.
- **"Logged in" is not a boolean**: model `loading`, `anonymous`, `authenticated` (and an optional `expired`), or you ship a login-page flash on every refresh and lose the user's destination.
- **The flow has nine steps**, and each has a named failure mode — storage choice, refresh restore, guard timing, header attachment, server enforcement, 401 handling, and a logout that actually clears everything.
- **Authorisation is two-sided**: hide and explain in the UI, enforce on the server; one `can()` helper on the client so the rules are reviewable.
- **The client's limits are the point**: it cannot protect data, cannot keep a signed payload secret, and cannot stop an attacker with the token — so the token's lifetime and storage are the levers you actually control.

---

**What's next →** [`02-login.md`](./02-login.md) builds the login and registration screens properly: a controlled form with validation (Part 8's rules), pending and error states (Part 11's actions), password requirements that are honest, accessible error display, and the lab's measured tests for success, wrong credentials and expired sessions.
