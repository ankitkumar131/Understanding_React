# 06 — Frontend Security: XSS, CORS, CSRF, CSP and the Browser's Rules

> **Part 15 · Production · File 6 of 8**

Why this file exists: the browser has three security mechanisms most React developers use daily without being able to explain — the same-origin policy that makes CORS necessary, the cookie rules that make CSRF possible, and the escaping rules that make React safe by default and dangerous the moment you step outside them. This file explains each one from the browser's point of view, with a lab measurement that shows exactly what React escapes and what it does not: rendering `<img src=x onerror="alert(1)">` as a text child produced **escaped text, no element**, while the same string through `dangerouslySetInnerHTML` produced **a real `<img>` element with a working `onerror`**, and React's own `javascript:` URL protection in JSX turned out **not** to apply to raw HTML. It ends with CORS, cookies and CSRF, content security policy, supply-chain hygiene, and a review checklist.

Measured: [`react-lab/evidence/part15-xss.txt`](../../react-lab/evidence/part15-xss.txt).

---

## 1. XSS: the three kinds, and why React escapes by default

| Kind | Where the payload lives | Example |
| --- | --- | --- |
| **Stored** | in your database, served to other users | a comment containing `<script>` |
| **Reflected** | in the URL/response of your own request | `?q=<img onerror=...>` echoed into the page |
| **DOM-based** | in the client, from `innerHTML`, `eval`, or a URL | `el.innerHTML = location.hash` |

React's protection is simple and effective: **it escapes text children and attribute values**, so data becomes text, not markup. Measured in this lab:

```tsx
const attack = '<img src=x onerror="alert(1)">';
render(<p>{attack}</p>);
```

```text
text child -> DOM:         <p>&lt;img src=x onerror="alert(1)"&gt;</p>
text child -> textContent: <img src=x onerror="alert(1)">
attribute -> DOM:          <div title="<img src=x onerror=&quot;alert(1)&quot;>">x</div>
```

Note what happened: the DOM contains **escaped text** (`&lt;img …&gt;`), the user sees the literal characters, and **no element was created**. That is the default, and it covers the overwhelming majority of cases.

The four ways to lose that protection:

```tsx
// 1. dangerouslySetInnerHTML — the name is the warning label (measured)
render(<div dangerouslySetInnerHTML={{ __html: attack }} />);
// DOM: <div><img src="x" onerror="alert(1)"></div>   ← a real element with a live onerror
```

```tsx
// 2. A URL prop — React blocks javascript: in JSX (measured), but see below
render(<a href="javascript:alert(1)">click</a>);
// DOM: <a href="javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')">
```

```tsx
// 3. …but that protection does NOT apply to raw HTML (measured)
render(<div dangerouslySetInnerHTML={{ __html: '<a href="javascript:alert(1)">click</a>' }} />);
// DOM: <div><a href="javascript:alert(1)">click</a></div>
```

```ts
// 4. Anything that is not React at all: direct DOM writes, eval, third-party scripts
element.innerHTML = userInput;           // no escaping at all
new Function(userInput);                 // arbitrary code execution
```

| Sink | Escaped by React? | Rule |
| --- | --- | --- |
| Text children `{value}` | ✅ yes | the default; use it |
| Attribute values `attr={value}` | ✅ yes | safe for `title`, `alt`, `value`… |
| `href` / `src` | ✅ `javascript:` blocked in JSX (measured) | still validate against an allowlist |
| `dangerouslySetInnerHTML` | ❌ **no** | sanitise first (section 2) |
| `style={value}` | partially | a value like `url(javascript:…)` is a risk; never pass user input |
| Direct DOM / `eval` / `innerHTML` | ❌ no | do not; if you must, sanitise |
| A third-party script | n/a | it runs with full access to your page (section 5) |

⚠️ **URLs need an allowlist, not just escaping.** `href="https://evil.example/?next=…"` is not XSS but it is phishing, and `data:text/html,<script>…</script>` in a link can be an XSS vector in some browsers. Validate schemes explicitly:

