# 06 — Code Splitting: Bundles, Chunks and What It Actually Saves

> **Part 10 · Advanced React · File 6 of 9**

Why this file exists: chapter 05 used `React.lazy` and `Suspense` without explaining where the "other file" comes from. This file goes one level down, to the bundler, and answers the questions that decide whether splitting helps: what a bundle contains, how a dynamic `import()` becomes a separate file, what the build output and `manifest.json` tell you, why splitting does **not** reduce total bytes, how caching interacts with hashing, and what actually bloats a React app. It ends with a measured split of a small app: one 109.4 kB gzip file became a 68.6 kB gzip entry plus two on-demand chunks, and the numbers are read honestly, including the part where the total grew.

Transcripts and measurements come from the split lab (`/tmp/splitlab/`, Vite 8 + `@vitejs/plugin-react`, `build.manifest: true`) and from the dependency benchmark in `/tmp/sizecheck/`.

---

## 1. What a bundle is, and why its size matters

A **bundle** is the JavaScript file your app is shipped as: every module you imported, concatenated in dependency order, with each module wrapped so its scope is preserved. A **chunk** is one output file; a build can produce many. In a Vite app the entry HTML loads one entry chunk (plus any chunk it statically imports); dynamic imports create additional chunks fetched at runtime.

Size matters for four reasons, in this order:

1. **Download** — bytes over the network. On a slow 4G connection, 100 kB of gzip is roughly a second of transfer time for a phone at the edge of coverage.
2. **Parse and compile** — the browser must turn that text into executable code; this is CPU work on the main thread before anything renders.
3. **Execute** — module-level code runs (top-level statements, polyfills, library initialisation).
4. **Memory** — every byte stays resident.

| | Raw | gzip | Brotli |
| --- | --- | --- | --- |
| A typical small app (split lab, one file) | 354,160 B | 109,419 B | ~15–20% smaller than gzip |

💡 **gzip is the number to compare, not raw.** JavaScript compresses extremely well (repetitive identifiers, whitespace). Compare like for like, and remember the *network transfer* is the gzip size while the *parse cost* is the raw size — both matter.

⚠️ The part people forget: on a mid-range phone, **parsing and executing 300 kB of JavaScript can cost well over a second** even after it has downloaded. That is why "split the bundle" is usually framed as "get less code in front of the first paint", not "make the app weigh less".

---

## 2. How a bundler decides where the chunk boundaries are

Rollup (which Vite uses for production builds) starts from the entry file and walks the static `import` graph:

```text
src/main.tsx ──static──▶ src/App.tsx ──static──▶ src/pages/Home.tsx
                                    └─static──▶ react, react-dom   (node_modules)

Everything reachable by static imports lands in the ENTRY chunk.
```

A **dynamic** `import()` is a boundary. Rollup treats the imported module (and everything only it reaches) as a **new chunk**:

```text
src/main.tsx ──static──▶ src/App.tsx ──static──▶ src/pages/Home.tsx
                                    ├─dynamic─▶ src/pages/Reports.tsx ──▶ zod   → chunk "Reports"
                                    └─dynamic─▶ src/pages/Settings.tsx ─▶ axios → chunk "Settings"
```

Rules that follow, and that explain most surprises:

- **A module used by both a dynamic chunk and the entry is pulled into a shared chunk** (or duplicated, if the bundler cannot share it) so it is downloaded once.
- **Everything a dynamic chunk imports statically is part of that chunk** — so splitting a page moves its whole dependency subtree with it (in the measurement below, `zod` travelled into the Reports chunk).
- **`node_modules` code is only split if it is only reached through dynamic imports.** A UI kit imported by the layout stays in the entry.
- **The entry is what the browser must have before first paint.** Splitting is the act of moving things *out of the entry*.

---

## 3. `import()` — the one primitive under all of it

```tsx
const module = await import('./pages/Reports');    // promise of a module namespace
const Reports = module.default;

import('./pages/Reports').then((m) => console.log(m.default.name));

const { NamedReports } = await import('./pages/Reports');   // any export, not only default
```

