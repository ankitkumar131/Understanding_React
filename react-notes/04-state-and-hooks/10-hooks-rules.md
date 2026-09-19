# 10 — The Rules of Hooks

> **Part 4 · State and Hooks · File 10 of 10**
> Why this file exists: every hook you met in this part — `useState`, `useEffect`, `useRef`, `useContext`, `useReducer`, `useMemo`, `useCallback`, and the custom hooks you wrote in file 09 — only works because React can find each hook's memory on the next render. It finds it by **position**, which imposes two rules on your code. Break them and you get some of the strangest bugs in React: state that jumps between fields, effects that attach to the wrong hook, "Rendered more hooks than during the previous render". This file explains why the rules exist, what each violation looks like (verbatim, from a real lint run and real runtime errors), and how to fix each one.

---

## 1. The two rules

React's own documentation states them in two lines:

> **1. Hooks must be called at the top level of a component or custom hook** — never inside conditions, loops, nested functions, `try`/`catch`, or after an early `return`.
> **2. Hooks must be called from React function components or custom hooks** — never from plain functions, event handlers, class methods, or module scope.

The linter can check both. React can only detect the *consequences* at runtime. Knowing why they exist turns them from arbitrary rules into a design constraint you can reason about.

---

## 2. Why: state is stored in a list, and the list is indexed by call order

A function component is, from React's point of view, a function that runs again and again. Between runs it keeps a small array (conceptually a linked list) of memory cells for that component instance — one cell per hook call, in order.

```text
function CartPanel() {                    React's memory for this instance:
  const [lines, setLines] = useState([]);      cell 0: lines
  const [open, setOpen] = useState(true);      cell 1: open
  const total = useMemo(...);                  cell 2: total + its dependency list
  useEffect(...);                              cell 3: the effect + its dependency list
  const ref = useRef(null);                    cell 4: ref
}
```

On the first render React fills the cells. On every later render it walks the list **from the top**, handing cell 0 to the first hook call, cell 1 to the second, and so on. React does not know the *names* `lines`, `open`, `total`, or `ref` — only the order. (That is also why the initial argument of `useState` is ignored after the first render: cell 0 already has a value.)

Now break the order:

```tsx
function CartPanel({ showLineCount }: { showLineCount: boolean }) {
  const [lines, setLines] = useState<CartLine[]>([]);     // cell 0 (always)

  if (showLineCount) {
    const [count] = useState(0);                          // cell 1 (only sometimes!)
  }

  const [open, setOpen] = useState(true);                 // cell 1 or cell 2, depending on the branch
}
```

Render once with `showLineCount = false`, then once with `true`, and cell 1 has changed meaning: it held `open`, now it is asked to be `count`. React cannot recover from the mismatch — the values were never labelled. **Runtime errors are the best case; silently swapped values are the worst case.**

---

## 3. The error messages, verbatim

React detects hook-order problems and tells you what it sees. All four messages below were produced by the lab harness (`src/dev/ref-memo-probe.tsx`, cases 9–12) — the outputs are quoted from `/tmp/part4-refmemo.txt`.

### 3.1 More hooks than before

**The code:**

```tsx
function ConditionalHook({ flag }: { flag: boolean }) {
  const [always] = useState(0);
  if (flag) {
    const [onlySometimes] = useState(10); // ← hook inside a condition
    return <span>{`${always}/${onlySometimes}`}</span>;
  }
  return <span>{`${always}/-`}</span>;
}
```

**Mounted with `flag={false}`, then re-rendered with `flag={true}`:**

```text
thrown: Rendered more hooks than during the previous render.
```

React also logs a table that tells you exactly where the order diverged — this is the single most useful diagnostic in React:

