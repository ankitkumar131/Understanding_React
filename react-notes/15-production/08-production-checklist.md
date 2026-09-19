# 08 — The Production Checklist: Before, During and After Deploy

> **Part 15 · Production · File 8 of 8**

Why this file exists: everything in Parts 1–15 has to come together at one moment — the
moment you ship. This file is that moment, as a checklist you can actually run. It has three
phases: **before deploy** (about an hour, catches almost everything), **during deploy** (the
mechanics of static hosting and SPA routing), and **after deploy** (verification and
rollback, which decide whether a bad release lasts five minutes or five hours).

Copy it into your repo as `DEPLOY_CHECKLIST.md`. A checklist nobody can find is not a
checklist.

---

## 1. Phase 1 — Before deploy

### 1.1 Correctness

```bash
npx tsc -b --noEmit          # 0 errors
npm run lint                 # 0 errors (warnings triaged)
npx vitest run               # all green
npm run build                # succeeds with no warnings you have not explained
npx vitest run --coverage    # coverage on changed files, not a global vanity number
```

- [ ] `tsc` passes with `strict` on (Part 2). No `any` escape hatches added this release.
- [ ] Lint passes, including the boundary rules from file 02/03.
- [ ] Tests pass — and new behaviour has a new test (Part 13).
- [ ] `npm run build` produces no unexplained warnings. A warning you ignore this time is
      a bug you ship next time.

### 1.2 Configuration (file 01)

- [ ] `.env.production` has the correct API URL, and **no secrets**.
- [ ] `grep -rn "import.meta.env" src` returns **one file** (`src/config.ts`).
- [ ] Missing required variables fail at startup, not three screens later.
- [ ] A `staging` build was verified, not just production.

```bash
# The secret check that catches real incidents:
npm run build && grep -rEi "sk-|api[_-]?key|secret|password|BEGIN.*PRIVATE KEY" dist/assets/*.js
# Expect: no matches. If you find one, revoke and rotate before you do anything else.
```

### 1.3 Build output

```bash
ls -lhS dist/assets/ | head          # is anything unreasonably large?
npm run preview                      # serve the REAL build locally, not the dev server
```

- [ ] Entry chunk within budget (file 07). Largest chunk explained.
- [ ] **Tested with `npm run preview`, not `npm run dev`.** This is the single most-skipped
      step and it is where minification bugs, broken `base` paths and missing env vars show
      up.
- [ ] Every route works when loaded **directly** (deep link), not only by in-app navigation.
- [ ] Hard-refresh on a deep link works (this is the SPA rewrite rule — section 2).

⚠️ **"It works in dev" is not a deployment test.** The dev server serves unbundled ESM,
skips minification, has different env files, and never exercises your `base` path. Build,
preview, click.

### 1.4 Error handling and logging (files 04, 05)

- [ ] Root `ErrorBoundary` + per-route boundaries are in place.
- [ ] Every data screen has pending / error / empty / success states.
- [ ] `userMessage()` never prints a raw stack to a user.
- [ ] `reportError` sends to a real destination, carrying release + commit.
- [ ] `unhandledrejection` and `error` listeners are registered.
- [ ] `console.log` noise is silenced or routed in production.

### 1.5 Security (file 06)

- [ ] No `dangerouslySetInnerHTML` without DOMPurify.
- [ ] User-controlled URLs go through a scheme check.
- [ ] Token storage decision is deliberate and documented (Part 14 file 05).
- [ ] CSP configured at the hosting layer (start `Report-Only`).
- [ ] CORS on the API is scoped to your origin — never `*` with credentials.
- [ ] `npm audit` shows no unexplained high/critical in `dependencies`.
- [ ] `package-lock.json` committed; CI runs `npm ci`.
- [ ] Source maps uploaded to the error tracker, **not** served publicly.

### 1.6 Performance (file 07)

- [ ] Lighthouse (mobile, throttled) median of 5: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- [ ] Images have `width`/`height`; the LCP image is **not** lazy-loaded.
- [ ] Routes are code-split.
- [ ] `web-vitals` reporting is live.
- [ ] Size budget enforced in CI.

### 1.7 Product and access

- [ ] Keyboard-only: you can complete the main flow with Tab and Enter.
- [ ] Focus is visible; modals trap and restore focus.
- [ ] Screen reader: landmarks, headings, labels on every input, `alt` on meaningful images.
- [ ] Mobile viewport: nothing overflows at 360 px wide.
- [ ] `lang` attribute on `<html>`, `<title>` and meta description per route.
- [ ] Favicon, `robots.txt`, and (if indexed) a sitemap.
- [ ] 404 route exists and is friendly.
- [ ] Analytics/consent: nothing tracks before consent if your users require it.

---

## 2. Phase 2 — Deploying an SPA

