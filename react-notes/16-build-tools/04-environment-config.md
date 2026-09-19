# 04 — Environment Configuration: Modes, `loadEnv`, `define` and Per-Environment Builds

> **Part 16 · Build Tools · File 4 of 4**

Why this file exists: Part 15 file 01 covered environment *variables* — what they are, why
frontend ones cannot be secret. This file covers the **build machinery** underneath them:
what a *mode* actually is, the exact precedence of `.env.[mode]` files, how `loadEnv` differs
from `import.meta.env`, when you need `define` instead, and how to produce correct builds for
development, staging and production from one commit in CI — including the failure modes that
make "it works on my machine" a build-system problem.

---

## 1. Mode is not "development or production"

A **mode** is a string label you choose. Vite ships with two conventions and lets you add any
number of your own:

```bash
vite                # command: serve,  mode: development
vite build          # command: build,  mode: production
vite build --mode staging    # command: build, mode: staging
vite --mode qa               # command: serve, mode: qa
```

Two facts that clear up most confusion:

1. **`command` and `mode` are independent.** You can *serve* in `staging` mode and *build* in
   `qa` mode.
2. **`mode` only decides which env files are loaded and what `import.meta.env.MODE` says.**
   It does **not** change `NODE_ENV` semantics by itself — `vite build` is a production build
   (minified, tree-shaken) regardless of the mode you pass.

⚠️ **The most common misconception:** "`--mode development` gives me an unminified build."
It does not. `vite build --mode development` still produces a minified production build; it
just loads `.env.development`. Minification follows the *command*, not the mode.

```ts
// vite.config.ts — you can see both values
export default defineConfig(({ command, mode }) => {
  console.log(command, mode);     // 'build' 'staging'
  return {};
});
```

---

## 2. Env file precedence, exactly

```text
Loaded, later files overriding earlier ones:
  1. .env                    # all modes
  2. .env.local              # all modes, git-ignored
  3. .env.[mode]             # this mode only
  4. .env.[mode].local       # this mode only, git-ignored

Never loaded: .env.[mode].local when mode is 'test' (Vitest convention)
```

```bash
# .env
VITE_APP_NAME=Taskboard
VITE_API_URL=https://api.taskboard.example.com     # safe default = production

# .env.development
VITE_API_URL=http://localhost:8000

# .env.staging
VITE_API_URL=https://staging-api.taskboard.example.com

# .env.local  (git-ignored — my machine)
VITE_API_URL=http://192.168.1.20:8000
```

```bash
npm run dev                     # VITE_API_URL = http://192.168.1.20:8000   (.env.local wins)
npm run build                   # VITE_API_URL = https://api.taskboard.example.com
npm run build -- --mode staging # VITE_API_URL = https://staging-api...
```

⚠️ **`.env.local` wins over `.env.[mode]`.** That surprises people who expect a
mode-specific file to override everything. It is deliberate: `.local` means "this machine",
and your machine should beat a shared default. If you want a mode file to win, do not put
that variable in `.env.local`.

💡 **Putting production values in `.env` (the base file) is a good default:** a forgotten
`--mode` then produces a *safe* build rather than one pointing at localhost.

---

## 3. Two different readers: `import.meta.env` vs `loadEnv`

| | `import.meta.env` | `loadEnv(mode, cwd, prefix)` |
| --- | --- | --- |
| Available in | Client code (`src/**`) | Node code (`vite.config.ts`, scripts) |
| Populated by | Vite at build time (statically replaced) | You, explicitly |
| Prefix filter | Only `VITE_`-prefixed vars | You choose the prefix (`''` = all) |
| Types | `ImportMetaEnv` (you declare it) | `Record<string, string>` |

```ts
// vite.config.ts — reading env in Node-land
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // '' as the third argument disables the VITE_ filter — use ONLY in Node config
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      port: Number(env.PORT ?? 5173),
      proxy: { '/api': { target: env.BACKEND_ORIGIN ?? 'http://localhost:8000', changeOrigin: true } },
    },
  };
});
```

⚠️ **`loadEnv(mode, cwd, '')` exposes secrets to the config file — which is fine, because
the config runs in Node and never ships.** The danger is passing those values into `define`
or returning them from the config in a way that reaches client code. `BACKEND_ORIGIN` used
for a dev proxy never leaves your machine; the same variable inlined into `src/` would be
public.

```ts
// ❌ Leaks a non-prefixed (possibly secret) value into the client bundle
define: { __BACKEND__: JSON.stringify(env.BACKEND_ORIGIN) }
// ✅ Fine: it is a public value anyway, and it is explicitly named
define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) }
```

---

## 4. `define`: build-time constants that are not env vars

`define` performs a **literal text replacement** at build time. Use it for values that are
not configuration a developer would edit in a `.env` file:

```ts
// vite.config.ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(execSync('git rev-parse --short HEAD').toString().trim()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
```

```ts
// src/vite-env.d.ts — without these, tsc errors on identifiers that only exist post-build
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __BUILD_TIME__: string;
```

```tsx
// src/app/VersionBadge.tsx
export function VersionBadge() {
  if (import.meta.env.PROD) return null;
  return <span title={`built ${__BUILD_TIME__}`}>v{__APP_VERSION__} · {__APP_COMMIT__}</span>;
}
```

🔍 **Why `JSON.stringify` around every value:** `define` does raw text substitution.
`__APP_VERSION__: pkg.version` would paste `1.4.2` into your code as a *number expression*,
which is a syntax error or a wrong value. `JSON.stringify` produces `"1.4.2"` — valid code.

💡 **`define` vs `import.meta.env`, choosing:** env vars are for *configuration that differs
per deployment* and that a developer might change locally. `define` is for *facts about the
build* (version, commit, build time) that no one edits by hand.

---

## 5. Per-environment Vite config (not just per-environment values)

Sometimes the environment needs a different *config*, not just different values:

```ts
// vite.config.ts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';
  const isStaging = mode === 'staging';

  return {
    base: env.VITE_BASE_PATH ?? '/',
    plugins: [
      react(),
      isProd && visualizer({ filename: 'dist/stats.html', gzipSize: true }),
    ].filter(Boolean),
    build: {
      sourcemap: isProd || isStaging,        // maps for prod + staging, not for previews
      minify: isProd ? 'esbuild' : false,    // readable staging builds help debugging
    },
    server: {
      proxy: { '/api': { target: env.BACKEND_ORIGIN ?? 'http://localhost:8000', changeOrigin: true } },
    },
  };
});
```

⚠️ **Keep this small.** A config with fifteen `if (mode === …)` branches becomes
untestable. Prefer: same config everywhere, different *values* via env files, and only the
genuinely structural differences (source maps, `base`, minification) branching on mode.

---

## 6. Building every environment from one commit (CI)

The rule: **the commit is the unit of deployment; the environment is a build parameter.**

```yaml
# .github/workflows/release.yml
name: release
on:
  push: { branches: [main] }

jobs:
  build:
    strategy:
      matrix:
        include:
          - env: staging
            mode: staging
          - env: production
            mode: production
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx tsc -b --noEmit
      - run: npm run lint
      - run: npx vitest run
      - run: npm run build -- --mode ${{ matrix.mode }}
        env:
          # Secrets come from the CI secret store, never from a committed .env
          BACKEND_ORIGIN: ${{ secrets.BACKEND_ORIGIN }}
      - run: |
          # Guard: no secret-looking strings in the shipped bundle
          if grep -rEiq "sk-[a-z0-9]{20}|BEGIN.*PRIVATE KEY" dist/assets/*.js; then
            echo "Secret detected in bundle" && exit 1
          fi
      - uses: actions/upload-artifact@v4
        with: { name: dist-${{ matrix.env }}, path: dist }
```

**Three properties this gives you**

1. **Reproducibility** — `npm ci` installs exactly the lockfile, so the build does not depend
   on what was published to npm that morning.
2. **One code path** — staging and production are built by the same job with a different
   `--mode`. A bug fixed in one is fixed in both.
3. **Secrets stay in CI** — they are injected as process env vars for the Node-side config,
   never committed and never reaching the client bundle (the grep proves it).

⚠️ **Promote artefacts, don't rebuild them.** The gold standard is: build *once*, test that
artefact on staging, then deploy **the same bytes** to production. Rebuilding for production
means the thing you tested is not the thing you shipped — a small but real class of incident.

---

## 7. Failure modes (and how to diagnose them)

| Symptom | Cause | Diagnosis |
| --- | --- | --- |
| `VITE_API_URL` is `undefined` in the build | Missing `VITE_` prefix, or wrong mode | `console.log(import.meta.env.MODE)` in the app |
| Dev works, production hits localhost | `.env.production` missing; `.env` default is localhost | Put production values in `.env` |
| Staging build behaves like production | `--mode` not passed (note the `--` in npm scripts) | `npm run build -- --mode staging` |
| Config change has no effect | Config is read at startup | Restart the dev server |
| Secret visible in the bundle | A `VITE_` prefix, or a `define` of a secret | `grep -r <value> dist/assets/*.js` |
| Type error on `import.meta.env.X` | `ImportMetaEnv` not extended | Declare it in `vite-env.d.ts` (Part 15 file 01) |
| `__APP_VERSION__ is not defined` at type-check | Missing `declare const` | Add the declaration |
| Works locally, fails in CI | `.env.local` supplied a value CI does not have | Never depend on `.env.local` for correctness |