```text
React has detected a change in the order of Hooks called by ConditionalHook. This will lead to bugs and errors if not fixed. For more information, read the Rules of Hooks: https://react.dev/link/rules-of-hooks

   Previous render            Next render
   ------------------------------------------------------
1. useState                   useState
2. undefined                  useState
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

Read it as a diff: on the previous render there was no second hook; on this render there is one. The `undefined` is React saying "cell 1 was never used last time".

### 3.2 Fewer hooks than before

**The code:**

```tsx
function EarlyReturn({ stop }: { stop: boolean }) {
  const [first] = useState(0);
  if (stop) return <span>{`${first}/stopped`}</span>; // ← early return SKIPS the hook below
  const [second] = useState(1);
  return <span>{`${first}/${second}`}</span>;
}
```

**Mounted with `stop={false}`, then re-rendered with `stop={true}`:**

```text
thrown: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
```

The message even names the usual cause. `return` before a hook is the same bug as `if` around it — the hook is simply not reached.

### 3.3 A hook where there is no component

**The code:**

```tsx
function HookInHandler() {
  return (
    <button
      className="bad-handler"
      onClick={() => {
        const [value] = useState(0); // ← hooks are for render, not for handlers
      }}
    >
      call a hook in a handler
    </button>
  );
}
```

Nothing is thrown *inside* the event handler — React's event system catches it and reports it to the window, which is why the harness had to listen for it:

```text
reported to window   : Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.
```

Three candidate causes, and it is worth knowing how to tell them apart (section 8).

### 3.4 "Invalid hook call" for the same reason elsewhere

| Where the hook is called | Why it fails |
| --- | --- |
| Inside an event handler | The handler runs long after the render; there is no current component to attach state to. |
| Inside `setTimeout`/promise callbacks | Same — those run outside the render. |
| Inside a class method | There is no hook list for a class component; class state is `this.state`. |
| At module scope | Runs once, at import time, before any component exists. |
| In a plain function called from a component (`function calcTotal() { useState(...) }`) | React identifies a "React function" by name and by its caller. Rename it `useTotal()` if it really contains hooks (section 5). |

---

## 4. What "top level" means, precisely

Every one of these is a violation:

```tsx
// ❌ inside a condition
if (isOpen) { const [x] = useState(0); }

// ❌ inside a loop
for (const tag of tags) { const [selected] = useState(false); }

// ❌ after an early return
if (!user) return <Login />;
const [prefs] = useState({});

// ❌ inside a nested function (even if that function is called during render)
const handleClick = () => { const [x] = useState(0); };

// ❌ inside try/catch — the catch path would skip the hook list
try { const [x] = useState(0); } catch { /* … */ }

// ❌ inside a callback passed to Array.prototype.sort/map/filter
products.sort((a, b) => { const [x] = useState(0); return 0; });
```

Every one of these is fine:

```tsx
// ✅ straight-line calls at the top of the component's body
const [isOpen, setIsOpen] = useState(false);
const [items, setItems] = useState<Item[]>([]);
const total = useMemo(() => items.reduce((sum, i) => sum + i.priceMinor, 0), [items]);
useEffect(() => { /* … */ }, []);

// ✅ conditions AFTER the hooks
if (!isOpen) return null;