A Vite build is **static files**. There is no server process to run — which makes deployment
cheap and makes exactly one thing hard: **routing**.

### 2.1 The SPA rewrite rule (the classic production bug)

Your app has routes like `/tasks/42`. There is no file at `dist/tasks/42/index.html`. So a
direct visit or a refresh returns **404** unless the host is told to serve `index.html` for
unknown paths and let React Router take over.

```text
# Netlify — netlify.toml
[[redirects]]
  from = "/*"
  to   = "/index.html"
  status = 200
```

```json
// Vercel — vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```nginx
# nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

```bash
# Apache — public/.htaccess
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

```bash
# GitHub Pages has no rewrite rule. Two options:
# (a) use HashRouter (#/tasks/42) — ugly URLs, but it works
# (b) the 404.html trick: copy index.html to 404.html and set base accordingly
```

⚠️ **The rewrite must exclude real files**, or `/assets/index-abc.js` would return HTML and
your app would fail with a baffling MIME-type error (`Failed to load module script: Expected
a JavaScript module but the server responded with a MIME type of "text/html"`). Every
config above handles this — that MIME error is the signature of getting it wrong.

### 2.2 Sub-path deployment

Deploying to `https://you.github.io/my-app/` instead of a domain root? Set `base`:

```ts
// vite.config.ts
export default defineConfig({ base: '/my-app/' });
```

Without it, assets are requested from `/assets/…` and 404 — a blank page with a console full
of 404s.

### 2.3 Caching headers

```text
/                    → Cache-Control: no-cache         (must revalidate — it references hashed assets)
/assets/index-*.js   → Cache-Control: public, max-age=31536000, immutable
/assets/*.css        → Cache-Control: public, max-age=31536000, immutable
/favicon.svg         → Cache-Control: public, max-age=3600
```

⚠️ **Long-caching `index.html` breaks deploys.** Users keep the old HTML, which references
chunk filenames that no longer exist → white screen until they hard-refresh. HTML: revalidate.
Hashed assets: cache forever.

### 2.4 A minimal CI pipeline

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push: { branches: [main] }
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci                                   # exactly the lockfile
      - run: npx tsc -b --noEmit
      - run: npm run lint
      - run: npx vitest run --coverage
      - run: npx size-limit                           # bundle budget (file 07)
      - run: npm run build
      - run: npx --yes serve -s dist -l 4173 & sleep 2 && npx --yes lighthouse http://localhost:4173 --only-categories=performance --quiet --output=json --output-path=./lh.json
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist }
      # then your host's deploy step (Netlify/Vercel/S3)
```

🏭 **Every deploy should be from a commit, by CI, with the same lockfile.** "It worked on my
machine" is eliminated by `npm ci` plus an artefact-based deploy.

---

## 3. Phase 3 — After deploy

Deploying is not the finish line. Spend ten minutes verifying, and know your rollback before
you need it.

### 3.1 Verification (do this every time, in order)

```text
[ ] Open the production URL in a private window (no cached assets, no extensions)
[ ] Home page renders; no console errors
[ ] Log in → protected route works
[ ] Refresh on a deep link (/tasks/42) → works, not 404      ← the SPA rule
[ ] Hard-refresh (Ctrl+Shift+R) → still works
[ ] One create, one update, one delete against the real API
[ ] Trigger an error on purpose (block a request in DevTools) → friendly message, retry works
[ ] Check the network tab: assets are hashed, compressed (br/gzip), and cache headers are right
[ ] Mobile viewport (DevTools device mode, 360 px) → nothing overflows
[ ] Confirm the release: the version/commit in your error tracker matches the deploy
[ ] Open the error tracker and the vitals dashboard: no spike, LCP looks sane
```

```bash
# Fast checks from the terminal
curl -sI https://app.example.com | grep -Ei "cache-control|content-encoding|content-security-policy"
curl -s https://app.example.com/tasks/42 -o /dev/null -w "%{http_code}\n"   # must be 200, not 404
```

### 3.2 Rollback — decide it *before* the incident

| Hosting | Rollback mechanism | Time |
| --- | --- | --- |
| Netlify / Vercel | One click: "publish previous deploy" | < 1 min |
| S3 + CloudFront | Re-upload the previous `dist/`, then **invalidate the cache** | 5–15 min |
| nginx / VM | Keep `releases/<sha>/` and flip a symlink | < 1 min |
| Docker | Re-tag the previous image | 1–3 min |

⚠️ **Two rollback traps**

1. **CDN cache.** Rolling back files without invalidating the cache serves the new (broken)
   assets for as long as the TTL. Invalidate `/index.html` at minimum.
2. **Database migrations.** A frontend rollback does not roll back an API migration. If your
   release depended on an API change, coordinate — this is why API changes should be
   backwards-compatible and deployed first.

🏭 **The rule that saves you: rollback is a deploy, not a fix.** Do not hotfix under
pressure. Roll back to green, then fix forward with a test.

### 3.3 Watch for 24 hours

- [ ] Error rate compared to the same window yesterday (file 05) — alert on the *delta*.
- [ ] LCP/INP/CLS trend — a regression usually appears within hours.
- [ ] API error rate and latency (a frontend release can hammer an API with a bad
      `staleTime` or a retry loop).
- [ ] Support channels — users report what dashboards miss.

---

## 4. The one-page version

```text
BEFORE   tsc · lint · test · build · preview (not dev!) · deep links · secrets grep
         env vars · error boundaries · 4 UI states · CSP/CORS · npm audit · budgets
         keyboard · mobile · 404 page · meta

