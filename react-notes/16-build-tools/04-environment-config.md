# 04 — Modes and Environment Configuration in Depth

> **Part 16 · Build Tools · File 4 of 4**

Why this file exists: Part 15, file 01 established the rule that matters most — anything in a `VITE_` variable is public — and this file covers the mechanics underneath: the four modes a real project lives in (development, production, staging, test), the precedence between `.env` files (measured here: `.env.staging` beat `.env.local`, and a staging build contained the staging API URL while a production build contained the production one), what `import.meta.env` contains in each mode (measured in a test: `MODE = test`, `DEV = true`, `PROD = false`, and `test.env` values winning over `.env`), reading non-`VITE_` variables inside `vite.config.ts` with `loadEnv` (measured: `API_TARGET` visible only when the prefix argument is `''`), and how to keep every environment consistent without forking the code.

Measured: [`react-lab/evidence/part16-env.txt`](../../react-lab/evidence/part16-env.txt) and [`react-lab/evidence/part16-env-modes.txt`](../../react-lab/evidence/part16-env-modes.txt).

---

## 1. Modes, and what selects them

| Mode | Selected by | Vite command | What it is for |
| --- | --- | --- | --- |
| `development` | default for `vite` | `vite` / `vite --mode development` | your local dev server (HMR, no minification) |
| `production` | default for `vite build` | `vite build` | the shipped build |
| `staging` (custom) | `--mode staging` | `vite build --mode staging` | a pre-production environment (or QA) |
| `test` | Vitest sets it | `vitest` | tests; `.env.test` is **not** loaded by Vitest by default |

```bash
vite                              # mode = development
vite build                        # mode = production
vite build --mode staging         # mode = staging  → .env.staging is loaded
vite build --mode qa              # any name works; --mode is free-form
```

```ts
// The mode is available in code, and it is statically replaced at build time
const isStaging = import.meta.env.MODE === 'staging';
```

⚠️ **`--mode` is not `NODE_ENV`.** Vite sets `NODE_ENV` for you based on mode (`production` for `vite build`, otherwise `development`), and it is the *mode* that decides which `.env` files load. Reaching for `process.env.NODE_ENV` in application code does not work in the browser — use `import.meta.env.DEV` / `.PROD` / `.MODE`.

---

## 2. Precedence between `.env` files (measured)

```text
# The files in this lab
.env                 VITE_API_URL=http://localhost:3001/api      VITE_APP_NAME=React Lab (dev)
.env.staging         VITE_API_URL=https://api.staging.react-lab.example/api
                     VITE_APP_NAME=React Lab (staging)         API_TARGET=http://localhost:8098
.env.local           VITE_APP_NAME=React Lab (local override)
```

```text
$ npx vite build --mode staging          # .env + .env.staging + .env.local all present
  api.staging.react-lab.example    FOUND in bundle
  React Lab (staging)              FOUND in bundle
  React Lab (local override)       not found        ← .env.local did NOT win
  React Lab (dev)                  not found

$ npx vite build                         # mode = production
  api.staging.react-lab.example    not found
  api.react-lab.example            FOUND in bundle
  React Lab (local override)       not found
```

| Priority | File | Committed? | Typical contents |
| --- | --- | --- | --- |
| highest | `.env.[mode].local` | ❌ gitignored | machine-specific overrides for one mode |
| | `.env.[mode]` | ✅ usually | staging/production URLs and flags |
| | `.env.local` | ❌ gitignored | machine-specific overrides for all modes |
| | `.env` | ✅ yes | shared defaults (`VITE_APP_NAME`) |
| lowest | — | | built-ins (`MODE`, `DEV`, `PROD`) |

So the order is: **`.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`** — and the measured consequence is that a developer's `.env.local` cannot accidentally override a value that is explicitly configured for the mode being built. The failure mode that remains is the opposite one: a value that exists **only** in `.env.local` (nothing in `.env.[mode]`) will be used — which is why CI must build on a clean checkout (Part 15, file 01).

