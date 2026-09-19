# 01 — Environment Variables: Configuration Without Secrets in the Bundle

> **Part 15 · Production · File 1 of 8**

Why this file exists: an app that works on your machine and fails in production is usually a configuration problem, and configuration in a frontend build has one rule that overrides every other consideration: **anything you put in the bundle is public.** There is no "server-side environment variable" in a static SPA — the bundle is downloaded by every visitor, and a secret placed in it is a secret you have published. This file covers Vite's environment system precisely (`import.meta.env`, `VITE_` prefixes, `.env` files per mode), measured on this lab's build: the development build contained the dev API URL and the production build contained the production one, while a non-prefixed `DB_PASSWORD` appeared in **neither** bundle. Then it covers how to structure configuration so that dev, staging and production are the same code with different values, and where secrets actually belong.

Measured from this lab's builds (`npx vite build --mode development` and `npx vite build`).

---

## 1. The one rule, before the mechanics

```text
VITE_* variables  ──inlined into the bundle at build time──►  PUBLIC (any visitor can read them)
non-VITE variables ──not exposed to client code────────────►  still not a safe place for secrets
secrets (API keys with privileges, DB passwords, signing keys) ──belong on a SERVER, never in the bundle
```

A client-side bundle is a text file served to anyone. `grep` finds your secrets in seconds — and so do scanners on the internet.

⚠️ **"But it is just an API key"** is the sentence that precedes most incidents. The question to ask: *if a stranger has this string, what can they do?* A public read-only analytics key that is domain-restricted: acceptable. A key that can send email, move money, or read other users' data: never. If the key must be used from the browser, it must be **restricted** (origin/domain allowlist, scoped permissions) and treated as public.

---

## 2. Vite's environment system, measured

```text
# .env (loaded in every mode)
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME=React Lab (dev)
DB_PASSWORD=super-secret-do-not-ship

# .env.production (loaded only in production mode; overrides .env)
VITE_API_URL=https://api.react-lab.example/api
VITE_APP_NAME=React Lab
```

```ts
// src/lib/env.ts — one place where the app reads its configuration
export function readEnv() {
  return {
    apiUrl: import.meta.env.VITE_API_URL ?? '/api',
    appName: import.meta.env.VITE_APP_NAME ?? 'React Lab',
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD,
    mode: import.meta.env.MODE,
  };
}
```

```bash
npx vite build --mode development     # loads .env (and .env.development if present)
npx vite build                        # mode=production: loads .env.production, then .env
```

The measured result of grepping the two bundles:

```text
=== development build (mode=development, loads .env) ===
dev API URL inlined:        found
prod API URL inlined:       NOT found
secret leaked into bundle:  NOT found
import.meta.env remains:    NOT found

=== production build (mode=production, loads .env.production and .env) ===
dev API URL inlined:        NOT found
prod API URL inlined:       found
secret leaked into bundle:  NOT found
import.meta.env remains:    NOT found
```

```text
dev bundle contains "React Lab (dev)":         true
prod bundle contains "React Lab (dev)":        false
prod bundle contains "api.react-lab.example":  true
dev bundle contains "api.react-lab.example":   false
```

Five facts to take from that:

1. **Values are inlined at build time** — `import.meta.env.VITE_API_URL` is literally replaced by the string, and `import.meta.env remains: NOT found` proves nothing is left to resolve at runtime.
2. **Mode selects the file, and files stack**: `.env` is always loaded, `.env.[mode]` overrides it, and `.env.[mode].local` overrides that (for machine-specific overrides that must not be committed).
3. **Only `VITE_`-prefixed variables reach client code**: `DB_PASSWORD` appeared in neither bundle, no matter which file defined it.
4. **The build is environment-specific**: the development build is not "the same app with different settings" — it is a different file. You cannot ship one bundle and reconfigure it in place.
5. **The defaults matter more than the values.** `?? '/api'` means a missing variable degrades to a relative path rather than `undefined` appearing inside a `fetch` URL.

⚠️ **Non-prefixed variables are not secret just because the client cannot see them.** Vite reads `.env` files for its own configuration (`vite.config.ts` can use them via `loadEnv`), and those files usually live in the repo. Keep real secrets in your deployment platform's secret store or a server-side `.env` file that is never bundled.

---

## 3. Modes, files and precedence