```ts
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

export function safeUrl(input: string): string {
  try {
    const url = new URL(input, window.location.origin);
    return SAFE_SCHEMES.includes(url.protocol) ? url.toString() : '#';
  } catch {
    return '#';
  }
}

<a href={safeUrl(linkFromApi)}>Open</a>
```

---

## 2. Rendering user HTML safely

If you genuinely need rich text (a comment with bold, a CMS block), sanitise it **before** it reaches the DOM, with a library that maintains a maintained allowlist:

```tsx
import DOMPurify from 'dompurify';

function RichText({ html }: { html: string }) {
  const clean = useMemo(
    () => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'code', 'pre'], ALLOWED_ATTR: ['href', 'title'] }),
    [html],
  );
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

| Rule | Why |
| --- | --- |
| Sanitise on **render**, not only on save | old rows, other sources, and API changes all bypass your save path |
| Allowlist tags/attributes; never a blocklist | attackers have more tags than you have time |
| Keep `target="_blank"` links with `rel="noopener noreferrer"` | prevents `window.opener` tabnabbing |
| Do not sanitise in `useEffect` after rendering | the payload already ran |
| Prefer a markdown subset rendered by your own component | a much smaller attack surface than raw HTML |

💡 **The best fix is usually not needing HTML.** If the requirement is "bold and links", a tiny structured format (markdown with a restricted renderer, or `{ text, marks }` spans) removes the whole class of risk — no sanitiser to configure, no allowlist to maintain.

---

## 3. Same-origin policy and CORS

**Origin = scheme + host + port.** `https://app.example.com:443` and `http://app.example.com` are different origins; so are `https://api.example.com` and `https://app.example.com`. The browser allows your page to *display* cross-origin resources (images, scripts) but blocks your **JavaScript** from *reading* cross-origin responses — that is the same-origin policy, and CORS is the server's way to say "these other origins may read my responses in a browser".

```http
# The server's response to a cross-origin fetch
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
Access-Control-Allow-Headers: content-type, authorization
Vary: Origin
```

| Situation | Request sent? | Notes |
| --- | --- | --- |
| **Simple** request (GET/POST with simple headers and content types) | yes, then the browser checks the response | a blocked response still *reached* the server — mutations can happen |
| **Preflighted** (PUT/PATCH/DELETE, custom headers like `authorization`, `content-type: application/json`) | an `OPTIONS` preflight first | the real request is only sent if allowed |
| Credentials (`credentials: 'include'`, cookies) | yes, only if `Allow-Credentials: true` **and** a specific origin | ⚠️ `Allow-Origin: *` with credentials is invalid and browsers reject it |
| Cross-origin, no CORS headers | the browser blocks **reading** the response | DevTools shows a CORS error, not a status code |

```ts
// Client side: the two settings that matter
await fetch('https://api.example.com/products', {
  credentials: 'include',                  // only if you use cookies across origins
  headers: { authorization: `Bearer ${token}` },   // triggers a preflight
});
```

| CORS error you will see | Usual cause | Fix |
| --- | --- | --- |
| "No `Access-Control-Allow-Origin` header" | server sends none for your origin | add the header (echo the exact origin, with `Vary: Origin`) |
| "Credentials flag is true, but `Allow-Origin` is `*`" | wildcard + credentials | echo the specific origin |
| "Method PUT is not allowed" | preflight response lacks the method | add `Allow-Methods` |
| "Request header field authorization is not allowed" | preflight lacks the header | add `Allow-Headers` |
| Works in `curl`, fails in the browser | CORS is a **browser** rule | test in the browser; do not disable it |

⚠️ **CORS is not authorisation and not CSRF protection.** It restricts which *origins* may read responses in a browser; it does nothing for a `curl` client, a server-to-server call, or a form POST from another site. The API must authenticate and authorise every request regardless.