```gitignore
# .gitignore — never commit these
.env.local
.env.*.local
```

⚠️ **Do not commit real production secrets to `.env.production`** (there should be none in client config anyway), and treat the file as documentation of *names and shapes*, with values supplied by the deployment platform where they differ.

---

## 3. What `import.meta.env` contains

| Property | Type | Development | Production | Test (measured) |
| --- | --- | --- | --- | --- |
| `MODE` | `string` | `"development"` | `"production"` | **`"test"`** |
| `DEV` | `boolean` | `true` | `false` | **`true`** |
| `PROD` | `boolean` | `false` | `true` | **`false`** |
| `SSR` | `boolean` | `false` | `false` | `false` |
| `BASE_URL` | `string` | `/` (or your `base`) | `/` | `/` |
| `VITE_*` (yours) | `string \| undefined` | from `.env*` | from `.env*` | from `test.env`, else `.env*` |

```ts
// Measured in a Vitest run of this lab
MODE           = test
DEV            = true
PROD           = false
VITE_API_URL   = http://localhost:3001/api          ← from vite.config's test.env, not from .env
VITE_APP_NAME  = React Lab (test)
```

Two practical notes:

- **`DEV` is `true` in tests**, so a `if (import.meta.env.DEV)` guard does not separate test behaviour from dev behaviour; use `MODE === 'test'` if you need that.
- **`import.meta.env` is a build-time object, not a runtime lookup.** Measured in Part 15, file 01: the built bundle contained the literal URLs and **no** occurrence of `import.meta.env` — every access was replaced with a value.

---

## 4. Typing and validating your variables

```ts
// src/vite-env.d.ts — declared shape (types only)
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_ENABLE_NEW_CHECKOUT?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

```ts
// src/lib/env.ts — validated once, at boot
import { z } from 'zod';

const schema = z.object({
  VITE_API_URL: z.string().url().or(z.string().startsWith('/')),
  VITE_APP_NAME: z.string().min(1),
  VITE_ENABLE_NEW_CHECKOUT: z.enum(['true', 'false']).default('false'),
});

const parsed = schema.safeParse(import.meta.env);
if (!parsed.success) throw new Error(`Invalid environment configuration:\n${parsed.error}`);

