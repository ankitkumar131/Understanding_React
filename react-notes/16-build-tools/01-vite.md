# 01 — Vite: The Dev Server, HMR and Why It Is Fast

> **Part 16 · Build Tools · File 1 of 4**

Why this file exists: you have been running `npm run dev` since Part 1 without knowing what happens between saving a file and seeing it on screen. This file makes that mechanism concrete, using measurements from this lab: the dev server reported **`ready in 276 ms`**, the HTML it served contained `/@vite/client` and `/@react-refresh` (the HMR machinery), `/src/main.tsx` came back **transformed on demand** with its imports rewritten to `/node_modules/.vite/deps/react.js?v=fb4b5974` and an inline source map, and `node_modules/.vite/deps` held 15 files covering 6 dependencies, each marked `needsInterop: true`. Once you can see what the server is doing, the rest of this part — configuration, builds, modes — stops being magic.

Measured: [`react-lab/evidence/part16-vite.txt`](../../react-lab/evidence/part16-vite.txt) (Vite 8.3.0, Node 22).

---

## 1. The problem Vite solves

Before bundler-based dev servers, there were two archetypes:

| Approach | How dev worked | Why it hurt |
| --- | --- | --- |
| Bundle-first (webpack dev server) | bundle the whole app, serve the bundle, rebuild on change | startup and rebuild times grow with app size; a cold start on a big app was minutes |
| Native ESM, no build | serve source files as ES modules | the browser makes hundreds of requests, and TypeScript/JSX/CSS cannot run natively |

Vite's answer is **no bundling in development**: the browser loads your modules natively over ESM, and Vite transforms each file **on demand**, as it is requested. Startup becomes independent of app size, and a change only invalidates the modules that depend on it.

```text
        Bundle-first dev server                          Vite dev server
  src/**  ──bundle everything──►  bundle.js        src/utils.ts ──transform──► /src/utils.ts
          (slow start, big rebuild)                 (only what the browser asks for, on demand)
```

---

## 2. What actually happens on `npm run dev` (measured)

```bash
npx vite --port 5199 --strictPort
```

```text
  VITE v8.3.0  ready in 276 ms

  ➜  Local:   http://localhost:5199/
```

276 ms to a working server, on a project with React, TypeScript, Tailwind, Sass and the React Compiler plugin. The HTML it serves is **not** the `index.html` from `dist/`: Vite injects the HMR client and the React refresh runtime:

```html
<!-- GET / on the dev server (measured, trimmed) -->
<script type="module">
  import { injectIntoGlobalHook } from "/@react-refresh";
  injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
</script>
<script type="module" src="/@vite/client"></script>
<!-- …your own head tags… -->
<script type="module" src="/src/main.tsx"></script>
```

Both additions matter: `/@vite/client` is the websocket client that receives HMR updates, and `/@react-refresh` is what lets React components keep their state across edits.

Now ask the server for a source file:

```bash
curl http://localhost:5199/src/main.tsx
```

```js
// measured response (trimmed)
const StrictMode = __vite__cjsImport0_react["StrictMode"];
const createRoot = __vite__cjsImport1_reactDom_client["createRoot"];
import __vite__cjsImport0_react from "/node_modules/.vite/deps/react.js?v=fb4b5974";
import __vite__cjsImport1_reactDom_client from "/node_modules/.vite/deps/react-dom_client.js?v=0c5ed7a2";
import "/src/styles/global.css";
import { StylingDemo } from "/src/part12/StylingDemo.tsx";
createRoot(document.getElementById("root")).render(/* @__PURE__ */ _jsxDEV(StrictMode, { … }));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJtYXBwaW5ncyI6IkFBQUEs…
```

Five things to notice, because each one is a lesson:

1. **This is one file, transformed on the fly** — not a bundle. Vite only did work for this request.
2. **Bare imports were rewritten to URLs.** `import { StrictMode } from 'react'` became an import of `/node_modules/.vite/deps/react.js?v=fb4b5974`. A browser cannot resolve bare specifiers, so something must rewrite them; that is the dev server's job.
3. **Dependencies come from `.vite/deps`** with a version query (`?v=…`) for cache busting.
4. **TypeScript and JSX are erased.** What you wrote was `.tsx`; what the browser receives is plain JavaScript.
5. **A source map is appended inline**, so the browser's debugger shows your original file, line and column.

---

## 3. Dependency pre-bundling, measured

