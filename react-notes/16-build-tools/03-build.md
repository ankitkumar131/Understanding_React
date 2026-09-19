# 03 — The Production Build: `dist/`, Chunking, Analysis and Preview

> **Part 16 · Build Tools · File 3 of 4**

Why this file exists: `npm run build` is the moment your source code becomes a product. This
file opens the box: what each file in `dist/` is and why it exists, how Rollup decides what
goes in which chunk, what the content hash is for, how to read a bundle analysis and act on
it, how to serve the build locally, and the handful of build-time failures that only appear
in production.

---

## 1. Running the build and reading its output

```bash
npm run build
```

```text
vite v7.x.x building client environment for production...
transforming (412) src/features/tasks/components/TaskList.tsx
✓ 412 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                       0.46 kB │ gzip:   0.30 kB
dist/assets/index-Cv8mP2qL.css       18.22 kB │ gzip:   3.91 kB
dist/assets/settings-Dt4nR7sW.js      9.84 kB │ gzip:   3.44 kB
dist/assets/index-Bk3xQz9a.js       187.31 kB │ gzip:  60.02 kB
✓ built in 2.84s
```

**Reading it**

- **`412 modules transformed`** — the size of your dependency graph. Grows with the app; a
  sudden jump usually means a whole library got pulled in.
- **Two sizes per file: raw and gzip.** *Always* reason about the gzip number — that is what
  travels over the wire. 187 kB raw → 60 kB gzip is typical for minified JS.
- **One `index.html`, one CSS, one main JS, plus one chunk per `lazy()` route.** If you see
  no extra chunks, you have no code splitting (file 01 of Part 10 in Part 10).
- **Warnings appear here and nowhere else.** "Some chunks are larger than 500 kB" is Vite
  telling you something you should not ignore.

⚠️ **`tsc -b && vite build`** — the `tsc` half is what makes type errors fail the build.
Vite/esbuild strips types without checking them, so a build can succeed with broken types.

---

## 2. What is actually in `dist/`

```text
dist/
├── index.html                          # the entry document, rewritten
├── favicon.svg                         # verbatim copy of public/
├── robots.txt                          # verbatim copy of public/
└── assets/
    ├── index-Bk3xQz9a.js               # the entry chunk (your app + small deps)
    ├── index-Cv8mP2qL.css              # extracted, minified CSS
    ├── settings-Dt4nR7sW.js            # a lazy route chunk, loaded on demand
    ├── react-CmR8tLp2Q.js              # a manualChunks vendor chunk (optional)
    └── hero-1200-Bf2kLp9w.webp         # an imported image, content-hashed
```

```html
<!-- dist/index.html — what Vite generated from your source index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script type="module" crossorigin src="/assets/index-Bk3xQz9a.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-Cv8mP2qL.css" />
  </head>
  <body><div id="root"></div></body>
</html>
```

Three facts that explain a lot:

1. **`dist/` is the entire product.** There is no server, no `node_modules`, no runtime
   dependency. Deploying means copying this folder somewhere that serves files.
2. **`public/` is copied without hashing**; everything imported from `src/` is hashed. That
   is why a favicon goes in `public/` (fixed URL) and a component image goes in `src/`
   (cache-busted).
3. **The `<script>` tag is `type="module"`** — the browser executes your app as ESM, which
   is why the output targets modern browsers and why very old browsers need
   `@vitejs/plugin-legacy`.

---

## 3. Chunking: how Rollup decides what goes where

A **chunk** is an output file containing one or more modules. Rollup's defaults:

| Chunk | Contains | When it loads |
| --- | --- | --- |
| Entry chunk | Everything reachable from `index.html` that is not split out | Immediately |
| Async chunks | Anything behind a dynamic `import()` | On demand (a route, a modal) |
| Shared chunks | Modules used by 2+ async chunks | With the first chunk that needs them |

```ts
// This one line is what creates an async chunk
const SettingsPage = lazy(() => import('@/features/settings'));
```

🔍 **The rule:** a static `import` puts a module in the entry chunk; a dynamic `import()`
creates a boundary and a separate file. That is the *entire* mechanism behind route-level
code splitting — no magic, just where you put the `import()`.

**Why chunking matters for real users**

- **First load** pays only for the entry chunk.
- **Navigation** pays for one small route chunk (with a Suspense fallback — Part 10 file 07).
- **Re-deploys** only invalidate chunks whose content changed, because the hash changes only
  then.