export const env = {
  apiUrl: parsed.data.VITE_API_URL,
  appName: parsed.data.VITE_APP_NAME,
  newCheckout: parsed.data.VITE_ENABLE_NEW_CHECKOUT === 'true',
} as const;
```

Why both halves matter: the `.d.ts` gives the editor completion and catches typos (during development), while the schema catches **missing or malformed values at boot** in every environment — including a deploy where someone forgot to set a variable. The measured failure mode that this prevents is a bundle containing the string `undefined` inside a `fetch` URL, which is far harder to diagnose in production than a thrown error at startup.

---

## 5. Reading environment values inside `vite.config.ts`

Config code runs in Node, not in the browser, so it can read **all** variables — including ones without the `VITE_` prefix, which are exactly the ones you do *not* want to ship to users. That is what `loadEnv` is for:

```ts
// vite.config.ts
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');        // '' = no prefix filter → all variables
  return {
    server: {
      proxy: {
        '/api': { target: env.API_TARGET ?? 'http://localhost:3001', changeOrigin: true },
      },
    },
    define: {
      // A build-time constant, from an un-prefixed variable (never shipped as a value users can repurpose)
      __BUILD_SHA__: JSON.stringify(process.env.GITHUB_SHA ?? 'local'),
    },
  };
});
```

Measured with `loadEnv` directly:

```text
mode=development  | VITE_API_URL = http://localhost:3001/api                      | API_TARGET = (unset)
mode=production   | VITE_API_URL = https://api.react-lab.example/api              | API_TARGET = (unset)
mode=staging      | VITE_API_URL = https://api.staging.react-lab.example/api      | API_TARGET = http://localhost:8098
default prefix (VITE_ only): API_TARGET = (not exposed)                            ← the third argument matters
```

| Pattern | Use it for |
| --- | --- |
| `loadEnv(mode, cwd)` | reading `VITE_`-prefixed values in config code |
| `loadEnv(mode, cwd, '')` | reading **any** variable (proxy targets, CI metadata) |
| `envPrefix: 'APP_'` | renaming the client prefix (rare; `VITE_` is the convention) |
| `envDir` | keeping `.env` files outside the project root (monorepos) |
| `define` | injecting a build-time constant into client code |

⚠️ **Anything you pass to `define` is public and permanent for that build.** `__BUILD_SHA__`, a version string, a feature flag default — fine. An API key, a signing secret — never (Part 15, file 01).

---

## 6. Tests: deterministic environment, always

Tests must not depend on the machine's `.env` files, or a passing suite becomes a matter of luck. Vitest reads the same `test` block as Part 13, and `test.env` pins the values your app will see:

```ts
// vite.config.ts (excerpt)
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
  env: {
    VITE_API_URL: 'http://localhost:3001/api',   // measured: wins over .env inside tests
    VITE_APP_NAME: 'React Lab (test)',
    VITE_ENABLE_NEW_CHECKOUT: 'false',           // flags off by default in tests; enable per test if needed
  },
},
```

Measured in a test run of this lab:

```text
MODE           = test
DEV            = true
PROD           = false
VITE_API_URL   = http://localhost:3001/api        ← the test.env value, not the .env value
VITE_APP_NAME  = React Lab (test)
```

This closes the loop with Part 13, file 05: the app's HTTP client builds its URLs from `env.apiUrl`, so MSW handlers written as relative paths (`http.get('/api/products')`) and the app agree by construction — no absolute hosts in tests, no environment-specific stubs.

💡 **Two habits that keep tests honest**: keep flags off in `test.env` (so a feature must be enabled explicitly in the test that covers it), and never read `import.meta.env` outside your `env.ts` module — one import point means one place to control and one place to mock.

---

## 7. Putting it together: a project with four environments

```text
.env                     VITE_APP_NAME=Product          (shared, committed)
.env.development         VITE_API_URL=http://localhost:3001/api
.env.staging             VITE_API_URL=https://api.staging.example/api      VITE_ENABLE_NEW_CHECKOUT=true
.env.production          VITE_API_URL=https://api.example/api              VITE_ENABLE_NEW_CHECKOUT=false
environment.ts           reads env.apiUrl / env.newCheckout (validated)
vite.config.ts           proxy target from API_TARGET (loadEnv), test.env pinned
CI                       npm ci → lint → tsc -b → test → build --mode staging/production → deploy
```

| Environment | Build command | Where the values come from | How you verify |
| --- | --- | --- | --- |
| Local dev | `npm run dev` | `.env` + `.env.development` (+ your `.env.local`) | the app calls the local API through the proxy |
| Test | `npm test` | `test.env` + setup | the suite is green on a clean checkout |
| Staging | `npm run build:staging` | `.env.staging` | grep the bundle; run the staging smoke test (Part 15, file 08) |
| Production | `npm run build` | `.env.production` | grep the bundle; run the production smoke test |
| Runtime override (optional) | `config.js` (Part 15, file 01) | the deployment | edit the file and reload — no rebuild |

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "dev:staging": "vite --mode staging",
    "build": "tsc -b && vite build",
    "build:staging": "tsc -b && vite build --mode staging",
    "preview": "vite preview",
    "test": "vitest"
  }
}
```

