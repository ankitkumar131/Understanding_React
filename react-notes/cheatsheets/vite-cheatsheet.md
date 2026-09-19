# Vite Cheatsheet — Commands, Config, Environment, Build

> **Part 18 · Reference · Cheatsheet 8 of 9**
> Baseline in this book: Vite 8 (Rolldown + Oxc). Commands, config, environment variables, proxies, building, testing and troubleshooting.

---

## 1. Commands

```bash
npm create vite@latest my-app -- --template react-ts   # scaffold (React + TypeScript)
npm install                                            # install
npm run dev                                            # dev server + HMR (default port 5173)
npm run build                                          # usually `tsc -b && vite build`
npm run preview                                        # serve dist/ locally to verify the build
npx vite build --mode staging                          # build with a different mode
npx vite build --minify false                          # readable output (debugging)
npx vite --port 5199 --host                             # explicit port, reachable on the network
npx vite optimize                                        # re-run dependency pre-bundling
npx vite --force                                         # ignore the dep cache
npx vite-bundle-visualizer                              # treemap of what is in the bundle
```

| Command | Notes |
| --- | --- |
| `vite` | dev server with on-demand transforms; **no type-checking** |
| `vite build` | production build (Rolldown); **no type-checking** |
| `tsc -b` | the type-check — put it before `vite build` in `npm run build` |
| `vite preview` | static server for `dist/`; the SPA fallback works here |
| `vitest` | tests reuse the same config (`test` block) |

---

## 2. `vite.config.ts` anatomy

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  plugins: [
    react({ compiler: true }),        // React Compiler 1.0 (automatic memoisation)
    tailwindcss(),
  ],

  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },   // pair with tsconfig `paths`
  },

  server: {
    host: true,                       // listen on 0.0.0.0 (containers, previews)
    port: 5199,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8098', changeOrigin: true } },   // no CORS in dev
  },

  build: {
    outDir: 'dist',
    sourcemap: true,                  // upload to your error tracker; do not serve publicly
    minify: 'oxc',                    // Vite 8 default; 'terser' if you need its options
    target: 'baseline-widely-available',
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router'] },        // stable vendor chunk
      },
    },
  },

  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },

  test: { … },                        // vitest block (see §7)
}));
```

| Field | Effect |
| --- | --- |
| `plugins` | React, Tailwind, svgr, PWA, compression… |
| `resolve.alias` | `@/components/Button` instead of `../../components/Button` |
| `server.host` | `true` = `0.0.0.0` (required inside containers/preview environments) |
| `server.proxy` | forwards `/api` to a backend, so the app uses relative URLs |
| `build.manualChunks` | split vendors so app deploys do not invalidate framework caching |
| `build.sourcemap` | real line numbers in error reports |
| `define` | replaces a compile-time constant (`__APP_VERSION__`) |
| `mode` | the string used to pick `.env.[mode]` |

---

## 3. Environment variables

```bash
# .env                → all modes
# .env.local          → all modes, git-ignored, developer-specific
# .env.development    → `vite` (dev server)
# .env.production     → `vite build` (default)
# .env.staging        → `vite build --mode staging`
# .env.[mode].local   → highest priority
```

```bash
VITE_API_URL=/api
VITE_APP_NAME=Taskboard
API_TARGET=http://localhost:8098     # no VITE_ prefix → NOT exposed to the client
```

```ts
import.meta.env.VITE_API_URL         // typed as any → validate it (below)
import.meta.env.MODE                 // 'development' | 'production' | 'staging' | 'test'
import.meta.env.DEV / PROD           // booleans
import.meta.env.BASE_URL             // the `base` option, for asset URLs
```

**Measured precedence (this book's lab):** `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`.

```ts
// src/lib/env.ts — validate once, fail loudly
import { z } from 'zod';

const schema = z.object({
  VITE_API_URL: z.string().min(1),
  VITE_APP_NAME: z.string().default('App'),
});

const parsed = schema.safeParse(import.meta.env);
if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`);

export const env = parsed.data as { VITE_API_URL: string; VITE_APP_NAME: string };
```

⚠️ **Anything with the `VITE_` prefix is public** — it ends up in the bundle. Never put secrets there.

```ts
// vite.config.ts — read env in config (server-side) with loadEnv
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');        // '' = include un-prefixed variables
  return { server: { proxy: { '/api': { target: env.API_TARGET } } } };
});
```

```ts
// Vitest: pin values so tests do not depend on a developer's .env.local
test: { env: { VITE_API_URL: '/api', VITE_APP_NAME: 'React Lab (test)' } }
```

---

## 4. Dev server behaviour (what to expect)

| Request | Response |
| --- | --- |
| `GET /` | `index.html` + two injected modules: `/@vite/client` and `/@react-refresh` |
| `GET /src/main.tsx` | transformed on demand, imports rewritten to `/node_modules/.vite/deps/*.js?v=hash`, with an inline sourcemap |
| `GET /node_modules/.vite/deps/react.js` | pre-bundled dependency, served `Cache-Control: max-age=31536000, immutable` |
| `GET /api/*` | proxied to the backend (`server.proxy`) — no CORS in development |
| `GET /nope` (SPA) | `index.html` (the HTML fallback), so client-side routes work on refresh |

