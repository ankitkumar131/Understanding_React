# 03 — The Production Build: Output, Splitting, Analysis and Preview

> **Part 16 · Build Tools · File 3 of 4**

Why this file exists: `npm run build` is treated as a ritual — run it, upload `dist/`, hope. This file makes the output readable, with measurements from this lab: `npx vite build` produced `index.html` 0.45 kB, CSS 8.38 kB, and **223.35 kB of JavaScript (70.26 kB gzipped)** in 467 ms; adding one `lazy(() => import(...))` produced a second chunk (`lazy-panel`, 0.37 kB); adding `manualChunks` split the entry into **4.59 kB of app code and 218.97 kB of vendor code**; and, importantly, a build with a deliberate type error **succeeded** under `npx vite build` while `npm run build` (`tsc -b && vite build`) failed with `error TS2322` — because Vite does not type-check. Once you can read the output, you can control it.

Measured: [`react-lab/evidence/part16-vite.txt`](../../react-lab/evidence/part16-vite.txt).

---

## 1. What the build command actually does

```json
// package.json
{ "scripts": { "build": "tsc -b && vite build", "preview": "vite preview" } }
```

```bash
npm run build          # 1. type-check the whole project (fails fast on any type error)
                       # 2. transform, tree-shake, minify, split, hash, write dist/
npx vite preview       # serve dist/ locally, with the SPA fallback
```

Measured — the type-check is doing real work, and it is **not** part of `vite build`:

```text
-- npx vite build with a type error in the source --
dist/assets/index-7JBCeG3v.js       223.35 kB │ gzip: 70.26 kB
✓ built in 477ms                       ← succeeded!

-- npm run build (tsc -b && vite build) with the same error --
src/dev/lazy-panel.tsx(11,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/dev/lazy-panel.tsx(11,7): error TS6133: 'broken' is declared but its value is never read.
```

⚠️ **This is the single most common reason a broken build reaches a code review**: someone runs `vite build` (or a CI job that only runs it) and believes the app is fine. Vite's job is bundling; TypeScript's job is types. Your `build` script and your CI must run both — which is why the template pairs them.

---

## 2. Reading the output (measured)

```text
$ npm run build

dist/index.html                       0.45 kB │ gzip:  0.29 kB
dist/assets/index-D0dZhWMe.css        8.35 kB │ gzip:  2.55 kB
dist/assets/lazy-panel-Dey562yt.js    0.37 kB │ gzip:  0.28 kB
dist/assets/index-LZdKF5L4.js       223.26 kB │ gzip: 70.22 kB

✓ built in 563ms
```

