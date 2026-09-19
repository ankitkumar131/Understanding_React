# 03 — Setting Up: Vite + React + TypeScript

> **Part 3 · React Fundamentals · File 3 of 12**
> Why this file exists: most beginners' first hour with React is spent fighting a setup they copied from a video. This file creates the project properly, explains **every file that appears**, and verifies the toolchain so that later confusion is about React — never about the scaffolding.

---

## 1. Choose the tool first, then install

There are three ways to start a React project today, and the correct one depends on what you are building.

| Option | What you get | Choose it when | Do not choose it when |
| --- | --- | --- | --- |
| **Vite** (`npm create vite`) | A client-side app: dev server with instant HMR, TypeScript, production build. No routing/SSR opinions | You are learning, prototyping, or building a dashboard/tool/app that runs in the browser | You need server rendering, SEO-critical pages, or file-based routing conventions |
| **A framework** (Next.js, React Router v7 as framework, TanStack Start, Expo for native) | Vite-equivalent tooling **plus** routing, data loading, SSR/RSC, deployment conventions | Your product needs SSR/SSG, server data, or you want the ecosystem's opinionated defaults | You are 3 hours into React and cannot yet read a component |
| **`create-react-app` (CRA)** | Nothing you should use: CRA is **deprecated and unmaintained**; its own README points elsewhere | Never, for new projects | — |

We use **Vite** in this part because it removes every non-React distraction and because it is what the React docs themselves recommend when you want "a client-side app". You will meet frameworks in Part 18 — after you can reason about components, state and effects, which is exactly the knowledge a framework *assumes*.

> ✅ **Official guidance, paraphrased:** "If you want to build an app, use a framework; if you want to learn React (or build a client-only app), use Vite." We are doing the second now and the first in Part 18.

---

## 2. Prerequisites

### 2.1 Node.js

React itself does not need Node, but every build tool does. Vite 8, `@vitejs/plugin-react` and oxlint all declare the same engine range:

```json
{ "engines": { "node": "^20.19.0 || >=22.12.0" } }
```

Check what you have:

```bash
node -v
npm -v
```

**Expected result** (the machine these notes were written on):

```text
v22.22.3
10.9.8
```

If your Node is older than `20.19` (or you are on 21.x, which is out of support), upgrade. With `nvm`:

```bash
nvm install 22
nvm use 22
```

With `fnm`, `asdf` or a system package manager, the same idea applies: get an **even-numbered LTS release**. Node 20 and 22 are fine; 24 (when LTS) is fine. Odd-numbered versions (21, 23) work but are not maintained for long.

> ⚠️ **Node 22.12+ vs 22.x:** the engine range is `^20.19.0 || >=22.12.0`. A Node 22.5 install is *too old* for Vite 8 despite being "Node 22". When in doubt, run `node -v` and compare numbers, not vibes.

### 2.2 A package manager

The template works with npm, pnpm, yarn and bun. This notes set uses **npm**, because it ships with Node and every error message you will find online assumes it. If you use pnpm or yarn, replace `npm install` with your equivalent and remember one rule:

> **Commit exactly one lockfile** (`package-lock.json` *or* `pnpm-lock.yaml` *or* `yarn.lock`). Two lockfiles in one repository is how teams end up with "works on my machine" dependency bugs.

### 2.3 An editor

VS Code (or any editor with TypeScript support). Install nothing at first: TypeScript and React/TSX support are built in. When your editor shows a type error that `npm run build` does not, it is almost always using a different TypeScript version — fix it with **Command Palette → "TypeScript: Select TypeScript Version…" → "Use Workspace Version"**.

---

## 3. Step 1 — create the project

Pick a parent folder *outside* any existing repository, then run:

```bash
npm create vite@latest megashop -- --template react-ts
```

**Expected result** (real output):

```text
◇  Scaffolding project in /tmp/megashop...
│
└  Done. Now run:

  cd megashop
  npm install
  npm run dev
```

Three notes on that command line, because it looks stranger than it is:

- `npm create vite@latest` downloads and runs the `create-vite` scaffolder. npm prints a confirmation prompt the first time; press `y`.
- The `--` separates npm's own flags from the flags passed *to the scaffolder*. Without it, npm tries to interpret `--template` itself and the template is ignored (a very common self-inflicted wound: you get a JavaScript project instead of a TypeScript one).
- `react-ts` is the React + TypeScript template. The bare `react` template gives you JavaScript.