⚠️ **Too many chunks is also a cost.** Each is a separate HTTP request with its own latency.
Fifty 3 kB chunks is worse than five 30 kB chunks on a slow connection. Split by *route*,
not by component.

---

## 4. The content hash, precisely

```text
index-Bk3xQz9a.js
      └────┬───┘
      hash of the file's CONTENT
```

- Content changes → hash changes → new filename → browsers fetch it.
- Content identical → hash identical → browsers reuse the cached file.

This is what makes `Cache-Control: immutable` safe for assets, and it is why `index.html`
must **not** be cached long: it is the file that *names* the hashed files.

⚠️ **The deploy bug this prevents — and the one it causes.**

```text
Correct:  index.html (no-cache) → references index-NEWHASH.js → user gets new code
Broken:   index.html cached for a year → references index-OLDHASH.js → 404 → white screen
```

If users report "the app is blank until I hard-refresh after a deploy", the HTML is being
cached. Fix the headers, not the app (Part 15 file 08).

---

## 5. Analysing a bundle (and acting on it)

```bash
npm i -D rollup-plugin-visualizer
```

```ts
// vite.config.ts — production only
plugins: [react(), isProd && visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true })]
```

```bash
npm run build && open dist/stats.html
```

The treemap shows every module's contribution. Read it in this order:

1. **Anything over ~50 kB gzipped** — is it earning its place?
2. **Anything you did not expect to see** — a date library you use twice, all of `lodash`,
   an icon set, a second copy of a package.
3. **Duplicated packages** — two versions of the same library means both ship.

**The usual findings and fixes**

| Found | Fix |
| --- | --- |
| All of `lodash` | `lodash-es` + named imports, or native `Array` methods |
| `moment` | `date-fns` (tree-shakeable) or `Intl.DateTimeFormat` |
| A whole icon library | Import individual icons, or an SVG sprite |
| Two copies of one package | `npm dedupe`; check for version conflicts |
| A charting library in the entry chunk | `lazy()` the screen that uses it |
| Your own code duplicated across chunks | Expected for small shared modules; ignore unless large |

🏭 **Set a budget before you optimise.** "Make it smaller" has no end; "the entry chunk must
be under 150 kB gzipped" has a definition of done (Part 15 file 07).

---

## 6. Serving the build locally

```bash
npm run preview            # vite preview — serves dist/ at http://localhost:4173
npm run preview -- --port 5000 --host
```

`vite preview` is a **static server with the same `base` handling as the build**. It is not
a production server — no compression tuning, no custom headers, no SPA rewrite for unknown
paths beyond its own defaults.

⚠️ **`preview` will not reproduce your host's rewrite rule.** To test deep links locally the
way production behaves:

```bash
npx --yes serve -s dist -l 4173      # -s = single-page app: unknown paths → index.html
```

That is the closest local equivalent to Netlify/Vercel/nginx SPA rewrites, and it is how you
catch "refresh on `/tasks/42` gives 404" before your users do.

---

## 7. Build-time failures that only appear in production

| Error | Cause | Fix |
| --- | --- | --- |
| `Some chunks are larger than 500 kB after minification` | No code splitting | `lazy()` your routes |
| `Module externalized for browser compatibility: process` | A Node-only dep got bundled | Use a browser-compatible alternative |
| `"X" is not exported by "Y"` | Importing a named export that does not exist, or a CJS/ESM mismatch | Check the package's exports; use the default import |
| `Cannot read properties of undefined (reading 'env')` | Using `process.env` in client code | `import.meta.env` (Part 15 file 01) |
| Build succeeds, app is blank | Wrong `base`, or a runtime error the dev server tolerated | Check `base`; open the console in `preview` |
| Different behaviour after minification | Code that depended on function names or property order | Rewrite without the implicit dependency |
| `Failed to resolve import "@/…"` in build but not dev | Alias only in `tsconfig`, not `vite.config.ts` | Add `resolve.alias` |

🔍 **Minification changes more than size.** It renames identifiers, drops `function.name`
reliability, and removes dead branches. Code that inspects its own names (some DI libraries,
`switch` on `constructor.name`) breaks only in production. This is a real category of bug and
the reason `npm run preview` is in every checklist.

---

## 8. Source maps in production

```ts
build: { sourcemap: true }     // emits dist/assets/index-Bk3xQz9a.js.map
```

