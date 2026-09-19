# Vite Cheat Sheet

> Commands, config and the build output. Deep version: [Part 16](../16-build-tools/)

## Commands

```bash
npm create vite@latest my-app -- --template react-ts    # scaffold
npm install                                             # dependencies
npm run dev                                             # dev server → http://localhost:5173
npm run dev -- --host --port 3000                       # reachable on your network, custom port
npm run dev -- --force                                  # ignore the dependency pre-bundle cache
npm run build                                           # tsc -b && vite build → dist/
npm run build -- --mode staging                         # ⚠️ the `--` is required in npm scripts
npm run preview                                         # serve dist/ → http://localhost:4173
npx serve -s dist -l 4173                               # preview WITH SPA rewrites (deep links)
npx tsc -b --noEmit                                     # type-check (Vite does NOT)
npm run lint                                            # oxlint (the template's linter)
```

⚠️ **`npm run build --mode staging` passes `--mode` to npm, which ignores it.** You need
`npm run build -- --mode staging`.

## The two modes

| | `npm run dev` | `npm run build` |
| --- | --- | --- |
| Engine | esbuild transform + native ESM | **Rollup** bundle |
| Startup | Roughly constant | Grows with the app |
| Output | Nothing on disk (plus `node_modules/.vite`) | `dist/` |
| Code | Unminified, source maps | Minified, tree-shaken, chunked, hashed |
| Env files | `.env` + `.env.development` | `.env` + `.env.production` |
| Type-checking | ❌ none | Only if `tsc -b` is in the script |

**They are different programs.** Test the build with `npm run preview` before deploying.

## `vite.config.ts`

```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');     // '' = include non-VITE_ vars (Node-side only)
  const isProd = mode === 'production';

  return {
    base: env.VITE_BASE_PATH ?? '/',

    plugins: [
      react(),
      isProd && visualizer({ filename: 'dist/stats.html', gzipSize: true }),
    ].filter(Boolean),

    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),          // always JSON.stringify
      __APP_COMMIT__: JSON.stringify(execSync('git rev-parse --short HEAD').toString().trim()),
    },

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },

    server: {
      port: 5173,
      strictPort: true,                                    // fail rather than pick another port
      host: false,                                         // true = bind 0.0.0.0 (phone testing)
      proxy: {
        '/api': { target: env.BACKEND_ORIGIN ?? 'http://localhost:8000', changeOrigin: true },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: isProd ? 'hidden' : true,                 // upload, never serve publicly
      chunkSizeWarningLimit: 250,                          // kB
      target: 'es2022',
      cssCodeSplit: true,
      reportCompressedSize: false,                         // faster builds on large apps
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom', 'react-router'] },
        },
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/shared/test/setup.ts',
    },
  };
});
```

⚠️ **The alias needs two entries** — `resolve.alias` here **and** `paths` in `tsconfig`. One
without the other is the classic "it runs but `tsc` fails" bug:

```jsonc
// tsconfig.app.json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }
```

⚠️ **`__dirname` does not exist in `vite.config.ts`** (it is an ES module). Use
`fileURLToPath(new URL('./src', import.meta.url))`.

⚠️ **Editing `vite.config.ts` restarts the server.** HMR does not apply to the config file, and
neither does it apply to `.env` — restart the dev server after changing either.

## Environment variables

```text
.env                 # all modes — put PRODUCTION defaults here (a forgotten --mode stays safe)
.env.local           # all modes, git-ignored, YOUR machine
.env.development     # mode = development
.env.staging         # mode = staging
.env.production      # mode = production
.env.[mode].local    # per-mode, git-ignored
```

**Precedence:** `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`. `.local` beats the
mode file, which surprises people.

```ts
// Client code (src/**) — ONLY VITE_-prefixed variables are exposed
const apiUrl = import.meta.env.VITE_API_URL;
const mode   = import.meta.env.MODE;      // 'development' | 'production' | 'staging' | …
const isDev  = import.meta.env.DEV;
const isProd = import.meta.env.PROD;
const base   = import.meta.env.BASE_URL;

// Node code (vite.config.ts, scripts) — use loadEnv
const env = loadEnv(mode, process.cwd(), '');
```