| File | What it is | Why it matters |
| --- | --- | --- |
| `index.html` | the shell: `<div id="root">` plus `<script>`/`<link>` tags pointing at the hashed assets | must not be cached (Part 15, file 08) |
| `assets/index-<hash>.css` | all CSS extracted from your imports | one request, cacheable forever |
| `assets/index-<hash>.js` | the entry chunk: your code plus the dependencies it needs | the number to watch; this is what blocks first paint |
| `assets/lazy-panel-<hash>.js` | a chunk created by `lazy(() => import(...))` | downloaded only when that path runs (file 01's splitting) |
| `assets/favicon.svg`, `icons.svg` | files from `public/`, copied verbatim | not processed by the bundler |

```bash
ls -lh dist/assets                  # sizes on disk
gzip -c dist/assets/*.js | wc -c    # what the network actually carries
```

Three habits that make these numbers useful:

1. **Compare gzip, not raw size.** The raw 223 kB is 70 kB over the wire; raw numbers mislead about what a user waits for (and a CDN with brotli does better still).
2. **Compare against the previous build**, not against a feeling. A 10 kB regression in the entry chunk is a fact; "the bundle feels big" is not.
3. **Know which chunk is on the critical path.** The entry chunk blocks the first render; a lazy chunk does not (it blocks the interaction that needs it).

---

## 3. What the build does to your code

| Step | Effect | Where you can see it |
| --- | --- | --- |
| Transpile | TypeScript/JSX → JavaScript for the target browsers | `build.target` |
| Tree-shake | unused exports dropped (a module's unused functions disappear) | compare a big import's effect on the bundle |
| Minify | names shortened, whitespace removed, cheap rewrites applied | the output being unreadable |
| Dead-code elimination | `if (import.meta.env.DEV) { … }` becomes `if (false)`, then disappears | grep the bundle for your dev-only strings |
| Split | dynamic imports and manual chunk rules create separate files | file names in the output |
| Hash | content hash in each asset name | the same source produces the same hash (measured in Part 15, file 08) |
| Extract CSS | imported CSS becomes a stylesheet (or a per-chunk stylesheet) | `index-<hash>.css` |
| Inline env | `import.meta.env.VITE_*` replaced by literals | Part 15, file 01's measured greps |

```ts
// How dead-code elimination looks in practice
if (import.meta.env.DEV) {
  enableWhyDidYouRender();         // gone from the production bundle
}
const apiUrl = import.meta.env.VITE_API_URL ?? '/api';   // becomes "…"/"api" or "/api"
```

⚠️ **Tree-shaking only works with ESM and with code that can be proven unused.** `import _ from 'lodash'` (or any CommonJS package with side effects) may pull in far more than you use; `import debounce from 'lodash/debounce'` or `lodash-es` does not. The bundle is the only place this is visible — which is why section 5 exists.

---

## 4. Splitting: the two ways, measured

**Dynamic imports** create chunks at the points you choose:

```tsx
const LazyPanel = lazy(() => import('../dev/lazy-panel'));
{showPanel && <Suspense fallback={<p>Loading…</p>}><LazyPanel /></Suspense>}
```

```text
dist/assets/lazy-panel-DV0C4Lcy.js    0.37 kB │ gzip: 0.28 kB      ← new file, fetched on demand
dist/assets/index-…js               223.35 kB │ gzip: 70.26 kB      ← unchanged entry
```

**Manual chunks** move shared code (usually `node_modules`) into a long-lived file:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
    },
  },
},
```

```text
$ npm run build (with manualChunks)
dist/index.html                       0.53 kB │ gzip:  0.32 kB
dist/assets/index-BfIfxHXu.css        8.38 kB │ gzip:  2.56 kB
dist/assets/lazy-panel-DV0C4Lcy.js    0.37 kB │ gzip:  0.28 kB
dist/assets/index-BgUEBRmu.js         4.59 kB │ gzip:  2.22 kB     ← your app code
dist/assets/vendor-Dd8u2uol.js      218.97 kB │ gzip: 68.33 kB     ← React and friends