```text
$ ls node_modules/.vite/deps
_metadata.json  package.json  react-dom.js  react-dom_client.js  react.js
react_compiler-runtime.js  react_jsx-dev-runtime.js  react_jsx-runtime.js   (15 files total)

$ node -e "console.log(require('./node_modules/.vite/deps/_metadata.json'))"
hash: 042c7437 | configHash: c4e94444
  react                 -> react.js                  needsInterop: true | src: ../../react/index.js
  react-dom             -> react-dom.js              needsInterop: true | src: ../../react-dom/index.js
  react-dom/client      -> react-dom_client.js       needsInterop: true | src: ../../react-dom/client.js
  react/jsx-runtime     -> react_jsx-runtime.js      needsInterop: true | src: ../../react/jsx-runtime.js
  react/compiler-runtime-> react_compiler-runtime.js needsInterop: true | src: ../../react/compiler-runtime.js
```

```bash
$ curl -I http://localhost:5199/node_modules/.vite/deps/react.js
HTTP/1.1 200 OK
Content-Type: text/javascript
Cache-Control: max-age=31536000,immutable
Etag: W/"9b8b-mAE9ybdfTCKkw8FW34GFKuakNmY"
```

| Question | Answer |
| --- | --- |
| What is pre-bundled? | your **dependencies**, once, into `node_modules/.vite/deps` |
| Why? | (a) many packages ship hundreds of small internal modules — one request each would be slow; (b) CommonJS packages cannot be imported by a browser at all, so they must be converted to ESM (that is what `needsInterop: true` records) |
| With what? | Vite 8's bundler (the output imports `rolldown-runtime-*.js`, which is the tell) |
| When does it rerun? | when dependencies change (lockfile/config hash) or you force it |
| Cost of a cache miss | the first `vite` run after installing packages is slower; later runs reuse the cache |

```bash
npx vite --force          # ignore the pre-bundle cache and rebuild it
rm -rf node_modules/.vite # the other way to start clean
```

⚠️ **The cache is why "it works after I delete `node_modules/.vite`" is a real fix** — but it is also a symptom: if you find yourself doing it often, something in your config or dependency list is confusing the optimizer (a linked workspace package, a dependency with a `main`/`module` mismatch, or a plugin changing resolution).

---

## 4. HMR: hot module replacement

HMR is the feature that makes you forget you have a dev server at all: edit a component, and the change appears **without losing the state in that component's subtree** (in a form you are typing into, the text stays).

```text
save file
   │
   ▼
Vite sees the change (file watcher) ──► invalidates that module and walks the import graph up
   │
   ├─ module accepts HMR (a React component via @vitejs/plugin-react) ──► send the new module over the websocket
   │                                                                      └─► React Fast Refresh re-renders that component,
   │                                                                          keeping state for components whose props/hooks are unchanged
   └─ no accepting boundary found ──► full page reload
```

The client half is in your bundle as `/@vite/client`; the module you edited is asked "do you accept being updated?" via `import.meta.hot`:

```ts
// What the plugin adds around your component (conceptually)
if (import.meta.hot) {
  import.meta.hot.accept();          // "I can be replaced without a full reload"
}
```

| Edit | Result | State |
| --- | --- | --- |
| Change JSX in a component | Fast Refresh re-renders that component | preserved |
| Change a hook's implementation | that component and its children re-render | **partly reset** (hooks have no stable identity to preserve) |
| Change a module with non-component exports (`vite.config`-adjacent utilities) | often a full reload | lost |
| Change CSS | the stylesheet is swapped | preserved (no reload) |
| Change `vite.config.ts` | the server restarts | lost |
| Add a dependency | a re-optimisation pass runs | usually a page reload |

⚠️ **HMR hides two classes of bug**: state that only exists because you have been clicking around (it will not exist on a real page load), and effects that run "one time only" on mount (Fast Refresh may re-run them). Before trusting a feature, do a **hard reload** and run the flow from the top — a habit worth having, because HMR makes stale-state bugs very convincing.

---

## 5. Development vs production: two different machines

| | Dev (`vite`) | Production (`vite build`) |
| --- | --- | --- |
| Module loading | native ESM, one request per module | one (or a few) bundled files |
| Transform | on demand, per request, in memory | every module, once, at build time |
| Dependencies | pre-bundled into `.vite/deps` | bundled and tree-shaken into your output |
| HMR client | injected | absent |
| Minification | none (readable output) | full (Oxc/Terser per your config) |
| Source maps | inline, always | only if you ask (`build.sourcemap`) |
| Dead code | kept (helpful warnings survive) | eliminated (including `if (import.meta.env.DEV)` branches) |
| Speed metric | server ready in ~300 ms, updates in ms | a one-off build (measured here: ~0.5 s for a small app) |

That table explains three things you will meet repeatedly: why a dev-only branch never runs in production (`PROD` is statically `false`, so the code is removed), why production bugs can be invisible in dev (minification, dead-code elimination, no HMR), and why you must **always test a production build before shipping** (`npm run build && npx vite preview`).

---

## 6. A first look at the dev server's own behaviour

```bash
$ curl -s -o /dev/null -w 'GET /nope -> %{http_code} %{content_type}\n' http://localhost:5199/nope
GET /nope -> 200 text/html
```

