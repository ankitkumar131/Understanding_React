# 01 — What Is React?

> **Part 3 · React Fundamentals · File 1 of 12**
> Why this file exists: every React tutorial starts with `npx create-vite` and a counter. That teaches *typing*, not *understanding*. This file starts one step earlier — with the actual problem React was built to solve — so that everything in the next eleven files has a reason to exist.

---

## 1. The 30-second answer

**React is a JavaScript library for describing what a user interface should look like for a given set of data, and for keeping the browser's DOM in sync with that description automatically.**

Read that sentence three times. It has three load-bearing parts:

1. **"a JavaScript library"** — not a language, not a framework, not a compiler. React is code you install with npm and import into your own JavaScript/TypeScript files. If you can write JavaScript, you can already write React; you are learning *a way of organising* your JavaScript.
2. **"for describing what a user interface should look like"** — you write descriptions, not instructions. `PriceTag` says *"show ₹4,999.00 struck through next to ₹5,999.00"*. It does not say *"find the third `<span>`, change its `textContent`, then add a class"*.
3. **"for keeping the DOM in sync automatically"** — this is the part that earns React its keep. You change data; React figures out which parts of the page must change and changes exactly those.

Everything else in these notes — JSX, props, state, hooks, context, routers, data fetching — is machinery in service of that one sentence.

### Before you continue

These notes assume Part 1 (Fundamentals + tooling) and Part 2 (TypeScript). You should be comfortable with:

| Skill | Where it was covered | Why React needs it |
| --- | --- | --- |
| `const` / `let`, arrow functions, template literals | Part 1 | You will write arrow functions in almost every line of JSX |
| Array methods: `map`, `filter`, `reduce` | Part 1 | Rendering a list *is* `array.map(...)` (file 11) |
| Destructuring, spread, rest | Part 1 | Props are destructured in every component (files 07–08) |
| Objects, `Object.fromEntries`, `Record<K, V>` | Part 1 / Part 2 | State objects and lookup tables |
| `interface` vs `type`, unions, literal types | Part 2 | Props typing, `Category \| 'all'` filters (files 06, 11) |
| Modules: `import` / `export` | Part 1 | Every component lives in its own file |

If any row makes you uneasy, that is fine — but go back. React punishes gaps in JavaScript far more than gaps in React itself.

---

## 2. The problem React was invented to solve

Let's build the same tiny feature twice. It is a cart indicator: a badge showing how many items are in the cart, and a total price.

### 2.1 The plain-JavaScript version

**File: `cart.html`** (open it directly in a browser — no tooling needed)

```html
<!doctype html>
<html lang="en">
  <body>
    <p>Cart: <span id="badge">0</span> item(s)</p>
    <p>Total: <span id="total">₹0.00</span></p>
    <button id="add">Add ₹499 keyboard</button>
    <button id="remove">Remove one</button>

    <script>
      // ---- the "state" ----
      let itemCount = 0;
      const priceMinor = 49900;

      // ---- the DOM handles ----
      const badge = document.getElementById('badge');
      const total = document.getElementById('total');

      function render() {
        badge.textContent = String(itemCount);
        total.textContent = (itemCount * priceMinor / 100).toFixed(2);
      }

      document.getElementById('add').addEventListener('click', () => {
        itemCount += 1;
        badge.textContent = String(itemCount);   // a developer "optimised" render()
        // ... and forgot the total line. Nobody notices in the demo.
      });

      document.getElementById('remove').addEventListener('click', () => {
        itemCount = Math.max(0, itemCount - 1);
        render();
      });

      render();
    </script>
  </body>
</html>
```

**Run it** — save the file, open it in a browser, and click **Add ₹499 keyboard** three times, then **Remove one**.

**Expected result** (this is real output, produced by driving the same HTML in a scripted browser DOM):

```text
start                              badge= 0  total=0.00
after 3 clicks on "Add"            badge= 3  total=0.00
after clicking "Remove one"        badge= 2  total=998.00
```