💡 **The same-origin shortcut**: if your SPA is served from the same origin as its API (or the dev server proxies `/api` to the backend), there is no CORS problem at all, and cookies become far simpler. Part 15, file 01's `apiUrl ?? '/api'` default is exactly this idea.

---

## 4. Cookies, CSRF and how to stop it

```http
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax; Path=/; Domain=app.example.com; Max-Age=3600
```

| Attribute | Effect | Why it matters |
| --- | --- | --- |
| `HttpOnly` | JavaScript cannot read the cookie | an XSS cannot steal the session token |
| `Secure` | sent only over HTTPS | no leakage over plain HTTP |
| `SameSite=Strict` | never sent on cross-site requests | strongest CSRF defence; can break external links/redirects |
| `SameSite=Lax` | sent on top-level GET navigations | the practical default; protects POST/PUT/DELETE |
| `SameSite=None` | always sent, requires `Secure` | for genuine cross-site use cases (embeds, third-party) |
| `Domain` / `Path` / `Max-Age` | where and how long | narrower is safer |

**CSRF in one paragraph:** cookies are attached automatically to requests to your origin, so another site can make the victim's browser send an authenticated request (via a form POST or an image) without the victim knowing. The server sees a valid session cookie and performs the action. Mitigations, in order of strength:

| Mitigation | How it works | Notes |
| --- | --- | --- |
| `SameSite=Lax/Strict` | the browser refuses to attach cookies to cross-site requests | the baseline; supported by all current browsers |
| Anti-CSRF token (synchroniser or double-submit) | the client sends a value the attacker cannot know | still the belt-and-braces approach |
| `Origin`/`Referer` validation | the server checks the request's origin | simple and effective when implemented as an allowlist |
| Custom header requirement (`X-Requested-With` or a bearer token) | a cross-site form cannot set custom headers | why bearer-token APIs are naturally CSRF-resistant |
| Re-authentication for sensitive actions | password/2FA prompt | for the highest-risk operations |

```ts
// The bearer-token variant sidesteps CSRF: nothing is sent automatically,
// so a cross-site form post has no credentials (Part 14, file 05 for storage trade-offs).
fetch('/api/orders', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body });
```

⚠️ **Do not build CSRF protection by checking a header in the client.** The protection is the server rejecting requests without a valid token/origin; the client's job is to send the token (from a cookie your JS *can* read, or from a meta tag) and to use `SameSite` cookies.

---

## 5. Content Security Policy and the other headers

CSP is an allowlist the browser enforces: which scripts may run, from where, and what they may connect to. It is the last line of defence when an injection happens.

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-r4nd0m' https://cdn.example.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://images.example.com;
  connect-src 'self' https://api.example.com;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  report-uri /api/csp-report
```

| Directive | Controls | Common mistake |
| --- | --- | --- |
| `default-src` | the fallback for everything | leaving it `*` while tightening scripts |
| `script-src` | scripts and inline handlers | `'unsafe-inline'` (defeats much of the value) |
| `style-src` | stylesheets and inline styles | `'unsafe-inline'` is often unavoidable with CSS-in-JS |
| `connect-src` | `fetch`/XHR/WebSocket targets | forgetting your API host |
| `img-src` | image sources | forgetting `data:` for icons or your CDN |
| `frame-ancestors` | who may embed you | replacing `X-Frame-Options` |
| `report-uri` / `report-to` | where violations are sent | never collecting reports |

```text
Deploy order that does not break production:
1. Content-Security-Policy-Report-Only: <policy>      ← collect violations, break nothing
2. Fix what legitimately needs allowing (often: a nonce for your bundle, a CDN host)
3. Content-Security-Policy: <policy>                   ← enforce
4. Watch the reports for a week, then tighten further
```

💡 **A nonce-based policy is what modern apps should aim for**: the server generates a random value per response, your bundle's `<script>` tag carries `nonce="…"`, and inline scripts are allowed only with it. Vite's build emits external scripts, so a `script-src 'self'` policy with a nonce for any inline bootstrap code is achievable without `unsafe-inline`.

Also worth setting: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy` for isolation.

