# 01 — Environment Variables: `.env`, Modes and the Secrets That Cannot Be Secret

> **Part 15 · Production · File 1 of 8**

Why this file exists: every file in Parts 15 and 16 configures an app that has to run in
more than one place — your laptop, a preview deployment, and production — from the *same*
committed source code. Environment variables are the mechanism that makes that possible,
and they are also the single most common source of a real security incident in a frontend
codebase. This file explains what Vite actually does with a `.env` file, why anything
prefixed `VITE_` is public by design, how modes work, how to type your variables so a
typo becomes a compile error, and where secrets must live instead.

---

## 1. The problem environment variables solve

Without them, an app that talks to an API has one of two bad options:

```ts
// ❌ Bad option 1: hard-code it
const api = 'https://api.mycompany.com';   // breaks on localhost; can't preview against staging

// ❌ Bad option 2: fork the code per environment
// (a branch, or a sed in the deploy script, or a comment you uncomment)
```

Both fail for the same reason: **configuration is being treated as code.** It is not.
Configuration differs per environment; code must not.

The solution is one line of indirection:

```ts
// ✅ Good: read configuration from the environment
const api = import.meta.env.VITE_API_URL;
```

Now the *same commit* can be built for development, staging and production, and the
difference between the three builds is a text file, not a diff.

💡 **Mental model:** environment variables are *inputs to the build*, not variables that
exist at runtime in the browser. Vite reads them while bundling and pastes their values
directly into the output JavaScript. That single fact explains everything that follows.

---

## 2. How Vite reads env files

Create these at the **project root** (next to `package.json`), not in `src/`:

```text
.env                # loaded in every mode
.env.local          # loaded in every mode, ignored by git
.env.development    # loaded when mode = development
.env.development.local
.env.production     # loaded when mode = production
.env.production.local
```

```bash
# .env — shared defaults, safe to commit
VITE_APP_NAME=Taskboard

# .env.development — committed, because it contains no secrets
VITE_API_URL=http://localhost:8000

# .env.production — committed, because it contains no secrets
VITE_API_URL=https://api.taskboard.example.com
```

**Loading order (later files win):** `.env` → `.env.local` → `.env.[mode]` →
`.env.[mode].local`. A variable defined in `.env.production` overrides the same name in
`.env`.

```bash
npm run dev              # mode = development  → .env + .env.development
npm run build            # mode = production   → .env + .env.production
npm run build -- --mode staging   # mode = staging → .env + .env.staging
```

⚠️ **`.env.local` must be in `.gitignore`.** The Vite template already adds it. This is
where *your machine's* overrides go — a colleague's API URL, a local port change. It is
the file that stops you committing "my machine's settings" to everyone else.

🔍 **Why `.local` is git-ignored and `.env.production` is not:** the `.local` suffix means
"this machine only", so it carries per-developer overrides that would conflict constantly.
Environment *files for environments* (`.env.production`) describe an environment every
developer must reproduce, so they belong in git — and that is only safe because they
contain no secrets (section 4).

---

## 3. Reading them in code

Vite exposes variables on `import.meta.env`:

```ts
// src/config.ts
export const config = {
  appName: import.meta.env.VITE_APP_NAME,
  apiUrl: import.meta.env.VITE_API_URL,
  mode: import.meta.env.MODE,        // 'development' | 'production' | 'staging' | …
  isDev: import.meta.env.DEV,        // boolean
  isProd: import.meta.env.PROD,      // boolean
  basePath: import.meta.env.BASE_URL // the `base` from vite.config.ts, default '/'
} as const;
```

**Line by line**

- `import.meta.env` — Vite replaces this object at build time. It is not a Node
  `process.env`; there is no `process` in a browser.
- `VITE_APP_NAME` — only variables whose name **starts with `VITE_`** are exposed. The
  prefix is a safety gate, not a convention you can drop.
- `MODE` / `DEV` / `PROD` / `BASE_URL` — always available, no prefix needed, because Vite
  defines them itself.

⚠️ **The prefix rule is the whole security model.** A variable named `API_PASSWORD` in
`.env` is loaded into the build process but is *not* inlined into the client bundle, so
the browser never sees it. Rename it `VITE_API_PASSWORD` and it is in your shipped
JavaScript for the whole world to read. This is the mistake to build an instinct against.

```bash
# Prove it to yourself — search the built bundle
npm run build
grep -o "https://api.taskboard.example.com" dist/assets/*.js   # ✅ found: VITE_API_URL was inlined
grep -o "s3cr3t" dist/assets/*.js                              # no output: unprefixed var never shipped
```

---

## 4. Why frontend variables are NOT secret

This deserves its own section because it is the most misunderstood idea in frontend work.