✓ built in 525ms
```

Why splitting the vendor chunk is usually worth it: **cache stability**. React and friends change rarely, so when you ship an app change only the 4.59 kB app chunk is invalidated; users keep the 218.97 kB vendor file from cache. Before splitting, every deploy invalidated all 223 kB.

| Splitting strategy | Good for | Cost |
| --- | --- | --- |
| Route-level `lazy` | multi-page apps; the first screen loads fast | a request when navigating; fallbacks to design |
| Component-level `lazy` (below the fold, editors, charts) | big, rarely used features | more chunks to manage |
| Vendor chunk | cache stability across deploys | an extra request on first load |
| Per-dependency chunks | isolating a heavy library | water-fall risk; usually too fine-grained |
| No splitting | tiny apps | slower first load, worse caching for large apps |

⚠️ **Do not split blindly.** Each chunk is an extra request and, if it is needed for the first render, a potential waterfall. Start with route-level splitting plus a vendor chunk, measure, and split further only where the numbers justify it. `chunkSizeWarningLimit` exists to make you look at a large chunk, not to silence it.

---

## 5. Analysing a bundle

```bash
# Quick triage: sizes and gzip
ls -lh dist/assets && for f in dist/assets/*.js; do echo "$(gzip -c "$f" | wc -c) $f"; done | sort -n
```

```ts
// A visual treemap of what is inside (install: npm i -D rollup-plugin-visualizer)
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [react(), visualizer({ gzipSize: true, brotliSize: true, filename: 'dist/stats.html' })],
});
```

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Entry chunk grew by tens of kB | a heavy library imported at the top level | lazy-load it, or find a smaller alternative |
| The same package appears twice | two versions (a dependency pins an older copy) | dedupe with `npm ls <pkg>`, align versions, `optimizeDeps` |
| Icon/date/utility library is huge | a barrel import pulling everything | import per module (`lodash/debounce`, `date-fns/format`) |
| A "small" dependency dominates | a polyfill or a CommonJS package with side effects | check the treemap before believing the README |
| Everything is in one chunk | no dynamic imports and no manual chunks | route-level `lazy`, vendor chunk (section 4) |
| Large CSS | a utility framework scanning too broadly, or unused component styles | configure content paths; check `build.cssCodeSplit` |

💡 **Analyse after a change, not once a year.** The best moment to notice a 30 kB regression is the pull request that introduces it — which is why size budgets in CI (a `size-limit` check or a small script comparing gzip sizes) earn their keep.

---

## 6. Source maps, targets and other build settings

```ts
export default defineConfig({
  build: {
    target: 'es2022',            // baseline-widely-available by default; lower it only for real users
    sourcemap: 'hidden',         // generate maps, don't link them from the bundle
    cssCodeSplit: true,          // a stylesheet per async chunk (default)
    assetsInlineLimit: 4096,     // files under 4 kB become data URLs (fewer requests)
    chunkSizeWarningLimit: 600,  // kB; raise deliberately
  },
});
```

| Setting | Options | Recommendation |
| --- | --- | --- |
| `sourcemap` | `false` \| `true` \| `'inline'` \| `'hidden'` | `'hidden'` in production + upload maps to your error tracker (Part 15, file 04); `true` only if you accept publishing your source |
| `target` | an ES version or `'baseline-widely-available'` | keep the default unless you must support older browsers; lowering it adds transpilation and polyfills |
| `assetsInlineLimit` | bytes | the default is a good balance; raise for many small icons, lower to keep files cacheable |
| `cssCodeSplit` | boolean | leave on: a page that does not need the CSS does not download it |
| `minify` | `'oxc'` \| `'terser'` \| `false` | default is fine; `terser` when you need its specific options (Part 15, file 05's `pure_funcs`) |
| `outDir`, `emptyOutDir` | path, boolean | defaults (`dist/`) are fine; `emptyOutDir` prevents stale files |

⚠️ **Source maps are source code.** `sourcemap: true` publishes your original files (including comments and any code you thought was hidden) to anyone who opens DevTools. `'hidden'` gives you debugging in your error tracker without handing the source to visitors — the usual choice for production apps.

---

## 7. Verifying what you built

```bash
npm run build && npx vite preview
```

The preview server serves `dist/` with the SPA fallback and production caching behaviour, which makes it the closest thing to production you can run locally. A minimal verification routine:

| Check | How | Why |
| --- | --- | --- |
| The app renders | open `/` | the obvious one |
| Deep link works | open `/products` directly | SPA fallback (measured 404 on a plain static server, Part 15, file 08) |
| Refresh on a nested route | F5 on `/products/42` | routing + fallback together |
| A lazy chunk loads | navigate to the lazy feature | chunk paths are hashed |
| No dev artefacts | search the bundle for `localhost`, dev API URLs, debug logs | measured shipping of dev values (Parts 15, files 01 and 05) |
| Debug logs are gone | grep for a known `console.log` string | same |
| Size budget | compare gzip sizes with the last release | regressions are cheap to fix now, expensive later |
| Screens look right | compare against dev screenshots | CSS differs between dev and build (order, minification) |

⚠️ **A production build can fail where dev succeeded** for reasons that are invisible in dev: minification breaking code that relied on function names, a dynamic import path that cannot be statically analysed, CSS order changing, or an env variable that is in `.env.local` on your machine and missing in CI. Always run the build; never assume.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Running `vite build` without types | measured: a type error builds fine | `tsc -b && vite build` (the template's script) |
| 2 | Shipping `sourcemap: true` unknowingly | your source is public | `'hidden'` + upload to the error tracker |
| 3 | Comparing raw kB with other apps | gzip/brotli change the picture | compare gzip sizes of the same app over time |
| 4 | Splitting everything | request waterfalls, worse first render | route-level + vendor first, then measure |
| 5 | Never splitting anything | huge entry chunk, poor caching | the same |
| 6 | A barrel import of a big library | the whole library ships | import per module |
| 7 | Silencing the chunk-size warning | a 900 kB chunk ships unnoticed | analyse the chunk, then decide |
| 8 | Testing only `npm run dev` | production-only failures | `npm run build && npx vite preview` |
| 9 | Committing `dist/` | stale artifacts in the repo | gitignore it; build in CI |
| 10 | Old files left in `dist/` | stale assets served | let Vite empty the output (`emptyOutDir`) |
| 11 | Assuming tree-shaking always works | CommonJS/side-effectful packages defeat it | check the analyser |
| 12 | `.env.local` in the build | a machine-specific value ships | build in CI (Part 15, file 01) |

---

## 9. Best practices

1. **Type-check before building**, always — and in CI, on the same artifact you deploy.
2. **Read the build output every time.** Four lines tell you if something changed unexpectedly.
3. **Track gzip sizes over time** and fail CI on a budget breach; a number defends a decision better than an opinion.
4. **Split by route, keep a vendor chunk**, and lazy-load anything heavy that is below the fold.
5. **Analyse before optimising**: the treemap answers "why is this 200 kB" in one glance.
6. **Use `'hidden'` source maps** and send them to your error tracker.
7. **Verify with `vite preview`**, including deep links and a lazy chunk.
8. **Grep the bundle for dev values** after changes to configuration (Parts 15, files 01 and 05 measured what leaks).
9. **Keep the build fast**: if a build takes minutes, most code splitting choices stop being cheap to iterate on.
10. **Document your budgets** (entry ≤ X kB gzip, per-route ≤ Y kB) so reviewers have a rule rather than a preference.

---

## 10. Practice

### Beginner

1. Run `npm run build` and read every line of the output. Explain what each file is and why two of them have hashes.
2. Introduce a type error, run `npx vite build` (it will succeed) and then `npm run build` (it will fail). Revert.
3. Run `npx vite preview` and open a deep link directly. Compare with the same URL on the dev server.

### Intermediate

1. Add a `lazy(() => import(...))` for a component and confirm in the output that a new chunk appears (measured here: a 0.37 kB `lazy-panel` chunk).
2. Add a `manualChunks` rule for `node_modules`, compare the output with the previous build, and explain the caching consequence.
3. Add a size check to CI: for example, a script that fails when the entry chunk's gzip size exceeds a threshold you set. Prove it fails by lowering the threshold.

### Challenge

1. Take a real app and produce a bundle report: entry chunk size, largest dependencies, duplicated packages, and the three changes with the best size-to-effort ratio. Implement one and measure the difference.
2. Design the splitting strategy for a multi-route app: which routes are lazy, what goes in the vendor chunk, how the critical path is kept minimal, and how you would verify that a change did not move a heavy dependency into the entry chunk.
3. Set up source maps for production error reporting: generate `'hidden'` maps, upload them to your error service during the deploy, verify that a stack trace resolves to your source, and confirm that the maps are not publicly served.

---

## 11. Solutions

### Beginner

1. `index.html` (the shell, 0.45 kB), the CSS (8.35 kB), the entry JS (223.26 kB / 70.22 kB gzip) and a lazily loaded chunk (0.37 kB). The hashes are content fingerprints: a change produces a new name, which is what allows `immutable` caching of assets and `no-cache` for the HTML.
2. `npx vite build` succeeds because Vite never type-checks; `npm run build` fails with `TS2322` (and, with the unused-variable setting on, `TS6133`). Reverting removes both errors.
3. Both serve the app for a deep link; the difference is what is behind them — the dev server transforms modules on demand, the preview server serves the built, minified, hashed assets (so it also validates your build's routing behaviour).

### Intermediate

1. The dynamic import creates a separate chunk (`lazy-panel-DV0C4Lcy.js`), and the entry chunk is unchanged — proof that the module is not in the initial download. If the chunk did *not* appear, the import would be static somewhere (or the bundler inlined it).
2. Vendor chunking produced `index-BgUEBRmu.js` 4.59 kB (app) and `vendor-Dd8u2uol.js` 218.97 kB (dependencies). Consequence: a normal app change now invalidates only 4.59 kB, and users keep the vendor file cached — at the cost of one extra request on a cold load.
3. A CI size check can be as simple as a script that reads `dist/assets`, sums gzip sizes per chunk pattern, and exits non-zero above a budget. Lowering the budget until it fails proves the gate is real; the value should come from your actual baseline plus a small allowance.

### Challenge

1. A useful report has numbers, not adjectives: for example "entry 223 kB gzip 70 kB; largest contributors: react-dom 130 kB raw, our own code 24 kB, a date library 18 kB; duplicated package: none; three changes: (a) lazy-load the chart library (−52 kB gzip on the critical path), (b) replace the date library with `date-fns` per-function imports (−9 kB), (c) split vendor (−0 kB but +cache stability)." The implementable one is usually (a).
2. Strategy: every route lazy except the landing route; vendor chunk for `node_modules`; keep context providers and the layout in the entry; verify with a size check that the entry does not grow by more than a small allowance, and with a treemap that a heavy library did not move into the entry. Also decide the fallback design (skeletons) and whether to prefetch the likely next route.
3. Sources: build with `sourcemap: 'hidden'`, upload `dist/**/*.map` to the tracker as part of the deploy (its CLI usually has an `upload-sourcemaps` step), trigger a real error, and confirm the stack points at your `.tsx` file. Then `curl` one of the `.map` URLs from the deployed site and confirm a 404 — that is the difference between debuggable and public.

---

## 12. Summary

- **The build script is `tsc -b && vite build`, and both halves matter**: measured, a type error built successfully under `npx vite build` and failed with `TS2322` under `npm run build` — Vite bundles, TypeScript checks types.
- **Learn to read the output**: measured (small app) `index.html` 0.45 kB, CSS 8.35 kB, entry JS 223.26 kB (**70.22 kB gzip**), plus a lazy chunk of 0.37 kB, built in ~0.5 s. Compare gzip sizes against the previous build, never raw kB against other apps.
- **The build transforms your code in ways you can see**: transpile, tree-shake, minify, eliminate `DEV` branches, inline env values, split, hash, extract CSS.
- **Two splitting levers**: dynamic imports create on-demand chunks (measured: `lazy-panel` 0.37 kB), and `manualChunks` separates a long-lived vendor chunk (measured: **4.59 kB app + 218.97 kB vendor**) — the second is mostly about cache stability across deploys.
- **Analyse before optimising**: a treemap (or gzip sizes per file) answers "why is this big" in a minute; duplicated packages, barrel imports and unintentional CommonJS side effects are the usual culprits.
- **Source maps are source**: use `'hidden'` and upload to your error tracker rather than publishing your code.
- **Verify with `vite preview`** — deep links, a lazy chunk, no dev artefacts in the bundle — because a production build can fail where dev succeeded.

---

**What's next →** [`04-environment-config.md`](./04-environment-config.md) covers modes and environment files in depth: `.env` and `.env.[mode]` precedence (measured: `.env.staging` beat `.env.local`, and the staging bundle contained the staging API URL while the production bundle contained the production one), `--mode` for staging builds, `loadEnv` and `define` inside the config, typed env variables, and how to keep development, test, staging and production consistent without forking your code.
