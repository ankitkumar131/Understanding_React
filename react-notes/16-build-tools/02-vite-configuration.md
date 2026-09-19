# 02 — `vite.config.ts`: Aliases, Plugins, Proxy and Build Options

> **Part 16 · Build Tools · File 2 of 4**

Why this file exists: file 01 explained what Vite does by default. This file is about the
one file where you change those defaults. Most of a real project's config is ten lines —
path aliases, a dev proxy, a couple of plugins — but each of those lines prevents a specific
category of daily friction, and the build options decide whether your production bundle is
sane. Everything here is config you will find in a real codebase, with the reason attached.

---

## 1. The shape of the file

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

**Line by line**

- `defineConfig(...)` — not required, but it gives you **type checking and autocomplete** for
  the whole config object. Always use it.
- `react()` — the React plugin. It wires up Fast Refresh (HMR that keeps state) and JSX
  transform. Without it, `.tsx` files do not work.
- The default export can be an object, or **a function** that receives `{ command, mode }` —
  you need the function form for anything environment-specific.

```ts
export default defineConfig(({ command, mode }) => {
  // command: 'serve' (dev) | 'build'
  // mode:    'development' | 'production' | whatever --mode you passed
  return { /* … */ };
});
```

💡 **`command` vs `mode`:** `command` tells you *what Vite is doing* (serving or building);
`mode` tells you *which configuration* to use. `npm run build -- --mode staging` gives
`command: 'build'`, `mode: 'staging'`.

---

## 2. Path aliases: the first thing to add

```ts
// ❌ what imports look like without aliases — brittle and unreadable
import { Button } from '../../../shared/ui/Button';
import { useTasks } from '../../tasks/hooks/useTasks';

// ✅ with an alias
import { Button } from '@/shared/ui/Button';
import { useTasks } from '@/features/tasks';
```

```ts
// vite.config.ts
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
```

⚠️ **Vite's alias is not enough on its own.** Vite resolves it at build time, but
**TypeScript needs to know about it too**, or your editor shows red squiggles and
`tsc` fails:

```jsonc
// tsconfig.app.json (or tsconfig.json)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Two places, one alias. Forgetting the `tsconfig` half is the single most common config bug:
it works when you run the app and fails when you run `tsc`.

⚠️ **`fileURLToPath(new URL('./src', import.meta.url))` is not a ritual.** The config file
is an ES module, so `__dirname` does not exist in it. This expression computes an absolute
path relative to *the config file*, which keeps working no matter what directory you run the
command from.

---

## 3. The dev proxy (no CORS in development)

```ts
export default defineConfig({
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,          // sets the Host header to the target
        // rewrite: (path) => path.replace(/^\/api/, ''),   // only if the backend has no /api prefix
      },
    },
  },
});
```

**What this does:** a request from the browser to `/api/tasks` is same-origin (no CORS
preflight, no browser restriction). The dev server forwards it to `localhost:8000/api/tasks`
server-to-server, where CORS does not apply.

⚠️ **The proxy exists only in development.** In production there is no Vite server — your
hosting serves static files, and the browser talks to the real API origin, which must send
proper CORS headers (Part 15 file 06). This asymmetry is why "CORS only breaks in
production" is such a common bug report.

```ts
// Making the target configurable without hard-coding it (Part 15 file 01)
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: { proxy: { '/api': { target: env.BACKEND_ORIGIN ?? 'http://localhost:8000', changeOrigin: true } } },
  };
});
```

Other `server` options worth knowing:

```ts
server: {
  host: true,          // bind 0.0.0.0 → test on your phone over wifi
  strictPort: true,    // fail instead of silently picking another port (CI needs this)
  https: {},           // local HTTPS — required for Secure cookies and some APIs
}
```

---

## 4. `base`: deploying to a sub-path

```ts
export default defineConfig({ base: '/my-app/' });   // assets load from /my-app/assets/…
```

| Deployed at | `base` |
| --- | --- |
| `https://app.example.com/` | `'/'` (default) |
| `https://you.github.io/my-app/` | `'/my-app/'` |
| A CDN | `'https://cdn.example.com/my-app/'` |
| Unknown until build time | `''` (relative) — works, but breaks deep-link routing |