| File | Loaded when | Committed? | Use for |
| --- | --- | --- | --- |
| `.env` | always | ✅ yes | defaults shared by everyone (`VITE_APP_NAME`) |
| `.env.local` | always (except in test) | ❌ gitignored | your machine's overrides |
| `.env.development` | `vite dev` / `--mode development` | ✅ usually | dev API URL, feature flags on |
| `.env.production` | `vite build` | ✅ usually | production API URL, flags off |
| `.env.staging` | `--mode staging` | ✅ possible | a third environment with its own values |
| `.env.[mode].local` | matching mode | ❌ gitignored | per-machine values for that mode |

```bash
# .gitignore — the files that must never be committed
.env.local
.env.*.local
```

```json
// package.json — explicit scripts per environment
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:staging": "tsc -b && vite build --mode staging",
    "preview": "vite preview"
  }
}
```

⚠️ **Precedence is a common source of "it works on my machine"**: the order is `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env` (measured in Part 16, file 04: a staging build used `.env.staging` while `.env.local` was ignored). The remaining risk is a variable that exists **only** in a developer's `.env.local`: that value will be built in, pointing the artifact at their machine. The fix is not discipline — it is CI: the pipeline builds on a clean checkout where `.env.local` does not exist.

---

## 4. Typing and validating the environment

`import.meta.env` is typed loosely (`string | undefined` for custom keys). Two improvements pay for themselves immediately:

```ts
// src/vite-env.d.ts — declare the shape of your environment (types only, no runtime cost)
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_ENABLE_NEW_CHECKOUT?: string;      // optional flags are optional here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

```ts
// src/lib/env.ts — validate at the boundary, once, when the app boots
import { z } from 'zod';

const EnvSchema = z.object({
  VITE_API_URL: z.string().url().or(z.string().startsWith('/')),
  VITE_APP_NAME: z.string().min(1),
  VITE_ENABLE_NEW_CHECKOUT: z.enum(['true', 'false']).default('false'),
});

const parsed = EnvSchema.safeParse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
  VITE_ENABLE_NEW_CHECKOUT: import.meta.env.VITE_ENABLE_NEW_CHECKOUT,
});

if (!parsed.success) {
  // Fail loudly at startup, not mysteriously mid-session
  throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL,
  appName: parsed.data.VITE_APP_NAME,
  newCheckout: parsed.data.VITE_ENABLE_NEW_CHECKOUT === 'true',
} as const;
```

Three properties this buys:

1. **A typo fails at boot**, with a message naming the variable — instead of `fetch('undefined/products')`.
2. **One place to import**: components import `env`, never `import.meta.env` (which also makes them testable — the module can be mocked once).
3. **Booleans and numbers are converted once** (`'false'` is a truthy string — the classic flag bug).

⚠️ Every environment variable is a **string**. `import.meta.env.VITE_PORT === '5173'`, and `if (import.meta.env.VITE_ENABLE_X)` is `true` for the string `'false'`. Convert explicitly (section 4's schema does) — this single bug has been shipped by nearly every team at least once.

---

## 5. Configuration vs secrets: who owns what

| Thing | Where it lives | Why |
| --- | --- | --- |
| API base URL, app name, feature flags | `VITE_*` in `.env.[mode]` | public by nature; different per environment |
| Analytics write key (origin-restricted) | `VITE_*` | safe **only** if restricted to your domains and scoped |
| Auth client id, OAuth redirect URL | `VITE_*` | public identifiers by design |
| Server API keys, DB credentials, signing secrets | the server's secret store | the client must never hold privileges |
| Anything you would not paste in a public Slack channel | the server | the same audience can read your bundle |

```text
  browser bundle  ──────────────►  your server (holds the secrets)
   public config                        │
                                        ├── talks to the third-party API with the real key
                                        └── enforces rate limits, quotas, permissions