An unknown path returns the app shell with **200**, not a 404: the dev server applies the SPA fallback by default (`appType: 'spa'`). That is convenient, and it also means the dev server hides a classic production problem — a host without the fallback returns 404 for `/nope`. You saw the production side in Part 15, file 08 (measured: `/` → 200, `/products` → 404 on a plain static server); the two measurements together are the whole story.

```ts
// vite.config.ts — the three appType behaviours
export default defineConfig({
  appType: 'spa',        // default: unknown paths → index.html (200)
  // appType: 'mpa',     // multi-page: 404 for unknown paths
  // appType: 'custom',  // you own the middleware
});
```

---

## 7. Vite 8 in one paragraph (for readers of older tutorials)

Older articles describe Vite's internals with **esbuild** (the transform and dependency pre-bundling) and **Rollup** (the production bundle). Vite 8 has moved on, and this lab measured the difference: Vite 8 transforms with **Oxc** and bundles with **rolldown**. The practical consequence is that esbuild-specific options are no longer the way to configure transforms — Vite 8 printed, verbatim, when given an esbuild option:

```text
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored.
The following esbuild options were set: `{ drop: [ 'console', 'debugger' ] }`
```

That warning is worth remembering twice: first as a fact about the toolchain (check the version a tutorial was written for), and second as the reason Part 15, file 05 measured the *actual* way to strip `console` calls in Vite 8 (a minifier setting, not an esbuild one).

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Testing only in dev | production-only bugs (minification, dead code, caching) | `npm run build && npx vite preview` before shipping |
| 2 | Trusting HMR state | a flow that only works because of accumulated dev state | hard reload and run the flow again |
| 3 | Editing `node_modules/.vite` by hand | corrupt pre-bundle cache | `npx vite --force` |
| 4 | Importing from a built path (`dist/…`) | works by accident, breaks in dev/build | import from source |
| 5 | Relying on the dev SPA fallback | deep links 404 in production | configure the host (Part 15, file 08) |
| 6 | A huge dependency in the app shell | slow pre-bundling, slow first load | check the bundle (file 03), lazy-load it |
| 7 | Absolute URLs to your API in dev | CORS problems that vanish in production | `server.proxy` (file 02) |
| 8 | Watching a network drive / container mount | file watching misses changes | `server.watch.usePolling` |
| 9 | Assuming `vite dev` == the deployed behaviour | SSR/headers/caching differ | test against a preview or staging deploy |
| 10 | Copying esbuild-based config from old posts | options silently ignored (measured warning) | check the Vite version; use current options |
| 11 | Committing `node_modules/.vite` | huge, machine-specific | it is gitignored by default |
| 12 | Debugging with HMR-generated stacks | mapped frames confusing | use `--debug`, or reproduce with a full reload |

---

## 9. Best practices

1. **Learn the two modes as two products**: dev prioritises feedback speed; production prioritises size, correctness and cacheability.
2. **Hard-reload before you believe a feature works**, especially after hook or effect changes.
3. **Keep the dev/production gap in mind**: `import.meta.env.DEV` branches vanish in production; test what you ship.
4. **Let the dev server proxy your API** so your code uses relative URLs everywhere (file 02) — it removes CORS from your life.
5. **Watch the startup time**: if it grows past a few seconds, suspect pre-bundling (a big dependency or a changed lockfile), not "Vite being slow".
6. **Keep the toolchain current and read its own warnings** — measured example: the esbuild/Oxc warning above is Vite telling you that your config is being ignored.
7. **Never debug by editing `node_modules`**; use `--force`, a config change, or a plugin patch.
8. **Use `vite preview` as your local production check** — it serves the real build with the SPA fallback.
9. **Understand the module graph**, because it is what makes HMR (and code splitting) predictable: an edit propagates up until it finds a boundary that accepts it.
10. **Read `vite --debug` output when something is mysterious**; it names plugins, resolutions and transforms.

---

## 10. Practice

### Beginner

1. Start your dev server and read the output: the version, the ready time, and the URLs. Then find `/@vite/client` in the HTML the server returns.
2. Request `/src/main.tsx` with `curl` and identify: the rewritten imports, the erased types, and the inline source map.
3. Change a component's text while a form on the page has content typed in; confirm the text stays. Then change one of its hooks and observe what resets.

### Intermediate

1. Inspect `node_modules/.vite/deps` and its `_metadata.json`: which dependencies were pre-bundled, and which needed interop?
2. Run `npx vite --force` and compare the ready time with a warm start. Explain the difference.
3. Compare `/nope` on the dev server (200 HTML) with the same path on `vite preview` after a build, then with a plain static server (Part 15, file 08). Write one sentence per result.

### Challenge

