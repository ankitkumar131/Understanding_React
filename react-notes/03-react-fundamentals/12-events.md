# 12 — Events and Interaction

> **Part 3 · React Fundamentals · File 12 of 12**
> Why this file exists: a React app with no events is a poster. Events are where the user meets your state, and where beginner bugs concentrate — handlers that fire during render, forms that reload the page, `target` vs `currentTarget`, buttons that submit when they should not. This file covers the syntax, the event object, forms, and the runtime behaviours (batching, propagation) that are easiest to *believe* when you have seen them measured.

---

## 1. Handlers are functions, not strings

| HTML | React (JSX) |
| --- | --- |
| `<button onclick="addToCart()">` | `<button type="button" onClick={() => addToCart(product)}>` |
| Attribute value is a **string of code** | Attribute value is a **function value** |
| Runs in global scope | Closes over the component's props and state |

```tsx
// ✓ pass the function reference — React calls it later, when the user clicks
<button type="button" onClick={handleClick}>Add to cart</button>

// ✓ pass a new arrow function — for when you need to supply arguments
<button type="button" onClick={() => onAddToCart(product)}>Add to cart</button>

// ✗ CALLS handleClick immediately, during render, and passes its return value as the handler
<button type="button" onClick={handleClick()}>Add to cart</button>
```

That third line is one of the top three beginner bugs, and its symptoms are distinctive:

- the "handler" runs while the page renders (so you see its side effect before any click);
- the actual click passes `undefined` (or whatever it returned) as the handler, so **clicking sometimes throws** `TypeError: handler is not a function`;
- in StrictMode you see the effect **twice** per render (file 07 §6).

The fix is one pair of parentheses: `onClick={handleClick}`.

### 1.1 Naming

```tsx
// The component's props declare what happened:
export interface ProductCardProps {
  onAddToCart: (product: Product) => void;
}

// Inside, the implementation says what it does:
const handleAddToCart = () => { onAddToCart(product); };

// And the JSX connects them:
<button type="button" onClick={handleAddToCart}>Add to cart</button>
```

`onX` = "this component received an event callback"; `handleX` = "this component owns this behaviour". In our lab, `ProductList` passes `onAddToCart` through to `ProductCard`, and `App` implements it as `handleAddToCart` — you can tell at a glance which side of the prop boundary you are on (file 04 §5).

---

## 2. The events you will use

| Prop | Fires when | Typical use |
| --- | --- | --- |
| `onClick` | Click / tap (also Enter/Space on a focused `<button>`) | Buttons, chips, rows |
| `onChange` | After the value of an input/textarea/select changes | Controlled inputs (below) |
| `onSubmit` | A form is submitted (click on a submit button or Enter in a field) | Search, login, checkout |
| `onKeyDown` / `onKeyUp` | A key is pressed/released | Escape to close, Enter to submit, arrows in a menu |
| `onFocus` / `onBlur` | An element gains/loses focus | Validation on blur, dropdown open/close |
| `onMouseEnter` / `onMouseLeave` | Pointer enters/leaves | Hover affordances that must be stateful |
| `onDoubleClick` | Double click | Rename-in-place |
| `onScroll` | Scrolling | Infinite scroll (prefer IntersectionObserver — Part 10) |
| `onDragStart` / `onDrop` | HTML5 drag and drop | Kanban boards (prefer a library) |
| `onPointerDown` etc. | Unified pointer events | Drawing, gesture handling |

React's `onChange` is **not** the DOM's `change` event: it behaves like the DOM's `input` event (it fires on every keystroke), which is what a "controlled input" needs. If you need the DOM's native `change` (fires on blur/commit), use `onBlur` or compare values yourself.

Two React-specific details people trip over:

- **`onChange` on checkboxes** → read `event.currentTarget.checked`, not `.value`.
- **React does not support `onScroll` bubbling the way you might expect** — attach scroll listeners to the scrolling element, and note that React 17+ re-attaches scroll handlers directly to the node rather than delegating them.

---

## 3. The event object

Handlers receive a **synthetic event**: a React object that wraps the native event and normalises behaviour across browsers. It behaves like the DOM event for everything you need:

```tsx
function Demo() {
  return (
    <div onClickCapture={() => console.log('capture on div')} onClick={() => console.log('bubble on div')}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          console.log(event.type);                                  // "click"
          console.log((event.target as HTMLElement).tagName);       // the element the user clicked
          console.log(event.currentTarget.tagName);                 // the element with the handler
          console.log(event.nativeEvent instanceof MouseEvent);     // true — the DOM event
        }}
      >
        <span>click me</span>
      </button>
    </div>
  );
}
```

