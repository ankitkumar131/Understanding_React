# 02 — Lifting State Up and the Single Source of Truth

> **Part 5 · React Concepts · File 2 of 9**
> Why this file exists: "lift the state up" is one of React's most-repeated phrases, and it is usually taught as a mechanical trick. It is really a rule about **ownership**: every piece of changing information gets exactly one owner, and everything else is derived from it. This chapter measures what happens when that rule is broken — two copies of a count drifting apart (`left=1 · right=0`), a piece of state sitting one level too high forcing an unrelated sibling to re-render, and a value copied from props into state becoming permanently stale — and then shows the two idioms that make those bugs impossible: **derive during render** and **reset with `key`**.

---

## 1. Two components, one fact

Some information is *shared*: the currently selected category, the search query, whether the cart is open. When two components need the same fact, there are only three ways to arrange it:

| Arrangement | What it looks like | Verdict |
| --- | --- | --- |
| **Duplicate** it — each component has its own `useState` | two independent boxes that happen to hold the same value *for now* | drifts the moment one is updated; the bug is guaranteed, just delayed |
| **Lift** it — the closest common parent owns it; children receive it as a prop | one box, two readers | the default answer |
| **Derive** it — one owner holds the base value, others compute from it | one box, zero copies | the answer when the second value is a function of the first |

The °C/°F converter from file 01 was the *derive* case (one number, the other computed). The category filter is the *lift* case (a choice made in one child, read by another). The failure mode is always the first row.

---

## 2. The failure, measured

**File: `src/dev/comm-probe.tsx`** — two sibling counters that were *intended* to be "the same" count, each with its own `useState`:

```tsx
function DisagreeingCounters() {
  const [leftCount, setLeftCount] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  // …two buttons, each bumping one of them
}
```

**Verified:**

```text
6. two copies of "the same" state after bumping one: left=1 · right=0
```

One click, and the two readings already disagree — forever. Nothing in React keeps two `useState` boxes in sync; `useState` initialises once and then belongs to its own component. The only way to make copies agree is to write synchronisation code (an effect, or a call in every handler), and that code is where the bugs live: it is skipped on a fast path, forgotten for a new input, or fires twice in StrictMode.

⚠️ **The tell-tale sign** you are looking at this bug in real code: a component with two or more `useState` calls that are *always* updated together in the same handler. That is one value wearing two hats. Merge it (or lift it).

---

## 3. The rule

> **Every piece of changing information has exactly one owner. Everything else is computed from it.**

Three consequences that make the rule usable:

1. **Base state** (things the user can change, things that come from outside) lives in a `useState`/`useReducer`, in exactly one component.
2. **Derived values** (totals, counts, filtered lists, formatted strings, booleans like `isEmpty`, `hasSelection`) are computed **during render** from the base state. They are never stored.
3. **The owner is the closest common ancestor** of every component that needs the value — not the top of the app by default.

The benefit is not tidiness for its own sake: it removes an entire category of bug. There is no code path that can leave a derived value stale, because there is no second value to be stale.

---

## 4. How to lift state: the recipe

Lifting is mechanical once you can see the destination. Four steps, always in this order:

1. **Find the closest common ancestor** of every component that reads or writes the value.
2. **Cut the `useState`** out of the child that owns it and **paste** it into that ancestor.
3. **Pass the value down** as a prop, and **pass a callback** for the change.
4. **Delete the child's state** and replace every `setX(...)` with a call to the callback.

Before — a review form and a review summary that must agree:

```tsx
// ❌ two components, two copies of the same draft
function ReviewForm() {
  const [draft, setDraft] = useState('');
  return <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

function ReviewSummary() {
  const [draft] = useState('');                 // ← always empty, forever
  return <p>Characters: {draft.length}</p>;
}
```

After — one owner, one value, one source of truth:

```tsx
// ✅ the parent owns the draft; both children read it
function ReviewPanel() {
  const [draft, setDraft] = useState('');

  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(draft); }}>
      <ReviewForm value={draft} onChange={setDraft} />
      <ReviewSummary text={draft} />
    </form>
  );
}

interface ReviewFormProps { value: string; onChange: (next: string) => void }

function ReviewForm({ value, onChange }: ReviewFormProps) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} />;
}

function ReviewSummary({ text }: { text: string }) {
  return <p>Characters: {text.length}</p>;
}
```

