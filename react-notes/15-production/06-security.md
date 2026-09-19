# 06 — Frontend Security: XSS, CSRF, CORS, CSP and Dependencies

> **Part 15 · Production · File 6 of 8**

Why this file exists: a React app's attack surface is different from a server-rendered app's,
and the defaults that make it safer are invisible until you break them. This file covers the
threats that actually affect SPAs — XSS through the handful of escape hatches React gives
you, token storage (with Part 14's trade-offs applied), CSRF and CORS as *browser* features
rather than server bugs, Content Security Policy as defence in depth, and dependency
vulnerabilities, which are how most frontend compromises actually happen.

**The rule this whole file builds toward:** *frontend validation is a user-experience
feature. It is never a security control.* Every check you write in React can be bypassed by
anyone with `curl`. The server must enforce everything again.

---

## 1. XSS: the one vulnerability you can cause in React

**Cross-Site Scripting** = attacker-supplied text becomes attacker-supplied *code* in your
page. Once it runs, it can read `localStorage` (your tokens), call your API as the user,
rewrite the DOM, and exfiltrate data.

React protects you by default: **everything rendered inside `{}` is escaped.**

```tsx
const comment = '<img src=x onerror="alert(1)">';

// ✅ SAFE — renders as literal text, no script runs
<p>{comment}</p>
// Output: <p>&lt;img src=x onerror="alert(1)"&gt;</p>
```

⚠️ **The escape hatches — the only ways to get XSS in a normal React app:**

```tsx
// ❌ 1. dangerouslySetInnerHTML — the name is the warning
<div dangerouslySetInnerHTML={{ __html: userComment }} />

// ❌ 2. javascript: URLs in href/src
<a href={userProfileUrl}>Profile</a>   // if userProfileUrl === 'javascript:alert(1)'

// ❌ 3. Third-party scripts/widgets injected at runtime
// ❌ 4. Server responses served with the wrong content-type
```

**Fixing each one**

```tsx
// ✅ 1. Sanitise first — DOMPurify is the standard, allow-list-based choice
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userComment, { USE_PROFILES: { html: true } });
<div dangerouslySetInnerHTML={{ __html: clean }} />

// ✅ 2. Validate the scheme, never trust a user-supplied URL
function safeHref(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.href : '#';
  } catch {
    return '#';
  }
}
<a href={safeHref(userProfileUrl)}>Profile</a>
```

🔍 **Why `{}` is safe but `__html` is not:** JSX compiles to `createElement` calls; React
sets text content through DOM text nodes, which cannot execute. `dangerouslySetInnerHTML`
bypasses that and assigns to `innerHTML`, which parses HTML — including `<script>`-adjacent
tricks like `<img onerror>`. (Note: `<script>` inserted via `innerHTML` does *not* execute,
but dozens of other vectors do — which is why "it didn't alert, so it's fine" is not a test.)

💡 **DOMPurify is an allow-list sanitizer.** It removes anything not on its list rather
than trying to block known-bad patterns. Regex-based "sanitisers" you write yourself have
been bypassed for twenty years; do not write one.

🏭 **Sanitise on the server too** (or instead). Client-side sanitisation can be bypassed by
skipping the client — and the stored payload will then attack the *next* user through any
other consumer (a mobile app, an email digest, an admin panel).

---

## 2. Token storage, applied

Part 14 file 05 laid out the trade-offs. The security summary:

| Storage | XSS can steal it? | CSRF risk? | Verdict |
| --- | --- | --- | --- |
| `HttpOnly` cookie | ❌ no | ✅ yes — mitigate with `SameSite` + CSRF token | Best for same-site apps |
| `localStorage` | ✅ **yes** | ❌ no (you attach it manually) | Common in SPAs; requires a strict CSP |
| In-memory + refresh cookie | ⚠️ only during the session | Mitigated | Best security, most work |

The dependency is the important part: **if you store tokens in `localStorage`, your XSS
defence is your token defence.** That is why sections 1 and 5 belong in the same file —
a CSP is not optional polish for an SPA using `localStorage`.

⚠️ **`HttpOnly` only stops JavaScript from *reading* the cookie.** It does not stop
JavaScript from *using* it: injected code can still `fetch('/api/me', { credentials: 'include' })`
and the browser attaches the cookie. `HttpOnly` prevents exfiltration, not abuse.

---

## 3. CSRF and CORS — two browser features people confuse

### CORS (Cross-Origin Resource Sharing) — a *server* setting

CORS is the browser asking a server "may this origin read your response?" It is configured
**entirely on the API**, and a CORS error is a *server configuration* issue, not a React bug.

```http
# What the API must return for your SPA origin
Access-Control-Allow-Origin: https://app.taskboard.example.com
Access-Control-Allow-Credentials: true      # only if you send cookies
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: content-type, authorization
```

⚠️ **`Access-Control-Allow-Origin: *` with `Allow-Credentials: true` is rejected by
browsers** — and if you "fix" it by echoing the `Origin` header back for any origin, you
have allowed every website on the internet to make credentialed requests to your API.
That is a real vulnerability, and it is the most common CORS misconfiguration.

⚠️ **CORS is not a security boundary for your data.** It controls what a *browser* may
read. `curl`, Postman and a malicious server ignore it entirely. Your API must authenticate
every request regardless.

**In development, prefer the Vite proxy over permissive CORS** (Part 16):

```ts
// vite.config.ts — the browser sees same-origin requests, so no CORS at all
server: { proxy: { '/api': 'http://localhost:8000' } }
```

### CSRF (Cross-Site Request Forgery) — a *cookie* problem

CSRF exists **only when authentication rides on automatically-sent cookies**. An attacker's
page makes your browser send a request to your API, and the browser attaches your session
cookie without asking you.

```html
<!-- on evil.example.com: the victim's browser sends this WITH their cookies -->
<form action="https://api.taskboard.example.com/api/tasks" method="POST">
  <input name="title" value="owned" />
</form>
<script>document.forms[0].submit();</script>
```

Defences, in order of effectiveness:

1. **`SameSite=Lax` (or `Strict`) cookies** — the browser omits the cookie on cross-site
   POSTs. This alone stops the attack above. `Lax` is the modern default and is usually
   what you want.
2. **A CSRF token** — a value the attacker's page cannot read, sent as a header
   (`X-CSRF-Token`) and verified by the API. Needed if you must support cross-site cookies.
3. **Bearer tokens in `localStorage`** — not sent automatically, so not CSRF-able. (But see
   section 2: this trades CSRF for XSS.)

💡 **Which do you have?** Ask one question: *does my browser attach authentication to
requests without my code doing anything?* If yes (cookies) → you need CSRF defences. If no
(`Authorization: Bearer` header set by your `httpClient`) → CSRF is not your threat model,
XSS is.

---

## 4. Content Security Policy: defence in depth

A **CSP** is an HTTP response header that tells the browser which sources of scripts,
styles and connections are allowed. Its job is to make a successful XSS *much* less useful:
even if an attacker injects a tag, the browser refuses to run a script from their domain.

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.taskboard.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  object-src 'none'
```

| Directive | What it prevents |
| --- | --- |
| `script-src 'self'` | Loading/executing scripts from an attacker's CDN — **the big one** |
| `connect-src` | Exfiltrating stolen data to `evil.example.com` |
| `frame-ancestors 'none'` | Clickjacking (your app framed inside an attacker's page) |
| `base-uri 'self'` | `<base href>` injection hijacking every relative URL |
| `object-src 'none'` | Legacy plugin content |

⚠️ **Two real frictions**

- **Inline scripts are blocked by `script-src 'self'`.** Any inline `<script>` in
  `index.html` (analytics snippets, theme flash-prevention) needs a `nonce` or hash. Vite's
  build inlines no scripts by default, so this is usually a one-time fix.
- **`style-src 'unsafe-inline'`** is often needed for CSS-in-JS. It is a smaller risk than
  unsafe-inline scripts, but it is still a weakening — prefer nonce-based styles if your
  stack allows.

🏭 **Where to set it:** your hosting layer (a `_headers` file on Netlify, `vercel.json`
headers on Vercel, an nginx `add_header`, a CloudFront response-headers policy). Vite cannot
set it, because the header is emitted by whatever serves `dist/`. Start with
`Content-Security-Policy-Report-Only` to collect violations for a week before enforcing.

---

## 5. Dependencies: how frontend apps actually get compromised

Most real-world frontend incidents are not clever XSS — they are a compromised or
vulnerable npm package running with full access to your users' sessions.

```bash
npm audit                    # known vulnerabilities in your tree
npm audit --json | jq '.vulnerabilities | length'
npm audit fix                # safe (semver-compatible) fixes
npm audit fix --force        # ⚠️ BREAKING major upgrades — read before running
npm outdated               # what is behind
```

| Practice | Why |
| --- | --- |
| Commit `package-lock.json` | Reproducible installs; the lockfile is what `npm ci` uses |
| Use `npm ci` in CI | Installs exactly the lockfile, never resolves new versions |
| Dependabot / Renovate | Vulnerability PRs without you remembering |
| `npm audit` in CI, fail on `high`/`critical` | A merge should not add a known CVE |
| Pin majors, review minors | `^` allows surprise behaviour changes |
| Check before adding a package | Downloads, maintenance date, bundle size, typosquatted name |

⚠️ **Typosquatting is a real vector:** `npm install react-dom-utils` when you meant a
different package, or a name one character off from a popular one. Read the package page
before installing anything you have not used.

⚠️ **`npm audit` reports dev dependencies too.** A vulnerability in a build-only tool that
never ships is usually lower risk than the report implies — but a vulnerability in something
in your `dependencies` (which gets bundled and runs in users' browsers) is not. Triage by
what actually reaches the browser.

---

## 6. Input handling, secrets and the rest

| Concern | Frontend responsibility | Server responsibility |
| --- | --- | --- |
| Validation | Instant feedback, block obvious mistakes | **Authoritative** — reject bad data |
| Authorization (who may do this) | Hide/disable controls (UX) | **Enforce on every endpoint** |
| Secrets | Hold none | Hold all of them |
| Rate limiting | Disable the button after click | **Enforce** |
| Sensitive data | Don't render what you don't need | Don't send what the client doesn't need |

```tsx
// Frontend validation = UX. This stops typos, not attackers.
const schema = z.object({ email: z.string().email(), age: z.number().min(18) });
// An attacker sends { email: 'x', age: -1 } straight to your API. The server must re-check.
```

🏭 **Say this in an interview and you will pass a security question:** "Client-side
validation is a UX feature — it makes the form pleasant. The server is the security
boundary, because the client is fully under the attacker's control. Every check I write in
React has a twin on the API."

Other practical items:

- **Never put secrets in `VITE_` variables** (file 01). A bundle is a public document.
- **Don't log tokens or request bodies** (file 05).
- **Use HTTPS everywhere**, including `localhost` when testing auth cookies with `Secure`.
- **`target="_blank"` gets `rel="noopener noreferrer"`** — modern browsers imply `noopener`,
  but old ones did not, and the reverse-tabnabbing attack was real.
- **Don't render user content as a URL** without a scheme check (section 1).
- **Feature-flag secrets are not secrets.** If the flag is in the bundle, the "hidden"
  feature is discoverable.

---

## 7. A twenty-minute security review checklist

```text
[ ] grep for dangerouslySetInnerHTML — is every use sanitised with DOMPurify?
[ ] grep for href={ / src={ fed by user or API data — is the scheme validated?
[ ] Where are tokens stored? If localStorage: is the CSP strict? Are access tokens short-lived?
[ ] Does auth ride on cookies? If yes: SameSite set? CSRF token needed?
[ ] Does the API echo the Origin header? Is Allow-Credentials + wildcard combination absent?
[ ] Is a CSP set at the hosting layer? Is frame-ancestors 'none'?
[ ] npm audit — any high/critical in `dependencies` (not devDependencies)?
[ ] Is package-lock.json committed and does CI run `npm ci`?
[ ] Does `dist/assets/*.js` contain any credential? (grep it — file 01)
[ ] Are source maps uploaded to the tracker rather than served publicly?
[ ] Is there a single user-facing error path that never prints err.message? (file 04)
[ ] Does every guarded endpoint have a server-side check, not just a hidden button? (Part 14)
```

⚠️ **This checklist finds implementation mistakes. It is not a penetration test.** For
anything handling payments or health data, get a real review.

---

## 8. Common mistakes

| Mistake | Reality |
| --- | --- |
| "React escapes everything, so XSS isn't a risk" | True until the first `dangerouslySetInnerHTML` or `javascript:` URL |
| "CORS blocked it, so we're secure" | CORS is a browser feature; `curl` ignores it |
| "We set `Allow-Origin: *` to fix a bug" | With credentials that is a vulnerability; scope it to your origin |
| "Frontend validation covers it" | The client is the attacker's machine |
| "`HttpOnly` makes cookies safe" | It prevents reading, not using |
| "We hid the admin button" | Hiding is not authorising (Part 14, file 06) |
| "`npm audit` is clean, we're fine" | Check what's in `dependencies` vs dev-only, and keep updating |
| "CSP will break our app" | Start in `Report-Only` mode for a week |
| "A regex strips `<script>`" | Sanitisers based on block-lists are always bypassed; use DOMPurify |

---

## 9. Practice

### Beginner
1. Render `<img src=x onerror="alert(1)">` through `{}` and through
   `dangerouslySetInnerHTML`; observe the difference.
2. Write `safeHref()` and test it with `javascript:alert(1)`, `https://ok.example`,
   `mailto:a@b.c` and `not a url`.

### Intermediate
1. Add DOMPurify to a comment renderer and confirm an injected `<img onerror>` is stripped.
2. Configure the Vite dev proxy so no CORS headers are needed in development, then write
   down which CORS headers production still requires.

### Challenge
1. Set a CSP in `Report-Only` mode against your app and list every violation it reports.
   Classify each as "fix the code" or "widen the policy".
2. Run the twenty-minute checklist against a real project and produce a findings list
   ordered by risk, with a fix for each.

---

## 10. Solutions

### Beginner
1. Through `{}`: the literal text appears on screen. Through `__html`: the browser parses it
   and (in a page without a strict CSP) fires the handler. Same string, opposite outcomes —
   that difference is the entire XSS section.
2. ```ts
   it.each([
     ['javascript:alert(1)', '#'],
     ['https://ok.example', 'https://ok.example/'],
     ['mailto:a@b.c', 'mailto:a@b.c'],
     ['not a url', '#'],
   ])('safeHref(%s) → %s', (input, expected) => expect(safeHref(input)).toBe(expected));
   ```

### Intermediate
1. `DOMPurify.sanitize('<img src=x onerror=alert(1)>hi')` returns `'hi'` — the element is
   removed, the text survives. That is allow-listing: unknown-dangerous is dropped by
   default.
2. With `server.proxy['/api']` the browser sees only same-origin requests, so no CORS
   preflight. Production still needs `Access-Control-Allow-Origin: <your origin>`,
   `Allow-Headers: content-type, authorization`, `Allow-Methods`, and
   `Allow-Credentials: true` **only** if you use cookies.

### Challenge
1. Typical violations: an inline analytics script (fix: nonce or move to a file),
   `style-src` for a CSS-in-JS runtime (widen: `'unsafe-inline'` for styles only),
   `connect-src` for your API and your log endpoint (widen with exact origins),
   `img-src data:` for base64 avatars (widen). Everything else is usually real.
2. The output is a table: finding → risk (high/med/low) → fix → owner. Almost every audit
   finds the same three: an unsanitised HTML render, a wildcard CORS origin, and an
   `npm audit` high in a shipped dependency.

---

## 11. Summary

- **React escapes by default; XSS enters through the escape hatches** —
  `dangerouslySetInnerHTML`, user-controlled URLs, injected third-party scripts.
- **Sanitise with an allow-list library (DOMPurify), never a regex.** And sanitise on the
  server, because clients can be skipped.
- **Token storage decides your threat model:** cookies → CSRF; `localStorage` → XSS. There
  is no free option.
- **CORS is a browser-enforced server setting**, not a security boundary; never combine a
  wildcard origin with credentials.
- **CSRF only matters when auth is sent automatically.** `SameSite` cookies plus a CSRF
  token is the standard defence.
- **A CSP makes successful XSS much less valuable** — set it at the hosting layer, start in
  `Report-Only`.
- **Dependencies are the most common real compromise.** Lockfile committed, `npm ci` in CI,
  automated update PRs, `npm audit` triaged by what reaches the browser.
- **Frontend validation is UX. The server is the security boundary.** Say it plainly,
  every time.

---

**What's next →** [`07-performance.md`](./07-performance.md): performance as a production
requirement. Core Web Vitals, performance budgets, measuring real users instead of your
laptop, and the optimisations that actually move the numbers.