**Verified output** of clicking the inner `<span>` (from the jsdom harness in `src/dev/interact.tsx`'s sibling probe):

```text
handler order with stopPropagation: capture on div -> button: type=click target=SPAN currentTarget=BUTTON
```

Read that line carefully — it contains three separate facts:

1. **Capture runs before bubble.** Handlers registered with `onClickCapture` fire on the way *down* the tree; regular `onClick` handlers fire on the way *up*.
2. **`target` is what the user hit** (`SPAN`); **`currentTarget` is the element with the handler** (`BUTTON`). This is why `event.currentTarget.value`/`.checked` is the safe way to read an input's value (file 06 §6.1 types this distinction for you).
3. **`stopPropagation()` stops the bubble phase** — the `bubble on div` handler never ran, while the capture handler already had.

### 3.1 `preventDefault` and `defaultPrevented`

```tsx
const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();       // stop the browser's default action (navigation / page reload)
  onSearch(query.trim());
};
```

**Verified result:**

```text
6a. submit: handler ran 1x, defaultPrevented=true
```

`preventDefault()` does **not** stop propagation (`stopPropagation()` does that), and it does not "cancel" React's state updates. It cancels the *browser's* built-in behaviour for that event: form submission navigation, link navigation, checkbox toggling (if you prevent it), text selection, etc.

Common defaults you will cancel:

| Element / event | Default behaviour | When to cancel |
| --- | --- | --- |
| `<form onSubmit>` | Navigate to the `action` URL, reloading the page | Almost always in a client app |
| `<a onClick>` | Navigate to `href` | When it is really a button, or when a router intercepts it (Part 6) |
| `<input type="checkbox" onChange>` | Toggles `checked` | Only when you are fully controlling it (rare — usually you just use the value) |

> ⚠️ **Forgetting `preventDefault()` in a form is the single most common React form bug**: the page reloads, all state is lost, and it looks like "my submit handler did nothing". React's dev server even shows the reload in the terminal.

### 3.2 Event pooling is gone

You may read that "React pools events, so you must call `event.persist()`". **That was React 16.** Event pooling was removed in React 17; synthetic events are normal objects, safe to read asynchronously. `event.persist()` still exists as a no-op for compatibility — do not add it to new code.

---

## 4. Passing arguments to handlers

```tsx
// 1. the handler needs no arguments from the call site
<button type="button" onClick={handleSubmit}>Search</button>

// 2. the handler needs an argument that the call site knows
{products.map((product) => (
  <button key={product.id} type="button" onClick={() => onAddToCart(product)}>
    Add to cart
  </button>
))}

// 3. the argument is already on the DOM node — read it from the event
<button type="button" data-choice={choice} onClick={handleChoice}>…</button>

const handleChoice = (event: MouseEvent<HTMLButtonElement>) => {
  const choice = event.currentTarget.dataset.choice;      // string | undefined
  if (choice !== undefined) onChange(choice as CategoryChoice);
};
```

| Approach | Cost | Notes |
| --- | --- | --- |
| Pass the function reference | none | Simplest, and the handler identity is stable across renders |
| Arrow at the call site (`() => f(id)`) | one tiny closure per item per render | **Fine by default.** Our lab uses it for chips and product buttons. Do not pre-optimise (Part 10) |
| `data-*` + read from the event | none | Useful for long lists and for delegation; the value arrives as a `string`, so narrow/parse it |
| `f.bind(null, id)` | one bound function per item per render | Avoid: it is less readable and no faster than the arrow |

The one thing to avoid is creating a handler *inside* another handler needlessly, or passing a *new* function to a memoised child on every render while expecting memoisation to help — Part 10 has the details and the measurement habit.

---

## 5. Forms: controlled inputs and submission

This is the most important interaction pattern in the part, and our `SearchBar` implements it end to end:

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react';

export interface SearchBarProps {
  /** Called with the trimmed query when the form is submitted or cleared. */
  onSearch: (query: string) => void;
  placeholder?: string;
  initialQuery?: string;
}

export function SearchBar({ onSearch, placeholder = 'Search products…', initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.currentTarget.value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Without this line the browser navigates and the app reloads — the single
    // most common React form bug.
    event.preventDefault();
    onSearch(query.trim());
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
      <button type="submit">Search</button>
      {query === '' ? null : (
        <button type="button" className="search__clear" onClick={handleClear}>Clear</button>
      )}
    </form>
  );
}
```

**Verified markup on first render:**

```html
<form class="search" role="search"><label for="product-search">Search</label><input id="product-search" type="search" placeholder="Search products…" value=""/><button type="submit">Search</button></form>
```

And **verified end-to-end behaviour** of this component wired into `App` (interaction harness):

```text
2. typed "ssd" and pressed Search
   visible : 1TB NVMe SSD, 2TB Portable SSD
   footer  : Showing 2 of 8 products.

5. pressed "Clear"
   visible : (all 8 products)
```

### 5.1 Controlled vs uncontrolled, precisely

| | Controlled | Uncontrolled |
| --- | --- | --- |
| Value lives | In React state (`value={query}`) | In the DOM (`defaultValue`) |
| Read it | From state | Via a ref, or on form submission (Part 8) |
| Every keystroke | Re-renders the component | No render |
| Validation / formatting as you type | Natural | Awkward |
| Reset from outside | Set the state (`setQuery('')`) | Remount (`key`) or imperatively clear the input |
| Use when | You need the value (search, filters, live validation) | You only need the value on submit (long forms) |

**Verified warning** when you mix them — a `value` with no `onChange`:

```text
You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only
field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`.
```

React is telling you the truth: with `value` set and no change handler, the field *cannot* change (React will overwrite any typing on the next render). If you meant "a starting value the user can edit", you meant `defaultValue`. If you meant "read-only forever", say so with `readOnly`.

### 5.2 Buttons: `type` is not optional in a form

```tsx
<form onSubmit={handleSubmit}>
  <input … />
  <button type="submit">Search</button>              {/* submits */}
  <button type="button" onClick={handleClear}>Clear</button>   {/* does NOT submit */}
</form>
```

The HTML default for `<button>` is `type="submit"`. Inside a form, a `<button>` with no `type` **submits the form** — so a "Clear" button without `type="button"` will both clear the field *and* submit the (now empty) search. This is why every button in our lab has an explicit `type`; you can see it in every rendered snippet in this part.

> ✅ **Rule:** always write `type="button"` or `type="submit"` explicitly. The bug it prevents is invisible in code review and irritating to reproduce.

### 5.3 Keyboard behaviour for free

- **A real `<button>`** is focusable, announces itself as a button, and browsers turn <kbd>Enter</kbd>/<kbd>Space</kbd> into a click. That is why our chips, cards' CTAs and clear buttons are all `<button>`.
- **A `<div onClick>`** is none of those things: not focusable, not announced, and no keyboard activation. If you must use a non-button element for interaction, you owe it: `role="button"`, `tabIndex={0}`, and an `onKeyDown` that handles <kbd>Enter</kbd>/<kbd>Space</kbd>. That is four extra chances to be wrong — prefer the button.
- **Submitting with Enter** inside a form works automatically *because* the form has a submit button; `<form onSubmit>` is therefore both a semantic and a keyboard-accessibility win over `<div>` + `onClick`.
- **Escape to close, Enter to confirm** are expectations; wire them with `onKeyDown`:

```tsx
const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key === 'Escape') onClose();
};
```

---

## 6. Two runtime behaviours worth measuring

### 6.1 Two state updates in one handler produce **one** re-render

```tsx
<button
  type="button"
  onClick={() => {
    setCount((c) => c + 1);
    setCount((c) => c + 1);
  }}
>
  … count is {count}
</button>
```

**Verified:**

```text
two setCount calls in one handler -> "click me count is 2"
renders: 1 before the click, 2 after (two updates, one re-render)
```

This is **automatic batching** (React 18+): updates triggered from the same event are collected and applied in one render pass. The count is `2` (both updates applied — they used the functional updater `(c) => c + 1`, so each saw the previous one's result), but the component rendered **once**.

Two consequences:

- **Use the functional form when the next value depends on the previous one.** `setCount(count + 1); setCount(count + 1)` would set `1` twice (both read the same stale `count` from this render's closure) — a classic bug that Part 4 explains fully.
- **React is already efficient** in the common case. You do not need to "combine state updates to avoid renders"; batching does it.

### 6.2 `flushSync` opts out (and why you almost never want it)

```tsx
flushSync(() => setCount((c) => c + 1));
flushSync(() => setCount((c) => c + 1));
```

**Verified:**

```text
flushSync: 1 render before, 3 after -> "flushed 2"
```

Two forced renders instead of one batched render. `flushSync` exists for the rare case where *something outside React* must see the DOM updated synchronously (integrating with a non-React widget in an event handler). Using it in application code is almost always a design smell: it defeats batching and can cause layout thrash. Know it exists; do not reach for it.

---

## 7. How React delivers events (delegation)

React does not attach your handler to each element individually. In React 17+ it attaches listeners to the **root container** (the element you passed to `createRoot`) and dispatches events as they bubble, using its own mapping from DOM node → fiber → your handler.

Practical consequences, in the order you will meet them:

| Consequence | Detail |
| --- | --- |
| `event.currentTarget` is typed and correct | React sets it to the element whose handler is running — that is why it is safe to read (file 06 §6.1) |
| Handlers on elements rendered *later* still work | The listener is on the root, not on the element |
| `stopPropagation()` stops React's synthetic propagation | But not necessarily other *native* listeners outside React's tree, and not the browser's default action (`preventDefault` does that) |
| Portals still bubble through the React tree | Part 10's portals: a modal rendered elsewhere in the DOM still receives events as if it were a child — usually what you want |
| A native listener on `document` may fire **before** React's handler | `document.addEventListener('click', …)` is on the same path but at a higher node; ordering can surprise you in integrations |
| Removing a node does not leak handlers | There is nothing per-node to clean up |

You do not need to manage any of this. The point is that **`e.target`/`e.currentTarget` are the data you should use**, rather than assuming your handler is attached to the node you think it is. This is also why the `data-*` + `currentTarget.dataset` pattern from §4 is idiomatic.

---

## 8. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `onClick={handleClick()}` | Handler runs during render (twice in StrictMode); clicking throws | `onClick={handleClick}` |
| Forgetting `preventDefault()` in `onSubmit` | Page reloads; state resets | Call it first in the handler |
| `<button>` without `type` inside a form | It submits the form (default is `submit`) | `type="button"` or `type="submit"`, explicitly |
| Reading `event.target.value` in a click handler | `TS2339: Property 'value' does not exist on type 'EventTarget'`; or `undefined` at runtime | `event.currentTarget.value` |
| `value` with no `onChange` | React warning; field appears read-only | `onChange` + setState, or `defaultValue` |
| `defaultValue` and expecting to read it later from state | State is empty; the DOM holds the value | Controlled, or read on submit (Part 8) |
| Async handler reading the event later | (React 16 only) pooled event | Not an issue since React 17; ignore `event.persist()` advice |
| `onChange` on a checkbox reading `.value` | Always `"on"` | `.checked` |
| Handler calls `setState` with a stale value | `setCount(count + 1)` twice → `+1`, not `+2` | Functional updates: `setCount((c) => c + 1)` (Part 4) |
| `stopPropagation()` to "fix" a parent handler | Parent behaviours silently stop elsewhere; modal/outside-click logic breaks | Model the intention (e.g. `data-*` + a check in the parent), or use capture deliberately |
| Inline arrow that captures a loop variable incorrectly (`var`) | All rows act on the last item | Use `let`/`const` (`map` callbacks are already per-item), or `data-*` |
| `<a onClick>` without `preventDefault` | Full page navigation | Use a `<button>` if it is an action; use the router's `<Link>` for navigation (Part 6) |
| `onClick` on a `<div>` for a control | Not keyboard accessible, not announced | Use `<button>` (or add `role`, `tabIndex`, `onKeyDown` — a warning sign) |
| Heavy work inside a handler | Slow, janky clicks | Compute in the handler but keep it small; move expensive work out (Part 10) |
| `flushSync` "to make it work" | Extra renders, layout thrash | Find the real cause; almost never needed in app code |

---

## 9. Best practices

1. **`onClick={fn}` passes a function; `onClick={fn()}` calls one.** Write the parentheses deliberately.
2. **Always call `preventDefault()` in `onSubmit`** and in any `<a>` you are repurposing.
3. **Always set `type` on `<button>`**; prefer `type="submit"` only for the form's primary action.
4. **Use `<button>` for actions, `<a href>` for navigation** (and the router's `<Link>` for in-app navigation in Part 6).
5. **Read `currentTarget`**, not `target`, when you need the element's own value.
6. **Controlled inputs for anything you need to read, validate or reset**; `defaultValue` for fire-and-forget forms (Part 8 covers when each wins).
7. **Declare callbacks in props as `onX: (arg) => void`**, implement them as `handleX`, and keep children ignorant of the parent's mechanics (file 08).
8. **Let React batch.** Two `setX` calls in one handler = one render; use functional updates when the next value depends on the previous.
9. **Keyboard parity is free with buttons and forms** — use them instead of divs, and wire Escape/Enter where the interaction implies it.
10. **Never `flushSync` to fix a bug.** Investigate instead.
11. **Debounce/throttle at the event level** when a handler runs per keystroke or per scroll, and cancel on unmount (Part 4's effects, Part 10's patterns).

---

## 10. Practice

### Beginner

1. Add a `CopySkuButton` to `ProductCard` that copies `product.sku` and shows "Copied!" for two seconds. Keep the timer out of the render (the `setTimeout` lives in the handler).
2. Add keyboard support: pressing <kbd>Enter</kbd> in the search field should submit (it already does, via the form) — prove it by reading the `<form>` element in the DOM and confirming the button's `type`.

**Solution**

```tsx
// src/components/CopySkuButton.tsx
import { useState } from 'react';
import type { Product } from '../data/products';

export interface CopySkuButtonProps {
  product: Pick<Product, 'sku' | 'name'>;
}

export function CopySkuButton({ product }: CopySkuButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // The side effect belongs in the handler, never in the render body.
    void navigator.clipboard.writeText(product.sku);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);   // timer handle discarded on purpose: see the note
  };

  return (
    <button
      type="button"
      className="card__copy"
      onClick={handleCopy}
      aria-label={`Copy SKU ${product.sku} for ${product.name}`}
      aria-live="polite"
    >
      {copied ? 'Copied!' : `Copy ${product.sku}`}
    </button>
  );
}
```

Notes that matter in review: the clipboard write and the timer are in the **handler** (a side effect during render would fire twice in StrictMode and on every re-render); `aria-live="polite"` announces the state change; the accessible label includes the SKU *and* the product name, because a product grid full of "Copy KBD-1" buttons is announced identically otherwise. The dismissed timer is the honest simple version; keeping the id and clearing it in an effect's cleanup is the correct version once you know `useEffect` (Part 4) — at which point this becomes a two-line change.

### Intermediate

Build `QuantityStepper` with `+`/`−` buttons and a value, where: the value cannot go below 1 or above 10; `+`/`−` are disabled at the limits; typing a number in the input works too; and pressing <kbd>Escape</kbd> resets the input to the last valid value.

**Solution**

```tsx
// src/components/QuantityStepper.tsx
import { useState, type ChangeEvent, type KeyboardEvent } from 'react';

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function QuantityStepper({ value, min = 1, max = 10, onChange }: QuantityStepperProps) {
  const [draft, setDraft] = useState(String(value));       // what the input shows while typing

  const atMin = value <= min;
  const atMax = value >= max;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.currentTarget.value);
    const parsed = Number(event.currentTarget.value);
    if (Number.isFinite(parsed) && parsed !== 0) {
      onChange(clamp(Math.trunc(parsed), min, max));       // commit on every valid keystroke
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setDraft(String(value));                              // abandon the edit
      event.currentTarget.blur();
    }
  };

  const step = (delta: number) => {
    const next = clamp(value + delta, min, max);
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="stepper" role="group" aria-label="Quantity">
      <button type="button" onClick={() => step(-1)} disabled={atMin} aria-label="Decrease quantity">−</button>
      <input
        className="stepper__input"
        inputMode="numeric"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Quantity"
      />
      <button type="button" onClick={() => step(1)} disabled={atMax} aria-label="Increase quantity">+</button>
    </div>
  );
}
```

Design points: the component is **controlled** by its parent (`value` + `onChange`) but keeps a local **draft** so the input can hold a partially typed string (empty, "1" while typing "12") without lying to the parent; every handler reads `currentTarget`, uses the functional `+`/`−` deltas, and clamps in one place (`clamp`) so the limits cannot diverge between the buttons and the input; and <kbd>Escape</kbd> restores the last committed value — a small touch that makes numeric inputs far less annoying.

### Challenge

Build a `Modal` that: opens from a button, closes on <kbd>Escape</kbd> **and** on backdrop click, traps focus inside while open, returns focus to the trigger when closed, and does not close when you click *inside* the panel. Then explain what `stopPropagation()` does and does not solve here.

**Solution**

```tsx
// src/components/Modal.tsx
import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement;             // remember who opened it
    panelRef.current?.focus();                               // move focus in

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown); // cleanup: no leaked listeners
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();   // focus back
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal__backdrop"
      onClick={onClose}                                       // backdrop click closes
      role="presentation"
    >
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}          // clicks inside must not reach the backdrop
      >
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

```tsx
// usage
const [open, setOpen] = useState(false);
<button type="button" onClick={() => setOpen(true)}>Filters</button>
<Modal open={open} title="Filters" onClose={() => setOpen(false)}>
  <CategoryFilter value={category} onChange={setCategory} counts={counts} />
</Modal>
```

What `stopPropagation()` does and does not solve here:

- **It solves** the "click inside the panel bubbles to the backdrop and closes the modal" problem, because React's synthetic events bubble through the React tree and the panel's handler runs first.
- **It does not solve** keyboard focus escaping the dialog, `Escape` handling, or focus restoration — those are the `useEffect` parts (add a keydown listener while open, remember the previously focused element, restore it on cleanup). Note the effect uses the **native** `document.addEventListener`, not `onKeyDown` on the panel: the user's focus may be anywhere in the document, so the listener must be document-level.
- **It does not solve** a complete focus trap either (this version moves focus in and back, which is the 90% case; a full trap cycles Tab at the edges — that is the point where a library such as Radix or the native `<dialog>` element becomes the better answer than more code).
- **It does not prevent** the default action of anything — that is `preventDefault()`.

> 💡 In production, prefer the native `<dialog>` element (`showModal()` gives you a real focus trap and Escape handling from the browser) or a well-tested headless library. Build the version above once, to understand the mechanics — then use the platform.

---

## 11. Summary

- Handlers are **functions**: `onClick={fn}` passes one; `onClick={fn()}` calls it during render (a bug with distinctive symptoms).
- React events are camelCase props; `onChange` behaves like the DOM's `input` (fires per keystroke); `onSubmit` needs `preventDefault()` or the page reloads.
- **`target` = what was clicked, `currentTarget` = the element with the handler.** Read `currentTarget` for values; TypeScript types the difference for you.
- **Capture runs before bubble**; `stopPropagation()` stops bubbling, `preventDefault()` cancels the browser's default behaviour. They are different tools.
- Event pooling is a React 16 relic — ignore `event.persist()` advice.
- **Controlled inputs** (`value` + `onChange`) make the state the source of truth; `value` without `onChange` produces a read-only field and a warning; that is what `defaultValue` is for.
- **`<button>` defaults to `type="submit"`** inside a form — always write `type` explicitly.
- **React batches updates** from one handler: two `setX` calls → one re-render (verified), so use functional updates when the next value depends on the previous one. `flushSync` opts out and is rarely warranted.
- React **delegates events at the root**; your handler still receives correctly typed `currentTarget`/`target`, and later-rendered elements work without re-binding.
- **Buttons and forms give you keyboard and screen-reader behaviour for free**; a `<div onClick>` gives you none of it.

---

## 12. Where Part 3 leaves you

You can now read and write the whole of the MegaShop app: components, props, composition, data rendering, conditional rendering, lists with correct keys, and events. Everything in the lab is explained by files 01–12, and the app builds, lints and type-checks cleanly:

```text
npx tsc -b            → (no output, exit 0)
npm run lint          → Found 0 warnings and 0 errors. (17 files, 116 rules)
npm run build         → dist/ 27 modules · js 226.17 kB │ gzip 70.87 kB · css 3.10 kB │ gzip 1.14 kB
npx tsx --tsconfig tsconfig.app.json src/dev/render-static.tsx   → 39 lines of markup for 12 sections
npx tsx --tsconfig tsconfig.app.json src/dev/interact.tsx        → 30 lines of scripted user session
```

What is missing is the thing every one of these components will need next: **state that changes over time, shared across components, and synchronised with the outside world.** That is Part 4 — `useState` in depth, `useReducer`, `useRef`, `useEffect`, and the rules that make them safe.

---

**What's next →** Part 4, [`../04-state-and-hooks/01-state.md`](../04-state-and-hooks/01-state.md) *(coming in the next part)*
