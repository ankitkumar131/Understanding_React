# 01 — What Vite Is: Dev Server, HMR and Why It Feels Instant

> **Part 16 · Build Tools · File 1 of 4**

Why this file exists: you have typed `npm run dev` hundreds of times by now and it has
worked every time. That is exactly why it is worth one part to understand what it does —
because the moment it *doesn't* work (a stale module, a proxy that 404s, a build that behaves
differently from dev), the fix comes from understanding, not from restarting until it works.
This file explains the two-mode architecture of Vite, native ESM in the browser, Hot Module
Replacement, the dependency pre-bundling step, and what `npm run build` produces.

---

## 1. What Vite is, in one paragraph

Vite is a **build tool with two modes that work differently on purpose**:

- **Development** — it runs a dev server that serves your source files as native ES modules,
  transforming each file *on request*. No bundle is built up front, so startup time does not
  grow with your app's size.
- **Production** — it bundles your app with Rollup, because serving hundreds of unbundled
  files over a network would be slow for real users.

That asymmetry is the whole idea: **optimize for the developer in dev, optimize for the user
in prod.** Older tools used one bundler for both, which meant the developer paid the user's
cost on every startup and every edit.

---

## 2. Why it starts instantly: no bundle in dev

Compare what happens when you run the dev server:

```text
Bundler-first (the old way)
  1. Read every module in the app
  2. Resolve and transform all of them
  3. Produce one or more bundles in memory
  4. Only THEN serve the first request
  → startup time grows with app size (seconds → tens of seconds)

Vite (native ESM)
  1. Start an HTTP server
  2. Serve index.html
  3. The browser asks for main.tsx → Vite transforms THAT file and returns it
  4. The browser sees imports, asks for those files, and so on
  → startup time is roughly constant; the browser drives what gets built
```

The browser does the work of discovering the module graph. Vite only transforms what is
actually requested — and only the route you are looking at.

🔍 **"Native ESM" means `<script type="module">` and real `import` statements the browser
executes.** Modern browsers can fetch `import`ed files themselves over HTTP. That capability
did not exist when the older generation of tools was designed, which is why they had to
bundle for development too.

⚠️ **This is also why the browser's network tab looks enormous in dev** — hundreds of small
requests. That is normal and *not* what your users get. Production is a handful of files.

---

## 3. Dependency pre-bundling: the step you see on first run

Your `node_modules` packages are usually published as CommonJS or as ESM with hundreds of
tiny internal files. Serving those one-by-one would mean thousands of requests. So on the
first `npm run dev`, Vite **pre-bundles dependencies** with esbuild (written in Go — 10–100×
faster than JS bundlers) and caches them:

```text
node_modules/.vite/deps/react.js
node_modules/.vite/deps/react-dom_client.js
node_modules/.vite/deps/_metadata.json
```

Two consequences you will actually meet:

1. **The first `npm run dev` after installing something is slower**; later ones are instant.
   That is the cache doing its job.
2. **`304 Not Modified` / full-page reloads after adding a dependency** — Vite detects a new
   dep, re-optimizes, and reloads the page once. Harmless, and the message says so.

```bash
# When the cache is genuinely stale (weird "does not provide an export named X" errors):
rm -rf node_modules/.vite && npm run dev
# or
npm run dev -- --force
```

💡 **Only your source is transformed per-request; dependencies are pre-bundled once.** That
split is why editing your own code is instant while adding a new library costs a one-time
pause.

---

## 4. Hot Module Replacement (HMR)

**HMR** = when you save a file, Vite sends only that module (and the modules that need to
re-run) to the browser, which swaps it in **without a full page reload and without losing
state**.

```text
You edit TaskList.tsx and save
  ↓
Vite's file watcher notices the change
  ↓
Vite transforms TaskList.tsx and pushes an update over a WebSocket
  ↓
The React Fast Refresh runtime re-renders <TaskList /> with the new code
  ↓
Component state is PRESERVED — your open form still has its text
```

That last line is the difference between a tool and a workflow. Without state preservation,
reaching a deeply-nested screen means re-logging-in and re-navigating after every keystroke.

**What HMR can and cannot preserve**

