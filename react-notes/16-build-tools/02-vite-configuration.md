# 02 — `vite.config.ts`: Plugins, Aliases, Proxy and the Rest

> **Part 16 · Build Tools · File 2 of 4**

Why this file exists: the config file is where a Vite project's behaviour is decided, and most teams only ever copy snippets into it. This file goes through the fields you will actually touch, with measured evidence for each: `resolve.alias` resolving `@/lib/env` to `/src/lib/env.ts` in the transformed output (and the TypeScript-side `paths` that must match — including the `baseUrl` deprecation that broke this lab's build until it was removed), `server.proxy` forwarding `/api/ping` to a backend on another port (with the `x-api-server` header proving it arrived), the `test` block that needs a `/// <reference types="vitest/config" />` reference to type-check, plugins (React with the React Compiler, whose output was visible in the transformed module), and the settings that are better left alone.

Measured: [`react-lab/evidence/part16-vite.txt`](../../react-lab/evidence/part16-vite.txt).

---

## 1. The anatomy of a config file

```ts
/// <reference types="vitest/config" />            // ← types for the `test` block below (measured requirement)
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  server: {
    port: 5199,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8098', changeOrigin: true },
    },
  },

  test: {                                   // Vitest reads this project's config
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```

```ts
// The function form, when the config depends on mode/command (file 04)
export default defineConfig(({ mode, command, isSsrBuild }) => ({
  define: { __APP_MODE__: JSON.stringify(mode) },
  build: { sourcemap: mode !== 'production' },
  // …
}));
```

| Key | Purpose | Touch it when |
| --- | --- | --- |
| `plugins` | framework support (React, Tailwind, …) | you add a capability (file 02 §3) |
| `resolve.alias` | short import paths | you are tired of `../../..` |
| `resolve.extensions` | extra resolvable extensions | rarely — defaults are right |
| `server.*` | port, host, proxy, HMR settings | local development ergonomics |
| `preview.*` | the same for `vite preview` | you test the production build locally |
| `build.*` | output, minifier, source maps, targets | shipping behaviour |
| `css.*` | preprocessors, modules, CSS code splitting | styling setup (Part 12) |
| `define` | replace identifiers at build time | a global constant (prefer `import.meta.env`) |
| `envDir`, `envPrefix` | where env files live / which are exposed | multi-app repos, non-`VITE_` prefixes |
| `optimizeDeps` | dependency pre-bundling rules | a dependency breaks or is missing |
| `test` | Vitest configuration | testing (Part 13) |

---

## 2. `resolve.alias`: short imports, on both sides

```ts
// vite.config.ts — the bundler's view (runtime resolution)
resolve: {
  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
},
```

```json
// tsconfig.app.json — the type checker's view (compile-time resolution)
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

```tsx
import { readEnv } from '@/lib/env';        // before: '../../lib/env'
```

Measured, with both files in place:

```text
$ npx tsc -b
(no output — types resolved the alias)