---

## 6. Supply chain: the code you did not write

| Risk | Practice |
| --- | --- |
| A dependency ships a compromised version | commit the lockfile; use `npm ci`; enable Dependabot/Renovate and review upgrades |
| A typo-squatted package | check the name, downloads, repository and publisher before installing |
| A dependency with full page access (analytics, chat widgets, A/B tools) | load third-party scripts with `integrity` (SRI) where possible, prefer the fewest vendors, and treat them as trusted code |
| Anonymous use of a CDN script | self-host or pin a version + SRI |
| Secrets in the bundle | file 01's rule: nothing privileged in client code |
| Postinstall scripts | `npm ci --ignore-scripts` in CI where feasible; review what runs |

```bash
npm audit --production            # known vulnerabilities in shipped dependencies
npm outdated                      # what is behind
npx npm-check-updates             # a review list, not an autopilot
```

⚠️ **Every third-party script you add is code with full access to your page and your users' data.** A chat widget can read the DOM, read `localStorage`, and exfiltrate anything (including tokens kept there — Part 14, file 05). Minimise the list and review it as carefully as your own code.

---

## 7. Authentication and authorisation, in one page

This part's earlier chapters cover the detail; the security summary is worth repeating because it is the most commonly misunderstood boundary:

| Statement | Reality |
| --- | --- |
| "The button is hidden, so it is protected." | ❌ the API is one `curl` away; enforce on the server |
| "The route guard protects the page." | ❌ it protects the *user experience*; data must be protected by the API |
| "The token is in `localStorage`, so it is safe." | ❌ any XSS reads it; prefer `HttpOnly` cookies + CSRF protection |
| "It is HTTPS, so it is secure." | ❌ HTTPS protects the wire; XSS, CSRF and authorisation are separate problems |
| "CORS protects my API." | ❌ CORS is a browser rule; `curl` ignores it |
| "We validate on the client." | ❌ client validation is for UX; the server validates as the source of truth |

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `dangerouslySetInnerHTML` with unsanitised input | the measured `<img onerror>` case: full XSS | sanitise on render, or avoid HTML |
| 2 | Trusting that React escapes "everywhere" | raw HTML, URLs, direct DOM writes escape nothing | know the four sinks (section 1) |
| 3 | No URL allowlist | `javascript:`/`data:` links, open redirects | scheme allowlist (`safeUrl`) |
| 4 | `target="_blank"` without `rel="noopener"` | tabnabbing via `window.opener` | add `rel="noopener noreferrer"` |
| 5 | `Allow-Origin: *` with credentials | browsers refuse; devs "fix" it by disabling cookies | echo the specific origin + `Vary: Origin` |
| 6 | Treating CORS as security | server-to-server and `curl` bypass it | authenticate/authorise every request |
| 7 | Cookies without `HttpOnly`/`Secure`/`SameSite` | stealable, leakable, forgeable | set all three deliberately |
| 8 | Assuming bearer tokens remove all CSRF risk | true for cookies, but XSS still steals tokens | fix XSS too |
| 9 | `'unsafe-inline'` in `script-src` | CSP provides little protection | nonce-based policy |
| 10 | Deploying a strict CSP without report-only first | site-wide outage | report-only, then enforce |
| 11 | Unreviewed third-party scripts | they can exfiltrate everything | minimise, pin, SRI |
| 12 | Secrets in `VITE_` variables | published credentials | server-side secrets (file 01) |

---

## 9. Best practices