Look at that second line. The badge says **3 items** and the total says **₹0.00**. The two numbers on screen describe two different imaginary carts. Then one click later the pair is `2` and `₹998.00` — still not a consistent pair, because the badge was updated by the `remove` handler while the total was recomputed by `render()`.

Nothing is broken in the *language*. There is no bug the compiler can see. There is no error in the console. The bug is **architectural**: the truth (`itemCount`) lives in one place, but the *projection* of that truth onto the screen is written out by hand, in three places, and every place has to remember to update on every change. Miss one line — in one handler, on one code path — and the UI silently lies.

Every large front-end codebase written in this style eventually dies of the same disease: **the screen and the data drift apart, and nobody can find where**.

### 2.2 The React version

**File: `src/components/CartSummary.tsx`**

```tsx
import { useState } from 'react';

const PRICE_MINOR = 49900; // ₹499.00, in paise — money is never a float (Part 2)

export function CartSummary() {
  const [itemCount, setItemCount] = useState(0);

  const totalMinor = itemCount * PRICE_MINOR;

  return (
    <section>
      <p>Cart: <span>{itemCount}</span> item(s)</p>
      <p>Total: <span>{formatRupees(totalMinor)}</span></p>
      <button type="button" onClick={() => setItemCount((count) => count + 1)}>
        Add ₹499 keyboard
      </button>
      <button type="button" onClick={() => setItemCount((count) => Math.max(0, count - 1))}>
        Remove one
      </button>
    </section>
  );
}

function formatRupees(minor: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
}
```

**Expected result:** badge and total are *derived from the same variable in the same function body*. They cannot disagree, because there is no second place where "3" or "₹0.00" is written down. Change `itemCount`, and both lines are recomputed on the next render.

That is the entire pitch. Not "React is fast". Not "React uses a virtual DOM". The pitch is: **you write the screen as a function of the data, once, and the library does the updating.**

> 💡 **The rule underneath everything**
> In React you never say *"change this element"*. You say *"the data is now this"*, and describe what the screen looks like for that data. React works out the difference.

---

## 3. What React actually is, piece by piece

### 3.1 A library, not a framework

The word "framework" gets used loosely, so here is the distinction that matters:

| | Library (React) | Framework (Angular, Next.js, Remix) |
| --- | --- | --- |
| Who is in charge? | **You.** You call React: `createRoot(...).render(<App />)` | The framework. It calls *you* at the right moments |
| What does it include? | Rendering, components, state, hooks | Rendering **plus** routing, data fetching, build pipeline, conventions |
| How do you add a router? | You choose one: React Router, TanStack Router | It is already there, and you use theirs |
| How do you fetch data? | You choose: `fetch`, TanStack Query, SWR | Framework-specific loaders/actions |
| Size of the mental model | Small core, ecosystem you assemble | Larger core, fewer decisions |

`react` (the package you install) contains **no router, no HTTP client, no form library, no state-management library, no CSS solution**. It contains the component model, the reconciler and the hooks. Everything else in a real app comes from somewhere else — which is why this notes set devotes Parts 6, 7, 8 and 14 to libraries that are *not* React.

That is a feature and a cost at the same time: freedom to choose, obligation to choose wisely.

### 3.2 Two packages, and why there are two

A React app on the web needs **two** packages, and beginners are usually surprised by the second:

```text
react          → the component model, hooks, and the description of your UI.
                 Pure JavaScript data structures. Knows nothing about browsers.

react-dom      → the "renderer": takes React's description and performs the actual
                 DOM operations (createElement, setAttribute, appendChild, …),
                 plus event handling in the browser.
```

You will meet them in exactly two flavours in this part:

```tsx
// Browser app — the normal case
import { createRoot } from 'react-dom/client';

// Server-side rendering to an HTML string — used in our dev harness and in real SSR
import { renderToStaticMarkup } from 'react-dom/server';
```

Why split them? Because React's description of a UI is not specific to the DOM. The same core (`react`) drives:

- **`react-dom`** — web (browser DOM),
- **`react-native`** — iOS, Android, Windows, macOS (native views instead of `<div>`),
- **`react-pdf`, `react-three-fiber`, …** — other "hosts" entirely.