### 3.1 What just happened

Nothing was installed. The scaffolder only **copied a folder of text files**:

```text
megashop/
├── .gitignore
├── .oxlintrc.json
├── README.md
├── index.html
├── package.json
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── App.css
│   ├── App.tsx
│   ├── assets/
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── index.css
│   └── main.tsx
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

Every file in that tree is explained in section 6. Nothing in it is magic, and by the end of Part 4 you will have edited most of it.

---

## 4. Step 2 — install dependencies

```bash
cd megashop
npm install
```

**Expected result** (tail of real output):

```text
added 63 packages, and audited 64 packages in 4s

9 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

What to notice:

- **`node_modules/` is ~87 MB** on disk and contains thousands of files, but you never read or edit it. It is disposable: delete it, run `npm install`, and it comes back. It is `.gitignore`d.
- **`package-lock.json` was created.** Commit it. It records the exact resolved version of every package so that your teammate and your CI get the identical tree. Ignoring the lockfile means "it worked yesterday" becomes unfalsifiable.
- **`found 0 vulnerabilities`** — this line is informational, not reassurance: it only means "npm's advisory database has nothing for these versions today". Supply-chain safety is a Part 16 topic.

---

## 5. Step 3 — run the dev server

```bash
npm run dev
```

**Expected result** (real output; your port and timing will differ):

```text
> megashop@0.0.0 dev
> vite

  VITE v8.3.0  ready in 178 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://169.254.0.21:5173/  eth0
```

Open <http://localhost:5173/>. You should see the Vite + React starter page: a hero image, the headline "Get started", a note about editing `src/App.tsx`, and a button reading **"Count is 0"**.

Two things about that banner are worth understanding:

- **`ready in 178 ms`** — the dev server does not bundle your app in advance. It transforms files on demand as the browser requests them. That is why starting is instant even in a large project.
- **`Network:`** — a URL other devices on your LAN can use. It is printed because the server runs with `--host` semantics on this machine; a plain local run prints only `Local:`. This is also the line that matters when you develop inside a container, VM or remote sandbox (section 9).

### 5.1 The first thing you should try: HMR

With the server running, open `src/App.tsx` and change the text `Get started` to `Hello React`. Save.

**Expected result** — the browser updates **without a page reload**, and the terminal prints something like (real log lines from our lab session):

```text
9:51:34 AM [vite] (client) hmr update /src/components/StockBadge.tsx
9:51:44 AM [vite] (client) hmr update /src/App.tsx, /src/components/CategoryFilter.tsx, /src/components/ProductCard.tsx
```

This is **Hot Module Replacement** (HMR), and in React projects it is more specifically **Fast Refresh**: Vite asks `@vitejs/plugin-react` to swap the changed module, and React re-renders components while **preserving their state**. That distinction matters while you are learning: edit a component's markup and the counter value on screen stays where it was, so you can iterate on UI without re-creating the state you were testing.

> 🔍 **HMR is a development-only feature.** It does not exist in the production build. And it can silently break if a file mixes components with non-component exports — oxlint warns about exactly that (see file 04, section 8).

### 5.2 Stop the server

`Ctrl+C` in the terminal. Nothing is left running.

---

## 6. Every file in the project, explained

### 6.1 `index.html` — the only HTML file

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>megashop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- It sits at the **project root**, not in `src/`, because it is the entry document the browser loads.
- `<div id="root"></div>` is the **mount point**: React will own everything inside this element.
- `<script type="module" src="/src/main.tsx">` loads your app. In dev, Vite serves that file as native ES modules; in the build, it becomes a hashed bundle referenced from a rewritten `index.html`.
- `href="/favicon.svg"` resolves against `public/` (section 6.4).
- You will edit this file rarely: to change the `<title>`, add meta tags for SEO/social sharing, or inject a font/analytics script.

### 6.2 `src/main.tsx` — the entry point

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Line by line:

- `StrictMode` — dev-only wrapper that double-invokes renders/effects to expose impure code. Renders nothing.
- `createRoot(document.getElementById('root')!)` — takes ownership of the `#root` element. The `!` says "this element exists"; that is idiomatic in this one place (the template ships it, so you are not being clever by copying it).
- `.render(<StrictMode><App /></StrictMode>)` — the first render of your component tree.
- Note the import order and the missing `React` import: with `"jsx": "react-jsx"` (see `tsconfig.app.json`), JSX compiles to `react/jsx-runtime` calls and no `React` variable is needed.

You will touch this file twice in the whole of these notes: once for `StrictMode`, and once in Part 6 when we wrap `<App />` in a router, and once in Part 5 for a provider. That is the point — it is a bootstrap file, not a place for logic.

### 6.3 `src/App.tsx` — the template's demo screen

The shipped `App.tsx` (~130 lines) is a showcase: a hero image collage, a counter button, "Documentation" and "Connect with us" sections, and `<svg><use href="/icons.svg#github-icon" /></svg>` references into `public/icons.svg`.

Read it once to see the shape of a component, then **delete its contents** — file 04 replaces it with our MegaShop page. Keeping the template's demo code around while learning is how beginners end up with two competing structures in one project.

### 6.4 `public/` — files served as-is