1. **Render data as text** (`{value}`) — React escapes it; make that the default and the exception rare.
2. **If you must render HTML, sanitise on render** with a maintained allowlist library, and keep the tag list short.
3. **Allowlist URL schemes** for every `href`/`src` that comes from data, and add `rel="noopener noreferrer"` to external links.
4. **Cookies: `HttpOnly; Secure; SameSite=Lax` as the baseline**, `Strict` where it does not break flows.
5. **Choose your CSRF story explicitly**: `SameSite` + origin checks, or an anti-CSRF token, or bearer tokens — and write it down.
6. **CORS on the server**: exact origins, minimal methods/headers, `Vary: Origin`, `credentials` only when needed.
7. **Ship a CSP in report-only first**, then enforce; aim for a nonce policy without `unsafe-inline`.
8. **Validate and escape on the server too** — the client is not the boundary; assume every request can be forged.
9. **Minimise third-party code**, pin versions, use SRI where possible, and audit dependencies regularly.
10. **Test the security-relevant behaviour**: an XSS-ish string renders as text, a `javascript:` URL is neutralised, a low-privilege token gets a 403 (Part 13, file 05; Part 14, file 06).

---

## 10. Practice

### Beginner

1. Render `<img src=x onerror="alert(1)">` as a text child and inspect the DOM. Explain why no element appears.
2. Do the same with `dangerouslySetInnerHTML` and observe the difference. Add `DOMPurify.sanitize` and check that the element disappears.
3. Test an `href` from data: pass `javascript:alert(1)`, then `data:text/html,<script>alert(1)</script>`, and fix both with a scheme allowlist.

### Intermediate

1. Build a small cross-origin request (a static page on one port, an API on another) and observe: a simple request that succeeds without CORS headers for the *server* but fails for *you*; then add the headers and fix it. Document the preflight for a `POST` with `content-type: application/json`.
2. Configure cookies with `HttpOnly`, `Secure`, `SameSite=Lax` and prove (from JS) that `document.cookie` does not show the session cookie, while the request still carries it.
3. Write a CSP in report-only mode for your app, collect violations, and produce the final policy. Note every allowance you had to add and why.

### Challenge

1. Perform a mini security review of a small app: run the checklist in section 9, and for each finding write the exploit sketch (how it could be triggered), the impact, the fix, and a test that proves the fix.
2. Implement CSRF protection end to end for a cookie-based session: the server issues a token, the client sends it back on mutations, the server validates it plus the `Origin`; then write a test that fails without the token.
3. Design the CSP for an app that uses a third-party analytics script, a font CDN, and `styled-components`-style runtime styles. Produce a policy, a report-only rollout plan, and the trade-offs you accepted (which often include `style-src 'unsafe-inline'`).

---

## 11. Solutions

### Beginner

1. React sets the string as a **text node**, so the DOM contains escaped characters (`&lt;img src=x onerror="alert(1)"&gt;`) — measured. The browser parses markup only from HTML, and no HTML was created, so nothing runs.
2. `dangerouslySetInnerHTML` writes the string as HTML: the measured DOM was `<div><img src="x" onerror="alert(1)"></div>`, a real element with an `onerror` attribute. With `DOMPurify.sanitize(attack)` the `<img>` is removed (or its `onerror` attribute stripped, depending on the config) and the string renders as harmless text.
3. **Both are dangerous**: React blocks `javascript:` in JSX (measured: the href is rewritten to a `throw new Error('React has blocked…')` string), but `data:text/html,…` links and raw-HTML paths are not covered. The fix is `safeUrl()` with an allowlist of `http:`, `https:`, `mailto:`, `tel:` — anything else becomes `#`.

### Intermediate