You write components and hooks the same way in all of them; only the renderer and the host elements change (`<div>` vs `<View>`). That is the origin of the phrase in React's own tagline: *"the library for web and native user interfaces"*.

### 3.3 A description, expressed in components

A **component** is a JavaScript function whose name starts with a capital letter and which returns what should be on screen:

```tsx
export function PriceTag(props: { priceMinor: number }) {
  return <strong>{formatRupees(props.priceMinor)}</strong>;
}
```

That is not HTML inside JavaScript. It is a **description** written in a syntax extension called JSX, which the build tool turns into ordinary function calls before the browser sees anything. We prove that in the next section.

Components compose: `ProductCard` uses `PriceTag`, `Rating`, `StockBadge` and `Tag`. A page is a tree of components, and a tree is something you can reason about, test, split across files and reuse.

### 3.4 The runtime: what it does with your description

When your data changes, React:

1. calls your component functions again (**render**),
2. gets a fresh description of the UI (a tree of plain objects called **elements**),
3. **compares** the new tree with the previous one (this is what "reconciliation" means),
4. applies the smallest set of real DOM operations that makes the page match (the **commit** phase),
5. then runs your **effects** — the code that talks to the outside world (timers, subscriptions, `fetch`).

You will spend most of your React life in steps 1–2 (writing components) and occasionally need to understand 3–5 (when performance or timing surprises you). Files 09–12 and all of Part 4 live in these details.

---

## 4. What JSX really is (and is not)

JSX looks like HTML. It is not HTML, and that distinction explains a dozen beginner errors at once.

**File: `src/jsx-demo.tsx`**

```tsx
export function Greeting({ name }: { name: string }) {
  return <p className="greet">Hello, {name}!</p>;
}

export const el = <Greeting name="Ada" />;
export const frag = <><span>a</span><span>b</span></>;
```

**Run it** — ask the TypeScript compiler to show you the JavaScript it produces:

```bash
npx tsc src/jsx-demo.tsx --jsx react-jsx --target ES2022 --module ESNext --outDir /tmp/jsxout
```

**Expected result** (`/tmp/jsxout/jsx-demo.js`, real output):

```js
import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";

export function Greeting({ name }) {
    return _jsxs("p", { className: "greet", children: ["Hello, ", name, "!"] });
}
export const el = _jsx(Greeting, { name: "Ada" });
export const frag = _jsxs(_Fragment, { children: [_jsx("span", { children: "a" }), _jsx("span", { children: "b" })] });
```

Every JSX expression became a **function call that returns a plain object**. That is all JSX is: nicer syntax for "make an element". Note three consequences, each of which you will feel later:

1. **Lowercase tags are strings** (`"p"`) — they mean "a real DOM element named p". **Capitalised tags are identifiers** (`Greeting`) — they mean "the function I defined". This is exactly why a component must be capitalised: `<greeting />` would tell React to look for an HTML tag called `greeting`.
2. **Attributes became object properties.** `className="greet"` → `{ className: "greet" }`. So JSX attribute values are ordinary JavaScript expressions in a different coat of paint; `className={42}` is a type error for the same reason `{ className: 42 }` is.
3. **Children became a `children` property.** The content between tags is just another prop. That single fact is what makes `children` work in files 07–08.

Older tutorials show a different compiled form:

```js
export function Greeting({ name }) {
    return React.createElement("p", { className: "greet" }, "Hello, ", name, "!");
}
```

That is the **classic runtime** (`"jsx": "react"`), which required `import React from 'react'` at the top of every file — React 16 style. Modern setups use `"jsx": "react-jsx"` (the **automatic runtime**, since React 17), which imports `react/jsx-runtime` for you and needs no `React` identifier. Our Vite template sets `"jsx": "react-jsx"`, so **if you see an old tutorial telling you to write `import React from 'react'` "or JSX won't work", that advice is two versions out of date.** Delete the unused import.

> ⚠️ JSX is not part of JavaScript. It is not part of React either — it is a transform performed by your build tool (esbuild/SWC via `@vitejs/plugin-react` in our setup, or `tsc` in the demo above). Browsers have never heard of it. This is *the* reason a React project has a build step at all.