$ curl http://localhost:5199/src/part12/StylingDemo.tsx | grep -o 'from "/src/lib/env.ts"'
from "/src/lib/env.ts"        ← Vite resolved '@/lib/env' to the source file
```

⚠️ **Two lessons from doing this in this lab** (both cost a build failure here first):

1. **`baseUrl` is deprecated.** Adding it produced: `error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.` The modern form is `paths` **without** `baseUrl` — the patterns are relative to the tsconfig file, so `"./src/*"` is enough.
2. **The two sides must agree, and they are separate settings.** TypeScript's `paths` satisfies the editor and `tsc`; Vite's `alias` satisfies the dev server and the build. Configuring only one gives you either red squiggles or a runtime "Failed to resolve import".

```ts
// An alias for the common 'node:path' style, if you prefer — same result
import path from 'node:path';
alias: { '@': path.resolve(__dirname, 'src') },
```

💡 **Prefer one alias.** `@/` alone keeps both configs short and readable; five aliases (`@components`, `@hooks`, …) mean five sync points and an architecture that is expressed by the alias names instead of by lint rules (Part 15, file 02).

---

## 3. Plugins

```ts
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      compiler: true,          // enable React Compiler (automatic memoization)
      // babel: { plugins: […] },   // only if a Babel plugin is genuinely required
    }),
    tailwindcss(),             // Tailwind v4 as a Vite plugin (Part 12)
  ],
});
```

| Plugin | What it does | Cost |
| --- | --- | --- |
| `@vitejs/plugin-react` | JSX transform, Fast Refresh, optional React Compiler | small; Fast Refresh needs the dev-only refresh runtime |
| `@vitejs/plugin-react-swc` | the same with a Rust-based transform | faster builds; a different compiler toolchain |
| `@tailwindcss/vite` | scans and generates utilities (Tailwind v4) | a build-time scan of your source |
| `svgr` (or `vite-plugin-svgr`) | imports `.svg` as React components | an extra transform per SVG |
| `vite-plugin-checker` | surfaces `tsc`/ESLint errors in the browser overlay | a second process in dev |

Measured — the React Compiler is genuinely active when `compiler: true`, and you can see it in the transformed output:

```js
// GET /src/part12/StylingDemo.tsx (measured, trimmed)
import __vite__cjsImport0_react_compilerRuntime from "/node_modules/.vite/deps/react_compiler-runtime.js?v=ebd34293";
const _c = __vite__cjsImport0_react_compilerRuntime["c"];
// …the component body is wrapped in memo-cache slots (_c(…)) generated by the compiler
```

⚠️ **Plugin order matters**, and so does trusting plugins with your source: a plugin can rewrite anything you write. Keep the list short, know what each one does, and prefer official plugins (`@vitejs/plugin-react`, `@tailwindcss/vite`) over abandoned community forks — you are handing them your code and your build.

---

## 4. `server.proxy`: relative URLs in development

```ts
server: {
  port: 5199,
  strictPort: true,                                   // fail instead of silently choosing another port
  host: true,                                         // listen on 0.0.0.0 (containers, LAN, previews)
  proxy: {
    '/api': { target: 'http://localhost:8098', changeOrigin: true },
    // A path rewrite when the backend has no /api prefix:
    // '/api': { target: 'http://localhost:8098', rewrite: (path) => path.replace(/^\/api/, '') },
  },
},
```

Measured with a stub backend on 8098:

```text
--- direct to the backend (port 8098) ---
HTTP/1.1 200 OK
x-api-server: the-real-backend-on-8098

--- through the Vite dev server (port 5199, same path /api/ping) ---
HTTP/1.1 200 OK
x-api-server: the-real-backend-on-8098        ← the same response, served from the dev server's origin
```

Why this is worth the ten lines:

| Without the proxy | With the proxy |
| --- | --- |
| the app must call `http://localhost:8098/api` in dev and `https://api.example.com/api` in production | the app calls `/api` **everywhere** |
| CORS headers needed in development (two origins) | one origin: no CORS in dev at all |
| cookies behave differently across origins | cookies work exactly as they will in production (Part 15, file 06) |
| `.env` differences leak into code | the base URL is a config detail of the environment (`VITE_API_URL ?? '/api'`, Part 15, file 01) |

⚠️ **`vite preview` and production hosting need the same mapping.** A proxy configured only under `server` applies to the dev server; for preview, configure `preview.proxy` too, and in production your host does the equivalent (a rewrite, an ingress, or an API on the same origin). Otherwise "it works in dev" and every API call 404s on the deployed site.

---

## 5. CSS, `define`, and other settings you will meet

```ts
export default defineConfig({
  css: {
    modules: { generateScopedName: '[name]__[local]___[hash:base64:5]' },  // default is fine for most apps
    preprocessorOptions: { scss: { additionalData: `@use "src/styles/tokens" as *;` } },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
    // prefer import.meta.env for configuration — this is for true build-time constants
  },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',        // generate maps, do not advertise them in the file
    chunkSizeWarningLimit: 600, // kB; raise knowingly, not to silence warnings
  },
  optimizeDeps: {
    include: ['react-dom/client'],     // force pre-bundling of a package that confuses discovery
    exclude: ['some-esm-only-package'],// keep a package out of the optimiser
  },
});
```

| Setting | Use it when | Warning |
| --- | --- | --- |
| `css.modules` | you need a specific class naming scheme | the default hashed names are fine; tests should not depend on them (Part 13) |
| `css.preprocessorOptions` | shared variables/mixins | `additionalData` runs in every file — keep it small |
| `define` | a constant that must be substituted textually | values are **not** JSON-encoded for you: `JSON.stringify` strings |
| `build.target` | you support older browsers | a lower target can mean more transpilation and polyfills |
| `build.sourcemap` | you want production stack traces | `true` exposes source; `hidden` keeps it private to your error tracker |
| `optimizeDeps.include/exclude` | a dependency is not being discovered, or is discovered wrongly | a first fix for "invalid hook call" and duplicated-package issues |

---

## 6. TypeScript in a Vite project

```json
// tsconfig.json — the root delegates to two projects
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

```json
// tsconfig.app.json (excerpt) — this lab's settings
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