**Everything your browser downloads is public.** Your JavaScript bundle, your source maps
if you ship them, your network traffic, your HTML. There is no "private" storage in a web
page. Therefore:

> **Any value that ends up in the client bundle is public information, whether or not it
> is prefixed `VITE_`.**

| Value | Safe in `VITE_*`? | Why |
| --- | --- | --- |
| Public API base URL | ✅ yes | It is in every network request anyway — open DevTools |
| App name, feature flag, Sentry DSN | ✅ yes | Designed to be public (DSN identifies, does not authorise) |
| Publishable/anon API keys (Stripe publishable, Firebase web key) | ⚠️ with care | Public *by design*, but must be restricted server-side |
| Database password, JWT signing secret | ❌ never | Full compromise |
| Secret API keys (OpenAI, Stripe secret, AWS keys) | ❌ never | Full compromise |
| Third-party tokens for paid services | ❌ never | Someone will mine your bundle and run up your bill |

🏭 **The pattern for anything that must be secret: proxy it.** Your backend holds the
secret, your frontend calls your backend.

```text
Browser ──POST /api/summarise──▶ Your API (holds OPENAI_API_KEY) ──▶ OpenAI
```

The browser sends the *request*, not the key. The key never leaves the server.

⚠️ **A real, common incident:** a `VITE_OPENAI_KEY` committed in `.env.production`. Anyone
can `curl` your site, download the JS, and read the key. Bots scan deployed bundles for
exactly this pattern within hours. If it ever happens: **revoke and rotate immediately** —
deleting the commit does nothing, because it is already public and already in git history.

---

## 5. Typing your environment (so tyops become compile errors)

Without types, `import.meta.env.VITE_API_URl` (lowercase L) is `any` and fails silently at
runtime as `undefined`. Vite ships a `vite/client` type declaration; you can extend it:

```ts
// src/vite-env.d.ts  (created by the Vite template — extend it, don't replace it)
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL of the API. No trailing slash. */
  readonly VITE_API_URL: string;
  /** Display name shown in the header. */
  readonly VITE_APP_NAME: string;
  /** Optional: sampling rate 0–1 for error reporting. Absent = disabled. */
  readonly VITE_ERROR_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Now `import.meta.env.VITE_API_URl` is a **compile error**: `Property 'VITE_API_URl' does
not exist on type 'ImportMetaEnv'`. That is the cheapest possible protection against a
production config bug.

⚠️ **Every env value is a `string`** (or `undefined`). There are no booleans or numbers.

```ts
// ❌ silently wrong — the string "false" is truthy
if (import.meta.env.VITE_ENABLE_LOGS) { /* runs even when set to "false" */ }

// ✅ parse it once, in config
export const config = {
  enableLogs: import.meta.env.VITE_ENABLE_LOGS === 'true',
  errorSampleRate: Number(import.meta.env.VITE_ERROR_SAMPLE_RATE ?? 1),
} as const;
```

**Fail fast on missing config.** A missing API URL should stop the app at startup, not
produce `fetch("undefined/users")` three screens later:

```ts
// src/config.ts
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const apiUrl = required('VITE_API_URL', import.meta.env.VITE_API_URL);
```

---

## 6. Environment variables in `vite.config.ts`

The config file runs in **Node**, not the browser, so it does not have `import.meta.env`
populated the same way. Use `loadEnv`:

```ts
// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // third arg '' loads ALL variables, including ones without the VITE_ prefix,
  // for use in Node-side config only — never expose those to the client
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(env.PORT ?? 5173),
      proxy: { '/api': env.BACKEND_ORIGIN ?? 'http://localhost:8000' },
    },
  };
});
```

This is how a *secret* (like `BACKEND_ORIGIN` in CI) can influence the build without ever
being inlined into client code — it is used to configure the dev proxy, which only exists
on your machine.

---

## 7. One codebase, three environments — the full setup

```text
taskboard/
├── .env                       # VITE_APP_NAME=Taskboard
├── .env.development           # VITE_API_URL=http://localhost:8000
├── .env.staging               # VITE_API_URL=https://staging-api.taskboard.example.com
├── .env.production            # VITE_API_URL=https://api.taskboard.example.com
├── .env.local                 # (git-ignored) my machine's overrides
└── src/config.ts              # the only file that reads import.meta.env
```

```json
// package.json — scripts section
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:staging": "tsc -b && vite build --mode staging",
    "preview": "vite preview"
  }
}
```

🏭 **Rule worth adopting:** *only `src/config.ts` reads `import.meta.env`.* Everything
else imports `config`. Benefits: one place to document, one place to validate, one place
to mock in tests, and `grep -r "import.meta.env" src` returns exactly one file.

```ts
// ❌ sprinkled across 14 files, unvalidatable, unmockable
const res = await fetch(`${import.meta.env.VITE_API_URL}/users`);

