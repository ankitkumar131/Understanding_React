# 02 — Login and Registration: Building the Screens

> **Part 14 · Authentication · File 2 of 5**

Why this file exists: the login screen is the first thing users see and the last thing developers polish, which is a bad combination. It has real requirements — correct autocomplete and input types, a pending state, error messages that help without leaking information, a path to registration and password recovery, keyboard and screen-reader support, and one destination rule (send people back where they were going). This file builds those screens with the tools Parts 8 and 11 already taught (controlled fields or form actions, Zod validation, pending states), then measures the behaviour in this lab's tests: sign-in stores a session and returns to the intended route, and wrong credentials show a message *without* storing anything.

Measured from `npx vitest run src/auth/session.test.tsx`: `6 tests, 1.73 s`, including "signs in, stores the session and returns to the intended route" (201 ms) and "shows a message for wrong credentials and does not store anything" (117 ms).

---

## 1. The screen's real requirements

| Requirement | Why it matters | Implementation |
| --- | --- | --- |
| Correct `type` and `autoComplete` | password managers and mobile keyboards depend on them | `type="email" autoComplete="username"`, `type="password" autoComplete="current-password"` |
| A real `<label>` per field | screen readers, click targets, and tests | `<label htmlFor="email">Email</label>` |
| Pending state | users click twice on a slow network | `disabled` + "Signing in…" |
| Honest error messages | "Wrong email or password" beats "Error 401" | map status codes (Part 7) |
| No information leak | "that email is not registered" tells attackers which accounts exist | one message for both credential failures |
| Return-to behaviour | landing on the home page after login loses context | `location.state.from` (measured below) |
| Registration + recovery links | otherwise the screen is a dead end | routes for `/register`, `/forgot-password` |
| Announcement | errors must be announced, not just displayed | `role="alert"` (or a live region) |
| No autofill surprises | browsers fight uncontrolled inputs | decide controlled vs `defaultValue` once (Part 8) |
| A way out | cancelled login must navigate back | a "back" link and no history traps |

```tsx
// src/auth/LoginPage.tsx (this lab, abridged)
<form onSubmit={onSubmit} noValidate>
  <h1>Sign in</h1>
  <label htmlFor="email">Email</label>
  <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={…} />

  <label htmlFor="password">Password</label>
  <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={…} />

  {error !== null && <p role="alert">{error}</p>}
  <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
</form>
```

---

## 2. The submit handler, line by line

```tsx
const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();                       // we are handling the submit ourselves
  setSubmitting(true);
  const ok = await login(email, password);      // the provider owns the request + storage
  setSubmitting(false);
  if (ok) {
    const state = location.state as LocationState | null;
    navigate(state?.from ?? '/', { replace: true });   // ← return-to, and replace: no back-button trap
  }
};
```

- **`preventDefault`** stops the browser's navigation. In the React 19 action style (Part 11, file 03) React does this for you; either is fine — pick one per form.
- **`login()` returns a boolean** and sets the error inside the provider, so the page does not duplicate status-code logic. `context` is the right home for that rule (Part 9).
- **`navigate(..., { replace: true })`** matters: without `replace`, the browser's Back button returns to the login screen (now pointless) instead of the page before it.
- **`state?.from ?? '/'`** is the measured return-to behaviour: the guard passed `from: location.pathname` when it redirected (file 04).

⚠️ Do not `navigate` inside the provider. Redirecting is a *screen* concern (it depends on where the user was), while authenticating is an *app* concern. Keeping them apart is what makes the provider importable in tests without a router.

---

## 3. What to show when things go wrong

| Failure | Status | Message | Extra |
| --- | --- | --- | --- |
| Wrong email or password | 401 | "Wrong email or password." | never say which one is wrong |
| Too many attempts | 429 | "Too many attempts. Try again in a minute." | show the retry-after if provided |
| Account locked / unverified | 403 | "Your account needs verification." | link to the verification flow |
| Network failure | — | "Network error — check your connection and try again." | keep the fields filled |
| Unexpected server error | 5xx | "Something went wrong. Please try again." | log the correlation id for support |
| Client validation | — | field-level messages under each field | do not submit; keep the values |

```tsx
// The mapping lives in the provider (or the HTTP client), not in the JSX
if (!response.ok) {
  setError(response.status === 401 ? 'Wrong email or password.' : `Sign-in failed (${response.status}).`);
  return false;
}
```

⚠️ **Two habits that make messages trustworthy:** never echo server error text verbatim into the UI (it may contain internals or be unlocalised), and always keep the user's typed email so a retry is one keystroke, not a retype.

---

## 4. Registration: the parts that differ

Registration looks like login with more fields, but four things are genuinely different:

| Concern | Login | Registration |
| --- | --- | --- |
| Password rules | not needed (the server decides) | show requirements **before** submission, and only the rules that are enforced |
| Confirmation field | no | yes — validate equality *and* decide what to do when one field changes (Part 8's `deps`) |
| Server errors | credentials | per-field errors (email taken, weak password) → map 422/409 to fields |
| Success behaviour | store the session, navigate | either log in automatically (store the session) **or** send to login with a "check your email" message |
| Terms/consent | no | a checkbox that must be checked server-side too |

```tsx
// Registration submit, using the action form from Part 11, file 03
const [state, formAction, isPending] = useActionState(async (_previous: RegisterState, formData: FormData) => {
  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values: Object.fromEntries(formData) };
  const response = await fetch('/api/auth/register', { method: 'POST', body: JSON.stringify(parsed.data), headers: { 'content-type': 'application/json' } });
  if (response.status === 409) return { errors: { email: ['That email is already registered'] }, values: {} };
  return { ok: true, errors: {}, values: {} };
}, { ok: false, errors: {}, values: {} });
```

💡 **Say what the password rules are in the UI, and make them match the server exactly.** A client-only "8+ characters" rule that the server does not enforce is theatre; a server rule the client does not show produces confusing failures. One Zod schema used in both places (Part 8) is the way to keep them honest.

⚠️ **Never log passwords, never send them in a query string, and never keep them in state after a successful login.** Clear the password field on success, and do not put it in a store (Part 9's devtools would show it).

---

## 5. The measured behaviour

```text
 ✓ src/auth/session.test.tsx > session handling > redirects to the login page when there is no session, remembering where the user was going 163ms
 ✓ src/auth/session.test.tsx > session handling > renders a protected route for an authenticated session 8ms
 ✓ src/auth/session.test.tsx > session handling > blocks a route when the user lacks the role 13ms
 ✓ src/auth/session.test.tsx > session handling > signs in, stores the session and returns to the intended route 201ms
 ✓ src/auth/session.test.tsx > session handling > shows a message for wrong credentials and does not store anything 117ms
 ✓ src/auth/session.test.tsx > session handling > treats an expired stored session as no session at all 1ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

```tsx
// the login test, complete
it('signs in, stores the session and returns to the intended route', async () => {
  const user = userEvent.setup();
  server.use(http.post('/api/auth/login', () => HttpResponse.json(session)));   // MSW (Part 13, file 05)
  render(<App initialSession={null} />);                                        // starts at /admin

  await user.type(await screen.findByLabelText('Email'), 'asha@shop.test');
  await user.type(screen.getByLabelText('Password'), 'correct-horse');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Admin area')).toBeInTheDocument();   // ← returned to where they were going
  expect(tokenStore.read()?.token).toBe('token-123');                 // ← the session was persisted
});
```

Four lessons in that one test:

1. **It asserts the user-visible outcome** (`Admin area`) rather than "login was called" — a behaviour test (Part 13, file 01).
2. **It asserts the persistence side effect** (`tokenStore.read()`), because "signed in but not remembered after refresh" is a real bug the UI assertion would miss.
3. **It covers the guard + provider + router together** — a small integration test, which is where the return-to behaviour lives.
4. **It is fast** (201 ms) because MSW returns instantly; the fake network is the reason the whole suite runs in under two seconds.

---

## 6. Accessibility and keyboard details that are easy to skip

| Detail | Why |
| --- | --- |
| Error summary + `role="alert"` | announced when it appears, without moving focus unexpectedly |
| Move focus to the first invalid field on submit | keyboard users are not left hunting |
| Do not disable fields while submitting, only the button | disabling inputs loses the values in some browsers and confuses autofill |
| `aria-busy` on the form | announces that something is happening |
| Show/hide password toggle with `aria-pressed` | a real usability win, especially on mobile |
| Announce success before navigating | otherwise screen-reader users hear nothing |

```tsx
<button type="submit" disabled={submitting} aria-busy={submitting}>Sign in</button>
```

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | "That email is not registered" | tells attackers which accounts exist | one generic credential message |
| 2 | No pending state | double submits, duplicated sessions | disable + label change |
| 3 | Navigating to `/` after login | the user loses their destination | `state.from` with `replace: true` |
| 4 | `navigate` without `replace` | Back returns to the login page | `{ replace: true }` |
| 5 | `type="text"` for email/password | no password manager, wrong mobile keyboard | correct `type` + `autoComplete` |
| 6 | Missing `<label>` | broken a11y and unqueryable tests | real labels (not placeholders as labels) |
| 7 | Client-only password rules | the server accepts weaker passwords | one schema, server-enforced |
| 8 | Echoing server error text | internals and unlocalised strings leak | map statuses to your own messages |
| 9 | Clearing the email on failure | the user retypes it | keep the values |
| 10 | Storing the password in state after success | it lingers in memory/devtools | clear it on success |
| 11 | Registration that logs the user in without verifying email | accounts with typo'd emails | decide (and state) the policy |
| 12 | No route to register/recovery | a dead end for new users | link both flows |

---

## 8. Best practices

1. **Design the error states before the happy path** — that is where the screen's quality shows.
2. **Keep credential rules on the server and mirror them in the UI** with one shared schema.
3. **Return users to their intended destination**, with `replace` navigation.
4. **Use real labels, correct `type`s and `autoComplete`**, and test with a password manager once.
5. **Announce errors and busy states** (`role="alert"`, `aria-busy`), and focus the first problem.
6. **Keep the login page's logic thin** — the provider does authentication, the router does navigation.
7. **Rate-limit and lock out on the server**, and surface the 429 message honestly.
8. **Test success, wrong credentials, network failure and the session-expired path** (Part 13, file 05).
9. **Add a "signed in as" affordance somewhere** so users know which account they are using (file 06).
10. **Never log credentials or tokens**, at any level.

---

## 9. Practice

### Beginner

1. Build a login form with email and password fields, a pending state, and an error region. Test it: success stores a session, failure does not.
2. Add the correct `type`, `autoComplete` and label for every field, then check the form with a password manager and the keyboard only.
3. Write the messages for 401, 429 and a network failure.

### Intermediate

1. Add registration with per-field errors (email taken → the email field), using a Zod schema shared with the server contract.
2. Implement "return to where I was going" and prove it with a test: start at a protected route, sign in, assert the destination.
3. Add a "session expired" flow: if the provider finds a session that expired, show the login page with a specific message and preserve the intended route.

### Challenge

1. Add a two-factor step: after a correct password, the server returns a challenge token; the UI moves to a code-entry screen; the session is only created after the code is verified. Design the states, and decide what happens if the user refreshes mid-challenge.
2. Build a password-recovery flow (request → email token → set new password) with the same standards: no account enumeration, rate limiting messages, and a clear success state. Write the tests that prove the enumeration protection.
3. Audit an existing login form against the table in section 1 and fix everything: report each item as pass/fail before and after, including the accessibility items.

---

## 10. Solutions

### Beginner

1. The measured test in section 5 is the template: it asserts the destination appears, the token is stored, and (in the failure variant) that the alert shows the mapped message and `tokenStore.read()` is `null`.
2. `<input id="email" name="email" type="email" autoComplete="username" />` + `<label htmlFor="email">Email</label>`; for password, `type="password" autoComplete="current-password"`. Keyboard check: Tab order follows the DOM, Enter submits, and the error is announced.
3. 401 → "Wrong email or password." 429 → "Too many attempts. Try again in a minute." Network → "Network error — check your connection and try again." All three keep the entered email.

### Intermediate

1. The action form from Part 11, file 03, with `RegisterSchema` (Zod) parsed in the action; 409 maps to `{ email: ['That email is already registered'] }`, and the returned `values` keep everything the user typed.
2. The guard sets `state={{ from: location.pathname }}`; the login page reads `location.state` and navigates with `replace: true`. The test starts at `/admin` (measured), signs in, and asserts `Admin area` is visible.
3. In the provider's restore effect, compare `expiresAt`: if the stored session is expired, set `status: 'anonymous'` **and** an `expired: true` flag; the login page renders "Your session expired — sign in again to continue." The intended route is passed through the guard's `from` state, so the flow is identical to a first login.

### Challenge

1. States: `credentials → challenge (code entry) → authenticated`, with the challenge token held in memory (not storage) and a short expiry. On refresh mid-challenge, the user restarts the challenge (the password step is not repeated if the challenge is still valid server-side, which is why the token+state belongs in `sessionStorage` with a TTL). Design rule: the session is created only after the second factor verifies; the challenge token is not a session.
2. The enumeration protection: the request endpoint always returns 200 with "If that email exists, we sent a link", whether or not the account exists; the UI shows the same message in both cases; the test asserts identical DOM for an existing and a non-existing email (a spy on the response can prove the endpoint behaved the same). Rate limiting: 429 with a retry-after, surfaced as a message, and the same message regardless of account existence.
3. A realistic audit finds: placeholder-as-label (fails the label check), missing `autoComplete` (password managers do not offer to fill), no pending state (double submits), a 401 message that leaks whether the email exists, `navigate('/')` after login, and an error not announced to screen readers. Each fix is small; the report is valuable because the items are checkable.

---

## 11. Summary

- **The login screen is a product surface**: correct input types and `autoComplete`, real labels, a pending state, honest errors, and a route to registration and recovery.
- **Keep the logic split**: the provider authenticates and stores, the page renders and navigates, the router holds the destination. That split is what makes the measured tests possible without a browser.
- **One generic message for credential failures** (no account enumeration), mapped from status codes in one place, with the user's input preserved.
- **Return-to behaviour is measured and worth having**: `state={{ from }}` in the guard plus `navigate(from, { replace: true })` in the page — the test asserts the user lands on `Admin area` after signing in from a protected route (201 ms), and that a wrong password stores nothing (117 ms).
- **Registration differs in four ways**: visible password rules that match the server, a confirmation field, per-field server errors (409/422), and an explicit post-registration policy.
- **Accessibility is part of the screen**: announced errors, focus management, `aria-busy`, and never disabling input fields while submitting.
- **Test the four paths**: success, wrong credentials, network failure, expired session — the whole auth suite in this lab is six tests and under two seconds.

---

**What's next →** [`03-jwt.md`](./03-jwt.md) goes under the hood of token auth: what a JWT actually contains, access versus refresh tokens, expiry and clock skew, the 401 → refresh → retry interceptor that makes expiry invisible to users, and what to do when the refresh itself fails.