// ✅ custom hooks (their internals are the custom hook's business)
const cart = useCart();
const query = useSearchQuery();
```

The reframe that makes this natural: **hooks are the component's *outputs*, not its *logic*.** They run unconditionally, in a fixed order, every render. Branching happens *after* them, in JSX or in early returns.

---

## 5. The naming rule, and why it matters

React (and its linters) treat a function as a component or a hook based on **its name**:

| Name | Treated as | May call hooks? |
| --- | --- | --- |
| `CartPanel`, `ProductCard`, `Toast` | a component | yes |
| `useCart`, `useDebouncedValue`, `useKeyDown` | a custom hook | yes |
| `cartReducer`, `formatMoney`, `stockLevel` | an ordinary function | **no** |
| `CartPanelInner`, `_useThing` | a component / a hook (by the capital letter / `use` prefix) | yes |

The linter uses the same heuristic, which is why `export function hookInPlainFunction(value: string) { const [state] = useState(value); }` is reported as:

```text
react-hooks(rules-of-hooks): React Hook "useState" is called in function "hookInPlainFunction" that is neither a React function component nor a custom React Hook function. React Component names must start with an uppercase letter. React Hook names must start with the word "use".
```

Two consequences worth remembering:

- **Renaming a function can change whether React treats it as a hook.** A typo like `usecounter` silently stops being a hook.
- **A function that starts with `use` but is called *conditionally* is a rule violation for its caller** — the whole name is a promise that hooks inside it run in a stable order.

---

## 6. The lint output, verbatim

The lab's linter is **oxlint 1.83.0** (the Vite React-TS template ships it instead of ESLint). Its `react-hooks` rules are on by default: `react/rules-of-hooks` is an error, `react/only-export-components` a warning.

We created a temporary file with four deliberate violations and ran:

```bash
npx oxlint --deny-warnings src/dev/__rules-bad.tsx
```

**Real output** (`/tmp/part4-lint.txt`), violations 1–4:

```text
  x react-hooks(rules-of-hooks): React Hook "useState" is called conditionally. React Hooks must be called in the exact same order in every component render.
   ,-[src/dev/__rules-bad.tsx:8:21]
 6 |   const [count, setCount] = useState(0);
 7 |   if (flag) {
   :       ^^|^
   :         `-- When this condition is false, this Hook is skipped.
 8 |     const [extra] = useState(10); // 1. hook called conditionally
   :                     ^^^^^^|^^^^^
   :                           `-- This Hook call is not reachable on every render path.
 9 |     return <span>{count + extra}</span>;
   `----
  help: Move the Hook call before the condition, or call it unconditionally and branch inside the Hook/effect instead.

  x react-hooks(rules-of-hooks): React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render.
    ,-[src/dev/__rules-bad.tsx:11:3]
 10 |       }
 11 | ,->   useEffect(() => {
 12 | |       setCount((c) => c + 1);
 13 | |->   }, []); // 2. hook after a conditional early return
    : `---- This Hook call is not reachable on every render path.
 14 |       return <span>{count}</span>;
    `----
  help: Move the Hook call before the condition, or call it unconditionally and branch inside the Hook/effect instead.

  x react-hooks(rules-of-hooks): React Hook "useState" may be executed more than once. Possibly because it is called in a loop. React Hooks must be called in the exact same order in every component render.
    ,-[src/dev/__rules-bad.tsx:20:21]
 18 |   const values: string[] = [];
 19 |   for (const item of items) {
    :   ^|^
    :    `-- This loop may execute the Hook more than once.
 20 |     const [value] = useState(item); // 3. hook called inside a loop
    :                     ^^^^^^^|^^^^^^
    :                            `-- Hook is called here
 21 |     values.push(value);
    `----

  x react-hooks(rules-of-hooks): React Hook "useState" is called in function "hookInPlainFunction" that is neither a React function component nor a custom React Hook function. React Component names must start with an uppercase letter. React Hook names must start with the word "use".
    ,-[src/dev/__rules-bad.tsx:27:19]
 26 | export function hookInPlainFunction(value: string) {
    :                 ^^^^^^^^^|^^^^^^^^^
    :                          `-- Outer function
 27 |     const [state] = useState(value); // 4. hook in a function that is not a component
    :                   ^^^^|^^^
    :                       `-- Hook is called here
 28 |   return state;
    `----
```

Every message follows the same shape: **what is wrong, where, and what to do about it.** Two of the four come with the fix ("Move the Hook call before the condition…"). Linting is not optional here — these are bugs that TypeScript cannot see and that testing will only find by accident.

The same file also produced two warnings that are *not* about hook order, and they are worth reading because they show what the linter expects from modern React code:

```text
  ! react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders
    ,-[src/dev/__rules-bad.tsx:12:5]
  help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
```

```text
  ! react(only-export-components): Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components.
```

That second warning is the one we hit for real while building the lab, and fixed by moving `stockLevel` and `STOCK_LABELS` into `src/data/stock.ts` (Part 3, file 04, section 8).

---

## 7. The `exhaustive-deps` rule

`rules-of-hooks` protects *order*. Its sibling protects *correctness of dependencies*: **every reactive value the effect reads must appear in the dependency array.**

The lab harness (`src/dev/effect-probe.tsx`) contains a deliberate violation — an effect that reads `count` but declares no dependencies — and the linter says:

```text
  ! react-hooks(exhaustive-deps): React Hook useEffect has a missing dependency: 'count'
     ,-[src/dev/effect-probe.tsx:151:8]
 141 |       const staleTimer = setInterval(() => {
 142 |         intervalLog.push(`stale closure sees count=${count}`);
     :                                                      ^^|^^
     :                                                        `-- useEffect uses `count` here
```

A second kind of warning appears when a dependency is new *every* render:

```text
  ! react-hooks(exhaustive-deps): React hook useEffect depends on `options`, which changes every render
     ,-[src/dev/effect-probe.tsx:115:9]
 103 |     const options = { page: 1 }; // a NEW object on every render
```

Both are the same rule seen from two sides. File 03 measured the consequences:

```text
2. how often does each effect run over 3 renders (1 mount + 2 updates)?
   no array           : 3 runs
   []                 : 1 run
   [value]            : 2 runs   (value changed once)
   [{ page: 1 }]      : 3 runs   (a fresh object !== last render's object)
```

**How to fix a missing dependency — in this order:**

| Fix | When it applies | Example |
| --- | --- | --- |
| Add the dependency | The effect should re-run when it changes | `useEffect(..., [count])` |
| Use the updater form instead of reading the value | You only need the latest value to compute a new one | `setCount((c) => c + 1)` inside an interval |
| Move the value into a ref, and keep the ref current | You need the latest value *without* re-subscribing | the `latest.ref` pattern in `useKeyDown` (file 09) |
| Move the code **out** of the effect | Most common real answer | compute during render, or move it to the event handler |
| Wrap a function/object in `useCallback`/`useMemo` | The dependency is a function or object re-created every render | file 08 |

⚠️ **When is `eslint-disable-next-line react-hooks/exhaustive-deps` acceptable?** Almost never, and only with a comment that says why. The one legitimate pattern is an effect that must run *once* on mount and intentionally captures mount-time values:

```tsx
useEffect(() => {
  trackPageView({ path: initialPath }); // deliberately only on mount
  // Run once on mount: `initialPath` is intentionally captured, not tracked.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

If you cannot write that comment convincingly, you have a bug, not an exception. In the lab's four harness files we never disabled the rule — instead the harnesses *are* the demonstration of why the rule exists.

---

## 8. Debugging hook errors: a checklist

**"Invalid hook call"** — React lists three possible causes; check them in this order:

1. **Is the hook called inside a component or custom hook body?** Look for it in an event handler, a `setTimeout`, a promise callback, an async function, a loop, or a condition. (Most common by far.)
2. **Are there two copies of React?** Symptom: hooks work in some files and throw in others. Check `npm ls react react-dom` (both should appear once) and that no dependency bundles its own React. With npm/yarn workspaces this happens when a package lists React as a dependency instead of a peer dependency.
3. **Is `react-dom` (or the test renderer) the same version as `react`?** A mismatched pair produces the same message.

**"Rendered more/fewer hooks than …"** — React printed a numbered table. Compare the two columns:

1. Find the **first** row where the columns differ. That is the hook that changed identity (in the example above: row 2, `undefined` vs `useState`).
2. Go to that hook in the code and ask "can this line be skipped on some renders?" Usual suspects: a hook inside `if`, a hook after a `return`, a hook inside a `try`, a custom hook that early-returns before calling its last hook, a hook inside `items.map(...)`.
3. Fix by moving the hook **above** the condition, and branch afterwards — or split the component in two and render one of them (Part 3, file 10: different component types get separate state anyway).

**"The state is wrong / swapped between two fields"** — the silent version of the same bug, usually caused by changing the *number* of hooks in a custom hook between renders. Reproduce with React DevTools (the hooks panel shows the order for a selected component) before reading code.

💡 **A useful habit:** keep every component's hook calls in one block at the top, in the same order, with no blanks between them. Your eye then catches an intruder — a `useEffect` that drifted below a `return` — instantly. It also makes the "hook list" visible on the page.

---

## 9. Getting the lint running

### In this course's lab (oxlint, already configured)

The template's `package.json` has:

```json
{ "scripts": { "lint": "oxlint" } }
```

and the generated `.oxlintrc.json` enables the React rules:

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

(The installed version in the lab is **oxlint 1.83.0** — `npx oxlint --version` prints `Version: 1.83.0`.)

```bash
npm run lint
```

**Expected result:** `Found 0 warnings and 0 errors.` on the finished lab, because every deliberate violation lives in a temporary dev file that we delete afterwards.

### In an ESLint project (the official plugin, v7.x)

```bash
npm install --save-dev eslint-plugin-react-hooks
```

```js
// eslint.config.js — flat config (ESLint 9+)
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  reactHooks.configs.flat.recommended,
]);
```

The `recommended` preset contains `rules-of-hooks`, `exhaustive-deps`, and — new in v7, and the future of linting React — the **React Compiler diagnostics**: `globals`, `immutability`, `purity`, `refs`, `set-state-in-effect`, `set-state-in-render`, `static-components`, `use-memo`, `preserve-manual-memoization`, `component-hook-factories`, `error-boundaries`, `incompatible-library`, `unsupported-syntax`, `config`, `gating`. If you want the experimental ones as they land, use `reactHooks.configs.flat['recommended-latest']`.

You can already see one of those rules firing in our lab: oxlint 1.83 reports `react(globals)` ("Cannot reassign variables declared outside of the component/hook") for the render-counting trick our temporary probes used, and `react(immutability)` for a probe that mutated state on purpose.

💡 **Do not panic about that list.** React's own documentation says the compiler *skips* the components that contain an unsupported pattern and keeps compiling the rest, so you can adopt these rules gradually and fix violations at your own pace. The first two rules — `rules-of-hooks` and `exhaustive-deps` — are the ones that catch actual bugs today.

---

## 10. Common mistakes

| # | Mistake | What happens | Fix |
| --- | --- | --- | --- |
| 1 | A hook inside an `if` | `Rendered more/fewer hooks…` at some later render | call it unconditionally; branch afterwards |
| 2 | A hook after an early `return` | same | move all hooks above every `return` |
| 3 | A hook inside `items.map(...)` | "may be executed more than once" | lift the hook out; make a child component and render it per item |
| 4 | A hook in an event handler or callback | `Invalid hook call…` | compute in the handler; use hooks at the top of the component |
| 5 | A hook in a plain helper (`formatThing`) | `Invalid hook call` / lint error | rename to `useThing` **and** call it only from a component or another hook — or remove the hooks |
| 6 | Two copies of React in the tree | `Invalid hook call` in *some* files only | align versions; make React a peer dependency in libraries |
| 7 | Calling a hook from a class method | `Invalid hook call` | use function components (class components are legacy — Part 1, file 11) |
| 8 | Conditional `useEffect` "to control when it runs" | hook-order error | always call it; control the re-run with dependencies or an early-return *inside* the effect |
| 9 | A custom hook that sometimes returns early before its last hook | hook-order error inside the custom hook, blamed on the caller | keep every hook call unconditional inside the custom hook |
| 10 | A hook in a `try`/`catch` | hook-order error | move it out; handle errors inside the effect |
| 11 | Ignoring `exhaustive-deps` warnings | stale values, effects that never re-run, or effects that re-run forever | fix the dependency list, or restructure (section 7) |
| 12 | Disabling the rules to "make it build" | bugs that only appear on some interaction paths | fix the structure; the rules are the design, not the obstacle |

---

## 11. Best practices

1. **Keep every hook call in one unconditional block at the top** of the component, before any branching, in a readable order.
2. **After the hooks, branch freely** — early returns, conditionals, `switch` statements. That is where logic belongs.
3. **Extract hooks, not JSX, when a component grows.** A custom hook keeps the order rule automatically; a nested function that returns JSX does not.
4. **Let the linter run in CI** (`npm run lint` in the pipeline). A `rules-of-hooks` error is a bug that no type checker can find.
5. **Treat `exhaustive-deps` as a design conversation.** It is usually telling you "this effect is doing two jobs".
6. **Never disable the rules inline-only.** If a disable is truly needed, add the reason in the comment above it.
7. **Read the hook-order table before reading the code.** It tells you the exact row where the order changed.
8. **Keep custom hooks free of early returns before the last hook.** Move the early return after the hook calls, and branch on the resulting values.
9. **Name things correctly**, since names decide treatment: `CartPanel` (component), `useCart` (hook), `cartReducer` (plain function).
10. **Do not fight StrictMode.** Double invocation, hook-order checks and the compiler lints all exist to surface these bugs in development.

---

## 12. Practice

### Beginner — fix the broken counter component

The following component "works" until you click the button. Fix it, then explain what React printed and why.

```tsx
function Greeting({ name, showCount }: { name: string; showCount: boolean }) {
  const [count, setCount] = useState(0);

  if (showCount) {
    const [clicks, setClicks] = useState(0);
    return (
      <p>
        Hi {name}, {clicks} clicks
        <button type="button" onClick={() => setClicks(clicks + 1)}>
          +
        </button>
      </p>
    );
  }

  const [greeted, setGreeted] = useState(false);
  return (
    <p>
      Hi {name}
      {greeted ? ' (again)' : ''}
      <button type="button" onClick={() => setGreeted(true)}>
        Greet
      </button>
      {count}
    </p>
  );
}
```

### Intermediate — extract a custom hook without breaking the rules

The component below is doing three jobs. Move all of the state and logic into a custom hook `useDraftEditor(initialText: string)`, so that the component body contains only hook *calls* followed by JSX. Do not change the behaviour.

```tsx
function DraftEditor({ initialText }: { initialText: string }) {
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(initialText);
  const [saving, setSaving] = useState(false);

  const isDirty = text !== saved;

  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      setSaving(true);
      localStorage.setItem('draft', text);
      setSaved(text);
      setSaving(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [text, isDirty]);

  useEffect(() => {
    document.title = isDirty ? '• Draft' : 'Draft';
  }, [isDirty]);

  return (
    <section>
      <textarea value={text} onChange={(e) => setText(e.currentTarget.value)} />
      <p>
        {saving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'All changes saved'}
      </p>
    </section>
  );
}
```

Then run the linter on your version and fix anything it reports (there are two things it will say).

### Challenge — a data-fetching hook that satisfies every rule

Write `useProductQuery(id: string)` in `src/practice/useProductQuery.ts`:

- State: `{ status: 'idle' | 'loading' | 'error' | 'success'; data?: Product; message?: string }` as a discriminated union (file 02, section 8.3). No `useState` per field.
- Fetching: `useEffect` that fetches `/api/products/${id}` when `id` changes, cancels the previous request with `AbortController`, and ignores `AbortError`.
- A `retry()` function that is **stable** across renders (`useCallback`) and re-runs the fetch.
- A `refetch` counter kept in a ref... no: keep it in state, and explain in a comment why a ref would *not* work here (hint: what has to re-render?).
- Every hook call unconditional, in one block, with the dependency array passing `exhaustive-deps`.
- A `case` for each state in the component that consumes it, with a `never` check.

Then write the consuming component (`src/practice/ProductLoader.tsx`) that renders a spinner, an error with a Retry button, or the product name and price (`formatMoney`).

---

## 13. Solutions

### Beginner

```tsx
function Greeting({ name, showCount }: { name: string; showCount: boolean }) {
  // Every hook runs on EVERY render, in this fixed order.
  const [count, setCount] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [greeted, setGreeted] = useState(false);

  // Branching happens after the hooks — that is the whole trick.
  if (showCount) {
    return (
      <p>
        Hi {name}, {clicks} clicks
        <button type="button" onClick={() => setClicks((c) => c + 1)}>
          +
        </button>
      </p>
    );
  }

  return (
    <p>
      Hi {name}
      {greeted ? ' (again)' : ''}
      <button type="button" onClick={() => setGreeted(true)}>
        Greet
      </button>
      {count}
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        count
      </button>
    </p>
  );
}
```

What React printed: `Rendered more hooks than during the previous render.` with the order table. The original had **two** `useState` calls when `showCount` was true (cells 0 and 1) and **three** when it was false (cells 0, 1, 2) — because both branches declared their own extra state. Toggling `showCount` therefore changed the number of cells, and React refused to guess which cell meant what.

Note that the fixed version also keeps the *values* separate, which is the behaviour a user would expect: toggling the prop no longer resets `clicks` or `greeted`. In the broken version those two states shared cell 1, so they overwrote each other.

### Intermediate

**File: `src/practice/useDraftEditor.ts`**

```ts
import { useEffect, useState } from 'react';

export interface DraftEditorApi {
  text: string;
  setText: (next: string) => void;
  isDirty: boolean;
  saving: boolean;
}

/**
 * Owns the draft's memory and its two effects. The component only renders.
 * Every hook call below is unconditional, in a fixed order — the order the
 * linter would check if this were a component.
 */
export function useDraftEditor(initialText: string, storageKey = 'draft'): DraftEditorApi {
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(initialText);
  const [saving, setSaving] = useState(false);

  // Derived, not stored.
  const isDirty = text !== saved;

  useEffect(() => {
    if (!isDirty) return; // ← an early return INSIDE the effect is fine: the hook itself ran
    const timer = setTimeout(() => {
      setSaving(true);
      localStorage.setItem(storageKey, text);
      setSaved(text);
      setSaving(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [text, isDirty, storageKey]);

  useEffect(() => {
    const previous = document.title;
    document.title = isDirty ? '• Draft' : 'Draft';
    return () => {
      document.title = previous;
    };
  }, [isDirty]);

  return { text, setText, isDirty, saving };
}
```

**File: `src/practice/DraftEditor.tsx`**

```tsx
import { useDraftEditor } from './useDraftEditor';

export function DraftEditor({ initialText }: { initialText: string }) {
  const { text, setText, isDirty, saving } = useDraftEditor(initialText);

  return (
    <section>
      <textarea value={text} onChange={(event) => setText(event.currentTarget.value)} />
      <p>{saving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'All changes saved'}</p>
    </section>
  );
}
```

Two things the linter said about the original, both now fixed:

1. `exhaustive-deps` on the second effect: `document.title` is set from `isDirty`, and the effect used `[isDirty]` — correct — but the *first* effect read `localStorage` and `text` while writing `saved`; the array was complete, yet `storageKey` (a new parameter in the refactor) had to be added to keep the effect honest.
2. `react(set-state-in-effect)`: setting `saving` synchronously inside the effect triggers a second render per save. That one is *intentional* here (the save is genuinely asynchronous work), and the "help" text of the rule itself lists the acceptable use: "use an effect only when synchronizing with an external system" — `localStorage` and the document title are exactly that. Keeping it in a custom hook also means the warning has a single, reviewable home instead of being scattered through components.

### Challenge

**File: `src/practice/useProductQuery.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import type { Product } from '../data/products';

export type QueryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: Product };

export interface ProductQueryApi {
  state: QueryState;
  retry: () => void;
}

export function useProductQuery(id: string): ProductQueryApi {
  const [state, setState] = useState<QueryState>({ status: 'idle' });

  // The refetch counter MUST be state: something has to re-render when it changes,
  // and a ref would change silently (file 04). It is also part of the effect's
  // dependencies, which is what makes `retry()` actually start a new request.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetch(`/api/products/${id}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        if (controller.signal.aborted) return undefined; // a response can still land after abort()
        return response.json() as Promise<Product>;
      })
      .then((data) => {
        if (data === undefined) return; // aborted between response and parse
        setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return; // cancelled on purpose
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      });

    return () => {
      controller.abort(); // cancels the request when id changes or on unmount
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
```

**File: `src/practice/ProductLoader.tsx`**

```tsx
import { formatMoney } from '../data/products';
import { useProductQuery } from './useProductQuery';

export function ProductLoader({ id }: { id: string }) {
  const { state, retry } = useProductQuery(id);

  switch (state.status) {
    case 'idle':
    case 'loading':
      return <p role="status">Loading…</p>;
    case 'error':
      return (
        <div role="alert">
          <p>Could not load the product: {state.message}</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      );
    case 'success':
      return (
        <p>
          {state.data.name} — {formatMoney(state.data.priceMinor)}
        </p>
      );
    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled query state: ${JSON.stringify(unhandled)}`);
    }
  }
}
```

Why the retry counter cannot be a ref: a ref change does not re-render, so the effect would never re-run — you would have written a "Retry" button that does nothing visible while changing a number nobody reads. State is the correct home for anything that must *cause* work. (The reverse is also covered in file 04: a timer id or an `AbortController` must *not* be state, because you do not want a render for it.)

---

## 14. Summary

- Hooks are matched to their memory **by call order**, so the order must be identical on every render.
- **Rule 1:** call hooks at the top level of a component or custom hook — never in conditions, loops, nested functions, `try`/`catch`, or after an early return.
- **Rule 2:** call hooks only from React function components and custom hooks — never from handlers, plain functions, class methods, or module scope.
- Violations produce four messages worth recognising: `Rendered more hooks than during the previous render.`, `Rendered fewer hooks than expected.`, the hook-order **table**, and `Invalid hook call. Hooks can only be called inside of the body of a function component.`
- The `react-hooks(rules-of-hooks)` lint catches all of this **before** you run anything; the messages name the hook, the file, the line, and the fix.
- **`exhaustive-deps`** is the second half of the story: every reactive value an effect reads belongs in its dependency array. Fix it by adding the dependency, using the updater form, using a ref for "latest value", or — most often — moving the code out of the effect.
- Names decide treatment: `PascalCase` for components, `useSomething` for hooks, `camelCase` for everything else.
- Because the rules make hook order static, tools can reason about your code: Fast Refresh can swap a module in place, and React Compiler can optimise components automatically. The rules are not paperwork; they are what makes the ecosystem work.
- The new compiler-era lints (`globals`, `immutability`, `refs`, `set-state-in-effect`, `set-state-in-render`, `purity`, …) extend the same idea: components must be pure, and impurities are reported in development instead of corrupting state in production.

---

**What's next →** [`../05-react-concepts/01-component-communication.md`](../05-react-concepts/01-component-communication.md): components rarely work alone. Part 5 starts with the four ways components talk to each other — props down, callbacks up, siblings through a parent, and the escape hatch — then builds a real toolbar, a filter panel and a details pane on top of the state you now know how to model.