Notice what the two children became: `ReviewForm` is now a **controlled component** (its value comes from a prop — file 03) and `ReviewSummary` is a **pure presentational component**. Both are now trivially testable, and neither can drift.

💡 **The `value` + `onChange` prop pair is the signature of a lifted value.** When you see that pair on a component, you know the state lives above it. When you see `useState` *inside* it, you know it lives there.

---

## 5. Lifting is often the wrong verb: derive instead

"Lift the state" gets over-applied to values that should never have been state at all. The test is simple: **can this value be computed from something you already have?**

| Value | State or derived? | Why |
| --- | --- | --- |
| the text the user is typing | **state** | it is input; nothing else knows it |
| `charactersLeft = 280 - draft.length` | **derived** | arithmetic on state |
| `isValid = draft.length > 0 && draft.length <= 280` | **derived** | a fact about the draft |
| the filtered product list | **derived** | a function of `products` + `filter` |
| `count` of lines in the cart | **derived** | `lines.reduce(...)` |
| the total price | **derived** | arithmetic on the lines |
| `isLoading` | **state** (or better: part of a status union) | it reflects the outside world, not a computation |
| the selected category | **state** | it is a user choice |
| the page title | **derived** (a formatted string, but it *causes* an effect — Part 4, file 09) | `useDocumentTitle(count > 0 ? … : …)` |
| a sorted copy of a list | **derived** | sorting is a function of the list and the sort key |

⚠️ **The classic derived-state bug** is this:

```tsx
// ❌ derived value stored as state: two sources of truth for one fact
const [items, setItems] = useState<Item[]>([]);
const [count, setCount] = useState(0);
useEffect(() => { setCount(items.length); }, [items]);   // ← sync code, and a second render
```

The effect adds a render, the count can be momentarily wrong, and every future way of changing `items` must remember to update `count`. The fix is one line and zero hooks:

```tsx
// ✅ computed from the base state, always correct, no extra render
const [items, setItems] = useState<Item[]>([]);
const count = items.length;
```

---

## 6. Where exactly should the owner be? Colocation

The other half of "single source of truth" is *where*: keep state **as close as possible to the components that use it**.

**Verified** — the same toggle, in two places, with a sibling that does not use it at all:

```text
7. state in the parent: unrelated sibling is re-rendered too: sibling renders: 1 → 2 (parent rendered 2 times)
8. the same toggle with its state moved down: sibling renders: 1 → 1
```