| Option | Result |
| --- | --- |
| `false` (default) | Smallest output; production stack traces are unreadable |
| `true` | Full maps emitted — **upload them, do not serve them** |
| `'hidden'` | Maps emitted but **not referenced** by a `//# sourceMappingURL` comment, so browsers never request them |

🏭 **The correct pipeline:** build with `sourcemap: 'hidden'` → upload `*.map` to your error
tracker in CI → exclude `*.map` from the deployed artefact. You get readable stack traces in
your dashboard and your source stays private (Part 15 files 05–06).

⚠️ **Serving `.map` files publicly is equivalent to publishing your source**, including
comments and original file structure. It is one of the most common accidental disclosures in
frontend deploys.

---

## 9. A build checklist

```text
[ ] npm run build → zero errors, and every warning explained
[ ] Entry chunk within budget (gzip number, not raw)
[ ] One async chunk per route — code splitting is happening
[ ] dist/stats.html reviewed; no unexpected library over 50 kB gzip
[ ] sourcemap: 'hidden' + uploaded to the tracker + NOT in the deploy artefact
[ ] npm run preview → the app works, console clean
[ ] npx serve -s dist → deep link + refresh works
[ ] base matches the deploy location
[ ] No secrets in dist/assets/*.js (grep — Part 15 file 01)
[ ] dist/ is the only thing deployed; no node_modules, no .map
```

---

## 10. Practice

### Beginner
1. Build your app and write down: number of modules, entry chunk size (raw and gzip), and the
   number of chunks.
2. Compare `dist/index.html` with your source `index.html` and list three differences.

### Intermediate
1. Add `lazy()` to every route, rebuild, and record how much the entry chunk shrank.
2. Add the visualizer, find your largest module, and either replace it or lazy-load its
   screen. Record the before/after gzip size.

### Challenge
1. Set `sourcemap: 'hidden'`, build, and confirm no `sourceMappingURL` comment exists in the
   emitted JS while the `.map` files do. Write the CI step that uploads and then deletes them.
2. Deliberately create a build that works in dev but fails in `preview` (a `process.env`
   read, or an alias missing from `vite.config.ts`). Document the exact error message.

---

## 11. Solutions

### Beginner
1. Something like `412 modules`, `187.31 kB │ gzip: 60.02 kB`, `1 chunk`. If the chunk count
   is 1, you have no code splitting — that is your next task.
2. Vite injected the hashed `<script type="module">` and `<link rel="stylesheet">`, resolved
   `/favicon.svg` from `public/`, and kept your `<div id="root">`. Your source HTML never
   references your entry file — Vite discovers it *from* the HTML.

### Intermediate
1. A typical result: entry 480 kB → 140 kB raw, with 20–60 kB per route. First paint improves
   because the browser parses less before it can render anything.
2. The fix is almost always "import less", not "chunk better": `import { debounce } from
   'lodash-es'` instead of `import _ from 'lodash'`, or `lazy()` the one screen that needs
   the chart library.

### Challenge
1. `grep -c "sourceMappingURL" dist/assets/index-*.js` → `0`, while `ls dist/assets/*.map`
   lists the maps. CI: `npx @sentry/cli sourcemaps upload dist` (or your tracker's
   equivalent) then `find dist -name '*.map' -delete` before the deploy step.
2. `process.env.NODE_ENV` in client code builds fine (Vite replaces some of it) but reads
   `undefined` for anything else, throwing at runtime in `preview` only. The lesson: **the
   dev server and the build are different programs** (file 01).

---

## 12. Summary

- **`dist/` is the entire product** — static files, no server, no runtime dependencies.
- **The build output reports raw and gzip sizes.** Always reason about gzip.
- **Static imports land in the entry chunk; `import()` creates a new chunk.** That single
  distinction is code splitting.
- **Content hashes make immutable caching safe** — and require `index.html` to be
  short-cached, or deploys break.
- **Analyse with the visualizer, act on the three biggest surprises**, and set a budget so
  "smaller" has a definition of done.
- **`vite preview` tests the build; `serve -s dist` tests SPA routing.** You need both.
- **`sourcemap: 'hidden'` + upload + exclude from deploy** is the only correct production
  source-map setup.

---

**What's next →** [`04-environment-config.md`](./04-environment-config.md): the build side of
configuration — modes, `.env.[mode]` precedence, `loadEnv` in the config file, `define` for
build-time constants, and producing correct builds for development, staging and production
from one codebase in CI.
