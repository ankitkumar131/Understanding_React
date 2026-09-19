# 01 — State: The Idea Before the Hooks

> **Part 4 · State and Hooks · File 1 of 10**
> Why this file exists: hooks are the *tools*; state is the *idea*. Every hook in this part (`useState`, `useReducer`, `useRef`, `useMemo`, `useCallback`, `useContext`) exists to answer a question about memory and time inside a component. If you learn the tools without the idea, you will write code that "works" and still fights you on every third feature. So we start with the idea, prove it in the browser, and only then open the toolbox.

---

## 1. What "state" means in React

**State is the memory of a component: the data that can change while the component is on screen, and whose change must be reflected on screen.**

Three parts of that sentence matter, and each one is a boundary:

| Part | What it excludes |
| --- | --- |
| "the data that can change" | Constants that never change — the site title, a currency symbol, a tax rate. Those are not state; they can be module constants. |
| "while the component is on screen" | Data that is alive for one click — a local variable inside a handler, the value of `event.target`. That is not state either. |
| "whose change must be reflected on screen" | Data that changes but never affects the rendered output — a timer id, a counter of "how many times this effect ran", an in-flight `AbortController`. Those are *refs* (file 04), not state. |

A working definition you can apply in five seconds:

> **If the user can see it and it can change, it is probably state.
> If it can change but the user cannot see it, it is probably a ref (or a plain variable).
> If it can be computed from something the user can see, it is not state at all.**

That last line is the one beginners break most often. If you store `visibleProducts` in state *and* `query` in state, you now have two sources of truth and a promise to keep them in sync with every keystroke. Compute it instead:

```tsx
// ❌ two sources of truth — you must remember to update both, forever
const [query, setQuery] = useState('');
const [visibleProducts, setVisibleProducts] = useState(products);

// ✅ one source of truth, derived on every render
const [query, setQuery] = useState('');
const visibleProducts = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
```

The first version is not "wrong" in the sense of throwing an error. It is wrong in the sense of *tomorrow*: every new feature (a category filter, a sort control, a "clear" button) has to update both pieces of state in the right order, and one day a code path will forget.

---

## 2. Why a plain variable does not work

Here is the version every beginner writes first:

```tsx
// src/App.tsx — the broken version
export default function App() {
  let count = 0;

  return (
    <button
      onClick={() => {
        count += 1; // changes a variable
        console.log('count is now', count);
      }}
    >
      Clicked {count} times
    </button>
  );
}
```

**File: `src/App.tsx`** · **Run:** `npm run dev` (from the lab, file 03) · **Expected result in the console:** every click logs `count is now 1`, `count is now 1`, `count is now 1`… and the button never changes.

Two separate things are broken, and you must understand both.

### 2.1 The variable is recreated on every render

An event handler can only run after React has rendered *something*. When you click, the handler from the last render runs, increments *that render's* `count`, and logs `1`. Then, if React renders again for any reason (a parent's state changed, a prop changed, Hot Module Replacement reloaded the file), the component function runs from the top, `let count = 0` executes again, and the number is gone.

A local variable is a **new box on every render**. It is not a place to keep anything.

### 2.2 Changing a variable does not ask React to re-render

Even if the value survived, React has no idea it changed. React is not watching your variables (it cannot — JavaScript has no "watch this variable" feature for locals). Nothing about `count += 1` tells React "the screen is now out of date".

This is the part that trips people up when they come from jQuery or vanilla DOM code. There, *you* updated the screen and the value at the same time:

```js
// vanilla: value and screen are updated by the same line of code
count += 1;
document.querySelector('#count').textContent = String(count);
```

In React you only update the value, in a specific way, and React does the screen for you:

```tsx
count is changed through a setter -> React re-renders -> the new JSX reaches the screen
```

So a React state update is a *request*, not an assignment. And because it is a request, **reading the value right after the call is a bug**:

```tsx
onClick={() => {
  setCount(count + 1);
  console.log(count); // ← still the OLD value. Always. 
}}
```

This is not a quirk to memorise; it follows from what state is: a snapshot that belongs to one render (section 5).

---

## 3. The mental model: UI is a function of state

React's core claim fits in one line:

```
UI = f(state)
```