⚠️ **Every environment needs its own verification**, because the whole point of modes is that the artifacts differ. Three cheap checks after each deploy: (1) `grep` the bundle for the expected API host and the absence of the others, (2) load a deep link (SPA fallback), (3) confirm the feature flags are in the state you expect for that environment.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Reading `process.env` in app code | it does not exist in the browser | `import.meta.env` (through one `env.ts`) |
| 2 | Assuming `.env.local` overrides mode files | measured: `.env.staging` won | learn the precedence order |
| 3 | Using `NODE_ENV` to detect the environment | it is Vite's business, not yours | `import.meta.env.MODE` / `DEV` / `PROD` |
| 4 | A secret in a `VITE_` variable | public in the bundle | server-side only (Part 15, file 01) |
| 5 | `loadEnv(mode, cwd)` and expecting un-prefixed vars | measured: they are filtered out | pass `''` as the prefix |
| 6 | Tests reading the developer's `.env` | suite passes locally, fails in CI | pin `test.env` |
| 7 | Feature flags typed as strings | `'false'` is truthy | schema/`=== 'true'` conversion |
| 8 | Building every environment with the same command | staging and production artifacts are identical (or wrong) | `build:staging` with `--mode` |
| 9 | No validation at boot | `undefined` in a fetch URL at runtime | Zod at startup (measured pattern) |
| 10 | Committing `.env.local` | machine-specific values shared (and secrets leaked) | gitignore it |
| 11 | Assuming a build can be reconfigured later | values are inlined (measured) | runtime config (`config.js`) if needed |
| 12 | Forgetting that `DEV` is `true` in tests | dev-only behaviour runs in tests | branch on `MODE === 'test'` |

---

## 9. Best practices

1. **One `env.ts` module** validates with Zod, converts types, and is the only place that touches `import.meta.env`.
2. **Type the shape** in `vite-env.d.ts` so a typo is a compile error.
3. **Give every environment a mode and a script** (`build:staging`, `build:qa`), and make the mode explicit in the deploy pipeline.
4. **Pin `test.env`** so the suite never depends on a machine.
5. **Use `loadEnv(mode, cwd, '')` in the config** for un-prefixed values (proxy targets, CI metadata), and keep them out of the client.
6. **Default every optional value** so a missing variable degrades gracefully instead of crashing mid-flow.
7. **Document the variables** in the README (name, purpose, example, required?) — measured failures like `'false'`-is-truthy cost a support ticket each time.
8. **Verify the artifact after building**, not the intent: grep for the expected host, check a deep link, check the flags.
9. **Build on a clean checkout in CI** so no local file can influence a release.
10. **Re-read Part 15, file 01 once a quarter** — the public-bundle rule is the one that ages into an incident.

---

## 10. Practice

### Beginner

1. Add three variables (`VITE_API_URL`, `VITE_APP_NAME`, `VITE_ENABLE_X`) to `.env` and use them through one module. Print `MODE`, `DEV`, `PROD` in dev, in a production build and in a test.
2. Prove that a non-`VITE_` variable does not reach the bundle (grep the built file) but *is* readable in `vite.config.ts` with `loadEnv(mode, cwd, '')`.
3. Create `.env.staging`, add a `build:staging` script, and show which API URL is in the staging bundle versus the production bundle.

### Intermediate

1. Convert a string flag to a boolean safely and write a test that fails if someone reverts to a truthy check.
2. Pin `test.env` and remove the developer's `.env.local` temporarily; prove the tests still pass.
3. Add `MODE` to your error reports and to a visible footer in non-production builds, so anyone can tell which environment a screenshot came from.

### Challenge

1. Design a four-environment setup (dev, test, staging, production) for an app with a feature flag and two API services: the files, the scripts, the CI matrix, the verification commands, and what is committed versus supplied by the platform.
2. Implement runtime configuration so one artifact can be deployed to staging and production with different API URLs, then explain (with the measured trade-offs from Part 15, file 01) when you would prefer it over per-mode builds.
3. Write a validation layer that fails the *build* (not just the app) when a required variable is missing for the mode being built, and demonstrate it failing for a staging build with `VITE_API_URL` unset.

---

## 11. Solutions

### Beginner