| Setting | Why it matters |
| --- | --- |
| `noEmit: true` | Vite does the compiling; `tsc` is the type-checker (`tsc -b` in CI) |
| `moduleResolution: "bundler"` | matches how Vite resolves (extensionless, `package.json` exports) |
| `verbatimModuleSyntax` | forces `import type { … }` for type-only imports, so nothing is emitted for them |
| `jsx: "react-jsx"` | the automatic runtime: no `import React` needed (Part 6) |
| `strict` | the baseline; see Part 3 for the extra flags worth adding |
| `types: ["vite/client"]` | provides `import.meta.env` and asset-module types |

```ts
// vite-env.d.ts — keep this file; extend it for your own env variables (Part 15, file 01)
/// <reference types="vite/client" />
```

⚠️ **Two configs, one truth.** `vite.config.ts` decides what runs; `tsconfig*.json` decides what type-checks. If they disagree (aliases, `target`, JSX mode), you get a project that builds but does not type-check, or the reverse. When you change one, change the other in the same commit — the alias measurement in section 2 is exactly this lesson.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Alias in Vite but not in `tsconfig` (or the reverse) | red squiggles or resolve errors | configure both (measured) |
| 2 | Keeping `baseUrl` | `TS5101` deprecation error in modern TypeScript | use `paths` alone |
| 3 | Absolute API URLs in dev | CORS, cookie and `.env` differences | `server.proxy` (measured) |
| 4 | Proxy configured for dev only | preview/staging API 404s | mirror it in `preview.proxy` and in production |
| 5 | `define` with a raw string value | produced code contains unquoted text or crashes | `JSON.stringify(value)` |
| 6 | Ten plugins, none explained | mysterious transforms and slow builds | official plugins, each with a reason |
| 7 | `strictPort: false` (default) and scripts that assume 5173 | the port silently changes, links and proxies break | `strictPort: true` |
| 8 | `test` block without the vitest types | `tsc` error: `'test' does not exist in type 'UserConfigExport'` (measured here) | the triple-slash reference, or a separate `vitest.config.ts` |
| 9 | Config that behaves differently per machine | "works on my machine" | avoid absolute paths; use `fileURLToPath(new URL(…))` |
| 10 | Silencing the chunk-size warning without looking | a huge bundle ships | analyse it (file 03) |
| 11 | Editing config without restarting | stale behaviour (some options hot-reload, most do not) | restart the dev server; it prints when it does so itself |
| 12 | A separate `vitest.config.ts` that duplicates everything | the test environment diverges from the app's | share the config, or extend it explicitly |

---

## 8. Best practices

1. **Keep the config small and commented** — every option should explain why it exists; an unexplained option is a future mystery.
2. **Use one alias**, and configure both Vite and TypeScript in the same change.
3. **Proxy the API in development** so the application code only ever knows relative paths.
4. **Keep env in `.env` files** (Part 15, file 01) and reserve `define` for genuine build-time constants.
5. **Prefer official plugins** and keep the list short enough to explain out loud.
6. **Set `strictPort`** so scripts, proxies and docs can rely on the port.
7. **Type the config's extra blocks** (`/// <reference types="vitest/config" />`) so `tsc -b` stays green in CI.
8. **Mirror dev settings in preview** — anything you rely on locally should be reproducible against the built app.
9. **Review config changes like code**: they affect every developer and every deploy.
10. **Version-pin your tooling knowledge**: when copying a snippet, check the Vite version it was written for (measured example: esbuild options are ignored in Vite 8).

---

## 9. Practice

### Beginner

1. Add the `@/` alias in both `vite.config.ts` and `tsconfig.app.json`, convert five imports, and run `npx tsc -b` plus the dev server to prove both sides work.
2. Change the dev port and set `strictPort: true`; confirm the server fails loudly when the port is taken.
3. Add a `/api` proxy to a stub server of your own (a five-line Node server is enough) and call it from the app with a relative URL.

### Intermediate

1. Break the alias deliberately (remove it from `tsconfig` only) and describe what fails and where; then restore it and do the reverse.
2. Configure React Compiler in the plugin and verify it is active by reading the transformed module in the browser's Network tab; note what changed in the output.
3. Add `preview.proxy` so `vite preview` behaves like the dev server, then prove it with `curl` against both.

### Challenge

1. Design the config for a project that has: two apps sharing a workspace, an API with a different prefix in each environment, SVG imports as components, and CSS modules. Write the config with comments, and list which parts must be mirrored in `tsconfig` and which in CI.
2. Measure the cost of your plugin list: build with the full list, then with the optional ones removed, and report the differences in dev startup, HMR update time, and production build size/time. Decide which plugins earn their place (with evidence).
3. Write a "config review" checklist for your team: the questions a reviewer should ask about any change to `vite.config.ts` (what does it change in dev, in the build, in tests, in CI; what is the fallback if the tool changes it; who else must update their config).