| Change | State kept? |
| --- | --- |
| Editing JSX in a component | ✅ yes |
| Editing a hook's body | ⚠️ usually — the component re-mounts if the hook list changes |
| Adding/removing a hook call | ❌ no — Fast Refresh remounts (hook order changed) |
| Editing a module with side effects on import | ❌ often a full reload |
| Editing a file that exports non-components *and* components | ⚠️ may force a remount |
| Editing `vite.config.ts` | ❌ server restart |
| Editing `.env` | ❌ server restart (env is read at startup — file 01 of Part 15) |

⚠️ **Fast Refresh works best when a file exports only components.** Mixing a component and a
helper in one file is fine for small apps, but it can force remounts. If HMR feels flaky in
one file, split the non-component exports out.

⚠️ **"Why did my `useState` reset?"** — because the edit changed the *shape* of the component
(a different number or order of hooks), so React cannot reuse the state. This is the Rules of
Hooks (Part 4 file 10) showing up as a dev-experience symptom.

---

## 5. The two commands, compared

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "oxlint ."
  }
}
```

| | `npm run dev` | `npm run build` | `npm run preview` |
| --- | --- | --- | --- |
| Engine | esbuild transform + native ESM | **Rollup** bundle | Static file server |
| Output | Nothing on disk (except `.vite` cache) | `dist/` | Serves `dist/` |
| Code | Unminified, with source maps | Minified, tree-shaken, split | The real build |
| Env | `.env` + `.env.development` | `.env` + `.env.production` | Whatever was built |
| Speed | Instant startup | Seconds | Instant |
| Use for | Writing code | Shipping | **Testing what you ship** |

⚠️ **`tsc -b &&` matters.** Vite strips types with esbuild — it does **not type-check**.
Without `tsc -b` in the build script, type errors ship silently. (That is also why
`npm run dev` never complains about a wrong type: esbuild deleted the types before it could
look.)

⚠️ **`npm run preview` is not `npm run dev`.** Preview serves the *built* files. It is the
only local way to catch minification bugs, a wrong `base`, missing production env vars and
broken cache assumptions before your users do (Part 15 file 08).

---

## 6. What `npm run build` actually produces

```bash
npm run build && ls -la dist && ls -lhS dist/assets | head
```

```text
dist/
├── index.html                          # entry, rewritten to reference hashed assets
├── favicon.svg                         # copied verbatim from public/
└── assets/
    ├── index-Bk3xQz9a.js               # your app, minified + tree-shaken
    ├── index-Cv8mP2qL.css              # extracted CSS
    ├── settings-Dt4nR7sW.js            # a lazy() chunk (Part 10)
    └── hero-1200-Bf2kLp9w.webp         # an imported asset, hashed