Anything in `public/` is copied to the output root and served at the same path. `public/favicon.svg` → `/favicon.svg`; `public/icons.svg` → `/icons.svg` (which is why the template's `<use href="/icons.svg#github-icon">` works with an **absolute, root-relative** URL).

Use `public/` for files that must keep their exact name and path and are not referenced by the bundler: favicons, `robots.txt`, `manifest.webmanifest`, `og-image.png`, third-party verification files (e.g. `google-site-verification.html`). Do **not** put your app's images there if you want them optimised and content-hashed — those belong in `src/assets/`.

### 6.5 `src/assets/` — files the bundler manages

```tsx
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'

<img src={heroImg} className="base" width="170" height="179" alt="" />
```

- Importing an image gives you a **URL string** for the built asset. The build copies the file into `dist/assets/` with a content hash in the name (`hero-CLDdwZDr.png`), which makes long-term caching safe: change the file and the URL changes.
- Small assets below the inline limit may be inlined as data URIs instead.
- `import './index.css'` in `main.tsx` is the same mechanism applied to CSS: a **side-effect import**. The module exports nothing; importing it registers the stylesheet with the bundler.

### 6.6 `src/index.css` and `src/App.css` — styling

The template ships two stylesheets. `index.css` is imported once in `main.tsx` and holds global rules; `App.css` is imported by `App.tsx` and styles that component.

Note something modern in `App.css`: it uses **native CSS nesting** (`&:hover { … }` inside `.counter { … }`), which browsers now support directly — no preprocessor needed. In file 04 we delete both template stylesheets and write one small stylesheet for MegaShop; CSS strategy has its own part (Part 12).

### 6.7 `vite.config.ts` — the only config file the bundler needs

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
```

- `defineConfig` exists purely for editor autocompletion of the config object.
- `react()` is the plugin that adds three things: the JSX transform, Fast Refresh, and React-aware optimisations. Without it, a `.tsx` file would still be valid TypeScript but would have no JSX runtime wiring in dev.

This file is where Part 16's concerns live: path aliases, proxy rules, build target, chunking. For now it stays three lines.

### 6.8 `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — three files for one job

```jsonc
// tsconfig.json — a "solution" file: it contains no options, only references
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

Two separate configurations exist because two *different environments* compile TypeScript here:

| File | Compiles | Key settings |
| --- | --- | --- |
| `tsconfig.app.json` | your application code in `src/` | `"jsx": "react-jsx"`, `"lib": ["ES2023", "DOM"]`, `moduleResolution: "bundler"`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`, `noEmit` |
| `tsconfig.node.json` | `vite.config.ts` (Node context) | `module: "nodenext"`, `"types": ["node"]` — no DOM lib, because config code runs in Node, not the browser |
| `tsconfig.json` | nothing; it points at the other two | makes `tsc -b` build both projects |

Why it matters to you as a learner, in four bullets:

- **`"jsx": "react-jsx"`** — the automatic runtime, so no `import React` (file 05 explains the transform).
- **`"lib": ["ES2023", "DOM"]`** gives you `document`, `window`, `HTMLElement` types. They are absent from `tsconfig.node.json` on purpose: reaching for `document` in `vite.config.ts` should be a type error, because that file runs in Node.
- **`noUnusedLocals` / `noUnusedParameters`** mean an unused variable is a build failure, not a warning. This catches dead code early; it also means you must delete leftovers rather than "keep them for later".
- **`erasableSyntaxOnly`** bans TypeScript syntax that cannot simply be deleted from the emitted JavaScript — notably `enum`. Part 2 already argued against enums for app code; the template enforces it.
- **`"strict"` is not listed** — and that is not a mistake. TypeScript 6 turns `strict` on by default (proved in Part 2's lab: TS 6 flags an implicit-`any` parameter where TS 5 stayed silent). Your app code is strict, and the `noUnused*` settings on top of it are deliberate.

### 6.9 `.oxlintrc.json` — the linter

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

- **oxlint**, not ESLint. It is a Rust-based linter: `npm run lint` is ~30 ms for this project, and the template ships it configured with the React and TypeScript plugin rulesets.
- Two rules are explicitly configured, and both are React-correctness rules:
  - **`react/rules-of-hooks`** — errors when a hook is called conditionally or outside a component. This is the single most important React lint rule; it catches the bug class explained in Part 4.
  - **`react/only-export-components`** — warns when a file exports both components and non-components, because that breaks Fast Refresh's ability to preserve state (we hit it for real in file 04).
- The template's README notes that you can install `oxlint-tsgolint` and enable `"typeAware": true` for rules that need type information. That is a fine upgrade later, not a requirement now.

### 6.10 `package.json` and `package-lock.json`

```json
{
  "name": "megashop",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "typescript": "~6.0.2",
    "vite": "^8.3.0"
  }
}
```

| Entry | What it is | Why the project needs it |
| --- | --- | --- |
| `react` | The library: components, hooks, element description | Everything you write |
| `react-dom` | The browser renderer: DOM updates, event delegation, `createRoot` | Turning elements into a real page |
| `@types/react`, `@types/react-dom` | TypeScript definitions for the two packages | Props typing, JSX intrinsic elements, `useState` generics |
| `@types/node` | Node's types (`process`, `path`, `node:*`) | For `vite.config.ts` (it runs in Node) |
| `vite` | Dev server + production bundler | `npm run dev`, `npm run build` |
| `@vitejs/plugin-react` | Vite plugin for JSX + Fast Refresh | React-specific transforms |
| `typescript` | The compiler `tsc` | `tsc -b` in `build`, editor IntelliSense |
| `oxlint` | The linter | `npm run lint` |
| `"private": true` | Blocks accidental `npm publish` | You never want to publish an app to npm |
| `"type": "module"` | Node treats `.js` files here as ESM | Matches the browser/bundler ESM world |

**Version ranges, and why the installed version is not what you see here.** The declared ranges (`^19.2.8`, `~6.0.2`) allow newer minor/patch releases, so a fresh install today resolves to whatever is newest *within* those rules. On the day these notes were written, a fresh `npm install` produced:

```text
vite 8.3.0 · @vitejs/plugin-react 6.1.1 · typescript 6.0.3
react 19.3.0 · @types/react 19.3.0 · oxlint 1.83.0
node v22.22.3 · npm 10.9.8
```

Meaning of the prefixes you will see in `package.json` files:

| Syntax | Allows | Example |
| --- | --- | --- |
| `19.2.8` (exact) | nothing | Pin when a version breaks you |
| `~6.0.2` | patch updates within 6.0.x | Used for TypeScript here — minor TS releases change diagnostics |
| `^19.2.8` | any 19.x.y ≥ 19.2.8 (not 20.x) | Used for app libraries here |
| `>=1.2.3` | anything ≥ | Rarely appropriate in app code |

### 6.11 `.gitignore`

```text
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

`node_modules` (installable) and `dist` (build output) are ignored; everything else — including `package-lock.json` — is committed. `*.local` covers files like `.env.local` that hold secrets (Part 16).

### 6.12 `README.md`

The template's README explains its own choices, including two lines worth remembering:

> "The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see this documentation."

So the React Compiler (Part 10) is **opt-in**, not something you must configure on day one. The second useful line points at `oxlint-tsgolint` for type-aware linting.

---

## 7. Step 4 — verify the whole toolchain

Do this once, now, so you know what "green" looks like. Three commands:

### 7.1 Type check

```bash
npx tsc -b
```

**Expected result:** no output at all, exit code 0.

```text
[tsc exited 0 with no output]
```

Silence is success for `tsc`. You can confirm the exit code with `echo $?` (macOS/Linux) or `echo %ERRORLEVEL%` (Windows cmd).

### 7.2 Lint

```bash
npm run lint
```

**Expected result** (real output on the untouched template):

```text
Found 0 warnings and 0 errors.
Finished in 31ms on 3 files with 116 rules using 2 threads.
```

### 7.3 Production build

```bash
npm run build
```

**Expected result** (real output, untouched template):

```text
dist/index.html                   0.45 kB │ gzip:  0.29 kB
dist/assets/react-CHdo91hT.svg    4.12 kB │ gzip:  2.06 kB
dist/assets/vite-BF8QNONU.svg     8.70 kB │ gzip:  1.60 kB
dist/assets/hero-CLDdwZDr.png    13.05 kB
dist/assets/index-D64VDMd1.css    4.10 kB │ gzip:  1.47 kB
dist/assets/index-BRDr3nmD.js   222.52 kB │ gzip: 69.27 kB

✓ built in 158ms
```

Read that output like an engineer:

- The JS bundle is **222.52 kB raw / 69.27 kB gzipped**. Almost all of it is React + ReactDOM; the template's own code is a few kilobytes. This is the "React tax" from file 02, quantified on your own machine. Watch this number as you build: it should grow slowly, and Part 16 is about keeping it honest.
- Hashes in filenames (`index-BRDr3nmD.js`) are **content hashes** for cache-busting.
- `dist/` is what you deploy. It is static: any web server, CDN or static host can serve it.

Then confirm the built app actually works:

```bash
npm run preview
```

**Expected result** — Vite serves `dist/` on <http://localhost:4173/>. You are now looking at production code (no HMR, no React DevTools warnings from dev builds, minified). Get into the habit of checking `build` + `preview` before every deploy: some bugs only exist in production mode.

---

## 8. What the toolchain does for you (and why it is fast)

```text
                       DEV                                PRODUCTION
Browser  ──requests /src/main.tsx──▶ Vite            tsc -b   ──▶ type check (no output)
         ◀──transformed ES module──              ┌──▶ vite build ──▶ dist/index.html
         ──requests each import────▶ Vite       │                   dist/assets/*.js (hashed)
         ◀──only what changed (HMR)──            │
                                                  └─ esbuild/oxc transform + rollup bundling
Dependencies (react, react-dom) are pre-bundled once into
node_modules/.vite/ so that thousands of small imports become a
handful of HTTP requests.
```

Four ideas worth naming:

1. **Dev = on-demand transforms, not bundling.** The browser's own ES module loader fetches modules; Vite only transforms the ones you touch. Startup time barely grows with project size.
2. **Dependency pre-bundling.** Libraries like `react` ship many small files (CJS and ESM mixes). Vite pre-bundles them once with esbuild/oxc into `node_modules/.vite/`, which is why "optimizing dependencies" prints on the first run or after a dependency change.
3. **Production = full optimisation.** `vite build` minifies, tree-shakes, hashes filenames, and splits chunks (starting with the dynamic import in Part 10).
4. **The build runs the type checker first.** `"build": "tsc -b && vite build"` means **you cannot ship a TypeScript error**: `tsc` fails, `&&` short-circuits, the build stops. This is a feature; keep it in place even when it annoys you.

---

## 9. Developing inside a container, VM or cloud sandbox

If you develop in Docker, WSL2, a remote VM or a hosted preview environment, `localhost:5173` inside that environment is not your laptop's localhost. Two `server` options fix it:

**File: `vite.config.ts`** (the config used for the lab in these notes, with comments)

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // `host: true` binds to 0.0.0.0 so the dev server is reachable from outside
    // the machine (needed in containers, VMs, and hosted preview environments).
    host: true,
    // Vite blocks requests whose Host header it does not recognise (a DNS
    // rebinding protection). Hosted previews use their own domain, so either
    // list it explicitly — allowedHosts: ['my-preview.example.com'] — or, for a
    // throwaway sandbox, allow any host. NEVER ship `true` to production.
    allowedHosts: true,
  },
})
```

For a normal local project, **leave the config alone** (the three-line default). `host: true` in particular widens what can reach your dev server on a public network; prefer the explicit `allowedHosts: ['your-preview-host']` list whenever you can.

---

## 10. Common setup errors, walked through

### 10.1 `sh: vite: command not found` / `'vite' is not recognized`

- **Meaning:** the `vite` binary does not exist in `node_modules/.bin/`.
- **Cause:** `npm install` was never run (the scaffolder only copies files), or you are in the wrong directory.
- **Debug:** `ls node_modules/.bin | head` — is `vite` listed? `pwd` — are you inside `megashop/`?
- **Fix:** `cd megashop && npm install`. Never install Vite globally; npm scripts resolve the local binary automatically.

### 10.2 Vite refuses to start and complains about your Node version

- **Meaning:** your Node is outside `^20.19.0 || >=22.12.0`.
- **Cause:** an old system Node, or an NVM shell that reset to a default.
- **Debug:** `node -v`, then compare against the range above.
- **Fix:** `nvm install 22 && nvm use 22` (or your manager's equivalent), then `rm -rf node_modules package-lock.json && npm install` if the install was done with the old Node.

### 10.3 `Port 5173 is in use, trying another one...`

- **Meaning:** Vite wanted 5173, found it taken, and moved on. Vite prints exactly this and then serves on the next free port (5180 → error `Port 5174 is in use.` etc.). Real output:

```text
Port 5173 is in use, trying another one...

  VITE v8.3.0  ready in 198 ms

  ➜  Local:   http://localhost:5174/
```

- **Cause:** you already have a dev server running (very often: the same project in a second terminal).
- **Fix:** use the port it printed, or stop the other process. To fail loudly instead of jumping ports: `npm run dev -- --port 5173 --strictPort`.

### 10.4 A blank white page

- **Meaning:** the app mounted nothing, or crashed during the first render.
- **Cause (in order of likelihood):** a runtime error in `App.tsx` (check the browser console), a missing/renamed `<div id="root">` in `index.html` (you will see a `createRoot(...): Target container is not a DOM element` error), or a bad import path.
- **Debug:** open DevTools → Console. React errors are explicit: `Uncaught Error: …`, `Warning: …`. Then check `index.html` for `id="root"`.
- **Fix:** repair whatever the console names. Do not start deleting files at random.

### 10.5 The editor shows errors that `npm run build` does not

- **Meaning:** the editor and CLI are using different TypeScript versions.
- **Fix:** VS Code → Command Palette → **"TypeScript: Select TypeScript Version…" → "Use Workspace Version"**. The workspace version (from `node_modules`) is the one the build uses.

### 10.6 `EACCES: permission denied` during a global install

- **Meaning:** you are installing globally into a directory owned by root.
- **Fix:** do not. Nothing in this notes set needs a global install; `npm create vite@latest` runs through `npx`, and everything else is a local dev dependency. If you already have permission problems with npm's global prefix, fix npm's prefix rather than reaching for `sudo` (which creates root-owned files in your project and in `~/.npm`).

### 10.7 Windows: the dev server is slow and HMR lags

- **Meaning:** your project lives on the Windows filesystem (`C:\…`) but Node runs inside WSL, or file watching is crossing the boundary.
- **Fix:** keep the project inside the Linux filesystem (`~/projects/megashop`) when working in WSL2. Real-world numbers: this is often the difference between ~150 ms and multi-second updates.

### 10.8 "It says `Cannot find module './App'`"

- **Meaning:** the import path is wrong or the file does not exist.
- **Note:** in this template `allowImportingTsExtensions` is on, so `import App from './App.tsx'` (with extension) also works — you will see both styles in the wild. Pick one style per project; our lab uses the extension because the template does. On case-insensitive filesystems (macOS/Windows) a mismatch in case (`./app.tsx` vs `./App.tsx`) also passes locally and breaks in CI on Linux — a classic.

---

## 11. Practice

### Beginner

1. Create the project exactly as in section 3, run all four commands (`dev`, `tsc -b`, `lint`, `build`) and note the four outputs in a scratch file. You will compare against these numbers later.
2. Change `<title>megashop</title>` in `index.html` to your own project name, confirm HMR updates the browser tab title, then change the `h1` text in `src/App.tsx`.

**What you should see:** the tab title updates after a full reload for `index.html` edits (HTML is not hot-swapped the way modules are), while `App.tsx` edits appear instantly. Knowing which changes are hot and which need a reload saves hours of confusion.

### Intermediate

Delete the template's demo content and make the app your own skeleton:

1. Delete `src/App.css` and `src/assets/` (all three files).
2. Replace `src/App.tsx` with a minimal component that renders `<h1>MegaShop</h1>` and one paragraph.
3. Replace `src/index.css` with a short stylesheet of your own (system font, dark background, centred container).
4. Run `npx tsc -b`, `npm run lint`, `npm run build`.

**Solution**

```tsx
// src/App.tsx
export default function App() {
  return (
    <main className="page">
      <h1>MegaShop</h1>
      <p>A tiny shop, built to learn React.</p>
    </main>
  );
}
```

```css
/* src/index.css */
:root {
  color-scheme: dark;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
body {
  margin: 0;
  background: #0f1115;
  color: #e8ecf1;
}
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 20px;
}
```

**Expected results:** `tsc -b` silent; lint `Found 0 warnings and 0 errors.`; build succeeds with a **smaller** JS bundle than the template's 222.52 kB (our final MegaShop build is 226.17 kB *with* ten components and its data layer, but the skeleton is smaller still). If the build fails with `TS6133: 'heroImg' is declared but its value is never read`, you deleted the images but left the imports — delete the import lines too. That is `noUnusedLocals` doing its job.

### Challenge

1. Run `npm run build` twice and compare the CSS/JS sizes with the template's untouched build (section 7.3). Explain in two sentences where the difference comes from.
2. Prove the dev/production difference for yourself: introduce a tiny mistake — write `console.log(products.length)` where `products` does not exist in scope, then run `npx tsc -b`. Read the error (`TS2304: Cannot find name 'products'`) and note that `npm run build` refuses to continue.
3. Stop the dev server, run `npm run preview`, and confirm `dist/` works with the dev server off.

**Solution**

1. The sizes drop because the template's `App.css` (~4.10 kB) and its images (`hero.png`, `react.svg`, `vite.svg`) are no longer imported, so they are not copied into `dist/`; and the JS shrinks slightly because the demo component tree is gone. The **React runtime itself is still ~68 kB gzipped and does not shrink** — it is the fixed cost of using the library, which is why file 02 put bundle weight in the cost ledger.
2. `TS2304: Cannot find name 'products'.` — a *type* error. Because `build` is `tsc -b && vite build`, the `&&` short-circuits: no broken JavaScript is ever emitted. This is the practical value of TypeScript in a React project: the compiler is a gate on the deploy path.
3. `npm run preview` serves `dist/` on port **4173** with no HMR and no file watching. If something is broken only here, it is a production-mode problem: a build-time transform, a missing `NODE_ENV` branch, or an asset path that only exists in dev (Part 16).

---

## 12. Summary

- Start React projects with **Vite**: `npm create vite@latest megashop -- --template react-ts`. CRA is deprecated; frameworks are for SSR/routing needs (Part 18).
- **Node 20.19+ or 22.12+**, and one lockfile committed. Check with `node -v`.
- The scaffold copies files; `npm install` installs; `npm run dev` serves at <http://localhost:5173>; `npm run build` type-checks and bundles into `dist/`; `npm run preview` serves that build on 4173.
- Know what each file is: `index.html` (mount point + entry script), `main.tsx` (bootstrap), `App.tsx` (your tree), `public/` (served as-is), `src/assets/` (bundler-managed), `vite.config.ts` (build/dev config), three tsconfigs (app vs node vs solution), `.oxlintrc.json` (React correctness rules), `package.json` (scripts + declared ranges).
- `"jsx": "react-jsx"` means **no `import React`**; `noUnusedLocals` means no dead variables; `erasableSyntaxOnly` means no `enum`; `"build": "tsc -b && vite build"` means **no shipping type errors**.
- Dev is on-demand and instant; production is bundled, minified and content-hashed. HMR (Fast Refresh) preserves component state — and it is the reason a file should export components *and nothing else* (file 04).
- In containers/VMs, add `server.host` and `allowedHosts` — and never ship `allowedHosts: true` to production.

---

**What's next →** [`04-project-structure.md`](./04-project-structure.md)