```

💡 **The standard fix for "we need the key in the browser"** is a small server-side proxy: the browser calls *your* endpoint, your server attaches the privileged key, and the browser never holds it. It also gives you a place to rate-limit and log, which is what stops a leaked client key from becoming an invoice.

---

## 6. Runtime configuration (when one build must serve many environments)

Because values are baked at build time, a single artifact cannot be reconfigured. If you need that (the same image deployed to staging and production, per-tenant configuration), the pattern is a **runtime config file** read before the app boots:

```html
<!-- index.html — before the module script -->
<script src="/config.js"></script>
```

```js
// public/config.js — written by the deployment, not by the build
window.__CONFIG__ = { apiUrl: 'https://api.example.com/api', appName: 'React Lab' };
```

```ts
// src/lib/env.ts — prefer the runtime value, fall back to the build-time one
declare global {
  interface Window { __CONFIG__?: { apiUrl?: string; appName?: string } }
}

export const env = {
  apiUrl: window.__CONFIG__?.apiUrl ?? import.meta.env.VITE_API_URL ?? '/api',
  appName: window.__CONFIG__?.appName ?? import.meta.env.VITE_APP_NAME ?? 'React Lab',
};
```

| Approach | Pros | Cons |
| --- | --- | --- |
| Build-time (`VITE_*`) | simple, tree-shakeable, typed | one build per environment; a rebuild to change a value |
| Runtime (`window.__CONFIG__`) | one artifact, per-environment values, changeable without rebuilding | an extra request, no tree-shaking, values can be tampered with (never put secrets there) |
| Both | build-time defaults + runtime overrides | two paths to document |

⚠️ A runtime config file is **public and modifiable** (anyone can edit the response in transit). It is for non-secret configuration only, and the app should still treat every value as untrusted input.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Putting a secret in a `VITE_` variable | it ships to every visitor | keep it on the server (or proxy through it) |
| 2 | Assuming a non-prefixed variable is safe in `.env` | the file is often committed; Vite reads it too | use a deployment secret store |
| 3 | Reading `import.meta.env` all over the app | no validation, no single source, impossible to mock | one `env.ts` module |
| 4 | Using a raw string as a boolean | `'false'` is truthy | parse with a schema or compare to `'true'` |
| 5 | Forgetting `.env.local` in CI | a developer's overrides leak into a "production" build | build on a clean checkout |
| 6 | Committing `.env.production` with real endpoints | some teams mind; it also leaks internal hostnames | commit only non-sensitive defaults |
| 7 | Expecting one bundle to be reconfigurable | the values are inlined | runtime config (section 6) or one build per environment |
| 8 | No validation of required variables | mysterious runtime failures | fail at boot with a clear message |
| 9 | Naming variables differently per environment | typos produce `undefined` URLs | one schema, same names everywhere |
| 10 | Logging the whole `import.meta.env` | if a secret ever sneaks in, it is now in your logs | log only the specific, non-secret values |
| 11 | Using env vars for feature flags *and* permissions | two concepts tangled | flags are config; permissions come from the session (Part 14) |
| 12 | Secrets in `window.__CONFIG__` | public and tamperable | never |

---

## 8. Best practices

1. **Assume the bundle is public**, and design accordingly — that is the whole discipline.
2. **Prefix public values with `VITE_`**, and never put anything privileged behind that prefix.
3. **One `env.ts` module**: validate with Zod, convert types, export a frozen object, and let the rest of the app import only that.
4. **Declare the shape in `vite-env.d.ts`** so TypeScript catches a missing or misspelled variable.
5. **Fail at startup** on invalid configuration, with a message that names the variable.
6. **Provide sane defaults** (`?? '/api'`) so a missing optional value degrades gracefully.
7. **Commit `.env` defaults and `.env.[mode]` for non-secrets; gitignore `.env.local`.**
8. **Keep secrets on the server**, and proxy third-party APIs that need privileged keys.
9. **Build in CI on a clean checkout**, so no local overrides can influence a release artifact.
10. **Document every variable** in the README (name, purpose, example, whether it is required) — the next person's five minutes saved, every time.

---

## 9. Practice

### Beginner

1. Add `VITE_API_URL` and `VITE_APP_NAME` to `.env`, read them through one module, and render both on screen. Rebuild in production mode and confirm the production values are in the bundle.
2. Add a non-prefixed variable and prove (by grepping the built bundle) that it never reaches the client.
3. Convert `VITE_ENABLE_X` (a string) into a boolean correctly and demonstrate the bug if you forget.

### Intermediate

1. Validate the environment with Zod and make the app fail at boot with a clear message when a required variable is missing.
2. Add a `.env.staging` and a `build:staging` script, then verify which values end up in that bundle.
3. Type `ImportMetaEnv` so that a misspelled `import.meta.env.VITE_API_URLL` is a compile error.

### Challenge

1. Implement the runtime-config pattern (section 6) so one built artifact can be deployed to two environments with different API URLs. Write down what each approach costs (builds, requests, tree-shaking, tamper-resistance).
2. Replace a privileged third-party key in the client with a server-side proxy: define the endpoint, the server-side key handling, the rate limiting, and what the client sends. Prove with a bundle grep that the key is gone.
3. Write the configuration section of a deployment runbook: every variable, where its value comes from per environment, who can change it, how a change is applied, and how you would roll one back.

---

## 10. Solutions

### Beginner

1. Module as in section 2; the measured build shows the dev URL only in the development bundle and the production URL only in the production bundle, with `import.meta.env` fully replaced (no runtime lookups).
2. `DB_PASSWORD=super-secret-do-not-ship` in `.env`; `grep -r "super-secret" dist/` finds nothing in either build (measured above). Note the caveat: that only means it is not in the *bundle* — the file is still in the repo, so it is not a secret at all.
3. `const enabled = import.meta.env.VITE_ENABLE_X === 'true';` — the bug is `if (import.meta.env.VITE_ENABLE_X)` evaluating `true` when the value is the string `'false'`, which is a classic "the flag will not turn off" incident.

### Intermediate

1. The Zod schema in section 4, throwing at module load with `parsed.error.toString()` — the message names each invalid variable and why, which is exactly what a broken deployment needs.
2. `.env.staging` with a staging API URL; `npx vite build --mode staging` loads `.env`, then `.env.staging`; grepping the bundle shows the staging URL and neither of the others — the same pattern as the measured dev/prod comparison.
3. The `ImportMetaEnv` interface in `vite-env.d.ts` gives you completion and errors; keep the `/// <reference types="vite/client" />` line, or `DEV`/`PROD`/`MODE` disappear from the types.