```

Four things happen during that build:

1. **Transform** — TSX → JS (esbuild), SCSS → CSS, assets inlined or emitted.
2. **Bundle** — Rollup walks the import graph from `index.html` and groups modules into
   chunks.
3. **Tree-shake** — code that is provably never used is dropped. This is why
   `import { format } from 'date-fns'` ships one function while
   `import _ from 'lodash'` ships the library.
4. **Hash + emit** — filenames get a content hash so they can be cached forever, and
   `index.html` is rewritten to point at them.

🔍 **The hash is a cache-busting mechanism.** `index-Bk3xQz9a.js` changes name whenever its
content changes, so browsers can cache it "forever" and still get the new version after a
deploy — as long as `index.html` itself is *not* long-cached (Part 15 file 08).

⚠️ **Tree-shaking depends on static, side-effect-free imports.** Dynamic property access
(`_['format']`), `require()` in a bundled file, or a package with import side effects will
defeat it. If your bundle is unexpectedly large, this is usually why — and
`rollup-plugin-visualizer` shows you exactly what survived.

---

## 7. The dev server's other jobs

The dev server is not only a file server:

| Feature | What it does | Where |
| --- | --- | --- |
| **Transform on demand** | TSX/JSX/SCSS → browser-ready JS/CSS | automatic |
| **HMR** | Push updates over a WebSocket | automatic |
| **Proxy** | Forward `/api/*` to your backend — no CORS in dev | `server.proxy` |
| **Env injection** | Replace `import.meta.env.*` | automatic (file 01 of Part 15) |
| **Static serving** | `public/` at the root | automatic |
| **HTTPS / host** | Bind to `0.0.0.0` for phone testing | `server.host`, `server.https` |

```bash
npm run dev -- --host --port 3000     # reachable from your phone on the same wifi
```

⚠️ **`--host` binds to all interfaces**, so anyone on your network can reach your dev
server. Fine at home; think about it on a shared or café network.

---

## 8. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Expecting `npm run dev` to type-check | Type errors ship | `tsc -b` in the build script; your editor + CI catch the rest |
| Editing `.env` without restarting | Old values used | Env is read at startup — restart |
| Committing `node_modules/.vite` | Noise in diffs | It is git-ignored by default; don't force-add |
| Serving `dist/` with `npm run dev` | "It works in dev, not in prod" | `npm run preview` |
| Assuming dev = prod behaviour | Minification/env bugs found by users | Test the build locally |
| Mixing components and side-effectful exports in one file | Flaky HMR, state resets | Split them |
| Panicking at hundreds of network requests in dev | — | That is native ESM working as designed |
| Importing from `public/` | Asset not hashed, 404 after deploy | `import` from `src/`; `public/` is for fixed URLs only |

---

## 9. Practice

### Beginner
1. Run `npm run dev`, open the network tab, and count the requests. Then `npm run build &&
   npm run preview` and count again. Explain the difference in one sentence.
2. Edit a component's JSX and confirm state survives. Then add a new `useState` line and
   confirm it remounts.

### Intermediate
1. Add `server.proxy` for `/api` and remove any CORS configuration you needed before.
2. Clear `node_modules/.vite`, run `npm run dev -- --force`, and time the difference.

### Challenge
1. Add `rollup-plugin-visualizer` and identify the three largest modules in your bundle.
   Replace or split the worst one and record the before/after size.
2. Break something on purpose so it works in dev but not in `preview` (for example, read an
   env var that only exists in `.env.development`). Write down the exact error and what it
   taught you about the two modes.

---

## 10. Solutions

### Beginner
1. Dev: hundreds of requests (the browser pulls modules one at a time). Preview: a handful
   (Rollup bundled them). Same code, two delivery strategies — one for iteration speed, one
   for user speed.
2. JSX-only edits keep state because Fast Refresh can re-render the same component type with
   the same hook list. Adding a `useState` changes the hook list, so React must remount —
   which is the Rules of Hooks protecting you from mismatched state slots.

### Intermediate
1. `server: { proxy: { '/api': 'http://localhost:8000' } }`. The browser now only makes
   same-origin requests, so CORS never applies in development. Production still needs real
   CORS headers (Part 15 file 06).
2. Typically 2–6× slower on the first run, then back to instant. That cost is esbuild
   pre-bundling your dependencies into `node_modules/.vite/deps`.

### Challenge
1. `npm i -D rollup-plugin-visualizer`, add `visualizer({ open: true })` to `plugins`, build,
   and read the treemap. Usual culprits: a date library, a charting library, all of `lodash`,
   or an icon pack imported barrel-first.
2. The classic: `import.meta.env.VITE_ONLY_IN_DEV` is `undefined` in the production build, so
   a guard like `if (cfg.featureUrl.startsWith(...))` throws `Cannot read properties of
   undefined`. The lesson: **the only reliable test of production code is the production
   build.**

---

## 11. Summary

- **Vite has two engines:** esbuild + native ESM for development, Rollup for production.
  The asymmetry is deliberate.
- **Dev serves modules on demand**, so startup time does not grow with your app. The
  hundreds of requests in the network tab are the design, not a bug.
- **Dependencies are pre-bundled once** into `node_modules/.vite` — delete that folder or
  use `--force` when the cache misbehaves.
- **HMR swaps modules without a reload and usually keeps state**; changing the hook list
  forces a remount.
- **Vite does not type-check.** `tsc -b` in the build script is what keeps types honest.
- **`npm run build` transforms, bundles, tree-shakes and hashes** into `dist/`;
  `npm run preview` is how you test that output.
- **Dev and production are different programs.** Test the build before you ship it.

---

**What's next →** [`02-vite-configuration.md`](./02-vite-configuration.md): `vite.config.ts`
properly — aliases so imports stop being `../../../`, the plugin system, the dev proxy,
`base`, and the build options that control chunking and source maps.