- **It returns a promise** for the module namespace object. `import('x')` is an expression usable anywhere (a handler, an effect, a hook), unlike a static `import` statement, which must be top level.
- **The specifier must be a literal** for the bundler to see it and create a chunk. `import(path)` with a variable is left alone (Vite warns); `import.meta.glob('./pages/*.tsx')` is the escape hatch when you need a set of dynamic modules.
- **The result is cached by the browser**: importing the same module twice returns the same promise's value without a second request. That is exactly why the prefetch in chapter 05 (`loadLazyPanel()`, then a later `lazy(loadLazyPanel)`) eliminates the fallback.
- **Vite/Rollup naming**: the chunk name comes from the module path; to control it, use the `/* @vite-ignore */` and dynamic-import-config features, `manualChunks` (Vite 4+) or Rollup's `output.manualChunks`. Webpack's `/* webpackChunkName: "reports" */` comment has no effect in Vite — a good example of why bundler-specific advice must be checked against your bundler.
- **React-level wrappers** (`React.lazy`, React Router's route `lazy`) are conveniences over `import()`. They do not change the mechanics; they only decide *when* the import is called and how the while-waiting state is rendered.

---

## 4. The measured lab: one file becomes three

The lab is a three-page app (Home, Reports, Settings) where Reports imports `zod` and Settings imports `axios` — deliberately heavy, "sometimes needed" dependencies, exactly the shape chapter 05 told you to split.

**Version A — every import is static:**

```tsx
import Home from './pages/Home';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
```

```text
$ npx vite build
index-p5stY0YM.js   raw=354160  gzip=109419     ← one file, everything inside
```

**Version B — Reports and Settings are dynamic imports behind `lazy()` + `Suspense`:**

```tsx
import { lazy, Suspense } from 'react';
import Home from './pages/Home';

const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
```

```text
$ npx vite build
Reports-CAOWfQsc.js   raw=83320   gzip=23541    ← zod travels with this page
Settings-DXjTXCJr.js  raw=50094   gzip=18603    ← axios travels with this page
index-BB85usQC.js     raw=221561  gzip=68626    ← the entry: less than half the raw bytes

$ python3 -c "import json; print(json.load(open('dist/.vite/manifest.json')).keys())"
index.html          -> assets/index-BB85usQC.js      dynamic: False
src/pages/Reports.tsx  -> assets/Reports-CAOWfQsc.js  dynamic: True
src/pages/Settings.tsx -> assets/Settings-DXjTXCJr.js dynamic: True
```

Read the numbers honestly:

| | Entry (gzip) | Reports (gzip) | Settings (gzip) | Total (gzip) |
| --- | --- | --- | --- | --- |
| A — all static | 109,419 | — | — | **109,419** |
| B — two lazy pages | 68,626 | 23,541 | 18,603 | **110,770** |

**The entry dropped by 40,793 bytes gzip (37%), and the total went up by 1,351 bytes (1.2%).** Both facts are the point:

- The **first load** is 37% smaller, so the app paints sooner on a phone.
- The **total** is slightly larger, because splitting adds a little bookkeeping (module wrappers, the preload helper). Code splitting does not delete code; it moves code off the critical path.
- If the user never opens Reports, they never download `zod` at all — for them the saving is 23.5 kB gzip, not 37%.

⚠️ The raw entry is 221,561 bytes and the *parse* cost is proportional to that, not to the gzip size. Splitting also cuts parse time for the first screen, which on a slow device is the more valuable half.

---

## 5. Reading a build: output, manifest, analysis tools

**The build output itself** (`vite build`) is the first stop: one line per chunk with raw and gzip size, and a warning when a chunk exceeds 500 kB (Vite's default `build.chunkSizeWarningLimit`). If your entry is above the warning, you have a question to answer.

**`dist/.vite/manifest.json`** (`build.manifest: true`) is the machine-readable version: entry → file, and which files are `isDynamicEntry` plus what each imports. This is what a server-side integration uses to know which chunks to preload for a route. Reading it is how the lab proved that the two pages had become dynamic entries rather than staying in the entry.

**Bundle analysis** answers "which module is big?" rather than "which chunk is big?":

```bash
npx vite build --sourcemap                 # enable source maps for the analysis
npx vite-bundle-visualizer                 # treemap of the build, no code changes
# or add rollup-plugin-visualizer to vite.config.ts for a report on every build
```

A treemap of the pre-split lab would show three large rectangles: `react-dom`, `zod`, `axios` — and `zod`/`axios` are precisely what the split moved out. That is the analysis loop: **measure the chunk sizes, open the treemap, find the rectangle, move or replace it, re-measure.**

**Budgets in CI** turn the numbers into a rule: fail the build if the entry (gzip) exceeds the budget, or post the diff as a comment on the pull request. Tools: `size-limit`, `bundlesize`, `rollup-plugin-visualizer` with thresholds, or a five-line script that reads `manifest.json` and compares against a checked-in JSON.

---

## 6. Vendor chunks and long-term caching

Content hashes in file names (`index-BB85usQC.js`) exist so that browsers can cache assets **for ever**: if the file changes, the name changes. That creates a strategy question:

- **One big entry** — any change to any file invalidates the whole thing for every user.
- **Vendor chunks** (React, the router, the state library in their own file) — a change to your app code does not invalidate the vendor file, so a returning user downloads only your diff.
- **Per-route chunks** — a change to one page invalidates only that page's chunk.

```ts
// vite.config.ts — one way to separate vendors (Rollup's manualChunks)
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          data: ['@tanstack/react-query'],
        },
      },
    },
  },
});
```

⚠️ Manual chunking is easy to get wrong: over-splitting creates many small files (and, before HTTP/2, extra connections; even with HTTP/2, extra round trips), and cross-chunk imports can create a *cycle* of chunks that must load in sequence. The modern advice is to **let the bundler do it** (dynamic imports already create natural boundaries and shared chunks) and add manual vendor chunks only for a large library that is genuinely shared and genuinely stable — then verify with the manifest and the treemap that the result is what you intended. In Vite 5+/Rollup 4, `manualChunks` as above still works; Vite also exposes `build.rollupOptions.output.advancedChunks` in newer versions for finer control.

---

## 7. Preload, prefetch and the cost of a chunk chain

A dynamic chunk has to be *discovered* before it can be downloaded. Two mechanisms cut that latency:

- **`modulepreload`** — a `<link rel="modulepreload">` in the HTML for chunks the entry statically imports. Vite injects these automatically (`build.modulePreload` is on by default; the dependency manifest is what makes it possible). It means the browser starts downloading the next file while it is still parsing the first.
- **`<link rel="prefetch">`** — low-priority download of a resource likely needed on the next navigation. Vite's build can emit prefetch directives for dynamic imports when `build.modulePreload.polyfill`/`build.prefetch`-style plugins are enabled; otherwise add the links yourself or prefetch with `import()` on hover (chapter 05, section 6).

⚠️ **Chunk chains are the hidden cost of too much splitting:** if chunk A imports chunk B imports chunk C, the browser cannot request C until A has been parsed and B has been fetched. One 100 kB chunk sometimes beats three chunks of 35 kB with a dependency chain, because the chain serialises the network. Measure *time to interactive*, not just total bytes.

---

## 8. Tree shaking and what actually bloats a bundle

**Tree shaking** is the bundler removing exports nothing uses. It only works when the bundler can see the shape of the module:

```ts
import { it } from 'lodash';                  // ❌ CommonJS, whole library can land
import it from 'lodash/it';                   // ✅ per-method module, single function
import { format } from 'date-fns';            // ✅ ESM, tree-shakeable
import { format } from 'date-fns/format';     // ✅ also fine, explicit
import * as Icons from 'lucide-react';        // ⚠️ all icons can be pulled in, depending on build
import { Home } from 'lucide-react';          // ✅ named import, tree-shaken
```

Things that quietly defeat tree shaking or add bytes:

| Cause | Symptom | Fix |
| --- | --- | --- |
| CommonJS dependency | the whole package in the bundle | find an ESM build/subpath import, or another library |
| `import * as x` used dynamically | all exports retained | named imports |
| Side-effecting package without `"sideEffects": false` | unreachable code kept | check the package; use the ESM entry |
| A barrel file (`index.ts` re-exporting everything) inside your own app | importing one thing drags in siblings | import from the file, not the barrel, for heavy modules |
| Two copies of React | "invalid hook call" or doubled bytes | one version in the tree (`npm ls react`) |
| Dev-only code shipped | extra code and warnings | `import.meta.env.DEV` guards are stripped in production builds |
| Source maps served publicly | no bytes on the wire, but a leak | generate source maps, upload them to the error tracker, do not serve them |

Measured dependency sizes (gzip, React excluded) are the sanity check behind all of this: **`fetch` 0.15 kB · Zustand 1.85 kB · TanStack Query 12.50 kB · RTK + react-redux 19.68 kB · axios 21.40 kB**. A state library is rarely what makes an app heavy; a date library with every locale, an icon set, a chart or a UI kit usually is.

---

## 9. Choosing a splitting strategy

| Strategy | Mechanism | Best for | Watch out for |
| --- | --- | --- | --- |
| **Route-based** | one dynamic import per route (router `lazy` or `React.lazy`) | every app with more than one screen | a slow chunk means the whole screen waits; keep the shell eager |
| **Widget-based** | `lazy()` for editors, charts, maps, modals | heavy libraries behind a toggle | fallback flicker; make it the widget's shape |
| **Vendor-based** | `manualChunks` for React + a big shared library | long-lived cache across deploys | over-splitting; chunk cycles |
| **Never** | keep it in the entry | the shell, the landing route, tiny modules | nothing — this is the right answer more often than people expect |

**The order of operations that works:**

1. Build and read the numbers (entry gzip, chunk list, warning threshold).
2. Open the treemap; identify the one or two biggest rectangles.
3. Try replacing or shrinking them first (a smaller library, a subpath import, a lazy image instead of JS).
4. Then split what remains: routes, then widgets.
5. Re-measure entry bytes **and** time-to-interactive; keep the change only if both improve.
6. Put the resulting budget in CI so the next feature does not undo it.

---

## 10. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `lazy(import('./X'))` | the module downloads immediately; nothing deferred | `lazy(() => import('./X'))` |
| 2 | Assuming splitting reduces total bytes | measured: total grew by 1.2% | split to shrink the *entry*, and say so |
| 3 | Splitting without measuring | extra requests, extra fallbacks, no visible win | build, read the manifest, compare before/after |
| 4 | Splitting the landing route | first paint now waits on a second round trip | keep the first screen in the entry |
| 5 | Importing a whole icon set or date library | 100–300 kB gzip of mostly unused code | named/subpath imports, smaller libraries |
| 6 | A barrel file inside the app | one import drags in a page's worth of modules | import heavy modules from their own files |
| 7 | Many tiny chunks | request overhead and serialised chains | fewer, larger boundaries; check TTI, not only bytes |
| 8 | Two copies of React | broken hooks or doubled bytes | one version; check `npm ls react` |
| 9 | Vendor chunking by hand without verification | chunk cycles, worse caching than before | let the bundler split; verify with the treemap |
| 10 | Serving source maps publicly | code disclosure | upload to the error tracker, do not publish |
| 11 | Ignoring gzip/Brotli | raw sizes look terrifying or fine, unrelated to reality | compare compressed sizes; enable Brotli at the CDN |
| 12 | A one-time optimisation with no budget in CI | the next dependency re-inflates the bundle unnoticed | size check in the pipeline |

---

## 11. Best practices

1. **Measure in gzip and in time-to-interactive**, before and after; keep the before/after table in the pull request.
2. **Let dynamic imports do the splitting** and use `manualChunks` only for large, shared, stable vendors.
3. **Keep the entry lean**: shell, layout, nav, auth, landing screen.
4. **Split where the user's intent is clear** — routes and heavy widgets.
5. **Preload what the entry needs next** (`modulepreload`), prefetch what the user is likely to open (hover, idle).
6. **Prefer replacing a heavy dependency to splitting it** — the best chunk is the one you never ship.
7. **Watch the chain**: one chunk that imports another costs a serialised round trip, which byte counts hide.
8. **Enable Brotli** at the CDN (Vite does not compress; the host does).
9. **Cache hashed assets for ever, HTML briefly**, and handle the stale-chunk case (chapter 05, section 5).
10. **Enforce a budget in CI** so performance is a property of the project, not of one careful afternoon.

---

## 12. Practice

### Beginner

1. Explain the difference between a static `import` and a dynamic `import()` in terms of when the code is fetched.
2. In the measured lab, the entry dropped from 109,419 to 68,626 bytes gzip while the total rose from 109,419 to 110,770. Explain in two sentences why both numbers are true and which one the user feels.
3. Name three things that should stay in the entry chunk and three that are good splitting candidates.

### Intermediate

1. Reproduce the split lab: create a three-page Vite app, build it with static imports, then with `lazy()` + `Suspense`, and produce the same size table and manifest dump. Then answer: which page should you *not* have split, and how would you prove it?
2. Add a chart library (or any large dependency) to one page, build, and use `vite-bundle-visualizer` to find it. Move it behind a lazy boundary and report the entry before/after plus the new chunk's gzip size.
3. Explain the caching strategy you would ship for the shop admin: HTML, entry chunk, per-route chunks, images. Include the stale-chunk scenario after a deploy and how your headers make it rare.

### Challenge

1. Design and run an experiment that answers "route splitting or widget splitting?" for a screen with a heavy chart and a heavy table. Measure entry gzip, time-to-interactive and the fallback experience for three versions (no split, route split, route + widget split), and write the recommendation as one paragraph with numbers.
2. Build a bundle-budget script: read `dist/.vite/manifest.json`, compute gzip sizes for the entry and each dynamic entry, compare against `budget.json`, and exit non-zero on a violation. Run it against the split lab, then prove it fails when you import `zod` statically again.
3. Investigate whether the app can drop `axios` for `fetch` (measured difference: 21.40 kB gzip vs 0.15 kB). Write the migration plan for a typed API client (interceptors, base URL, cancellation, error shape), estimate the effort honestly, and state the conditions under which the switch is *not* worth it.

---

## 13. Solutions

### Beginner

1. A static import is resolved at build time and its module is part of the chunk that is loaded before the code runs — the browser must download it before the app starts. A dynamic `import()` is fetched at the moment it is called (usually because a component rendered or a user clicked), from a separate file, and returns a promise.
2. The entry (what the first screen needs) shrank by 37%, which is what the user feels as a faster first paint. The total grew slightly because splitting adds module-wrapper and preload bookkeeping, and because every chunk carries a little overhead — the point of splitting is to move bytes off the critical path, not to remove them.
3. Entry: layout, navigation, auth gate, landing route, React and the router. Split: a reports page, a rich-text editor, a chart or map library — anything large that only some users, or only some navigations, need.

### Intermediate

1. The table and manifest are the ones in section 4 (entry slightly above the "before" total, dynamic entries marked `isDynamicEntry`). The page you should *not* have split is the one you land on — in the shop admin that is the product list, because splitting it adds a round trip before the first useful screen. Proof: measure time-to-interactive for the landing route with a cold cache, with and without the split, on a throttled connection; if the split version is slower (or equal), the split is cost without benefit.
2. After adding the chart to Reports and building, the treemap shows a large rectangle for the chart library inside the Reports chunk (or the entry, if the import was static). Moving the chart into its own lazy component gives a third chunk (chart library bytes) and reduces the entry by roughly its size; the *screen* now has two boundaries — the page and the chart — which is the honest cost: two fallbacks and possibly a two-step load. The numbers to report: entry gzip before/after, chart chunk gzip, and whether the page's interactive time improved.
3. Cache strategy: `index.html` short-lived (`Cache-Control: no-cache` or a few minutes) so deploys are picked up; `/assets/*` with hashed names `Cache-Control: public, max-age=31536000, immutable`; images optimised, hashed and long-lived; API responses not cached by the browser (`no-store`) and cached in memory by TanStack Query. The stale-chunk scenario arises when an open tab's HTML references a chunk hash that the deploy removed — mitigated by short HTML caching, plus an error boundary with a retry/reload for the lazy route (chapter 05, section 5).

### Challenge

1. Versions: (a) **no split** — smallest number of requests, largest entry, slowest first paint on a slow connection; (b) **route split** — entry shrinks by the chart + table code, first paint improves, the chart's fallback is a page-level skeleton (the whole screen waits); (c) **route + widget split** — the screen paints with the data table while the chart streams in, so first *useful* paint is earlier, at the cost of a second boundary and its fallback. Recommendation: (c) when the chart is genuinely optional to the screen's purpose (paint the table first) and (b)/(a) when it is not — and the paragraph should quote the three entry sizes, the three TTI measurements and the observed fallback behaviour, not a preference.
2. ```js
   // scripts/check-budget.mjs
   import { readFileSync, statSync } from 'node:fs';
   import { gzipSync } from 'node:zlib';
   const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
   const budget = JSON.parse(readFileSync('budget.json', 'utf8'));
   let failed = false;
   for (const [key, entry] of Object.entries(manifest)) {
     if (!entry.isEntry && !entry.isDynamicEntry) continue;
     const size = gzipSync(readFileSync(`dist/${entry.file}`)).length;
     const limit = entry.isEntry ? budget.entry : budget.chunk;
     const status = size <= limit ? 'ok' : 'OVER';
     if (size > limit) failed = true;
     console.log(`${status} ${entry.file} ${size} B (limit ${limit})`);
   }
   process.exit(failed ? 1 : 0);
   ```
   Running it on the split lab prints the three chunks under budget; re-importing `zod` statically pushes the entry over its limit and the script exits 1 — which is exactly the CI step that keeps the optimisation alive.
3. Migration plan: create `src/api/http.ts` around `fetch` with a `baseUrl`, a request function that sets headers and JSON-encodes bodies, an error type carrying status + parsed body, an `AbortSignal` parameter for cancellation (the axios-specific `ERR_CANCELED` check becomes an `AbortError` check), and a timeout via `AbortSignal.timeout` (with the caveat measured in Part 7: axios distinguishes timeouts via `ECONNABORTED`), then swap the call sites one module at a time behind the existing typed signatures (`src/api/products.ts`), keep the integration tests, and re-measure the bundle (expected: −21.4 kB gzip). Effort: an afternoon plus regression testing of every endpoint. Not worth it if the app relies on axios interceptors, upload progress, XSRF handling or a large existing axios-specific surface — 21 kB gzip is real but small next to a week of risky refactoring.

---

## 14. Summary

- **A bundle is the JavaScript sent to the browser; chunks are the files it is split into.** Build-time cost is download (gzip bytes) and parse (raw bytes); both affect first paint.
- **Static imports stay together; a dynamic `import()` is a chunk boundary.** Everything a dynamic chunk imports statically travels with it — measured: `zod` moved into the Reports chunk, `axios` into Settings.
- **Measured split (Vite 8):** one file of **354,160 B raw / 109,419 B gzip** became an entry of **221,561 / 68,626**, a Reports chunk of **83,320 / 23,541** and a Settings chunk of **50,094 / 18,603** — the entry **−37% gzip**, the total **+1.2% gzip**. Splitting moves bytes off the critical path; it does not delete them.
- **`dist/.vite/manifest.json` proves it**: the entry is `isEntry`, the two pages are `isDynamicEntry` with the entry as their importer. That file is also what you script a budget against.
- **Analyse by module, not only by chunk** (`vite-bundle-visualizer`, source maps), then replace or move the big rectangles — a smaller library beats a cleverer split.
- **Vendor chunks help only for large, shared, stable libraries**; over-splitting creates request overhead and serialised chunk chains that byte counts hide. `modulepreload` and hover/idle prefetch cut the discovery latency.
- **Tree shaking needs ESM and honest imports**: CommonJS, `import * as`, barrel files and duplicate React copies are the usual reasons a bundle is bigger than the code you wrote. Measured dependency weights: `fetch` 0.15 kB, Zustand 1.85 kB, TanStack Query 12.50 kB, RTK + react-redux 19.68 kB, axios 21.40 kB gzip.
- **Strategy:** keep the shell and landing route eager, split routes and heavy widgets, prefetch one step ahead, keep hashed assets cached for ever, handle the stale-chunk case, and enforce a budget in CI so the win survives the next sprint.

---

**What's next →** [`07-suspense.md`](./07-suspense.md) takes `Suspense` past lazy code: how React 19's `use()` reads promises and context, what makes a resource "suspenseful", how data fetching with `use()` differs from `useEffect` fetching, what a skeleton should and should not do, and when to reach for a query library instead.