DEPLOY   static files + SPA rewrite · base path if sub-path · HTML no-cache, assets immutable
         npm ci in CI · deploy from a commit

AFTER    private window · login · deep-link refresh · hard refresh · CRUD · error path
         cache headers · mobile · version in tracker · vitals dashboard
         know the rollback command · watch 24 h
```

---

## 5. Common deployment failures and their signatures

| Symptom | Almost always | Fix |
| --- | --- | --- |
| Blank page, 404s on `/assets/*` in console | Missing `base` or wrong publish directory | Set `base`; publish `dist/` |
| 404 on refresh of a deep link | No SPA rewrite rule | Section 2.1 |
| `Failed to load module script… MIME type "text/html"` | Rewrite rule catching asset requests | Exclude real files (section 2.1) |
| White screen after a deploy, fixed by hard refresh | Long-cached `index.html` | `no-cache` on HTML |
| `undefined/users` requests in production | Env var not set at build time | Section 1.2 |
| CORS error only in production | Dev used the Vite proxy; prod hits the real origin | Configure CORS on the API |
| Everything works in dev, breaks in preview | Minification / env / bundling difference | Always test `npm run preview` |
| "It works for me" but not for users | Cached old bundle, or a browser you don't test | Private window; check versions in the tracker |
| Errors only for some users | Old bundle + new API, or a browser-specific API | Log the release with every error |

---

## 6. Practice

### Beginner
1. Run the Phase 1 checklist on your playground app and write down every item you fail.
2. Deploy it to Netlify or Vercel, then refresh a deep link and observe the 404. Add the
   rewrite rule and confirm it is fixed.

### Intermediate
1. Add the GitHub Actions pipeline from section 2.4 and make it fail on a deliberate type
   error.
2. Configure caching headers on your host and verify with `curl -sI` that HTML and assets
   differ.

### Challenge
1. Perform a deliberate rollback: deploy a broken build, roll back using your host's
   mechanism, and time it. Write the exact steps in your repo's runbook.
2. Add a `staging` deploy that runs the full checklist automatically and comments the
   Lighthouse and bundle-size results on the pull request.

---

## 7. Solutions

### Beginner
1. Typical first failures: no `npm run preview` habit, no 404 route, missing image
   dimensions, no error boundary. That list *is* the value of the checklist.
2. The 404 happens because the host looks for `dist/tasks/42/index.html`. The rewrite sends
   every unknown path to `index.html`, where React Router matches `/tasks/42` and renders
   the right page.

### Intermediate
1. `npm ci` + `tsc -b --noEmit` + `vitest run` in CI turns "I forgot to run the tests" from
   a production incident into a red check.
2. Expected: `index.html` → `cache-control: no-cache` (or `max-age=0, must-revalidate`);
   `/assets/index-<hash>.js` → `max-age=31536000, immutable`. If both look the same, one of
   the two deploy traps in section 3.2 is waiting for you.

### Challenge
1. The runbook should be three commands and one verification step, written so someone who
   has never seen the project can execute it at 2am. If it takes more than five minutes,
   automate it.
2. PR comments with LCP and bundle size turn performance from an argument into a diff. Gate
   merges on the budget, not on the score.

---

## 8. Summary

- **A checklist you cannot find is not a checklist.** Put it in the repo.
- **Test `npm run preview`, never only `npm run dev`.** Deep links and hard refresh included.
- **An SPA is static files plus one rewrite rule.** Getting that rule wrong is the most
  common production bug in React deployments.
- **HTML revalidates; hashed assets are immutable.** Mixing them up breaks every deploy.
- **Deploy from a commit, via CI, with `npm ci`.**
- **Verify in a private window for ten minutes**, and know the rollback command before you
  need it.
- **Roll back to green, then fix forward.** Watch error rates and vitals for 24 hours.

---

**What's next →** [`../16-build-tools/01-vite.md`](../16-build-tools/01-vite.md) opens
Part 16 and goes underneath everything you have been running: what Vite actually is, why the
dev server starts instantly, what HMR is doing when your edit appears without a reload, and
what `npm run build` really produces.