// ✅ everywhere else in the app
import { config } from './config';
const res = await fetch(`${config.apiUrl}/users`);
```

**In tests**, override with `vi.stubEnv` (Part 13) instead of creating `.env.test`:

```ts
it('points at the test API', () => {
  vi.stubEnv('VITE_API_URL', 'http://test-api');
  expect(import.meta.env.VITE_API_URL).toBe('http://test-api');
  vi.unstubAllEnvs();
});
```

---

## 8. Common mistakes

| Mistake | What you will see | Fix |
| --- | --- | --- |
| `process.env.VITE_API_URL` in client code | `process is not defined` at runtime | use `import.meta.env` |
| No `VITE_` prefix, variable is `undefined` | `fetch("undefined/users")`, CORS error | rename it `VITE_API_URL` |
| Typo in the name | `undefined`, no error | type `ImportMetaEnv` (section 5) |
| Secret committed with `VITE_` prefix | Key visible in `dist/assets/*.js` | revoke, rotate, move behind a proxy |
| Editing `.env` while `npm run dev` runs | Old value still used | env files are read at startup — restart the dev server |
| `.env.local` committed | Everyone gets your overrides | check `.gitignore` |
| Trailing slash mismatch | `https://api.com//users` | normalise in `config.ts` |

---

## 9. Practice

### Beginner
1. Create `.env.development` and `.env.production` with different `VITE_API_URL` values,
   build both, and prove by grepping `dist/` that the right URL landed in each.
2. Add `src/config.ts` that reads and validates `VITE_API_URL`, then import it somewhere.

### Intermediate
1. Type `ImportMetaEnv` and introduce a deliberate typo — capture the exact error.
2. Add an optional numeric variable, parse it safely, and write a test using `vi.stubEnv`.

### Challenge
1. Add a `staging` mode end to end: `.env.staging`, a `build:staging` script, and a
   visible badge in the UI that renders only when `import.meta.env.MODE !== 'production'`.
2. Audit your app for secrets: build it, then search the bundle for every credential you
   know about. Write down which ones appear and what you would change.

---

## 10. Solutions

### Beginner
1. `npm run build` (production) then `grep -o "https://api.taskboard.example.com" dist/assets/*.js` prints a match; `npm run build -- --mode development` and the same grep prints nothing while the localhost URL does. That difference *is* the mode system.
2. As in section 5: a `required()` helper that throws at startup means a missing URL fails on first load with a clear message instead of as a mysterious network error later.

### Intermediate
1. `Property 'VITE_API_URl' does not exist on type 'ImportMetaEnv'. Did you mean 'VITE_API_URL'?` — TypeScript even suggests the right name.
2. `const rate = Number(import.meta.env.VITE_ERROR_SAMPLE_RATE ?? 1);` then `expect(Number.isFinite(rate)).toBe(true)` and a clamp `Math.min(Math.max(rate, 0), 1)`. Without the clamp, `VITE_ERROR_SAMPLE_RATE=abc` becomes `NaN` and silently disables sampling.

### Challenge
1. `.env.staging` + `"build:staging": "tsc -b && vite build --mode staging"`. The badge: `{import.meta.env.MODE !== 'production' && <span className="badge">staging</span>}` — it disappears from production builds automatically, because Vite replaces `MODE` with a literal and the branch becomes dead code that is tree-shaken out.
2. Typical findings: a Stripe *publishable* key (fine), a Sentry DSN (fine), and — if you have one — a third-party token that should have been proxied. The exercise's value is the habit: **a bundle is a public document.**

---

## 11. Summary

- **Environment variables separate configuration from code**, so one commit can serve
  development, staging and production.
- **Vite inlines env values at build time.** They are build inputs, not runtime secrets.
- **Only `VITE_`-prefixed variables reach the browser**, and everything that reaches the
  browser is public. Prefixing is a gate, not a style choice.
- **Secrets never go in the client.** They live on a server; the browser calls the server.
- **Env files are ordered** (`.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`),
  `.local` is git-ignored, and modes are chosen with `--mode`.
- **Type `ImportMetaEnv`** and parse strings explicitly — every value is a string, and
  `"false"` is truthy.
- **Read env in exactly one file** (`src/config.ts`) and fail fast when something is missing.

---

**What's next →** [`02-project-architecture.md`](./02-project-architecture.md) moves from
*what values an app needs* to *where its code should live*: layer-based vs feature-based
architecture, why the choice matters as a team grows, and how to structure an app so that
deleting a feature means deleting a folder.
