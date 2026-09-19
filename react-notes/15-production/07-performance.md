# 07 — Production Performance: Budgets, Core Web Vitals, Real Numbers

> **Part 15 · Production · File 7 of 8**

Why this file exists: Part 10 file 04 taught you to *profile a component* — find a slow
render, fix it, measure again. This file is the other half: making an app fast **for real
users on real devices and real networks**, which is a different problem with different
metrics. Your laptop on wifi tells you almost nothing about a user on a mid-range Android
on 4G. Here: the metrics Google and your users actually care about, how to set budgets that
fail a build, how to measure real users, and the small set of changes that move the numbers.

---

## 1. Why production performance is a different problem

| Development performance | Production performance |
| --- | --- |
| "This list re-renders too often" | "The first paint takes 6 seconds" |
| Measured on your machine | Happens on devices you do not own |
| React Profiler, DevTools | Core Web Vitals, RUM, Lighthouse CI |
| Fixed by memoisation | Fixed by shipping less JavaScript |
| A rendering problem | Usually a **network and bundle** problem |

💡 **The uncomfortable truth:** most slow React apps are slow because they ship too much
code and too many images, not because a component re-renders. `React.memo` cannot help a
user downloading 900 kB of JavaScript on a 3G connection. **Fix the payload before the
render.**

---

## 2. The metrics that matter: Core Web Vitals

Three metrics, measured on real users, that Google uses as a ranking and quality signal:

| Metric | What it measures | Good | Needs work | Poor |
| --- | --- | --- | --- | --- |
| **LCP** — Largest Contentful Paint | How long until the biggest visible element (hero image, headline) renders | ≤ 2.5 s | 2.5–4 s | > 4 s |
| **INP** — Interaction to Next Paint | Latency of the *worst* interaction until the next frame is painted | ≤ 200 ms | 200–500 ms | > 500 ms |
| **CLS** — Cumulative Layout Shift | How much visible content jumps around while loading | ≤ 0.1 | 0.1–0.25 | > 0.25 |

Supporting metrics you will see in Lighthouse:

| Metric | Meaning | Target |
| --- | --- | --- |
| **FCP** — First Contentful Paint | First pixel of anything | < 1.8 s |
| **TTFB** — Time to First Byte | Server + network latency before the first byte | < 800 ms |
| **TBT** — Total Blocking Time | Main-thread work that blocks input (lab only) | < 200 ms |

⚠️ **INP replaced FID in March 2024.** Older articles and some dashboards still say
"First Input Delay" — FID measured only the *delay before* the first interaction started;
INP measures the *whole* latency of the worst interaction, which is what users actually
feel. If a dashboard of yours still shows FID, it is out of date.

🔍 **What causes each one, in React terms**

- **LCP** is caused by: a large render-blocking bundle, an unoptimised hero image, a
  chained request (HTML → JS → API → image). Fix: split code, optimise the image,
  `preload` it, fetch data earlier.
- **INP** is caused by: long synchronous work on the main thread during an interaction —
  a huge re-render, a big `filter`/`sort` in an event handler, a layout thrash. Fix:
  `useTransition` / `useDeferredValue` (Part 10 file 09), virtualisation, memoisation.
- **CLS** is caused by: images without dimensions, fonts swapping, late-injected banners
  and toasts. Fix: explicit `width`/`height`, `font-display: optional`, reserve space.

---

## 3. Lab vs field data (and why you need both)

| | **Lab** (synthetic) | **Field** (RUM — real user monitoring) |
| --- | --- | --- |
| Where | Lighthouse, WebPageTest, your CI | Your app, in users' browsers |
| Conditions | Fixed device + network profile | Whatever the user has |
| Reproducible | ✅ yes — comparable across commits | ❌ varies |
| Catches regressions before deploy | ✅ | ❌ only after |
| Reflects reality | ⚠️ approximates | ✅ this *is* reality |