1. Measure your own dev experience: time from `npm run dev` to the first rendered page, and time from saving a component to seeing the update. Find the slowest part (pre-bundling? a plugin? a big module) and improve one thing, with numbers before and after.
2. Construct an HMR failure deliberately: export a non-component value from a file that also exports a component, edit it, and observe the full reload. Then restructure the file so HMR works (component-only exports) and explain why the rule `react-refresh/only-export-components` exists.
3. Compare the dev server and a production build for the same page: request counts, transferred bytes (Network tab), and time to first render (Performance panel). Explain each difference in terms of the table in section 5.

---

## 11. Solutions

### Beginner

1. The output names the version (measure here: `VITE v8.3.0`), the ready time (`276 ms`), and the local URL. `/@vite/client` appears as a module script in the served HTML — it is the HMR client, injected only in dev.
2. The response shows bare imports rewritten to `/node_modules/.vite/deps/...` and `/src/...` URLs, JSX compiled to `jsxDEV` calls (no `<div>` syntax remains) with TypeScript types gone, and a `sourceMappingURL` with a base64 inline map so DevTools can show the original.
3. Text typed into a controlled input survives a JSX edit (Fast Refresh preserves state for that component). Changing a hook's body makes the component's state reset — Fast Refresh cannot preserve a hook list it cannot match, so it remounts that subtree.

### Intermediate

1. Measured: 15 files for 6 optimised entries (`react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react/compiler-runtime`), all with `needsInterop: true` — these packages still expose CommonJS entry points, so Vite converts them to ESM.
2. A cold run (or after `--force`) takes longer because Vite must discover, transform and write the dependency bundles; warm runs reuse them and start in a few hundred milliseconds (measured: 276 ms and 312 ms on warm caches).
3. Dev server: 200 `text/html` (SPA fallback). `vite preview`: also serves the shell for unknown paths (it mimics a correctly configured host). Plain static server: 404 — which is what a user would see if you deployed without the fallback.

### Challenge

1. Typical findings: pre-bundling dominates a cold start (fix: keep the lockfile stable, or pre-warm in CI), a plugin running on every request (fix: narrow its `include`), or a huge module imported by the entry (fix: lazy-load it). The deliverable is two numbers — for example "cold 4.2 s → 1.1 s; update 180 ms → 40 ms" — and the change that produced them.
2. A file exporting both a component and a non-component value (a constant, a helper) breaks Fast Refresh's boundary detection: the plugin cannot safely replace the module without re-running the non-component code, so it falls back to a full reload. Splitting into `Component.tsx` and `constants.ts` restores hot updates — which is precisely why `react-refresh/only-export-components` warns in lint.
3. Expected differences: dev makes many requests (one per module plus the pre-bundled deps) but transfers little per request and needs no minification pass; production makes a handful of requests (measured in this lab: `index.html`, one CSS file, one entry JS chunk, plus an on-demand chunk) with much smaller totals, at the cost of a build step and no HMR. Time to first render is usually *similar* on a warm dev server and a local preview — the production advantage shows up on a network, where bytes and request count dominate.

---

## 12. Summary

- **Vite does not bundle in development.** It serves your source as native ESM, transformed **on demand** — measured: `/src/main.tsx` came back as plain JS with its bare imports rewritten to `/node_modules/.vite/deps/react.js?v=fb4b5974`, types erased and an inline source map.
- **Startup is fast because there is nothing to bundle**: measured `ready in 276 ms` for a project with React, TypeScript, Tailwind, Sass and the React Compiler plugin.
- **Dependencies are pre-bundled once** into `node_modules/.vite/deps` (measured: 15 files for 6 entries, all `needsInterop: true`, served with `Cache-Control: immutable`) — that is how hundreds of package-internal modules become a handful of requests, and how CommonJS packages become importable.
- **HMR works through the module graph**: `/@vite/client` receives updates over a websocket, React Fast Refresh re-renders the edited component and keeps state; edits with no accepting boundary fall back to a full reload. Always hard-reload before trusting a flow.
- **Dev and production are two different machines**: on-demand transforms and no minification versus a full, tree-shaken, minified build (measured in this lab: ~0.5 s build, 223 kB JS / 70 kB gzip).
- **The dev server applies the SPA fallback** (`/nope` → 200 `text/html`), which hides the production problem you must configure and test yourself (Part 15, file 08).
- **Vite 8 transforms with Oxc and bundles with rolldown**: esbuild-era advice no longer applies, and Vite says so explicitly in a warning (measured verbatim).

---

**What's next →** [`02-vite-configuration.md`](./02-vite-configuration.md) goes through `vite.config.ts` field by field: plugins (including React Compiler), `resolve.alias` with the TypeScript side kept in sync (measured, including the `baseUrl` deprecation), `server.proxy` so your app can use relative URLs, CSS options, `define`, build settings, the Vitest block that shares this config, and mode-aware configuration.
