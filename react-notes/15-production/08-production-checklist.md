# 08 — Deployment & the Production Checklist: From `npm run build` to a URL Users Can Open

> **Part 15 · Production · File 8 of 8**

Why this file exists: an app on your machine is a project; an app at a URL real people use is a product, and the difference is a set of unglamorous things — a build, a host, a routing fallback, cache headers, a pipeline, a way to roll back, and a checklist for the moment after the deploy. This file walks the whole path with evidence from this lab: the production build produced a `dist/` with content-hashed assets (`index-B_kXvhTo.js`, 221 451 bytes, plus a hashed CSS file) and a single `index.html`; serving that folder with a plain static server returned **200 for `/` but 404 for `/products`**, because a static server knows nothing about client-side routes. It then covers hosting choices, caching rules, CI/CD, previews, the failed-chunk-after-deploy problem, monitoring, rollback — and, because a deploy is only safe if the code going out is sane, the code-quality gates (linting with oxlint/ESLint, types, formatting, pre-commit hooks, what reviewers look for) and the pre-deploy checklist that closes Part 15.

Measured: `/home/user/lab/part15-deploy.txt`.

---

## 1. The build, and what it produces

```bash
npm run build          # = tsc -b && vite build   (type-check first, then build)
npx vite preview       # serve the production build locally
```

```text
dist/
├── index.html                     # the only HTML file: shell + hashed asset links
├── favicon.svg
├── icons.svg
└── assets/
    ├── index-B_kXvhTo.js          # 221 451 bytes (application code)
    └── index-D0dZhWMe.css         # 8 356 bytes
```

```html
<!-- dist/index.html — the hashes are the mechanism behind safe caching -->
<script type="module" crossorigin src="/assets/index-B_kXvhTo.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-D0dZhWMe.css">
```

Rebuilding from unchanged source produced the **same** file name and the same bytes (`identical source -> identical hash/content: true`), which is exactly what you want: a content hash changes only when the content changes.

| Artifact | Cache policy | Why |
| --- | --- | --- |
| `assets/*.js`, `assets/*.css`, images with hashes | `Cache-Control: public, max-age=31536000, immutable` | the name changes when the content changes, so caching forever is safe |
| `index.html` | `Cache-Control: no-cache` (revalidate every time) | it is the pointer to the current hashes; a stale copy loads stale JS |
| `config.js` (runtime config, Part 15 file 01) | `no-cache` | same reason: it is meant to be changed without a rebuild |
| `robots.txt`, `manifest.webmanifest` | short `max-age` | occasionally edited |

⚠️ **The #1 deployment bug** is caching `index.html`: users keep loading an old shell that references deleted asset hashes, and every deploy breaks some sessions with `Failed to fetch dynamically imported module`. `no-cache` for HTML + `immutable` for hashed assets is the rule.

---

## 2. Hosting choices

| Option | How it works | Good for | Watch out for |
| --- | --- | --- | --- |
| Static host (Netlify, Vercel, Cloudflare Pages, S3+CloudFront) | upload `dist/`, configure rewrites | SPAs, docs, marketing sites | you must configure the SPA fallback and headers |
| Static host + edge functions | static assets, dynamic endpoints | SPAs with auth/webhooks | two deployment models to reason about |
| Node server (Express/Fastify) serving `dist/` | `app.use(express.static('dist'))` + a catch-all | apps needing a small API, SSR, or server-side auth | you own uptime, TLS, scaling |
| SSR framework (Next.js, Remix/React Router framework mode, TanStack Start) | render on the server, hydrate | SEO, fast first paint, data loading on the server | a bigger mental model and a server to run |
| Container (Docker → any orchestrator) | build an image, run it anywhere | on-prem, complex environments, team familiarity | most operational overhead |

```js
// The SPA fallback, in each world
// Netlify:            /*  →  /index.html   200
// Vercel:             { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
// Nginx:              try_files $uri $uri/ /index.html;
// Express:            app.get('*splat', (req, res) => res.sendFile(path.join(dist, 'index.html')));
```

```nginx
# nginx.conf (excerpt): the two rules that matter
location /assets/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
  try_files $uri =404;
}
location / {
  try_files $uri $uri/ /index.html;          # SPA fallback
  add_header Cache-Control "no-cache";       # index.html revalidates
}
```