HMR: edited modules are replaced without a reload; editing a component's file updates only that component (Fast Refresh preserves state where it can, and full-reloads when it cannot).

---

## 5. Building

```bash
npm run build     # tsc -b && vite build   → dist/
ls -lh dist/assets
```

```text
dist/index.html                       0.62 kB │ gzip:   0.34 kB
dist/assets/index-DtetkJLr.css        8.24 kB │ gzip:   2.50 kB
dist/assets/rolldown-runtime-*.js     0.58 kB │ gzip:   0.36 kB
dist/assets/ReportsPage-CTBW9k2s.js   2.09 kB │ gzip:   1.02 kB   ← lazy route
dist/assets/index-Cfv75aT3.js        12.04 kB │ gzip:   4.77 kB
dist/assets/vendor-DwDvQbTE.js      345.82 kB │ gzip: 107.76 kB
✓ built in 368ms
```

| Fact | Why it matters |
| --- | --- |
| File names contain a **content hash** | unchanged content → identical hash → safe `immutable` caching |
| `index.html` has **no hash** | serve it with `no-cache`, so users get the new hashes |
| Lazy routes become their own chunks | a 2 kB page costs nothing until visited |
| `vite build` **does not type-check** | a deliberate `TS2322` still builds; `tsc -b` is what fails |
| `manualChunks` keeps vendors stable | a one-line app change does not force a React re-download |
| `modulepreload` links in `index.html` | the entry's static dependencies start downloading immediately |

---

## 6. Static hosting

```nginx
# nginx — hashed assets cached forever, index.html never cached, SPA fallback
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
location /        { add_header Cache-Control "no-cache"; try_files $uri $uri/ /index.html; }
```

```jsonc
// Vercel
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```text
# Netlify: public/_redirects
/*  /index.html  200
```

Without the fallback, refreshing `/tasks/42` on a plain static server returns **404** (this book measured it).

---

## 7. Vitest in the same config

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',                     // DOM APIs for component tests
    globals: true,                            // describe/it/expect without imports (+ RTL auto-cleanup)
    setupFiles: ['./src/test/setup.ts'],      // jest-dom matchers, MSW server, cleanup
    css: false,                               // skip CSS processing in tests (faster)
    restoreMocks: true,
    env: { VITE_API_URL: '/api' },            // matches the MSW handlers exactly
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
```

```bash
npx vitest                 # watch mode
npx vitest run             # once (CI)
npx vitest run src/projects/taskboard   # one folder
npx vitest run --reporter=verbose        # per-test output
npx vitest run --coverage
```

---

## 8. TypeScript config that pairs with Vite

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,          // TS6133 — unused imports fail `tsc -b`
    "paths": { "@/*": ["./src/*"] },  // keep in sync with resolve.alias (no `baseUrl`: TS5101)
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true        // no enums/parameter properties/namespaces
  },
  "include": ["src"]
}
```

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Port 5173 is already in use` | a previous dev server is alive | kill it (`pkill -f vite`) or `--port 5199 --strictPort` |
| Blank page after deploy, works locally | `base` is wrong for a sub-path hosting | set `base: '/app/'` |
| Refresh on a deep URL → 404 | no SPA fallback | add the rewrite (§6) |
| Users see the old app after deploy | `index.html` cached | `Cache-Control: no-cache` for HTML |
| `process is not defined` | Node globals in browser code | use `import.meta.env`, or `define` |
| `Cannot use import statement outside a module` | a CommonJS dependency | check `optimizeDeps.include`, or use the ESM build |
| Import looks right but resolves to nothing | alias added in `tsconfig` only | add it to `resolve.alias` too (or vice versa) |
| Env variable is `undefined` in the browser | missing `VITE_` prefix | rename it, or read it in `vite.config.ts` with `loadEnv` |
| Tests fail on an absolute API URL | app and MSW handlers disagree on the base | make both relative (`/api`) |
| Vite ignores a `tsc` error | Vite does not type-check | run `tsc -b` (put it in `npm run build`) |
| `Big chunk size` warning | a heavy dependency in the entry | lazy-load the route, or `manualChunks` |
| Slow first dev load | dependency pre-bundling | expected once, then cached in `node_modules/.vite` |
| HMR does full reloads | the file exports non-component values | keep component files component-only |
| `esbuild` options ignored (Vite 8) | Oxc is the transformer now | use `build.minify: 'terser'` with `terserOptions` if you need those options |

---

## 10. Deploy quick reference

```yaml
# CI: one command that means "this is correct"
- run: npm ci
- run: npm run verify        # lint && tsc -b && vitest run && vite build
- uses: actions/upload-artifact@v4
  with: { name: dist, path: dist }
```

| Checklist item | Value |
| --- | --- |
| Build artefact | `dist/` (hashed assets + `index.html`) |
| Cache headers | `assets/*` → `public, max-age=31536000, immutable`; `index.html` → `no-cache` |
| SPA fallback | all unknown paths → `index.html` |
| Environment | set `VITE_API_URL` per environment at **build** time |
| Source maps | upload to the error tracker; do not serve publicly |
| Rollback | deploy the previous artefact; keep the deploy log |
| Preview | one preview deploy per pull request |