### Challenge

1. Implementation as in section 6 with `/config.js` in `public/`; cost summary: build-time values cost one build per environment but tree-shake and cannot be tampered with; runtime values cost one request and no tree-shaking, can be edited in transit (so never for secrets), and are the only option when a single artifact must serve multiple environments.
2. Proxy design: the client calls `POST /api/email/send` with the message; the server holds `EMAIL_PROVIDER_KEY`, validates the request, rate-limits per user, and calls the provider. Verification: `grep -r "<the key>" dist/` returns nothing, and the key exists only in the server's secret store. Bonus: you now have a place to log and to enforce quotas.
3. Runbook content per variable: name, purpose, whether required, example value, and per environment (dev/staging/prod) the source (committed `.env`, CI variable, platform secret), the owner, and the change procedure (redeploy for build-time values; edit the config file for runtime ones). Include the rollback: revert the value and redeploy (build-time) or revert the file (runtime) — and note that a cache-busting hash means the old artifact can be restored instantly.

---

## 11. Summary

- **The bundle is public.** `VITE_`-prefixed variables are inlined into the client build; anything privileged belongs on a server (or behind a proxy).
- **Measured**: the development build contained the dev API URL and the production build the production URL; a non-prefixed `DB_PASSWORD` appeared in **neither**; `import.meta.env` was replaced entirely, so nothing is resolved at runtime.
- **Mode selects files and they stack**: `.env` always, `.env.[mode]` on top, `.env.[mode].local` on top of that — which is why CI must build on a clean checkout (a developer's `.env.local` otherwise leaks into a release).
- **Every variable is a string**: `'false'` is truthy. Validate and convert once, in one module.
- **One `env.ts` module** validates with Zod, converts types, fails at boot with a named error, and gives the rest of the app a single, mockable import — plus `vite-env.d.ts` for compile-time safety.
- **Runtime configuration** (`window.__CONFIG__`) is the tool for "one artifact, many environments", with the caveats that it costs a request, prevents tree-shaking, and can be tampered with (so never secrets).
- **Document every variable**, and grep your own bundle after each release: `grep -r "secret" dist/` is a five-second habit worth having.

---

**What's next →** [`02-project-architecture.md`](./02-project-architecture.md) moves from values to structure: layer-based versus feature-based architecture, where the boundaries actually go in a React app, how to keep imports acyclic and dependencies pointing one way, and how a codebase stays navigable at 200 components.