⚠️ **A missing `base` produces a blank page with 404s on `/assets/*`** — and the console
error says nothing about `base`. If a deploy shows a white screen and the network tab is full
of 404s for JavaScript files, this is the first thing to check.

---

## 5. Build options that matter

```ts
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,             // ✅ upload to your error tracker; do NOT serve publicly
    chunkSizeWarningLimit: 250,  // kB — warn above this (Part 15 file 07)
    target: 'es2022',            // syntax level of the output
    cssCodeSplit: true,          // one CSS file per chunk (default)
    reportCompressedSize: false, // skip gzip-size reporting → faster builds on big apps
    rollupOptions: {
      output: {
        // Explicit control over chunk splitting
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
```

**The three you will actually touch**

1. **`sourcemap: true`** — production stack traces become readable *in your error tracker*.
   ⚠️ Serving them publicly hands out your original source. Upload them in CI and exclude
   them from the deployed directory (Part 15 files 05–06).
2. **`manualChunks`** — put large, rarely-changing libraries in their own chunk. Users then
   keep the cached `react-<hash>.js` across deploys and only re-download your app chunk.
3. **`target`** — how far back you support. Lower targets mean more transpiled (bigger)
   output. `es2022` is a sensible modern default; check your real browser support before
   lowering it.

⚠️ **`manualChunks` can break things.** Splitting a library that must be a singleton (React
itself, a context provider) into multiple chunks can produce two copies and the dreaded
"Invalid hook call" or "context is undefined" runtime error. Start with the default
splitting; add `manualChunks` only when the bundle analyser justifies it, and test after.

---

## 6. Plugins: what they are and which ones to add

A Vite plugin is an object with **Rollup-compatible hooks** plus Vite-specific ones. You
rarely write one; you install them.

| Plugin | Why you would add it |
| --- | --- |
| `@vitejs/plugin-react` | Required — JSX + Fast Refresh |
| `@tailwindcss/vite` | Tailwind v4 integration (Part 12) |
| `rollup-plugin-visualizer` | See what is inside your bundle (Part 15 file 07) |
| `vite-plugin-checker` | Run `tsc`/lint *during* dev, not only in CI |
| `@vitejs/plugin-legacy` | Support older browsers via a second, transpiled bundle |

```ts
import { visualizer } from 'rollup-plugin-visualizer';
import checker from 'vite-plugin-checker';

export default defineConfig({
  plugins: [
    react(),
    checker({ typescript: true }),                 // type errors appear in the browser overlay
    visualizer({ filename: 'dist/stats.html', gzipSize: true, open: false }),
  ],
});
```

💡 **A plugin is just an object with hooks.** The simplest useful one is five lines, and
seeing one demystifies the whole system:

```ts
// A plugin that logs every module Vite transforms
function logTransforms() {
  return {
    name: 'log-transforms',
    transform(_code: string, id: string) {
      if (!id.includes('node_modules')) console.log('transform:', id);
      return null;   // null = "I did not change anything"
    },
  };
}
```

⚠️ **Every plugin runs on every build.** Five plugins is fine; thirty is a slow CI. Add them
for a reason and remove the ones you stopped using.

---

## 7. A realistic complete config

```ts
// vite.config.ts — the config used by Project 6 (Part 17)
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';

  return {
    base: env.VITE_BASE_PATH ?? '/',
    plugins: [
      react(),
      isProd && visualizer({ filename: 'dist/stats.html', gzipSize: true }),
    ].filter(Boolean),
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: env.BACKEND_ORIGIN ?? 'http://localhost:8000', changeOrigin: true },
      },
    },
    build: {
      sourcemap: isProd,
      chunkSizeWarningLimit: 250,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom', 'react-router'] },
        },
      },
    },
    test: {                                  // Vitest config can live here (Part 13)
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/shared/test/setup.ts',
    },
  };
});
```

**Notes on the parts that surprise people**

- `.filter(Boolean)` — the idiomatic way to include a plugin conditionally.
- `isProd && visualizer(...)` — the analyser is a dev tool; do not pay for it on every build.
- `strictPort: true` — in CI, silently switching from 5173 to 5174 breaks every script that
  hard-codes the URL.