⚠️ **The fallback must not swallow the API.** If `/api/*` is proxied by the same host, exclude it before the catch-all, or a 404 from your API will return HTML and the client will fail parsing JSON with a confusing error.

---

## 3. Proving the fallback matters (measured)

```bash
cd dist && python3 -m http.server 8099        # a plain static server: no routing knowledge
```

```text
GET /            -> 200
GET /products    -> 404
GET /assets/index-B_kXvhTo.js -> 200 (221451 bytes)
```

With `vite preview` (or any host configured as above), `/products` returns the app shell and React Router renders the route. The 404 above is what a real user sees if you deploy `dist/` to a host without the fallback: everything works from the home page, and every deep link or refresh on a sub-route is broken — including the links your users share.

💡 Test this explicitly before announcing a release: open a deep link directly, refresh on a nested route, and open a link with a query string. Three curls (`/`, `/products`, `/products?page=2`) catch the entire class of bug.

---

## 4. The pipeline (CI/CD)

```yaml
# .github/workflows/deploy.yml (shape, not gospel)
name: CI/CD
on:
  push: { branches: [main] }
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -b
      - run: npm test -- --run
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist }
  deploy:
    needs: verify
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }
      - run: npx netlify deploy --dir=dist --prod      # or your host's CLI
```

| Stage | Command | Fails the pipeline when |
| --- | --- | --- |
| Install (clean) | `npm ci` | lockfile and `package.json` disagree |
| Lint | `npm run lint` | style/rule violations, including architecture rules (file 02) |
| Types | `npx tsc -b` | any type error — this must not come after deploy |
| Tests | `npm test -- --run` | behaviour changed; coverage thresholds missed (Part 13) |
| Build | `npm run build` | a production-only failure (env vars, imports) |
| Deploy | host CLI/action | the host rejects the upload |
| Smoke | `curl -f https://host/ && curl -f https://host/api/health` | the deployed app is not serving |

**Order matters:** the type-check and tests run *before* deploy, on the same artifact that will be shipped (`npm ci` → build once → deploy that artifact). Rebuilding on the deploy machine is how "it passed in CI but the deployed bundle differs" happens, most often through environment variables (file 01).

💡 **Preview deployments** (every PR gets a URL) turn review into something a person can click. Per-PR previews plus the smoke test above catch more real bugs than any additional unit test — especially routing, headers and env-specific behaviour.

---

## 5. Releases, cache, and the failed-chunk problem

```text
deploy v1              deploy v2
assets/index-AAA.js    assets/index-BBB.js   ← the old file is gone
   ▲                        ▲
   └── a user still has index.html?v1 cached/open, and a lazy() chunk named AAA breaks
```

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Failed to fetch dynamically imported module` | old HTML, new asset hashes | keep old assets for a grace period **and** handle the error with a reload prompt |
| "It works after a hard refresh" | stale `index.html` | `no-cache` for HTML (section 1) |
| Users on the old version for hours | long HTML cache or a service worker | shorten HTML caching; version-skip the worker |
| A deploy breaks an open session | tokens signed by an old key / API changed | rotate keys with overlap; make clients tolerate both (Part 14, file 03) |

```tsx
// Recover from a stale chunk instead of blanking the screen (Part 15, file 04 for the boundary)
<ErrorBoundary
  fallback={(error, reset) => (
    <div role="alert">
      <p>A new version of the app is available.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  )}
  onError={(error) => { if (/dynamically imported module/.test(error.message)) reportError(error, { kind: 'stale-chunk' }); }}
>
  <Suspense fallback={<PageSkeleton />}><SettingsPage /></Suspense>