**Use lab data to prevent regressions; use field data to know the truth.** A common failure
is optimising until Lighthouse says 100 while real users are still at 4 s LCP — because your
lab profile was a fast desktop on fast wifi.

```bash
# Lab: Lighthouse from the CLI (install once)
npx --yes lighthouse http://localhost:4173 --preset=desktop --output=json --output=html --output-path=./lh
# Then open lh.report.html
```

```ts
// Field: report Core Web Vitals to your own /logs endpoint (file 05)
// npm i web-vitals
import { onLCP, onINP, onCLS } from 'web-vitals';
import { logger } from '@/shared/lib/logger';

for (const report of [onLCP, onINP, onCLS]) {
  report(({ name, value, rating, id }) => {
    logger.info('web-vital', { metric: name, value: Math.round(value), rating, id });
  });
}
```

⚠️ **Do not block on field data in CI** — it is inherently variable. Set thresholds on lab
runs (deterministic) and alert on field trends (7-day moving average).

---

## 4. Performance budgets that fail a build

A budget is a number you refuse to exceed. Without enforcement, every feature adds 5 kB and
nobody notices until the app is unusable.

```ts
// vite.config.ts — fail the build if any chunk exceeds the limit
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 250,   // kB, before gzip — Vite warns (does not fail) above this
  },
});
```

```json
// budgets.json — the contract, checked in CI
{
  "javascript": { "total": "350 kB", "perChunk": "250 kB" },
  "css": { "total": "80 kB" },
  "images": { "total": "500 kB" },
  "lighthouse": { "performance": 90, "lcp": 2500, "cls": 0.1, "inp": 200 }
}
```

```bash
# CI: check bundle size against the previous main branch
npx --yes size-limit --config .size-limit.json
```

```json
// .size-limit.json
[
  { "path": "dist/assets/index-*.js", "limit": "250 kB", "gzip": true },
  { "path": "dist/assets/*.css", "limit": "80 kB", "gzip": true }
]
```