Given the same state, the same JSX comes out. Given new state, React compares the new JSX with the old one and updates only what differs (that is Part 3's tree diffing, file 10).

Trace it through the counter:

```text
state = 0   ->  f(0)   ->  <button>Clicked 0 times</button>
click       ->  setCount(1)  (a request)
state = 1   ->  f(1)   ->  <button>Clicked 1 times</button>
React diffs: only the text node changed -> it writes "Clicked 1 times"
```

You never wrote "change the text of the button". You wrote "the button's text is a function of the count", and React worked out the change. That is what *declarative* means in practice: **you describe the destination; React drives.**

<details>
<summary>Do not go further until this answers itself: what does <code>f</code> receive as input in a real component?</summary>

Whatever the component read during that render: props from its parent, all of its state, context values, and module constants. Anything else the component reads — `Math.random()`, `new Date()`, a global `let`, a mutable array from a module — is *outside* the door and breaks the `UI = f(state)` story. That is why Part 3 insisted on pure components, and why this part keeps insisting on it too.
</details>

---

## 4. The smallest real example

The lab already has this; we will now read it with state in mind.

**File: `src/components/SearchBar.tsx`** (excerpt, the real file from the lab)

```tsx
export function SearchBar({ onSearch, placeholder = 'Search products…', initialQuery = '' }: SearchBarProps) {
  // This component keeps its OWN draft state; the parent only hears about
  // committed searches.
  const [query, setQuery] = useState(initialQuery);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.currentTarget.value);
  };

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <form className="search" onSubmit={handleSubmit} role="search">
      <label htmlFor="product-search">Search</label>
      <input
        id="product-search"
        type="search"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
      />
      {/* … */}
    </form>
  );
}
```

Line by line, as a state lesson:

| Line | What it means for state |
| --- | --- |
| `useState(initialQuery)` | "This component has a memory slot. Its first value is `initialQuery`." `useState` returns the current value **and** the function that asks for a change. |
| `const [query, setQuery] = …` | Destructuring the returned pair. `query` is a snapshot for *this render*; `setQuery` is stable across renders. |
| `value={query}` | The input is *controlled*: the DOM is not the owner of the text, state is. Between renders they are guaranteed to agree. |
| `setQuery(event.currentTarget.value)` | The only place the draft changes. One writer. |
| `onSearch('')` next to `setQuery('')` | Two different responsibilities: local draft state, and the *committed* query the parent owns. This is a real pattern, and it is worth stealing. |

Notice what is **not** state here: the placeholder (a prop with a default), the label, the CSS class, the `id`. None of them change as the user types.

---

## 5. A snapshot per render (the single most useful mental model)

Here is the sentence to remember:

> **Every render sees a frozen snapshot of state. Inside one render, `count` cannot change.**

That is why `console.log(count)` right after `setCount(count + 1)` prints the old value, why an event handler created in render N keeps seeing render N's values (this is the "stale closure" idea we prove in file 03), and why two calls in the same handler both see the same starting number:

```tsx
onClick={() => {
  setCount(count + 1); // 0 + 1 = 1
  setCount(count + 1); // still 0 + 1 = 1, because `count` is 0 in this snapshot
}}
```

*Verified in the lab harness (`src/dev/state-probe.tsx`, temporary): two plain calls in one click moved the counter from 0 to **1**, in **one** re-render. Two `setCount(c => c + 1)` calls moved it to **2**.*

The snapshot rule also explains a rule you will meet again in file 08: a callback created in render N captures render N's values forever, unless something makes it re-create.

<details>
<summary>Why is the snapshot model "useful" rather than "annoying"?</summary>

Because it makes each render a pure function of its inputs. A pure function is easy to reason about, easy to test (Part 13), and safe for React to interrupt, restart, or run twice (that is what StrictMode does, and what Concurrent Rendering relies on). If state could change mid-render, the JSX you are returning could be half-old, half-new — the class of bug that made single-page apps hard to trust. React trades a little surprise ("why is my log stale?") for a lot of predictability.
</details>

---

## 6. Why the UI gets its own copy: the "no re-render" rule

A question that looks naive and is actually the heart of the matter:

> If state is just data in memory, why can't I change it directly?

```tsx
const [cart, setCart] = useState<CartLine[]>([]);

cart.push({ productId: 'p1', quantity: 1 }); // ❌ React never hears about this
```

Because React finds out that something changed only when a **setter** is called. React then schedules a re-render, runs your component again, gets a new JSX tree, and compares it with the previous one. Direct mutation bypasses the "please re-render" step entirely — the array really does contain your new line, and the screen will keep showing the old one until some *other* update happens to re-render the component. (Then the mutation leaks into the UI, which makes the bug look random: it works after you click something unrelated.)

*Verified in the lab harness (`src/dev/state-probe.tsx`): a component rendered “Asha”, the handler did `user.name = 'Bela'; setUser(user);` → the screen still said **"Asha"**, and the render count stayed at **1**; after an *unrelated* state update the screen said **"Bela"**; after `setUser({ ...user, name: 'Chetan' })` it said **"Chetan"** immediately.*

We will dissect that experiment line by line in file 02. Keep the conclusion for now:

> **New value → new object → call the setter. Mutate + set the same object → nothing happens (and then something weird happens later).**

---

## 7. Where state lives

React has no global "state store" that you opt into. State belongs to a **position in the tree**:

- A component that calls `useState` owns that state.
- The state survives re-renders of that component and of its parents, as long as the component *stays mounted*.
- The state is destroyed when the component unmounts (Part 3, file 10: switching a branch unmounts its subtree, and state goes with it — we measured `2 → 0` after hiding a counter with `&&`).
- If several components need the same data, you **lift it up** to their closest common parent and pass it down as props (Part 3, file 08), or share it through context (`useContext`, file 05) / a store (Part 5+).

There is one more rule that surprises people, and Part 3 already proved it with keys:

> **Identity in the tree, not identity of the variable, decides which state belongs to which instance.** Rendering `<Counter key="a" />` and `<Counter key="b" />` creates two independent memories. Changing the `key` throws the old memory away and starts a new one.

*Verified in the lab (`src/dev/state-probe.tsx`): a component with `useState(initialCount)` kept `count=3` after the prop changed from `1` to `99`; changing `key="reset"` re-mounted it and the state restarted at **99**.*

That single fact replaces a whole category of "sync state with props" effects. If you want a component's state to reset when its subject changes, change its `key`.

---

## 8. The three questions to ask before adding state

Ask these in order, every time. They will save you more code than any hook.

**1. Can it be derived?** If yes, compute it during render.
`subtotal`, `itemCount`, `isCartEmpty`, `filteredProducts`, `visiblePages`, `isSoldOut` — all of these in the lab's `useCart`/`App` are computed, not stored.

**2. Does it belong to the parent?** If two siblings need it, or if it survives a screen change, lift it.
The committed search query belongs to `App`, not to `SearchBar` — that is exactly why `SearchBar` reports `onSearch(query)` and keeps only the draft.

**3. Will the user notice it change?** If not, it is not state.
A `requestId` used to ignore stale responses, a timer id, "has this component mounted yet", a DOM node — all refs (file 04), because changing them must *not* cause a render.

If the answer to all three is no, you have found real state: something the user can see, that the component owns, that cannot be computed.

---

## 9. State vs props vs derived values vs refs

| | Owned by | Changes? | Read during render? | Causes a re-render? | Typical examples |
| --- | --- | --- | --- | --- | --- |
| **Props** | the parent | yes (parent decides) | yes | yes (when the parent re-renders with new values) | `product`, `onAddToCart`, `children` |
| **State** | this component (via its setter) | yes | yes | yes, that is its job | `query`, `category`, `cart`, `isOpen` |
| **Derived value** | nobody — recomputed | n/a | yes | no (it follows the render) | `filteredProducts`, `itemCount`, `subtotalMinor` |
| **Ref** | this component (via `.current`) | yes | *should not* (escape hatch) | **no** | timer ids, DOM nodes, `AbortController`, "latest value" holders |
| **Module constant** | the file | no | yes | no | `CATEGORIES`, `MAX_PER_LINE`, `STOCK_LABELS` |

A useful sanity check: for every piece of state you declare, you should be able to point at **the code that changes it** and **the JSX that shows it**. If you cannot point at the JSX, it is probably a ref. If you cannot point at the code that changes it (because it changes elsewhere), you have a synchronisation problem waiting to happen.

---

## 10. Runtime behaviour: what actually happens on a click

This is the sequence for `setQuery('monitor')` inside a click handler. Nothing here is magic; it is worth reading once slowly.

```text
1. The user clicks. React's event system calls your handler.
2. The handler runs to completion. `setQuery('monitor')` does NOT re-render
   immediately; React marks the component as "needs a re-render" and, since we
   are inside a React event, it batches everything into one update.
3. The handler returns. React now processes the batch.
4. React calls your component function again (the RENDER phase).
   `useState` returns the NEW value because React looks it up by position in the
   component's hook list.  ← this is why hook order matters (file 10)
5. React builds a new JSX tree and compares it with the previous one.
6. React applies the minimal set of DOM changes (the COMMIT phase).
7. The browser paints the new pixels.
8. After the paint, effects run (file 03): subscriptions, timers, title updates.
```

Two consequences that trip up beginners, both of them tested in file 02:

- **Steps 4–6 may not happen at all.** If the new value is identical (`Object.is`) to the old one, React may skip the render entirely. State that *looks* like it changed (a mutated object) therefore produces no update.
- **Step 2 can produce more than one render.** Updates are batched — two setters in one handler produce one render — unless you force React's hand (`flushSync`) or your update happens in an async callback (a `setTimeout`, a promise `.then()` — those are separate tasks, so each gets its own batch).

---

## 11. Real-world example: three kinds of state in one feature

Consider MegaShop's "add to cart" feature. It contains one of each kind of data, and seeing them together makes the boundaries obvious.

| Data | Kind | Why |
| --- | --- | --- |
| `cart.lines` (with quantities) | **State** (`useReducer`, file 06) | The user sees it and changes it; it cannot be computed from anything else. |
| `itemCount` (`2`) | **Derived** | `lines.reduce(...)`. Storing it would let it drift out of sync. |
| `lastAddedName` (drives the toast) | **State** | It is visible (the toast) and it disappears on its own — there is no formula for "which product was added most recently". |
| `MAX_PER_LINE` (10) | **Constant** | Never changes; belongs to the cart's rules, not to a render. |
| The `AbortController` that cancels an in-flight checkout request | **Ref** (file 04) | Changing it must not re-render anything. |
| `visibleProducts` | **Derived** | `products.filter(...)`. We measured it: "8 of 8 → 2 of 8 → 0 of 8 → 8 of 8" in Part 3's trace, all from two pieces of state (`category`, `query`). |

One feature, six kinds of data, six different homes. Choosing correctly is what "knowing React" mostly means at this stage.

---

## 12. When *not* to use state

| Symptom in your code | What is probably wrong | Fix |
| --- | --- | --- |
| `useState` + `useEffect` that only copies state into other state | derived data stored | compute during render |
| Two states that must always agree (`items` and `itemCount`) | redundant state | one is derived; delete it |
| Contradictory states (`isLoading` and `isError` both true) | missing state machine | one union state: `'idle' \| 'loading' \| 'error' \| 'ready'` (file 06) |
| Props copied into state on mount | duplicated truth | use the prop directly, or `key` to reset (section 7) |
| State that only a handler reads (`hasSubmitted`) | a ref, or nothing at all | plain variable/ref (file 04) |
| A DOM node stored in state (`const [el, setEl] = useState<HTMLInputElement>()`) | DOM ≠ render input | `useRef` (file 04) |
| State updated during render (`if (x !== y) setZ(...)`) | render is not pure | derive, or use an effect — see file 03's demo of the lint rule `set-state-in-effect` |

Every row in that table is the same mistake wearing different clothes: **you are storing the answer instead of the question.** State should hold what the user has *done*; everything else should be computed from it.

---

## 13. Common mistakes

| # | Mistake | What you will see | Fix |
| --- | --- | --- | --- |
| 1 | `let count = 0` in a component and mutating it | clicks log the same number; button never changes | `useState` |
| 2 | Reading state right after calling the setter | always the old value | treat state as a snapshot; compute locally if you need the new value now |
| 3 | `setState(count + 1)` twice | +1 instead of +2 | functional updater: `setState((c) => c + 1)` (file 02) |
| 4 | Mutating state (`cart.push(...)`, `user.name = 'x'`) | nothing happens now; a wrong value appears later | create a new object/array (file 02) |
| 5 | Storing derived data | values drift apart; "why is the badge wrong?" | derive during render |
| 6 | Lifting state too far (everything in `App`) | every keystroke re-renders the whole page; prop lists of 12 items | keep state where it is used; lift only to the closest common parent |
| 7 | Lifting state not far enough | two components disagree; passing callbacks three levels down | lift, or use context (file 05) |
| 8 | Copying props into state | the component ignores later prop changes | use the prop, or remount with `key` |
| 9 | A state update inside render | infinite render loop, or a warning | move it to an event/effect; derive instead |
| 10 | Assuming a state update is synchronous (e.g. to measure the DOM right after) | measurements read the previous DOM | `useEffect`/`useLayoutEffect` (file 03) or `flushSync` when you truly must |

---

## 14. Best practices

1. **Model the user's actions, not the UI's pixels.** State should answer "what has the user done?" (`query`, `selectedCategory`, `cartLines`), not "what does the DOM look like?" (`isHighlighted`).
2. **One source of truth per fact.** If two pieces of state can disagree, merge or derive.
3. **Prefer flat, primitive state.** `useState<Record<string, boolean>>` for open rows beats nested objects; arrays of ids beat arrays of objects you have to keep in sync with the catalogue.
4. **Name the setter after the state:** `[query, setQuery]`, `[isOpen, setIsOpen]`, `[lines, setLines]`.
5. **Use unions for mutually exclusive states.** `'idle' | 'loading' | 'error' | 'success'` cannot produce `isLoading && isError`.
6. **Keep state local until you must lift it.** Every lift makes the parent bigger and adds props; do it for a reason (two consumers, or a lifetime longer than one subtree).
7. **Never mutate.** `[...lines, line]`, `{ ...product, priceMinor: 0 }`, `lines.map(...)`. Files 02 and 06 show the reason at runtime.
8. **Treat `key` as a tool, not a workaround.** Reset-on-change is a legitimate, documented use of `key` (section 7).

---

## 15. Practice

### Beginner — convert the broken counter

**File: `src/practice/Counter.tsx`**

```tsx
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Clicked {count} times</p>
      <button type="button" onClick={() => setCount(count + 1)}>
        Add one
      </button>
      <button type="button" onClick={() => setCount(0)}>
        Reset
      </button>
    </div>
  );
}
```

Add it to `App.tsx` (`<Counter />`) and click "Add one" five times.

**Expected result:** the paragraph reads `Clicked 0 times`, then `1`, `2`, `3`, `4`, `5`; "Reset" returns it to `0`. It even keeps working if you add an unrelated state elsewhere in the app — which is exactly what the `let` version fails to do (add a second counter and watch the first one keep its value: two instances, two memories).

### Intermediate — find the redundant state

This component has one piece of state that must not exist. Remove it, prove the screen is identical, and say which line you deleted and why.

```tsx
function CartSummary() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [count, setCount] = useState(0);
  const [empty, setEmpty] = useState(true);

  const add = (line: CartLine) => {
    setLines([...lines, line]);
    setCount(count + 1);
    setEmpty(false);
  };

  return (
    <div>
      <p>{count} items</p>
      {empty ? <p>Nothing here yet</p> : null}
      <button onClick={() => add({ productId: 'p1', name: 'Keyboard', unitMinor: 499900, quantity: 1 })}>
        Add keyboard
      </button>
    </div>
  );
}
```

### Challenge — a filter panel with one source of truth

Build `src/practice/FilterPanel.tsx` for the lab's product list:

- State: `query: string` and `category: 'all' | Category`.
- Derived during render: `visible` (the filtered products) and `counts` (how many products in each category).
- UI: a text input, a row of category buttons, and a line of text: `Showing 3 of 8 products`.
- No `useEffect`, no second piece of state that mirrors either of the two.

Then answer (in a comment): if the user picks a category that has zero matches for the current query, what does the UI show, and which single line of code decides that?

---

## 16. Solutions

### Beginner

No change needed — the code above is already the fixed version. The two things to notice: `count` is read through the snapshot of the current render (`{count}` in JSX, `count + 1` in the handler), and the only writer is a setter call.

**File: `src/components/Counter.tsx`** — if you want the lab-styled version with a `--` button, remember the floor: `setCount((c) => Math.max(0, c - 1))`. Using the updater form here is not decoration: two rapid clicks in the same task (a double-click, or a keyboard repeat) are batched, and `count - 1` twice would subtract only once.

### Intermediate

```tsx
function CartSummary() {
  const [lines, setLines] = useState<CartLine[]>([]);

  // Derived during render — recomputed from `lines`, never stored.
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  const empty = lines.length === 0;

  const add = (line: CartLine) => setLines([...lines, line]); // new array, not push

  return (
    <div>
      <p>{count} items</p>
      {empty ? <p>Nothing here yet</p> : null}
      <button onClick={() => add({ productId: 'p1', name: 'Keyboard', unitMinor: 499900, quantity: 1 })}>
        Add keyboard
      </button>
    </div>
  );
}
```

Both `count` and `empty` were derived, so both were deleted. The screen is unchanged, but now there is exactly one fact (`lines`) and two readers. You also removed two ways to get out of sync — including the bug that `setCount(count + 1)` already had (it counts *lines*, not *items*, and those differ the moment a quantity exceeds 1).

### Challenge

**File: `src/practice/FilterPanel.tsx`**

```tsx
import { useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, products, type Category } from '../data/products';

type CategoryChoice = Category | 'all';

export function FilterPanel() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryChoice>('all');

  // Both derived values are recomputed on every render. They are cheap here
  // (8 products); file 07 shows how to measure before reaching for useMemo.
  const needle = query.trim().toLowerCase();
  const visible = products.filter((product) => {
    const matchesCategory = category === 'all' || product.category === category;
    const matchesQuery = needle === '' || product.name.toLowerCase().includes(needle);
    return matchesCategory && matchesQuery;
  });

  const counts = CATEGORIES.map((c) => ({
    category: c,
    count: products.filter((p) => p.category === c).length,
  }));

  return (
    <section>
      <label htmlFor="filter-query">Search</label>
      <input id="filter-query" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />

      {[{ category: 'all' as const, count: products.length }, ...counts].map(({ category: c, count }) => (
        <button key={c} type="button" aria-pressed={c === category} onClick={() => setCategory(c)}>
          {c === 'all' ? 'All' : CATEGORY_LABELS[c]} ({count})
        </button>
      ))}

      <p>
        Showing {visible.length} of {products.length} products
      </p>
      <ul>
        {visible.map((product) => (
          <li key={product.id}>{product.name}</li>
        ))}
      </ul>
    </section>
  );
}
```

Answer to the closing question: the UI shows `Showing 0 of 8 products` and an empty list — and the single line that decides it is `return matchesCategory && matchesQuery;` combined with the category counts being computed from the **whole** catalogue (not from the filtered list). If you later want the counts to reflect the current search, that is one change in one place — which is the entire payoff of having a single source of truth.

---

## 17. Summary

- **State is a component's memory**: data that changes while the component is on screen, and whose change must be visible.
- A plain variable fails twice over: it is **recreated every render**, and changing it **never asks React to re-render**.
- React's model is `UI = f(state)`. You describe the destination; React performs the DOM updates.
- Each render gets a **snapshot** of state. Within a render, `count` will not change, however many setters you call.
- State is only updated through **setters**, which *request* a re-render. Mutating the value in place does nothing visible — until it does something confusing later.
- State **lives at a position in the tree** and dies when that position unmounts. Changing a `key` is a documented way to reset it.
- Before adding state, ask: can it be **derived**? does it belong to the **parent**? will the user **notice**? If the answers are no, no, no — you have real state.
- Know the difference between **props, state, derived values, refs and constants**. Choosing the right home for a piece of data is most of the skill.
- The four functions on screen in this chapter — `useState`, `useReducer`, `useRef`, `useMemo`/`useCallback` — are all just tools that answer these questions. The idea comes first; the tools come next.

---

**What's next →** [`02-usestate.md`](./02-usestate.md): the `useState` hook in full detail — its signature, lazy initialisation, batching, functional updates, object and array state, TypeScript typing, and a lab harness that traps the three classic bugs (the double `setCount(count + 1)`, the mutated object, and the prop copied into state) so you can see the wrong value on screen instead of imagining it.