1. Development: `MODE = development`, `DEV = true`, `PROD = false`. Production build: `MODE = production`, `DEV = false`, `PROD = true`. Test (measured): `MODE = test`, `DEV = true`, `PROD = false` — the last one is the surprise worth remembering.
2. `DB_PASSWORD`-style variables are absent from both bundles (measured in Part 15, file 01) but `loadEnv(mode, cwd, '')` returns them in config code (measured here: `API_TARGET` present for staging, filtered out with the default prefix).
3. `.env.staging` with its own API URL plus `"build:staging": "tsc -b && vite build --mode staging"`; measuring the bundles shows the staging URL only in the staging artifact and the production URL only in the production one — exactly the pattern this lab measured.

### Intermediate

1. `const enabled = env.VITE_ENABLE_X === 'true';` in `env.ts`; the test asserts `readEnv().enabled === false` when the raw value is the string `'false'`, which is the case a naive truthiness check gets wrong.
2. With `test.env` set, the suite behaves identically with or without `.env.local` — the guarantee you want from a test suite (and the reason `test.env` exists in the Vitest config rather than a `.env.test` file, which Vitest does not load by default).
3. `MODE` in the error payload (Part 15, file 04) and a small badge rendered when `MODE !== 'production'` make screenshots and reports self-identifying; it has saved more confused conversations than any dashboard.

### Challenge

1. Files: `.env` (shared, committed), `.env.development`, `.env.staging`, `.env.production` (committed names/shapes, values where non-secret), `.env.local` (gitignored), `test.env` in the Vitest config. Scripts: `dev`, `dev:staging`, `build`, `build:staging`, `preview`, `test`. CI: a matrix over `[staging, production]` running `npm ci → lint → tsc -b → test → build --mode $MODE`, then a deploy job per environment with its own smoke test. Verification: grep the expected host, deep link, flag state.
2. Runtime config: `public/config.js` written by the deployment, read before the app boots, with `env.apiUrl` preferring the runtime value (Part 15, file 01 §6). Prefer it when one artifact must serve several environments (regulated release processes, identical staging/production images); prefer per-mode builds when you want tree-shaken flag branches and a value nobody can tamper with in transit.
3. A build-time check can live in the config function: after `loadEnv`, assert the required keys for that mode and `throw new Error('VITE_API_URL is required for mode staging')` — which fails the build with a clear message instead of shipping `undefined`. Demonstrating it (set the variable empty for one build) proves the guard works and documents the contract for whoever adds the next variable.

---

## 12. Summary

- **Four modes cover real projects**: `development` (dev server), `production` (build), custom modes such as `staging`/`qa` (`--mode`), and `test` (set by Vitest) — and the **mode**, not `NODE_ENV`, decides which env files load.
- **Precedence, measured**: `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`. A staging build contained the staging API URL and app name while `.env.local`'s value was ignored — which is why CI must still build on a clean checkout.
- **`import.meta.env` is replaced at build time** (Part 15, file 01 measured no runtime lookups), and in tests it reports `MODE = test`, `DEV = true`, `PROD = false` with `test.env` values winning over `.env`.
- **Validate at the boundary**: types in `vite-env.d.ts`, a Zod schema in one `env.ts`, conversion of strings to booleans — so a missing value fails at boot with a clear message instead of producing `undefined` inside a URL.
- **`loadEnv(mode, cwd, '')` exposes un-prefixed variables to config code** (measured: `API_TARGET` visible only with the empty prefix) — the right place for proxy targets and CI metadata, and never for values that end up in the bundle.
- **Pin `test.env`** so the suite is deterministic and MSW's relative paths, the app's `env.apiUrl`, and the test environment agree by construction (Part 13, file 05).
- **Give each environment its own script, artifact and verification**: grep the bundle for the expected host, load a deep link, check the flags — because the point of modes is that the artifacts genuinely differ.

---

**What's next →** [`../17-projects/01-counter.md`](../17-projects/01-counter.md) opens Part 17: six projects that apply everything so far, starting from a counter (component, state, events, testing) and building up to a complete production application. Each project follows the same shape — requirements, file tree, complete code, line-by-line explanation, tests, run instructions and expected output, then extensions — so you build the app and understand every line of it.