🏭 **Budgets work when they are small and loud.** One number per category, checked on every
PR, with the failure message telling the author *what to do* ("your PR added 40 kB to the
main chunk — consider `lazy()` or a smaller dependency").

---

## 5. The optimisations that actually move the numbers

Ordered by typical impact per hour of work:

### 1. Ship less JavaScript (biggest lever)

```bash
npm run build && ls -lhS dist/assets/*.js   # what is big?
```

```ts
// Route-level code splitting — the single highest-value change (Part 10 files 05–06)
const SettingsPage = lazy(() => import('@/features/settings'));
```

- Check bundle composition with `rollup-plugin-visualizer` — you will usually find one
  unexpected giant (a date library, a charting library, all of `lodash`).
- Replace heavy deps: `moment` → `date-fns` (tree-shakeable) or `Intl`;
  `lodash` → `lodash-es` with named imports, or native methods;
  `axios` → `fetch` if you do not need its features.
- `import { format } from 'date-fns'` ✅ vs `import _ from 'lodash'` ❌ (pulls everything).

### 2. Optimise images (biggest LCP lever)

```tsx
// Explicit dimensions prevent CLS; loading/fetchpriority control the network
<img
  src="/hero-1200.webp"
  srcSet="/hero-600.webp 600w, /hero-1200.webp 1200w"
  sizes="(max-width: 700px) 600px, 1200px"
  width={1200}
  height={630}
  alt="The dashboard"
  loading="lazy"            // below the fold
  decoding="async"
/>

// The LCP image: NOT lazy, and preloaded in index.html
<img src="/hero-1200.webp" width={1200} height={630} alt="" fetchPriority="high" />
```

```html
<!-- index.html — start the LCP image download immediately, in parallel with the JS -->
<link rel="preload" as="image" href="/hero-1200.webp" fetchpriority="high" />
```

WebP/AVIF at 1200 px instead of a 4000 px JPEG is routinely a 70–90% reduction.

⚠️ **Never `loading="lazy"` the LCP image.** Lazy-loading the hero delays the very metric
you are trying to improve — a classic self-inflicted wound.

### 3. Fonts

```css
/* 'optional' avoids a layout swap entirely (may fall back on slow connections) */
@font-face { font-family: 'Inter'; src: url('/inter.woff2') format('woff2'); font-display: optional; }
```

`font-display: swap` shows fallback text then swaps — better than invisible text, but it
*can* cause CLS. Reserve space with `size-adjust` in a fallback `@font-face`, or use
`optional`.

### 4. Reserve space for everything that loads late

```tsx
// ❌ a banner that pushes the page down when it arrives → CLS
{showPromo && <Promo />}

// ✅ space is always reserved
<div style={{ minHeight: showPromo ? undefined : 0 }}>{showPromo && <Promo />}</div>
```

Set `width`/`height` (or `aspect-ratio`) on every image, iframe, embed and skeleton.

### 5. Keep interactions short (INP)

```tsx
// A 3,000-row table that re-renders on every keystroke blocks input
const [query, setQuery] = useState('');
const deferredQuery = useDeferredValue(query);        // input stays responsive
const filtered = useMemo(() => rows.filter(matches(deferredQuery)), [rows, deferredQuery]);
```

Beyond ~200 rows, virtualise (Part 10 file 04). Virtualisation is worth more than any amount
of memoisation, because it changes the work from O(n) to O(visible).

### 6. Cache and prefetch correctly

```ts
// TanStack Query (Part 9): staleTime stops refetch storms on every mount
new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000 } } });

// Prefetch the route the user is about to visit
<Link to="/tasks" onMouseEnter={() => queryClient.prefetchQuery({ queryKey: ['tasks'], queryFn: fetchTasks })} />
```

### 7. Compress and cache at the edge

- Serve with Brotli or gzip (hosting does this automatically; verify with
  `curl -H 'accept-encoding: br' -sI https://your.site | grep -i content-encoding`).
- Long `Cache-Control: immutable` on hashed assets (`/assets/index-a1b2c3.js`) — Vite's
  content hashes make this safe.
- Short or `no-cache` on `index.html` itself — otherwise users keep an HTML file that
  references old, deleted chunks and get a white screen after a deploy.

⚠️ **That last point causes real outages.** A user with a cached `index.html` requests
`index-OLDHASH.js`, which no longer exists → the app fails to boot. Cache HTML briefly,
assets forever.

---

## 6. What NOT to do

| Anti-pattern | Why |
| --- | --- |
| Wrapping everything in `React.memo`/`useMemo` "for performance" | Memoisation has its own cost; measure first (Part 10 files 03, 08) |
| Optimising a component that renders in 2 ms | You cannot feel 2 ms; the 400 kB bundle is the problem |
| Trusting a single Lighthouse run | Lab numbers vary run to run — use medians of 5 |
| Chasing a 100 Lighthouse score | The score is a proxy; users are the metric |
| Preloading everything | Preloads compete for bandwidth and delay the LCP resource |
| Lazy-loading above-the-fold content | Directly worsens LCP |
| Adding a state library to "fix performance" | Extra abstraction, same renders |

💡 **The order of operations, always:** measure → find the biggest item → fix it → measure
again. Optimising without measuring is guessing with extra steps.

---

## 7. A repeatable performance pass

```text
1. npm run build; ls -lhS dist/assets/*        → is the JS unreasonable?
2. rollup-plugin-visualizer                    → what is inside it?
3. Lazy-load every route                        → is the entry chunk small?
4. Check images: format, dimensions, lazy flags → is the LCP image optimised and preloaded?
5. Lighthouse (mobile, throttled), median of 5  → LCP / INP / CLS baseline
6. Fix the ONE worst metric                     → re-run
7. Add size-limit + Lighthouse CI budgets       → keep it fixed
8. Ship web-vitals reporting                    → learn the real numbers
```

Eight steps. Most apps get 80% of the available win from steps 1–4.

---

## 8. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| No `width`/`height` on images | CLS > 0.25 | Always set dimensions |
| `loading="lazy"` on the hero | Terrible LCP | `fetchPriority="high"` + preload |
| One giant bundle | Slow first paint everywhere | Route-level `lazy()` |
| Whole-library imports | 200 kB for one function | Named, tree-shakeable imports |
| Long cache on `index.html` | White screen after deploy | Short cache for HTML, immutable for assets |
| Optimising before measuring | Weeks spent, no change | Profile / Lighthouse first |
| Memoising everything | Slower, more complex, same feel | Measure; consider the compiler (Part 11) |
| Only lab data | "Lighthouse says 100", users complain | Add RUM |
| Filtering 5,000 rows in an event handler | INP > 500 ms | `useDeferredValue` + virtualise |

---

## 9. Practice

### Beginner
1. Build your app, list `dist/assets/` by size, and identify the largest file.
2. Add `width`/`height` to every `<img>` in your app and re-measure CLS with Lighthouse.

### Intermediate
1. Add route-level code splitting to every route and record the entry-chunk size before and
   after.
2. Add `size-limit` and make CI fail when the main chunk grows by 10%.

### Challenge
1. Wire `web-vitals` into your logger, collect a week of field data, and compare the median
   LCP with your lab number. Explain the gap.
2. Take LCP from "poor" to "good" on a real page using only image and loading-order changes
   (no memoisation). Document each change with the before/after number.

---

## 10. Solutions

### Beginner
1. `ls -lhS dist/assets/*.js | head` — if the largest chunk is over ~250 kB gzipped, code
   splitting is your first task.
2. Lighthouse's CLS breakdown lists the exact elements that shifted. Adding dimensions
   usually takes CLS from ~0.2 to ~0.0 in one commit — the best effort-to-impact ratio in
   this entire file.

### Intermediate
1. A typical result: entry chunk 480 kB → 140 kB, with per-route chunks of 20–60 kB loaded
   on navigation. LCP improves because the browser parses far less before first paint.
2. ```json
   [{ "path": "dist/assets/index-*.js", "limit": "155 kB", "gzip": true }]
   ```
   Set the limit ~10% above today's size, so the *next* unconsidered dependency fails the
   build and starts a conversation.

### Challenge
1. Field LCP is almost always worse than lab LCP — slower devices, slower networks, cold
   caches. The median gap (often 1–2 s) is your honest baseline, and it is the number to
   put in front of a manager.
2. The reliable sequence: convert JPEG → WebP, downscale to the real display size, add
   `width`/`height`, remove `loading="lazy"` from the hero, add
   `<link rel="preload" as="image" fetchpriority="high">`. Each step is measurable;
   together they commonly halve LCP.

---

## 11. Summary

- **Production performance is mostly payload and network**, not rendering. Ship less before
  you optimise more.
- **Core Web Vitals: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.** INP replaced FID in 2024.
- **Lab data prevents regressions; field data tells the truth.** You need both.
- **Budgets must fail the build** — `size-limit`, `chunkSizeWarningLimit`, Lighthouse CI.
- **Highest-value fixes, in order:** code splitting, image optimisation + preload, font
  strategy, reserved space, `useDeferredValue` + virtualisation, caching headers.
- **Never lazy-load the LCP image; never long-cache `index.html`.**
- **Measure → fix the biggest thing → measure again.** Memoising without profiling is
  guessing.

---

**What's next →** [`08-production-checklist.md`](./08-production-checklist.md) pulls files
01–07 (plus everything before them) into a single pre-deploy checklist you can run in an
hour, and the post-deploy verification and rollback steps that decide whether a bad release
lasts five minutes or five hours.