---

## 10. Solutions

### Beginner

1. The two edits in section 2; after them `npx tsc -b` is silent (types) and the dev server serves the resolved path (measured: `from "/src/lib/env.ts"`). If you forget the tsconfig half, the editor shows "Cannot find module '@/lib/env'"; if you forget the Vite half, the dev server returns a resolve error at request time.
2. `server: { port: 5199, strictPort: true }` — starting two instances makes the second exit with "Port 5199 is already in use" instead of drifting to another port. That failure is better than a link, proxy or script pointing at the wrong place.
3. A stub backend plus the proxy block from section 4; the app calls `fetch('/api/ping')` and receives the JSON with the backend's header — measured here as `x-api-server: the-real-backend-on-8098` on both the direct and the proxied request.

### Intermediate

1. Missing from `tsconfig`: the editor and `tsc -b` fail with `TS2307: Cannot find module '@/lib/env'`, while the dev server keeps working. Missing from Vite: type-checking passes and the dev server fails at runtime with "Failed to resolve import". Both are clarity about where resolution happens — compile time versus bundle time.
2. With `react({ compiler: true })` the transformed module imports `react_compiler-runtime` and wraps the component in generated memo cache calls (`_c(…)`), which is visible in the Network tab's response body (measured). Behaviour should be unchanged — the compiler only adds memoization, and the official guidance is to keep existing `useMemo`/`useCallback` where an effect's stability depends on it.
3. `preview: { proxy: { '/api': { target: 'http://localhost:8098', changeOrigin: true } } }`; then `npm run build && npx vite preview` and `curl localhost:4173/api/ping` returns the backend's response, matching the dev result.

### Challenge

1. Sketch: a root config with `defineConfig(({ mode }) => …)`; per-app workspaces have their own configs extending a shared base (`mergeConfig`), the API prefix comes from `VITE_API_URL` (proxy in dev, host rewrite in production), `vite-plugin-svgr` for SVG components, and `css.modules` for CSS modules. Mirrored in `tsconfig` (`paths`, `jsx`, `moduleResolution`) and in CI (`npm ci`, `tsc -b`, `vite build`, size check).
2. A realistic measurement: removing a heavy plugin (e.g. a checker plugin running `tsc` in watch mode) can cut dev startup and HMR latency noticeably while adding nothing to the production bundle; removing a CSS framework plugin changes the build size and the CSS output dramatically. The lesson is to measure per plugin, not to argue about it.
3. Review questions: does this change affect dev only, or also the build/preview/tests? Is the equivalent setting present in `tsconfig` or in Vitest? What happens on a machine without the same paths/ports/env? Is there a documented way to undo it? Who else (CI, Docker, docs) must change with it?

---

## 11. Summary

- **`vite.config.ts` is the single place where dev, build, preview and tests are configured** — and the function form lets it vary by `mode`/`command` (file 04).
- **Aliases need two halves**: `resolve.alias` for Vite and `paths` for TypeScript. Measured: `@/lib/env` → `/src/lib/env.ts` in the transformed output, and `tsc -b` silent with `"paths": { "@/*": ["./src/*"] }` — plus the **`baseUrl` deprecation error (`TS5101`)** that shows why `paths` alone is the current form.
- **`server.proxy` removes CORS from development**: measured, `/api/ping` on the dev server returned the backend's response (header `x-api-server: the-real-backend-on-8098`), so application code can always use relative URLs — and the same mapping is needed for `vite preview` and production.
- **Plugins decide what happens to your source**: `react({ compiler: true })` was measurably active (the transformed module imports `react_compiler-runtime`), and each plugin is code with access to everything you write — keep the list short and official.
- **Config and TypeScript must agree** (aliases, target, JSX, resolution), and the config's extra blocks need their types (`/// <reference types="vitest/config" />`, whose absence produced a real `tsc` error here).
- **A few settings are worth knowing precisely**: `define` (needs `JSON.stringify`), `build.sourcemap: 'hidden'` for private maps, `optimizeDeps.include/exclude` for dependency edge cases, `strictPort` for predictability.
- **Copy snippets with the version in mind** — measured example: Vite 8 ignores esbuild options entirely and says so.

---

**What's next →** [`03-build.md`](./03-build.md) examines the production build: what `tsc -b && vite build` produces and how to read the output (measured: `index.html` 0.45 kB, CSS 8.38 kB, entry JS 223.35 kB / 70.26 kB gzip, and a lazily-loaded chunk of 0.37 kB), how code splitting, minification and tree-shaking show up in those numbers, how to analyse and shrink a bundle, and how to verify what you built.