```bash
# The fastest possible check of what a build actually contains
npm run build -- --mode staging && grep -o "https://[a-z.-]*" dist/assets/*.js | sort -u
```

That one command lists every URL baked into the bundle. If staging's API URL appears in your
production build, you have found the bug in five seconds.

---

## 8. Common mistakes

| Mistake | Consequence | Fix |
| --- | --- | --- |
| Thinking `--mode development` unminifies | Confusion when the build is still minified | Mode ≠ command |
| `npm run build --mode staging` (no `--`) | npm swallows the flag; mode stays `production` | `npm run build -- --mode staging` |
| Relying on `.env.local` for CI correctness | Builds fail or mis-point in CI | Commit `.env.[mode]`; keep `.local` for personal overrides |
| `loadEnv(mode, cwd, '')` values reaching client code | Secret in the bundle | Keep non-prefixed values Node-side only |
| `define` without `JSON.stringify` | Syntax errors or wrong types | Always stringify |
| No `declare const` for `define` identifiers | `tsc` fails on a working app | Declare them |
| Rebuilding per environment instead of promoting | Tested artefact ≠ shipped artefact | Build once, promote |
| Long-cached `index.html` | Blank screens after deploy | HTML `no-cache`, assets immutable |

⚠️ **The missing `--` is worth repeating:** in npm scripts, arguments after the script name
go to *npm* unless you separate them. `npm run build --mode staging` passes `--mode` to npm,
which ignores it. `npm run build -- --mode staging` passes it to `vite`.

---

## 9. Practice

### Beginner
1. Create `.env.staging` and a `build:staging` script; build both modes and grep `dist/` for
   each API URL to prove the right one landed.
2. Log `import.meta.env.MODE` in your app and confirm it changes with `--mode`.

### Intermediate
1. Move a dev-proxy target into `BACKEND_ORIGIN` and read it with `loadEnv` in
   `vite.config.ts`. Confirm it never appears in `dist/`.
2. Add `__APP_VERSION__` / `__APP_COMMIT__` via `define`, declare them, and render a version
   badge in non-production modes.

### Challenge
1. Write the matrix CI job from section 6 and make it fail when a secret-looking string is
   present in `dist/assets/*.js`.
2. Set up artefact promotion: build once, upload `dist`, deploy that artefact to staging and
   then production. Prove the two deployments are byte-identical (compare a checksum).

---

## 10. Solutions

### Beginner
1. `"build:staging": "tsc -b && vite build --mode staging"`. Then
   `grep -o "https://staging-api[a-z.-]*" dist/assets/*.js` matches after the staging build
   and not after the production build. Note the `--` is only needed when passing the flag
   through `npm run build`; inside a script it is written directly.
2. `MODE` is the string you passed. This is also the value that selects the env file — so
   logging it is the fastest way to diagnose "wrong config" bugs.

### Intermediate
1. `loadEnv(mode, process.cwd(), '')` in the config, `server.proxy['/api'].target` from it.
   Then `grep -r "$BACKEND_ORIGIN_VALUE" dist/assets/*.js` returns nothing — the value never
   entered client code, because nothing in `src/` referenced it.
2. `define` + `declare const` + the badge. In production builds `import.meta.env.PROD` is
   the literal `true`, so the `return null` branch is statically known and the badge code is
   removed entirely by tree-shaking.

### Challenge
1. The grep guard turns a security incident into a red build. Use a pattern specific enough
   to avoid false positives (`sk-` prefixes, PEM headers) rather than the word "key".
2. `sha256sum dist/assets/index-*.js` on both deployments must match. If you rebuild per
   environment, they will *not* match — because the build embeds different env values — which
   is exactly why you build once per environment and promote that artefact rather than
   rebuilding at deploy time.

---

## 11. Summary

- **A mode is a label**, not a build type. `command` decides serve vs build (and
  minification); `mode` decides which env files load.
- **Precedence:** `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`. `.local`
  beats mode files, which is why production defaults belong in `.env`.
- **`import.meta.env` is for client code; `loadEnv` is for Node code.** Never let a
  non-prefixed value cross that line.
- **`define` is literal text replacement** for build facts (version, commit, build time) —
  always `JSON.stringify`, always `declare const`.
- **Branch config on mode sparingly**: source maps, `base`, minification. Everything else
  should be a value, not a branch.
- **One commit, many modes, built by CI with `npm ci`** — and promote the artefact rather
  than rebuilding it.
- **`npm run build -- --mode staging`.** The `--` is not optional.

---

**What's next →** [`../17-projects/01-counter.md`](../17-projects/01-counter.md) opens
Part 17, where everything you have read gets built. Six projects, each one adding exactly
the concepts you have just learned, from a counter to a deployed production application.