---

## 5. What the browser actually receives

Beginners picture React "running in the browser and doing something magic". Here is the real pipeline for our lab app:

```text
src/data/products.ts     ─┐
src/components/*.tsx      ├─→  TypeScript compiler  ──→  JavaScript
src/App.tsx              ─┘        (tsc -b)              (types erased)
                                                            │
                                                            ▼
                                                       Vite bundler
                                                  (esbuild/rollup, JSX
                                                   transformed, modules
                                                   resolved and joined)
                                                            │
                                                            ▼
                                          dist/index.html + 1 CSS file + 1 JS file
                                                            │
                                                            ▼
                                                  the browser, which sees
                                                  only ES2023 JavaScript,
                                                  HTML and CSS
```

Real numbers from our MegaShop app (see file 03 for how to create it):

```text
$ npm run build
vite v8.3.0 building client environment for production...
transforming...
✓ 27 modules transformed.
dist/index.html                   0.45 kB │ gzip:  0.29 kB
dist/assets/index-*.css           3.10 kB │ gzip:  1.14 kB
dist/assets/index-*.js          226.17 kB │ gzip: 70.87 kB
✓ built in 138ms
```

Three things to take from that table:

- **Types cost nothing at runtime.** TypeScript is erased; the bundle is plain JavaScript. (Part 2's entire value proposition is compile-time.)
- **React itself is most of those 71 kB gzipped.** A "hello world" React app ships roughly 60–70 kB of library on top of your own code. On a fast connection that is imperceptible; on a slow phone, it is a real cost, and it is the strongest argument for the alternatives in section 11.
- **The output is small, static files.** React does not need a React server at runtime. `dist/` is HTML + CSS + JS that any static host can serve.

### 5.1 Where the app starts: `index.html` and the root

**File: `index.html`** (inside the Vite project)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>megashop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**File: `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Line by line:**

- `import { StrictMode } from 'react'` and `import { createRoot } from 'react-dom/client'` — the two packages from section 3.2, in their browser flavours.
- `import App from './App.tsx'` — your page, as a component. (The `.tsx` extension in the import works because the template sets `allowImportingTsExtensions`; without it you would write `'./App'`.)
- `import './index.css'` — a **side-effect import**: the CSS file is not used as a value, it just needs to be part of the bundle. Vite handles it; this is a bundler feature, not a React one.
- `document.getElementById('root')!` — finds the empty `<div>` from `index.html`. The `!` is the one idiomatic non-null assertion in a React app: that `<div>` is ours and always exists, and crashing loudly here is better than a mysterious failure later.
- `createRoot(...)` — hands that DOM node to React: *"from now on, you own this subtree."* The node is called the **root** (also called the **container**).
- `.render(<StrictMode><App /></StrictMode>)` — the first render. Everything else in the app is React rendering React rendering React.
- `StrictMode` — a development-only wrapper that intentionally double-invokes components, effects and some functions to surface bugs that would otherwise appear only in production. It renders nothing to the DOM. (It is what makes your effect logs appear twice in development. That is a feature, not a bug.)

> 🔍 **You no longer need React's DOM at all if you don't want it.** React can render into existing HTML on the server (SSR), into a canvas, or into native views. But every one of those still starts with "somebody creates a root and renders a component tree into it".

---

## 6. The mental model in one line

```text
UI = f(state)
```

The user interface is a **function** of the application's **state**. Not a sequence of manipulations — a function value.

From this single line, the rules of everything that follows can be derived:

| Because UI = f(state) … | … therefore |
| --- | --- |
| The screen is computed, not edited | You change state; you never touch `document.querySelector` in a component |
| The function must be predictable | Components must be **pure**: same inputs → same output, no mutation of things they do not own |
| A component is called with inputs | Those inputs are **props**, read-only by convention and by type (`readonly` in Part 2) |
| Something must remember values between renders | That is **state**, created with `useState` (Part 4) |
| The function must be re-run when state changes | React re-renders; you do not call the component function yourself |
| The same function can be used in many places | Components are reusable; props parameterise them |
| Two components may need the same data | You **lift state up** to the nearest common parent (file 08), or use context (Part 5) |
| Some work is not a pure computation (fetching, timers) | That is an **effect**, and it is deliberately an escape hatch (Part 4) |

If you remember one line from this file, remember `UI = f(state)`.

### 6.1 The honest truth about the "virtual DOM"

You will hear that React is fast because of the "virtual DOM". Here is the accurate version:

- React keeps an in-memory **tree of plain JavaScript objects** describing the UI. Those objects are called **elements**; you can log one and read it:

```tsx
const element = <p className="greet">Hello</p>;
console.log(element);
// { $$typeof: Symbol(react.transitional.element), type: 'p',
//   key: null, ref: null, props: { className: 'greet', children: 'Hello' } }
```

- On each render React builds a new tree, compares it to the previous tree (**diffing**), and computes the minimal set of DOM mutations (**reconciliation** → **commit**).
- That comparison is **not free**, and React is **not the fastest** way to update a DOM. Hand-written imperative DOM code that updates exactly one text node will beat React at that one task, always. React's winnings are elsewhere: predictability, composition, and not needing a human to figure out the minimal update set across hundreds of interacting features.
- The tree of objects is an **implementation detail that makes the programming model possible**. You are not meant to work with it directly, and you do not need to "optimise the virtual DOM". When performance does matter, the tools are: fewer/cheaper renders (Part 4, file 10), and letting the React Compiler (Part 10) handle memoisation.

> 🏭 **In production code**, I have never seen a team rewrite React because "the virtual DOM was too slow". I *have* seen teams fix performance by (1) rendering fewer rows, (2) moving derived work out of the render path, and (3) fixing state that was placed too high in the tree. That is Part 10's and Part 4's material.

---

## 7. Vocabulary — the words these notes will use

Learn these now; every later file assumes them.

| Term | Precise meaning |
| --- | --- |
| **Component** | A JavaScript function returning elements. Name starts with a capital. `function PriceTag() { … }` |
| **Element** | The plain object JSX produces: `{ type, props, key, ref }`. "What to render." |
| **Instance / fiber** | React's internal record of a mounted component. You never touch it; it appears in error stacks as "fiber". |
| **Props** | The read-only inputs passed to a component. Values flow **down**. |
| **State** | Data a component owns and can change over time, created with `useState`/`useReducer`. Changes trigger re-renders. |
| **Render** | Calling your component function to get a fresh element tree. "Rendering" ≠ "updating the DOM". |
| **Re-render** | A render that happens because state/props/parent changed after the first one. |
| **Reconciliation** | Comparing the new element tree with the previous one to decide what to update. |
| **Commit** | The phase in which React actually mutates the DOM. |
| **Mount** | A component being rendered into the tree for the first time (`main.tsx`'s first render mounts your whole app). |
| **Unmount** | Removing a component from the tree; its state is discarded. |
| **Root** | The DOM container React owns, created by `createRoot`. |
| **Hook** | A function whose name starts with `use`, callable only during render, that lets a component keep state, run effects, use context, etc. |
| **Effect** | Code run *after* commit to synchronise with the outside world (`useEffect`). |
| **Pure (component)** | Same props → same output; no side effects during render. Enforced by discipline, checked by `StrictMode` + linting. |
| **StrictMode** | Dev-only wrapper that double-renders to expose impurity and unsafe effects. |
| **HMR** | Hot Module Replacement — the dev server swaps a changed module into the running page without a full reload. |
| **JSX** | The syntax extension; transformed at build time into `jsx()` calls. |
| **Transitional element** | The internal marker on elements (`Symbol(react.transitional.element)`) that tells renderers "this is mine". You only meet it when rendering across React copies. |

---

## 8. What React is NOT (seven misconceptions, corrected)

| Misconception | Reality |
| --- | --- |
| "React is a framework." | It is a library. Routing, data fetching, forms, styling, i18n and testing are separate choices (Parts 6–14). |
| "React is a language / JSX is HTML." | React is JavaScript. JSX is a build-time transform into function calls. Browsers never see it. |
| "I must use Create React App." | **CRA is deprecated and unmaintained.** Current official advice is a build tool or framework: Vite for a client app, a framework (Next.js, React Router v7 as a framework, TanStack Start, Expo for native) when you want SSR/routing conventions. We use Vite (file 03). |
| "I must learn class components first." | You must *recognise* them (they appear in old code) but not write them. Hooks landed in React 16.8 (2019); all new code uses functions. Class components are covered once, briefly, as history in file 07. |
| "React is fast because of the virtual DOM." | React is *fast enough*, and its model removes the need for hand-written DOM updates. Micro-optimising the diff is not a beginner concern, and often not an expert one either. |
| "The page updates because the array changed." | Wrong. React has no idea you mutated an array in place: `products.push(x)` changes the data, triggers no re-render, and produces a UI that disagrees with your data. You must set state with a **new** value (`setProducts([...products, x])`). File 09 and Part 4 hammer this. |
| "Everything must be a component." | No. Formatting a price, sorting a list, validating an email — those are plain functions in `.ts` files. Our MegaShop keeps `formatMoney` in `data/products.ts`, not in a component. Use React for rendering, TypeScript for everything else. |

---

## 9. A short history, because it explains what current practice means

| Year | What happened | What it means for you today |
| --- | --- | --- |
| 2013 | React open-sourced by Facebook; class components, `createClass`, JSX | You will find this in very old tutorials only |
| 2015–2017 | `React.Component`, lifecycle methods, `React.createClass` removed | Lifecycle methods (`componentDidMount`, …) are now `useEffect` |
| 2017 | React 16: the "Fiber" reconciler rewrite, error boundaries, fragments | Concurrent features are possible because of this rewrite |
| 2018–2019 | React 16.8: **hooks** (`useState`, `useEffect`, …) | Hooks are *the* way to write components. Functions only |
| 2020–2022 | React 17 (no new features, easier upgrades), React 18 (concurrent rendering, automatic batching, `useSyncExternalStore`, `useId`) | `useId`, transitions, `useDeferredValue` are current tools |
| 2024–2026 | **React 19** (Server Components, Actions, `useActionState`, `useOptimistic`, `use`, `ref` as a prop, automatic memoisation via the **React Compiler**), docs moved to react.dev, class-component docs moved into a "Legacy" section | Our lab installs `react@19.2.x`. Modern docs (react.dev) are the reference; blogs are secondary |
| Current advice on setup | Vite (client apps), frameworks for SSR/RSC (Next.js and co.), Expo for native | File 03 sets up Vite exactly as the template ships it |

Two consequences worth internalising:

1. **React's documentation is now explicitly split** into current APIs and a *Legacy* section ("not recommended for newly written code"): `componentDidMount`, `defaultProps`, string refs, `React.FC`-with-implicit-children and friends live there. If a tutorial teaches those as the normal way, it is out of date.
2. **"Version-sensitive" is real.** `ref` as a plain prop, `use`, `useActionState`, `useOptimistic`, the React Compiler — all of these are recent. When a file in these notes says "since React 19", it is because the pattern does not exist in older versions. Cross-check anything that smells version-dependent against <https://react.dev>.

---

## 10. How React compares (honest trade-offs, no winners)

| Approach | Model | Strengths | Costs | Reach for it when |
| --- | --- | --- | --- | --- |
| **Vanilla JS + DOM** | Imperative | Zero dependencies, tiny, total control, instant | You maintain all sync logic (section 2); grows poorly past a few widgets | Small widgets on an existing server-rendered page |
| **React** | Declarative component tree | Enormous ecosystem, jobs, one model for web + native, predictable composition | 60–70 kB+ of library, build tooling, JS required for the page to work, state-management choices | Interactive apps with lots of shared state and growing UI |
| **Vue** | Declarative templates (SFCs) | Gentle learning curve, great docs, built-in router/state, smaller core | Smaller ecosystem; templating DSL to learn; less "one language everywhere" | Teams wanting Vue's convention-over-choice model |
| **Svelte / SvelteKit** | Compiler-first | Very small output, no virtual DOM, concise syntax, excellent DX | Smaller ecosystem and hiring pool; compiler magic can surprise | Performance/bundle-size-sensitive apps, new greenfield projects |
| **Angular** | Framework with DI, RxJS | Batteries included, strong for large enterprise teams, opinionated structure | Heaviest mental model and toolchain; steepest start | Big organisations wanting one prescribed architecture |
| **Solid / Qwik** | Fine-grained reactivity / resumability | React-like JSX with faster updates; Qwik's near-zero hydration cost | Ecosystem and maturity; different mental model (no re-render semantics) | Teams optimising for interactive performance or startup cost |
| **htmx / server-rendered HTML** | HTML-over-the-wire | No client state at all, tiny JS, superb for CRUD | Not suited to rich client-side interaction; server round-trip per change | Content sites, admin CRUD, teams avoiding client frameworks |

None of these is "better". **The correct question is which costs you can afford**: React's costs are library weight and choice-fatigue; the alternatives' costs are smaller ecosystems and fewer experienced hires. For the rest of these notes we go deep on React, because that is the tool the ecosystem and job market overwhelmingly assume — not because it wins a benchmark.

---

## 11. Where React fits in a real product

| Shape | What it means | When it is the right call |
| --- | --- | --- |
| **Client-side app (CSR/SPA)** | `index.html` + a JS bundle; the browser builds the page. *What we build in Parts 3–12.* | Logged-in dashboards, tools, editors |
| **Server-side rendering (SSR)** | The server runs your components to send real HTML, then the browser "hydrates" it into a live app | Content that must be indexable or fast on first paint |
| **Static generation (SSG)** | SSR at build time; HTML files on a CDN | Marketing pages, docs, blogs |
| **React Server Components (RSC)** | Some components run *only* on the server and never ship to the browser | Data-heavy app shells; needs a framework (Next.js and friends) |
| **Client + server mix** | Framework composes all of the above per route | Most production apps today |
| **React Native / Expo** | Components → native iOS/Android views | Mobile apps sharing logic and skills with your web app |

> ⚠️ **Complexity warning.** SSR/RSC solve real problems (SEO, first-paint, data access) at the price of a much bigger mental model: two environments, serialisation boundaries, server/client split, caching rules. Parts 3–12 teach the client model first *because* it is the foundation every framework builds on. Do not start a notes-app with RSC.

**Our plan:** Part 3–12 = a client-side app with Vite. Part 13 = testing. Part 14–15 = data and state libraries. Part 16 = build/performance. Part 17 = a full project. Frameworks get Part 18's overview.

---

## 12. Common mistakes in the first week

| Mistake | Why it happens | The fix |
| --- | --- | --- |
| Using `class` instead of `className` | JSX looks like HTML | JSX attributes are **props**: React uses the DOM property names. (TS catches it: *"Property 'class' does not exist … Did you mean 'className'?"* — file 05.) |
| Writing `for` on a `<label>` | Same | `htmlFor`. TS suggests it. |
| Waiting for the page to update after `arr.push(...)` | React doesn't watch your variables | Create a new value and set state with it |
| `document.getElementById` inside a component | Carrying imperative habits over | The component *returns* the description; there is nothing to query |
| "My effect runs twice — React is broken" | `StrictMode` double-invokes in development | It is exposing a real bug: your effect is not safe to run twice. Fix the effect (Part 4) |
| Copying `import React from 'react'` into every file | Outdated tutorials | Not needed with `"jsx": "react-jsx"`; an unused import is at best noise |
| Installing 20 libraries before writing a component | "React needs a stack" | Start with `react`, `react-dom`, `vite`. Add a library when a requirement demands it |
| Naming a component `button` | Capitalisation rule | `<button>` = HTML element; `<Button>` = your component. Name custom components with a capital |
| Putting everything into `App.tsx` | Momentum | One component per file, one responsibility per component (file 04) |

---

## 13. Practice

### Beginner

1. Start the MegaShop app (created in file 03 — if you have not created it yet, do file 03 first and come back) and change the header subtitle from `8 products in the catalogue` to your own text. Save the file and watch the browser.
2. In the running page, open DevTools → Elements. Find the `<div id="root">` and observe that the entire page lives inside it.

**What you should see:** the page updates without a full reload (that is HMR), and the DOM contains real `<article>`, `<h3>`, `<button>` elements — React did not invent its own markup language for the browser.

### Intermediate

Rewrite the `cart.html` example so the two numbers cannot drift: keep a single `render()` that recomputes both from `itemCount`, and call it from *both* handlers. Then answer in two or three sentences: what discipline does that version depend on, and what in the React version makes the same mistake impossible?

**Solution**

```js
document.getElementById('add').addEventListener('click', () => {
  itemCount += 1;
  render();                       // ← call the one function that computes the whole view
});

document.getElementById('remove').addEventListener('click', () => {
  itemCount = Math.max(0, itemCount - 1);
  render();
});
```

The fixed imperative version depends on a *human convention*: "always call `render()` after mutating `itemCount`, and never update the DOM anywhere else". It is correct today and unenforced — nothing stops a future edit from adding `badge.textContent = …` inline. The React version makes the mistake impossible because the view is *computed from* `itemCount` on every render; there is no second place to write the number down, and no way to publish a partial update. The state is the input; the screen is the output.

### Challenge

The plain-JS cart has a second, subtler flaw: after several clicks the "Remove one" button still works, but think about what happens when a *third* view of the same data is added (say a "free shipping over ₹500" banner that flips on at 2 items). Write down — in a comment, not code — the three separate places that would need to change in the imperative version, and how many lines would change in the React version. Then write the React version's derived value.

**Solution**

```text
Imperative version — adding a shipping banner touches:
  1. index.html      : add the banner element
  2. render()        : compute and set banner visibility
  3. every handler   : ensure it calls render() (or risk drift, as the bug above showed)
  4. plus a CSS class toggling line
→ 4 edits in 3 files, with an unenforced invariant.

React version — 2 edits in 1 file:
  1. const qualifiesForFreeShipping = totalMinor >= 50000;
  2. {qualifiesForFreeShipping && <p>Free shipping unlocked</p>}
→ no handler changes, because handlers only change state; the view recomputes itself.
```

```tsx
const totalMinor = itemCount * PRICE_MINOR;
const qualifiesForFreeShipping = totalMinor >= 50000;

return (
  <section>
    <p>Cart: <span>{itemCount}</span> item(s)</p>
    <p>Total: <span>{formatRupees(totalMinor)}</span></p>
    {qualifiesForFreeShipping && <p>🎉 Free shipping unlocked</p>}
    {/* …buttons… */}
  </section>
);
```

Derived values are just local variables. If you find yourself storing them in state, you have created a second source of truth — the exact problem you started with.

---

## 14. Summary

- React is a **library** for describing UI as a function of state: `UI = f(state)`.
- Two packages do two jobs: `react` (components, hooks, description) and `react-dom` (turn the description into browser DOM). Other renderers do the same job elsewhere, e.g. `react-native`.
- **JSX is not HTML**; it is build-time syntax sugar for function calls that return plain objects. Lowercase = DOM element, capitalised = your component. Attribute values are JavaScript expressions.
- React's job is **keeping the DOM in sync** with your description: render → reconcile → commit → effects. You change data; React changes the page.
- The "virtual DOM" is an implementation detail that makes this model possible. It is not a performance guarantee, and you do not work with it directly.
- Types are erased at build time; what ships is JavaScript. A minimal React app costs roughly 60–70 kB gzipped of library.
- React is not a framework: routing, data fetching, forms, styling and testing are separate decisions — and separate parts of these notes.
- Current practice means React 19, function components, hooks, Vite or a framework for setup; class components and CRA are history, not templates.

> ✅ **You now know what React is.** The next file answers the question that follows naturally: *if this is the model, why is it better than the alternatives for the apps I actually build?* — and, just as importantly, when React is the wrong tool.

---

**What's next →** [`02-why-react.md`](./02-why-react.md)