When the `open` flag lived in the parent, clicking the toggle re-rendered the parent **and the unrelated sibling** (the sibling's count went `1 → 2`). Moving the state into the component that actually uses it made the sibling's count stay at `1`: React re-renders the component whose state changed and everything below it — nothing else.

So the ownership rule has two directions, and both matter:

| If you put state too **low** | If you put state too **high** |
| --- | --- |
| siblings cannot share it; you end up duplicating (section 2) | unrelated components re-render (measured above); every intermediate component grows props it does not use |

The correct location is the **lowest** component that is still an ancestor of everyone who needs it. That single sentence settles almost every "where should this live?" question in a real app.

💡 **A practical test**: imagine deleting the component you are about to put state in. Would the feature still make sense? If yes, the state was too low. Imagine moving it one level up. Would any sibling suddenly receive a prop it ignores? If yes, it was already high enough.

---

## 7. Copying props into state

There is one more way to end up with two sources of truth, and it is subtle because the state is initialised *from* the prop — so it looks deliberate:

```tsx
// ❌ the prop is read once, at mount, and never again
function PriceLabel({ priceMinor, currency }: { priceMinor: number; currency: string }) {
  const [label] = useState(`${currency} ${(priceMinor / 100).toFixed(2)}`);
  return <span>{label}</span>;
}
```

**Verified:**

```text
9. a label copied from props into state: shows "₹ 4999.00"
10. after the props changed (and React re-rendered twice): still shows "₹ 4999.00" — the state never re-initialised
```

The parent re-rendered twice with a new currency and a new price; the child re-rendered too — and still shows the first values, because `useState`'s argument is only used on the **first** render (Part 4, file 02). This is the same class of bug as the drifting counters, one level further out.

Three legitimate reasons to copy a prop into state, each with its own correct pattern:

| Reason | Pattern | Note |
| --- | --- | --- |
| You need an **editable draft** of a value that arrives later (a form pre-filled from the server) | copy once, then track "dirty" explicitly — or reset deliberately when the source changes | the draft is genuinely independent state |
| You need to **reset** a component when an identity changes | change its **`key`**: a new key = a new component instance = fresh state | measured in Part 4, file 02: `count=3` while the prop said `99`; after `key="reset"` → `count=99` |
| You need an expensive **initial** value | lazy initialiser: `useState(() => compute(props))` | still runs only once — which is what you want |

The `key` reset is worth seeing as code, because it is the idiomatic React answer to "why is my component still showing the old values?":

```tsx
// The parent decides that a different product is a different editing session.
<EditProductForm key={product.id} product={product} />

// …and inside, the copy is honest: this component's state starts from the prop
// and then belongs to the user, for as long as this instance lives.
function EditProductForm({ product }: { product: Product }) {
  const [name, setName] = useState(product.name);   // re-initialised when `key` changes
  return <input value={name} onChange={(event) => setName(event.target.value)} />;
}
```

⚠️ Do **not** reach for an effect that watches the prop and calls the setter (`useEffect(() => setName(product.name), [product.name])`). It renders the form twice on every change, it cannot tell "the user typed the same text" from "the source changed", and it fights the user's edits. `key` or a derived value, never a sync effect.

---

## 8. Not everything needs lifting

Some state deliberately stays local, and that is the right design — until someone else needs it:

```tsx
// An uncontrolled accordion: it owns `open`, and nobody else cares.
function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {title}
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
```

Two patterns are worth naming here, because they are the mature versions of "don't lift until you must":

- **Uncontrolled components with a lifted-on-demand value** (files 03–04): the child owns the value internally; the parent asks for it when it matters (on submit, via a callback or a ref) instead of on every keystroke.
- **Compound components that share state through context** (file 09): `<Tabs>` owns `active`, and `<Tab>`/`<Panel>` read it through context — the state is technically lifted, but the *API* still looks local, and no prop has to be threaded through.

The decision, stated as a rule: **lift a piece of state when a second component needs to read it, or when a component above needs to reset it.** Not before.

---

## 9. One value or many? (and when to reach for a reducer)

Once the owner is right, the remaining question is how to *shape* the state it owns:

| Shape | Use when | Example |
| --- | --- | --- |
| separate `useState` per field | the fields are genuinely independent and never move together | `const [isPanelOpen, setIsPanelOpen] = useState(false)` |
| one `useState` object | the fields travel together as a unit (a filter, a draft, a draft form) | `const [filter, setFilter] = useState(emptyFilter)` |
| `useReducer` | the fields move together *and* the rules between them matter | the cart (Part 4, file 06) |

For the object shape, always spread the current value when changing one field:

```tsx
setFilter({ ...filter, category: next });   // ✅ the other fields survive
// setFilter({ category: next })             // ❌ silently resets query and onlyInStock
```

That one-character difference is a real bug in real codebases, and TypeScript cannot save you (a partial object is not assignable to the full type — but `{ category: next }` *is* if the other fields are optional, and it becomes `undefined` at runtime). The reducer version makes it impossible:

```tsx
dispatch({ type: 'setCategory', category: next });   // the reducer spreads for you
```

---

## 10. Real-world example: who owns what in MegaShop

| Value | Owner | Why there |
| --- | --- | --- |
| the cart (lines, toast message) | `CartProvider` via `useCart` (`useReducer`) | needed by the badge in the header, the panel, and every add-to-cart button — three unrelated branches |
| `category`, `query` | `Shop` | set by two children (`CategoryFilter`, `SearchBar`), read by `ProductList`; the closest common ancestor |
| `visible` (filtered list), `counts` | **nowhere** — derived in `Shop` during render | functions of `products` + the two filter values |
| `itemCount`, `subtotalMinor` | **nowhere** — derived inside `useCart` from the cart state (memoised for identity, Part 4 file 07) | arithmetic on the cart |
| the toast's remaining time | inside `<Toast>`'s effect | nobody else needs to know |
| `searchRef` (the input element) | `Shop` (`useRef`) | the `/` shortcut needs to focus it (file 06) |
| the filter object | one `useState` in `Shop`, if you take the challenge in file 01 | it travels as a unit, and "clear all" resets it in one call |

Read that table as a set of answers to the ownership question, and notice that three of the eight rows are **not state at all**. Removal of unnecessary state is the single largest simplification available in most React codebases.

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Two `useState` copies of the same fact | they drift (measured: `left=1 · right=0`) | one owner; pass the value down |
| 2 | Storing a derived value in state | stale totals, extra renders, sync effects | compute during render |
| 3 | An effect that synchronises two states | loops, flicker, order dependence | derive, or merge into one value |
| 4 | Copying a prop into state | it never updates (measured: still `₹ 4999.00` after two prop changes) | derive it; use `key` if you need a reset |
| 5 | Keeping state too high "just in case" | unrelated siblings re-render (measured: `1 → 2`) | move it down to the user of the value |
| 6 | Keeping state too low | siblings cannot share it; duplication appears | lift to the closest common parent |
| 7 | Replacing a state object without spreading | other fields vanish (`query` cleared by a category change) | `{ ...state, [field]: value }`, or a reducer |
| 8 | Passing the setter deep into the tree | children know the parent's shape (file 01) | pass a semantic callback |
| 9 | Lifting to the app root | every screen re-renders for one screen's flag | colocate; use context for genuinely global values |
| 10 | Resetting a component with a sync effect instead of `key` | double renders, edits fought | `key={id}` |
| 11 | Forgetting that props are a snapshot | reading `props.x` in a callback created last render | read during render; callbacks close over the current render's values (Part 3, file 12) |
| 12 | Assuming a child's `useState` initialiser re-runs when props change | "the form is not updating" | it runs once per instance; change the `key` or derive |

---

## 12. Best practices

1. **Name the owner** before writing code: "who owns this value?" If the answer is "both", the design is wrong.
2. **Ask "can this be computed?" first.** Most "extra state" disappears at that question.
3. **Put the state in the lowest common ancestor** of every reader and writer, and nowhere higher.
4. **Pass values down, intents up** (file 01); keep setters for the owner.
5. **Model values that move together as one object**, and use a reducer when the rules matter.
6. **Use `key` to reset an instance**, never a synchronising effect.
7. **Re-measure after moving state.** A render count before and after is the cheapest evidence that the change helped (`1 → 2` versus `1 → 1`).
8. **Prefer uncontrolled + read-on-demand** for values nobody else needs until submit (file 04).
9. **Let the tree document ownership**: state near the top means a widely shared fact; state deep inside means a local detail.
10. **Delete state you no longer need** — including derived values that crept in during an earlier iteration.

---

## 13. Practice

### Beginner — make the two views agree

The component below shows a character counter and a textarea that disagree. Fix it twice: once by **lifting** the value, and once by **deriving** it. Then say which version you would ship and why.

```tsx
function Composer() {
  const [draft, setDraft] = useState('');
  const [remaining, setRemaining] = useState(280);

  return (
    <form>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      <span>{remaining} characters left</span>
      <button type="button" onClick={() => setRemaining(280 - draft.length)}>Recount</button>
    </form>
  );
}
```

Requirements: type 300 characters and check what each version does; then make the "Post" button disable when the draft is empty or over 280 characters.

### Intermediate — move the state down

The panel below re-renders a costly sibling on every keystroke, because the draft lives too high. Move the state to where it is used, keep the same visible behaviour, and prove the fix with a render count.

```tsx
function Page() {
  return (
    <section>
      <ExpensiveChart />          {/* expensive, unaffected by the draft */}
      <CommentBox />
    </section>
  );
}

function PageWithState() {
  const [draft, setDraft] = useState('');
  return (
    <section>
      <ExpensiveChart />
      <CommentBox value={draft} onChange={setDraft} />
      <p className="preview">{draft.length} characters</p>
    </section>
  );
}
```

Then answer: the preview needs the draft too. What are your options, and which one keeps `ExpensiveChart` off the re-render path?

### Challenge — an editable product form with a real reset

**File: `src/practice/EditProductForm.tsx`**

Build a form that edits a product's `name` and `priceMinor`, with:

1. **Draft state**: the values come from the `product` prop and are then edited locally.
2. **A reset button** that restores the values from the current prop — implemented **without** an effect.
3. **A "dirty" indicator**: "You have unsaved changes" appears only when the draft differs from the prop.
4. Changing the `product` prop (a different product id) must **not** show another product's edits — prove it by switching between two products.
5. Then write the parent so it passes `key={product.id}` and explain, in one sentence, why the form still works even though nothing resets on the prop change.

---

## 14. Solutions

### Beginner

```tsx
// Version A — LIFTED: two pieces of state, kept in sync by hand.
// Note how much code exists purely to keep them agreeing.
function ComposerLifted() {
  const [draft, setDraft] = useState('');
  const [remaining, setRemaining] = useState(280);

  const updateDraft = (next: string) => {
    setDraft(next);
    setRemaining(280 - next.length);       // ← the sync step; forget it once and they drift
  };

  return (
    <form>
      <textarea value={draft} onChange={(event) => updateDraft(event.target.value)} />
      <span>{remaining} characters left</span>
      <button type="button" onClick={() => updateDraft('')}>Clear</button>
      <button type="submit" disabled={draft.length === 0 || draft.length > 280}>Post</button>
    </form>
  );
}

// Version B — DERIVED: one piece of state; the rest is arithmetic.
function ComposerDerived() {
  const [draft, setDraft] = useState('');
  const remaining = 280 - draft.length;              // computed on every render
  const tooLong = draft.length > 280;

  return (
    <form onSubmit={(event) => { event.preventDefault(); post(draft); }}>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      <span aria-live="polite">{remaining} characters left</span>
      {tooLong && <p role="alert">Too long by {draft.length - 280} characters.</p>}
      <button type="button" onClick={() => setDraft('')}>Clear</button>
      <button type="submit" disabled={draft.length === 0 || tooLong}>Post</button>
    </form>
  );
}
```

What happens with 300 characters: in version A, `remaining` shows `-20` only if every path remembered to call `updateDraft` (and typing does not — the textarea calls `setDraft` directly if you wire it that way, which is exactly how this bug ships). In version B, `remaining` is `-20` and `tooLong` is `true` together, always, because both are computed from the same `draft`.

**Ship version B.** The lifted version still has two sources of truth, and the sync step is a rule that a future edit can break. The derived version cannot be inconsistent, has half the code, and gets the "too long" state for free. This is the general shape of the answer: *lift* when two components need the same value; *derive* when one value can be computed from the other.

### Intermediate

```tsx
function Page() {
  return (
    <section>
      <ExpensiveChart />
      <CommentBox />
    </section>
  );
}

// The draft lives next to the textarea and the preview, one level below the chart.
function CommentBox() {
  const [draft, setDraft] = useState('');
  return (
    <div>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      <p className="preview">{draft.length} characters</p>
      <button type="button" onClick={() => setDraft('')}>Clear</button>
    </div>
  );
}
```

`ExpensiveChart` is rendered by `Page`, which has no state at all now, so a keystroke re-renders only `CommentBox` — measured with a `console.count('ExpensiveChart')` before and after the move.

Options for the preview, in order of preference:

1. **Put the preview inside the owner** (as above): the preview needs the draft, so it belongs to the same component as the textarea. No props, no lifting, no re-renders outside.
2. **If the preview genuinely lives elsewhere** (a sticky bar at the bottom of the page), then the state must be lifted to `Page` — and the chart must be protected from those re-renders with `memo` (Part 4, file 07) or by passing it as `children` so React reuses the element (file 07 of this part demonstrates the identity rule). Choose the first option unless the layout forces the second: keeping the chart off the path is the goal, and moving the state down achieves it without any memoisation.

### Challenge

**File: `src/practice/EditProductForm.tsx`**

```tsx
import { useState } from 'react';
import type { Product } from '../data/products';

export interface EditProductFormProps {
  product: Product;
  onSave: (next: Pick<Product, 'id' | 'name' | 'priceMinor'>) => void;
}

export function EditProductForm({ product, onSave }: EditProductFormProps) {
  // Draft state: initialised from the prop ONCE per component instance.
  const [name, setName] = useState(product.name);
  const [priceMinor, setPriceMinor] = useState(product.priceMinor);

  const isDirty = name !== product.name || priceMinor !== product.priceMinor;

  // Reset without an effect: put the props back into the draft.
  const reset = () => {
    setName(product.name);
    setPriceMinor(product.priceMinor);
  };

  return (
    <form
      className="edit-product"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ id: product.id, name: name.trim(), priceMinor });
      }}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <label>
        Price (₹)
        <input
          type="number"
          min={0}
          step="0.01"
          value={(priceMinor / 100).toFixed(2)}
          onChange={(event) => {
            // Keep rupees in the input, paise in the state — convert at the edge.
            const rupees = Number(event.target.value);
            setPriceMinor(Number.isFinite(rupees) ? Math.round(rupees * 100) : 0);
          }}
        />
      </label>

      <div className="edit-product__actions">
        <button type="submit" disabled={!isDirty}>Save</button>
        <button type="button" onClick={reset} disabled={!isDirty}>Reset</button>
      </div>

      {isDirty && <p className="edit-product__dirty">You have unsaved changes</p>}
    </form>
  );
}
```

The parent, using the reset-by-identity trick:

```tsx
export function ProductEditor({ product, onSave }: { product: Product; onSave: (next: Pick<Product, 'id' | 'name' | 'priceMinor'>) => void }) {
  return <EditProductForm key={product.id} product={product} onSave={onSave} />
}
```

Answers to the questions: requirement 2 (reset without an effect) works because `product` is the *current* prop in this render — putting its values back into the draft is ordinary event-handler code, not a synchronisation. Requirement 4 (no leaking between products) is handled by the `key`: when the parent renders `<EditProductForm key={product.id} … />`, switching products **unmounts** the old form and mounts a fresh one, so `useState` initialisers run again with the new product's values — and the dirty state, the cursor position and any local validation all reset together. That is why the form "still works even though nothing resets on the prop change": the `key` *is* the reset, expressed as identity rather than as a comparison. It is also the reason the `isDirty` check compares against the prop and not against a stored "original": the prop is the truth, and the draft is the only copy.

---

## 15. Summary

- Shared information has three possible arrangements: **duplicated** (drifts — measured `left=1 · right=0`), **lifted** (one owner, passed down), or **derived** (computed from one owner).
- The rule: **one owner per fact; everything else is computed during render**.
- Lifting is mechanical — find the closest common ancestor, move the `useState` there, pass the value down and a callback up, delete the child's state.
- **The `value` + `onChange` prop pair is the signature of a lifted value**; `useState` inside a component means the value lives there.
- **Colocate**: state belongs in the *lowest* common ancestor. Too high and unrelated siblings re-render (measured `1 → 2`); too low and siblings cannot share it.
- **Derived values are never state**: counts, totals, filtered lists, `isValid`, `charactersLeft`. Storing them creates sync effects, extra renders and stale data.
- **Copying a prop into state goes stale** (measured: still `₹ 4999.00` after two prop changes). Use `key` to reset an instance (measured in Part 4: `count=3` → `99`), never a synchronising effect.
- Model values that travel together as **one object** (spread on update) or as a **reducer** when the rules matter.
- Not everything must be lifted: uncontrolled components and context-driven compound components are legitimate ways to keep an API local while the state still has one owner.

---

**What's next →** [`03-controlled-components.md`](./03-controlled-components.md): the `value`/`onChange` pair in full. We will watch a controlled input's state, DOM and render count stay in agreement (`ab` / `ab` / 2 renders), reproduce the "read-only field" symptom React warns about, capture React's exact warnings for `value` without `onChange`, `value` + `defaultValue`, and the controlled→uncontrolled switch, and learn why an input that *ignores* your keystrokes is usually a missing `setState`, not a broken browser.