```ts
// Type them, so a typo is a compile error
// src/vite-env.d.ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_API_URL: string;
  readonly VITE_LOG_LEVEL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
```

⚠️ **Every env value is a string** (or `undefined`). `if (env.VITE_FLAG)` is truthy for
`"false"`. Parse explicitly: `=== 'true'`, `Number(...)`.

🔒 **Anything prefixed `VITE_` is public.** A bundle is a public document — secrets live on a
server. → [Part 15 · 01](../15-production/01-environment-variables.md)

## What lands in `dist/`

```text
dist/
├── index.html                 # entry, rewritten to reference hashed assets
├── favicon.svg                # verbatim copy of public/ (never hashed)
└── assets/
    ├── index-Bk3xQz9a.js      # entry chunk: minified, tree-shaken
    ├── index-Cv8mP2qL.css     # extracted CSS
    ├── settings-Dt4nR7sW.js   # a lazy() chunk, loaded on demand
    └── hero-1200-Bf2kLp9w.webp
```

- `public/` is copied **verbatim**; anything imported from `src/` is **hashed**.
- The content hash is what makes `Cache-Control: immutable` safe — and requires `index.html`
  itself to be `no-cache`, or users get a blank page after a deploy.
- Static `import` → entry chunk. Dynamic `import()` → a new chunk. That is all code splitting is.

## Analysing a bundle

```bash
npm i -D rollup-plugin-visualizer
npm run build && open dist/stats.html
ls -lhS dist/assets/*.js | head            # biggest first
```

Always reason about the **gzip** number in the build output — that is what travels.

## Budgets

```json
// .size-limit.json  →  npx size-limit
[
  { "path": "dist/assets/index-*.js", "limit": "180 kB", "gzip": true },
  { "path": "dist/assets/*.css", "limit": "60 kB", "gzip": true }
]
```

Plus `build.chunkSizeWarningLimit` for a build-time warning.

## Deploying

```toml
# netlify.toml — the SPA rewrite, without which deep links 404
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

```json
// vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```nginx
location / { try_files $uri $uri/ /index.html; }
```

Sub-path deploy (`https://you.github.io/my-app/`)? `base: '/my-app/'` — otherwise every asset
404s and you get a blank page.

## Useful plugins

| Plugin | Why |
| --- | --- |
| `@vitejs/plugin-react` | Required — JSX + Fast Refresh |
| `@tailwindcss/vite` | Tailwind v4 |
| `rollup-plugin-visualizer` | See inside the bundle |
| `vite-plugin-checker` | Type errors in the browser overlay during dev |
| `@vitejs/plugin-legacy` | A second, transpiled bundle for old browsers |

## Diagnostics

| Symptom | Cause → fix |
| --- | --- |
| Blank page, 404s on `/assets/*` | Missing `base`, or publishing the wrong directory |
| 404 on refresh of a deep link | Missing SPA rewrite rule |
| `Failed to load module script … MIME type "text/html"` | The rewrite is catching asset requests — exclude real files |
| `process is not defined` | `process.env` in client code → `import.meta.env` |
| An env var is `undefined` | No `VITE_` prefix, or the wrong `--mode` |
| Works in dev, broken in preview | Different programs — check env, `base`, minification |
| `__dirname is not defined` | ES module config → `fileURLToPath(new URL(...))` |
| Alias resolves at runtime but `tsc` fails | Missing `paths` in `tsconfig` |
| "does not provide an export named X" | A CJS/ESM mismatch, or a stale `node_modules/.vite` → `--force` |
| HMR stopped working / state resets | The file exports components *and* side-effectful values — split it |
| Blank screen after a deploy, fixed by hard refresh | `index.html` is being cached |
| Type errors shipping to production | `tsc -b` missing from the build script |