</ErrorBoundary>
```

💡 If you use a **service worker** (PWA), add a version-skip: when the app detects a new build, show "Update available" and call `skipWaiting()` on click, rather than letting a user run a half-old app against a half-new API.

---

## 6. Security headers (the short version)

| Header | Value | Protects against |
| --- | --- | --- |
| `Content-Security-Policy` | start with `default-src 'self'`, tighten iteratively | injected scripts (XSS payloads) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | downgrade to HTTP |
| `X-Content-Type-Options` | `nosniff` | MIME confusion |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | leaking URLs to third parties |
| `Permissions-Policy` | disable what you do not use | camera/mic/geolocation abuse |
| `X-Frame-Options` / CSP `frame-ancestors` | `DENY` or your embed partner | clickjacking |

```ts
// CORS, CSRF and CSP in depth are Part 15, file 06 — the rule of thumb here:
// the API sets CORS to your exact origins, cookies are SameSite, and the CSP is enforced in production.
```

⚠️ **Test the CSP in report-only mode first** (`Content-Security-Policy-Report-Only`) to find what you break; then enforce it. A CSP deployed blind is a site-wide outage waiting to happen.

---

## 7. After the deploy: monitoring and rollback

| Signal | Tool | What "good" looks like |
| --- | --- | --- |
| Errors | Sentry/GlitchTip/your endpoint (file 04) | no new issue groups after a release; the release tag matches the deploy |
| Web Vitals | RUM (`web-vitals` library → your endpoint) | LCP/INP within budget (file 07) |
| Availability | uptime checks on `/` and `/api/health` | 200s, response time trend flat |
| The human check | smoke test: log in, load the list, open a detail page on the deployed URL | it works |
| Rollback | the host's "previous deployment" button, or `--prod` with the previous artifact | under five minutes, tested before you need it |

```bash
# A smoke test you can run from anywhere (and put in the pipeline)
BASE=https://app.example.com
curl -fsS "$BASE/" -o /dev/null
curl -fsS "$BASE/products" -o /dev/null          # proves the SPA fallback in production
curl -fsS "$BASE/api/health" | grep -q '"ok":true'
```

⚠️ **Roll back first, diagnose second.** If a release breaks a user-visible path, restore the previous deployment and then investigate with the deploy still reproducible locally — a rollback is minutes, an investigation is hours. Write the procedure down before you need it, including *how* to roll back (which button, which command) and who can do it.

---

## 8. Code quality gates: what runs before a human looks

Machines should catch the boring problems so reviewers can think about behaviour. These gates are cheap, and each one has a job:

```js
// eslint.config.js — flat config, the shape current tooling expects
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,          // includes the compiler-powered Rules-of-React checks
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-floating-promises': 'error', // an unhandled promise is a real bug (file 04)
      '@typescript-eslint/no-misused-promises': 'error',  // e.g. an async function in onClick without handling
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }], // console only inside the logger (file 05)
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/features/*/*'], message: 'Import another feature through its index.ts.' },
        { group: ['**/pages/*'], message: 'Features must not import pages.' },
      ] }],
    },
  },
);
```

| Gate | Tool | Fails on | Runs |
| --- | --- | --- | --- |
| Lint (rules) | ESLint (typed rules) | bugs and consistency issues, architecture violations | editor + pre-commit + CI |
| Lint (speed pass) | **oxlint** | the high-signal subset in milliseconds | editor + CI first step |
| Types | `tsc -b` | type errors, unsafe `any` leaks, missing props | pre-commit (fast check) + CI |
| Format | Prettier (or Biome) | style — entirely delegated, never discussed in review | format on save + `--check` in CI |
| Tests | Vitest (+ coverage thresholds) | behaviour regressions | pre-commit for changed files + CI (Part 13) |
| Architecture | the boundary rules above, or `eslint-plugin-boundaries` | imports that violate file 02's direction | CI |
| Commit message | commitlint (optional) | unreadable history | commit hook |

```bash
# A fast pre-commit hook: only what changed, only what is cheap
npx oxlint . && npx tsc -b --noEmit && npx lint-staged
```

```json
// package.json (excerpt)
{
  "scripts": {
    "lint": "oxlint . && eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -b",
    "test": "vitest",
    "verify": "npm run lint && npm run typecheck && npm run test -- --run && npm run build"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,md,json}": ["prettier --write"]
  }
}
```

⚠️ **Two rules keep the tooling useful instead of resented**: (1) the pre-commit hook must stay under a few seconds — anything slower gets bypassed with `--no-verify`; (2) every rule you add must be one the team agrees is worth obeying, or it becomes noise nobody reads. `npm run verify` is the single command that mirrors CI; if it is fast and green, review is about design.

TypeScript strictness that pays for itself (Part 3's flags, worth repeating as a gate):

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true
  }
}
```

**What a reviewer should look for** (the checklist that catches real problems):

| Area | Question |
| --- | --- |
| Behaviour | does it do what the description says, including the empty/loading/error states? |
| Tests | is the behaviour that changed covered, and would the test fail if the fix were reverted? |
| Types | are the types honest, or is there an `any`/cast hiding a real question? |
| Accessibility | roles, labels, focus order, keyboard paths (Part 11) |
| Security | is anything hidden in the UI presented as protection? any unsanitised HTML? new third-party scripts? (file 06) |
| Performance | any new long list without virtualisation? a large dependency? (file 07) |
| Failure | what happens when this request fails or the user is offline? (file 04) |
| Readability | is the *why* explained where it is not obvious? |
| Scope | is the change as small as it can be? |

💡 **Documentation that earns its keep**: a `README` that gets a newcomer running in under five minutes (install, env, dev, test, build, deploy), a folder map (file 03), an `ADR` (Architecture Decision Record) for each decision someone might otherwise relitigate (why Data mode, why Zustand, why tokens in cookies), and a runbook for deploys and rollbacks. Three short documents beat one abandoned wiki.

---

## 9. The pre-deploy checklist

**Before you deploy**

- [ ] `npm run verify` is green locally (lint, types, tests, build)
- [ ] CI is green on the exact commit being deployed, and the artifact is the one CI built
- [ ] Environment variables for the target environment are set (and validated at boot — file 01): API URL, flags, version
- [ ] The bundle contains no secrets and no dev values (`grep` for the dev API URL; check the debug logs, file 05)
- [ ] The SPA fallback is configured and tested (`/`, a nested route, a route with a query string)
- [ ] `index.html` is `no-cache`; hashed assets are `immutable` (file 06's measured contrast)
- [ ] Security headers are in place (CSP enforced, HSTS, `nosniff`, referrer policy, `frame-ancestors`)
- [ ] Auth flows work end to end against the target environment: login, refresh, logout, 401 handling, role-denied paths (Part 14)
- [ ] The failure paths were checked by hand once: a 500, an offline state, an empty list
- [ ] Error reporting and vitals are enabled and tagged with the release
- [ ] A11y essentials: keyboard-only pass through the main flow, one screen reader spot-check, focus visible, contrast
- [ ] Performance budget: bundle sizes, LCP/INP measured on a preview, no new long list rendered in full
- [ ] Database/API migrations are backward compatible, or behind a flag
- [ ] Support knows what changed (release notes, feature flags flipped)
- [ ] The rollback plan is written, the previous artifact is available, and someone can execute it

**Right after you deploy**

- [ ] Smoke test: home, a deep link, login, the main flow, an API health check
- [ ] Watch errors for 15 minutes (new issue groups, error rate) and vitals for the first hour
- [ ] Confirm the release tag in reports matches what you deployed
- [ ] Announce in the team channel what shipped and what to watch
- [ ] Note anything surprising for the retrospective — including the deploy duration and any manual steps

**Periodically (monthly is enough for most apps)**

- [ ] Run the dependency and security review: `npm audit --production`, Dependabot PRs, third-party script list (file 06)
- [ ] Read the production logs and alert history; delete alerts nobody acted on (file 05)
- [ ] Re-measure the performance budget and re-check the bundle (file 07)
- [ ] Update the README/runbook for everything that changed
- [ ] Delete dead code and unused dependencies (the cheapest performance and security work available)

## 10. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | No SPA fallback | deep links 404 (measured above) | configure rewrites/try_files |
| 2 | Caching `index.html` | users stuck on an old version, failed chunks | `no-cache` for HTML, `immutable` for hashed assets |
| 3 | The API catch-all is swallowed by the fallback | API 404s return HTML → JSON parse errors | exclude `/api` before the catch-all |
| 4 | Building in deploy, with deploy-machine env | a different bundle than CI tested | build once, deploy the artifact |
| 5 | `npm install` instead of `npm ci` in CI | non-reproducible dependency trees | `npm ci` with the lockfile |
| 6 | Shipping with `DEV` config | debug UI, wrong API URL | check the bundle (file 01) |
| 7 | No smoke test | "deployed" but broken | three curls + one human pass |
| 8 | No preview deploys | reviewers approve blind | per-PR URLs |
| 9 | Secrets in client env vars | published credentials | server-side secrets or a proxy (file 01) |
| 10 | Untested rollback | panic during an incident | practise the rollback before you need it |
| 11 | Ignoring error monitoring | you learn from users | release-tagged reporting (file 04) |
| 12 | One environment ("prod is where we test") | every change is risky | a staging environment with production-like config |

---

## 11. Best practices

1. **Build once, promote that artifact** through environments; only runtime config changes between them (file 01).
2. **Hashes for assets, `no-cache` for HTML** — the two-line caching rule that prevents most deploy bugs.
3. **Configure and test the SPA fallback**, and make sure it does not swallow the API.
4. **CI gates before deploy**: `npm ci`, lint, types, tests, build — in that order, on a clean checkout.
5. **Preview every PR**, and smoke test the production deploy automatically plus once by hand.
6. **Keep old assets for a grace period** and handle stale-chunk failures with a reload prompt.
7. **Set the security headers** (CSP, HSTS, nosniff, referrer policy) in report-only first, then enforce.
8. **Monitor errors per release**, with the release tag in every report, and watch the first hour after each deploy.
9. **Have a written rollback** (who, how, how long) and practise it once.
10. **Document the deploy**: the commands, the environment variables, the host's routing rules, and the smoke test — in the README, where the next person looks.
11. **Let machines catch the boring problems**: lint (including the architecture rules), types, formatting and tests in a fast pre-commit hook, and the same gates as the CI floor — so review time goes to design and behaviour.
12. **Keep failures local and recovery cheap**: independent boundaries (file 04), server-enforced permissions (Part 14, file 06), backwards-compatible migrations, and a rollback that takes minutes.

---

## 12. Practice

### Beginner

1. Run `npm run build`, inspect `dist/`, and explain what each file is and why the JS/CSS names contain hashes.
2. Serve `dist/` with a plain static server, reproduce the `/products` 404, then serve it with `vite preview` and confirm the route works.
3. Write the three-curl smoke test for a deployed URL and run it against your own preview.

### Intermediate

1. Configure the SPA fallback and cache headers for a host of your choice (or a local nginx/caddy), and verify with `curl -I` that HTML is `no-cache` and an asset is `immutable`.
2. Write a CI workflow that runs install → lint → types → tests → build, uploads `dist`, and deploys only on `main`. Include a step that fails when the production bundle contains a dev-only marker.
3. Add a preview deployment per PR, post the URL on the PR, and note what you can now review that you could not before.

### Challenge

1. Design the release process for an app with a 5-minute SLA on rollback: artifact promotion, config per environment, the rollback mechanism, the smoke tests, the dashboards, and who is on point. Include the failure modes you are protecting against.
2. Reproduce the stale-chunk problem: build v1, load a page with a `lazy` route, deploy v2 (deleting old assets), then trigger the lazy import. Fix it with an error boundary + reload prompt and a grace-period policy on old assets, and show both behaviours.
3. Add monitoring end to end: `web-vitals` reporting, error reporting tagged with the release, and an uptime check. Then simulate a bad release (a deliberate error in a route) and show how you detect, confirm and roll it back — with the timings.

---

## 13. Solutions

### Beginner

1. `index.html` is the only HTML file: the mount point plus links to the hashed assets. `assets/index-<hash>.js` is the bundled application code and `assets/index-<hash>.css` the styles; the hash is a content fingerprint, so a change produces a new name and clients invalidate naturally. Measured: 221 451 bytes of JS, 8 356 bytes of CSS in this lab's build, and rebuilding unchanged source produced the identical hash.
2. `python3 -m http.server` in `dist/`: `/` → 200, `/products` → 404 (measured). `vite preview` (or a host with rewrites) returns the shell for `/products`, and the router renders the route in the browser.
3. `curl -fsS "$BASE/" && curl -fsS "$BASE/products" && curl -fsS "$BASE/api/health"` — `-f` fails the command on an HTTP error, which is what makes it usable as a gate.

### Intermediate

1. Netlify: `/* → /index.html 200` plus `_headers` with `/assets/*: Cache-Control: public, max-age=31536000, immutable` and `/*: Cache-Control: no-cache`. Nginx: the config in section 2. Verify with `curl -I`.
2. Workflow as in section 4; the dev-marker check can be a grep in a script step: `! grep -q "localhost:3001" dist/assets/*.js` (or check for a `VITE_`-inlined dev value you control), which catches the "shipped with dev config" class of bug before users see it.
3. With previews, a reviewer can click the actual changed screen, test routing and headers on a real URL, and check the console/network — behaviour that no unit test replaces; the PR comment with the URL is what makes it happen.

### Challenge

1. Process: CI builds an immutable artifact per commit; `main` promotes it to staging automatically (same artifact, staging config), and to production behind an approval; every deploy is tagged, and the host keeps the previous N artifacts for instant rollback; smoke tests run automatically post-deploy plus one manual pass on the critical path; error and vitals dashboards are annotated with the release; one person is the release owner with authority to roll back without a meeting. Protected-against failures: bad config (artifact promotion + previews), a broken bundle (CI gates), routing/headers (smoke tests), data/schema changes (backwards-compatible migrations, feature flags), and the human factor (the rollback runbook).
2. Build v1 with a `lazy` route; visit it so the chunk name is recorded; deploy v2 (which removes the old hashed file); navigate to the lazy route → the dynamic import 404s and the page breaks. Fix: an error boundary around the `Suspense` with a "new version available — reload" prompt, plus keeping the previous deployment's assets available for a grace period, plus `no-cache` on HTML so the shell is refreshed. Then repeat the test and show the prompt instead of a blank screen.
3. Monitoring: `web-vitals`' `onLCP`/`onINP`/`onCLS` → `POST /api/vitals`; `reportError` (file 04) with `release` in the payload → your endpoint or Sentry; an uptime check on `/` and `/api/health` every minute. A simulated bad release: ship a route that throws, see the error group appear tagged with the release and the vitals/uptime stay flat (the failure is contained), then roll back — and record the time from detection to rollback, which is the number the process exists to minimise.

---

## 14. Summary

- **The build produces a shell plus content-hashed assets** (measured here: `index-B_kXvhTo.js`, 221 451 bytes, and a hashed CSS file) — rebuilding unchanged source produced the identical hash, which is what makes long-lived caching safe.
- **Cache policy in two lines**: `immutable` for hashed assets, `no-cache` for `index.html` (and any runtime config). Caching the HTML is the single most common deployment bug.
- **A static server knows nothing about routes**: `/` returned 200 and `/products` returned 404 on a plain file server — every SPA needs a rewrite/`try_files` fallback, tested with three curls, and the fallback must not swallow `/api`.
- **Build once, promote the artifact**; CI gates (install → lint → types → tests → build) run before deploy, and only runtime config differs between environments.
- **Preview deployments and a smoke test** catch more real bugs than additional unit tests — routing, headers and environment-specific behaviour are exactly what unit tests do not see.
- **Stale chunks are a release-time reality** (old HTML, new hashes): keep old assets for a grace period and handle `Failed to fetch dynamically imported module` with a reload prompt rather than a blank screen.
- **Set security headers early** (CSP in report-only first), **monitor errors per release**, and **have a practised rollback** — roll back first, diagnose second.
- **Code quality gates are the pipeline's first reviewer**: `oxlint`/ESLint (with architecture and promise rules), `tsc -b`, Prettier, tests — fast enough that nobody bypasses them, so human review goes to behaviour, accessibility, security and scope.
- **The pre-deploy checklist is the artifact of this part**: build once and promote it, verify env/secret/routing/caching/headers/auth, check the failure paths by hand once, watch errors and vitals after the release, and keep `npm run verify` as the single command that mirrors CI.

---

**What's next →** [`../16-build-tools/01-vite.md`](../16-build-tools/01-vite.md) opens Part 16, which goes back under the hood of everything this part relied on: what Vite actually does (dev server, HMR, dependency pre-bundling, the Oxc transform), how to configure it (aliases, plugins, proxy, CSS), what `npm run build` produces and how to analyse it, and how modes and env files fit together — now that the deployment path has shown why each of those knobs matters.