1. A `GET` from `http://localhost:5173` to `http://localhost:3001/api/x` is sent, but the browser refuses to expose the response without `Access-Control-Allow-Origin: http://localhost:5173`. The `POST` with `content-type: application/json` triggers an `OPTIONS` preflight that must return the method and header allowances. Note the important detail: for a *simple* request the server already processed it — CORS protects reading, not acting, which is why CSRF exists.
2. `Set-Cookie: session=…; HttpOnly` is invisible to `document.cookie` (the browser hides it from JS) but is attached to requests to the same origin; verify in DevTools → Application → Cookies that the `HttpOnly` column is ticked, and in the Network tab that the request sends it. `SameSite=Lax` means it is *not* sent on a cross-site POST — you can demonstrate this with two local origins.
3. A typical first policy is `default-src 'self'; connect-src 'self' https://api.example.com; img-src 'self' data: https://images.example.com; style-src 'self' 'unsafe-inline'`. The violation reports show what you missed; the allowances you added should each have a comment explaining the vendor or feature that requires them — that list is the honest measure of your app's attack surface.

### Challenge

1. Findings usually include: a `dangerouslySetInnerHTML` in a rich-text component (exploit: a comment field, impact: session theft if tokens are in `localStorage`, fix: sanitise + move tokens to cookies, test: render the payload and assert no element), a missing CSP (fix: report-only → enforce), an API endpoint that trusts a client-provided `role` (fix: derive from the token, test: 403 for a forged role), and an external link without `rel="noopener"`.
2. Server: on login, set a `csrf` cookie readable by JS (not `HttpOnly`) and include `csrfToken` in the session; on every mutation, the client sends `X-CSRF-Token: <token>`, the server compares it to the value bound to the session **and** checks `Origin`. The failing test: send the mutation without the header → 403; with the header → 200. Keep `SameSite=Lax` as well — defence in depth.
3. Policy sketch: `script-src 'self' 'nonce-…' https://www.googletagmanager.com; connect-src 'self' https://api.example.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'; object-src 'none'`. Rollout: report-only for a week, fix violations, enforce, then tighten (e.g. move fonts to self-hosting to drop two allowances, replace the analytics script with a server-side proxy to drop the vendor entirely). The accepted trade-off is `'unsafe-inline'` for styles, which is common with runtime CSS-in-JS and worth replacing with a build-time solution when you can.

---

## 12. Summary

- **React escapes text children and attribute values** — measured: `<p>&lt;img src=x onerror="alert(1)"&gt;</p>` with **no element created**. That default covers most cases; four sinks escape nothing: `dangerouslySetInnerHTML`, URL props (partially — React blocks `javascript:` in JSX, measured), direct DOM writes, and non-React code.
- **Raw HTML bypasses React's own protections** — measured: `dangerouslySetInnerHTML` created a real `<img onerror>` and, in the second case, a working `javascript:` link. Sanitise on render with an allowlist library, or avoid HTML entirely.
- **Allowlist URL schemes** and add `rel="noopener noreferrer"` to external links; `javascript:` and `data:` are separate injection paths from HTML.
- **CORS is a browser reading rule**, not security: simple requests still reach the server, credentials require a specific origin (never `*`), and `curl` ignores all of it — so the API must authenticate and authorise every request.
- **CSRF exists because cookies are automatic**: the baseline defence is `SameSite=Lax/Strict` plus `HttpOnly`/`Secure`, with anti-CSRF tokens or origin checks layered on; bearer-token APIs are naturally resistant.
- **CSP is the last line of defence**: roll it out in report-only mode, aim for a nonce-based `script-src` without `unsafe-inline`, and tighten using the violation reports.
- **Third-party scripts run with full access to your page** — minimise them, pin versions, use SRI, and audit dependencies with a lockfile and `npm audit`.
- **Hiding in the UI is never protection**; the server is the authority, and the tests that matter assert 403s and escaped output rather than hiding.

---

**What's next →** [`07-performance.md`](./07-performance.md) turns attention to speed, starting from this lab's measurements: rendering 1000 rows cost 73.5 ms to mount and a state update re-rendered all 1000 rows (56 ms), `memo` + `useCallback` reduced that to **0 row renders and 7.7 ms**, and 20 000 rows cost ~1 second to mount — evidence for the rules about re-renders, memoization (and what React Compiler now does for you), code splitting, list virtualisation, and measuring before optimising.