- The `test` key requires `/// <reference types="vitest/config" />` at the top of the file
  for TypeScript to accept it.

---

## 8. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Alias in `vite.config.ts` but not `tsconfig` | Editor errors, `tsc` fails, app still runs | Add `paths` to `tsconfig` |
| Proxy assumed to work in production | CORS errors after deploy | Configure CORS on the API |
| No `base` on a sub-path deploy | Blank page, 404s on `/assets/*` | Set `base` |
| `sourcemap: true` deployed publicly | Your source is public | Upload to the tracker only |
| `manualChunks` splitting React | "Invalid hook call" / duplicate context | Remove it; let Vite decide |
| Editing config and expecting HMR | Nothing happens | Config changes restart the server (or restart it yourself) |
| `__dirname` in `vite.config.ts` | `__dirname is not defined` | `fileURLToPath(new URL(...))` |
| Using `import.meta.env` in the config | `undefined` | Use `loadEnv(mode, process.cwd(), '')` |

---

## 9. Practice

### Beginner
1. Add the `@` alias to both `vite.config.ts` and `tsconfig`, then convert five relative
   imports.
2. Add `server.proxy` for `/api` and confirm a request to `/api/health` reaches your backend.

### Intermediate
1. Add `build.sourcemap: true`, build, and open a `.js.map` to see your original TSX. Then
   write down where the maps should go in production.
2. Add `rollup-plugin-visualizer` (production only) and list your three biggest modules.

### Challenge
1. Add `manualChunks` for your largest library, build, and compare total size and the number
   of chunks. Then revert it if it did not help — and say why.
2. Write a five-line custom plugin that fails the build if any file in `src/shared/` imports
   from `src/features/` (Part 15 file 02).

---

## 10. Solutions

### Beginner
1. Both halves are required: Vite resolves the import at build time, TypeScript resolves it
   for the editor and `tsc`. After converting, `grep -rn "\.\./\.\./\.\./" src` should be much
   shorter.
2. With the proxy in place the browser only makes same-origin requests, so no preflight and
   no CORS headers needed in development.

### Intermediate
1. `dist/assets/index-<hash>.js.map` contains your original source in `sourcesContent`. In
   production: generate them, upload to Sentry/GlitchTip in CI, and delete them from the
   deployed folder.
2. Typical findings: `react-dom` (~140 kB), a date library, a chart library. The fix is
   usually replacing the library or importing it in a tree-shakeable way, not chunking.

### Challenge
1. Splitting helps *caching*, not total size: total bytes are the same, but the vendor chunk
   keeps its hash across app-only changes, so returning users download less. If your users
   are mostly first-time visitors, it is not a win — that is the honest answer.
2. ```ts
   function noUpwardImports() {
     return {
       name: 'no-upward-imports',
       transform(_code: string, id: string) {
         if (id.includes('/src/shared/') && /from ['"]@\/features\//.test(_code)) {
           this.error(`shared/ must not import features/: ${id}`);
         }
         return null;
       },
     };
   }
   ```
   A lint rule is usually the better tool — but writing this teaches you what a plugin hook
   actually is.

---

## 11. Summary

- **`defineConfig` gives you types**; the function form gives you `command` and `mode`.
- **Aliases need two entries** — `resolve.alias` in Vite and `paths` in `tsconfig`. One
  without the other is the classic "runs but fails to type-check" bug.
- **The dev proxy removes CORS in development only.** Production CORS is a server setting.
- **`base` must match where the app is served** or you get a blank page of 404s.
- **The build options that matter:** `sourcemap` (upload, don't serve), `manualChunks`
  (caching, not size — and it can break singletons), `target`, `chunkSizeWarningLimit`.
- **Plugins are objects with hooks.** Add them for a reason; each one costs build time.
- **Config changes restart the server** — HMR does not apply to `vite.config.ts`.

---

**What's next →** [`03-build.md`](./03-build.md): the production build in detail — what
lands in `dist/`, how chunking and hashing work, analysing a bundle, serving it locally, and
the deploy-time consequences of every file in that folder.
