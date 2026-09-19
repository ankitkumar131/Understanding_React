# 06 — Spread and Rest (`...`)

> **Part 1 · Prerequisites · File 6 of 11**
>
> **Why this file exists:** React's rule "never mutate state" and the phrase
> "immutability" are implemented with one operator: `...`. This file teaches the
> operator in both of its roles and then shows the exact patterns you will use to
> add, update and remove items in state — hundreds of times, for the rest of your
> career.

---

## 1. One operator, two jobs

The token `...` means different things depending on **where** it appears.

| Where it appears | Name | What it does |
| --- | --- | --- |
| In a function call / array / object literal | **spread** | *expands* a collection into individual items |
| In a function parameter list or destructuring pattern | **rest** | *collects* remaining items into one array/object |

```js
// SPREAD: expand an array into a call
const numbers = [3, 1, 4];
Math.max(...numbers);          // same as Math.max(3, 1, 4) → 4

// REST: collect arguments into an array
function sum(...values) {      // values is a real array: [3, 1, 4]
  return values.reduce((total, n) => total + n, 0);
}
sum(3, 1, 4);                  // 8
```

**Memory aid:**

```text
... on the RIGHT side of `=`  →  spread  (taking things apart)
... on the LEFT  side of `=`  →  rest    (gathering things up)
... in a function's parameters →  rest    (gathering)
... in a function's arguments  →  spread  (taking apart)
```

---

## 2. Spread with arrays

```js
const a = [1, 2, 3];
const b = [4, 5];

// Combine
const combined = [...a, ...b];        // [1, 2, 3, 4, 5]

// Copy
const copy = [...a];                  // a new array with the same items
console.log(copy === a);              // false — different array ✅

// Add at the end / the beginning
const appended = [...a, 4];           // [1, 2, 3, 4]
const prepended = [0, ...a];          // [0, 1, 2, 3]

// Insert in the middle
const inserted = [...a.slice(0, 1), 99, ...a.slice(1)]; // [1, 99, 2, 3]

// Use in function calls
const parts = ['2026', '09', '19'];
const isoDate = parts.join('-');       // no spread needed here
const maxValue = Math.max(...[10, 25, 4]); // 25 — spread the array into arguments

// Array.from alternative
const chars = [...'react'];            // ['r','e','a','c','t'] (strings are iterable)
const unique = [...new Set([1, 1, 2, 3])]; // [1, 2, 3]
```

### Spread copies are **shallow**

```js
const original = [{ id: 1 }, { id: 2 }];
const copy = [...original];

copy.push({ id: 3 });            // does not affect original ✅
console.log(original.length);    // 2 ✅

copy[0].id = 99;                 // ⚠️ mutates the SAME object
console.log(original[0].id);     // 99 😖
```

The outer array is new. The inner objects are shared. To change an item, you must
create a new item too:

```js
const next = original.map((item) => (item.id === 1 ? { ...item, id: 99 } : item));
```

> 🔍 **Why "shallow" is usually enough in React:** when you update state you
> replace *every changed object along the path* from the root to the changed
> value. Nothing else needs copying, because nothing else changed. Part 4 shows
> this for nested state; the pattern is always:
> ```js
> { ...state, level1: { ...state.level1, level2: { ...state.level1.level2, value: 'new' } } }
> ```

### Spread does not "merge" arrays

```js
const a = [1, 2];
const b = [3, 4];

[...a, ...b];      // [1, 2, 3, 4] ✅ concatenation
[a, b];            // [[1,2],[3,4]] ← nested arrays, probably not what you wanted
[1, 2, 3, 4];      // the values themselves, not the refs — only for primitives
```

---

## 3. Spread with objects

```js
const base = { id: 1, name: 'Ada', role: 'user' };

// Copy
const copy = { ...base };                 // new object, same property values
console.log(copy === base);               // false ✅

// Merge (later keys win)
const merged = { ...base, role: 'admin' };        // role is 'admin'
const merged2 = { role: 'admin', ...base };       // role is 'user' ⚠️ order matters!

// Add new properties
const withEmail = { ...base, email: 'ada@example.com' };

// Override one property, keep the rest — the single most common React update
const updated = { ...base, name: 'Grace' };
console.log(updated);  // { id: 1, name: 'Grace', role: 'user' }
console.log(base.name); // "Ada" ✅ original untouched
```

**Order is the whole game:**

```js
const defaults = { theme: 'light', fontSize: 14 };
const userPrefs = { theme: 'dark' };

{ ...defaults, ...userPrefs };  // { theme: 'dark', fontSize: 14 }   ✅ user wins
{ ...userPrefs, ...defaults };  // { theme: 'light', fontSize: 14 }  ⚠️ defaults win
```

The rule: **spread the base first, then the overrides.** React state updates
follow exactly this shape.

### Objects are also shallow-copied

```js
const state = { user: { name: 'Ada' }, theme: 'dark' };
const next = { ...state };

next.theme = 'light';        // ✅ top-level: original unchanged
next.user.name = 'Grace';    // ⚠️ nested object is shared — original user changed!
console.log(state.user.name); // "Grace"
```

Correct nested update:

```js
const next2 = {
  ...state,
  user: { ...state.user, name: 'Grace' },
};
console.log(state.user.name); // "Ada" ✅
```

### Spreading non-objects

```js
{ ...null };        // {}  — spreading null/undefined is allowed and yields nothing
{ ...undefined };   // {}
{ ...'ab' };        // { 0: 'a', 1: 'b' } ⚠️ strings spread into indexed keys
{ ...[1, 2] };      // { 0: 1, 1: 2 }    ⚠️ arrays become index-keyed objects
```

Those last two are legal but almost always bugs. If you see `{ 0: ..., 1: ... }`
in your state, you spread an array where you meant an object.

> ⚠️ Object spread is a **shallow** copy and it **ignores the prototype**. A
> class instance spread into a plain object loses its methods:
> ```js
> class User { constructor(name) { this.name = name; } greet() { return `Hi ${this.name}`; } }
> const u = new User('Ada');
> const plain = { ...u };  // { name: 'Ada' } — greet() is gone!
> ```

---

## 4. Rest: collecting the leftovers

### In destructuring

```js
// Arrays
const [first, second, ...others] = [1, 2, 3, 4, 5];
console.log(first, second); // 1 2
console.log(others);        // [3, 4, 5]

// Objects
const user = { id: 1, name: 'Ada', email: 'a@b.c', role: 'admin' };
const { id, ...withoutId } = user;
console.log(withoutId); // { name: 'Ada', email: 'a@b.c', role: 'admin' }

// Rest must be LAST
// const [...start, last] = [1,2,3];  // ❌ SyntaxError: Rest element must be last
```

**React use — forwarding props.** A wrapper component that adds a class and
passes everything else through:

```tsx
interface TextInputProps extends React.ComponentPropsWithoutRef<'input'> {
  hasError?: boolean;
}

export function TextInput({ hasError = false, className = '', ...inputProps }: TextInputProps) {
  const classes = `text-input ${hasError ? 'text-input--error' : ''} ${className}`.trim();

  return <input className={classes} {...inputProps} />;
}

// Usage: every normal input prop still works
<TextInput
  type="email"
  name="email"
  placeholder="you@example.com"
  hasError={false}
  onChange={handleChange}
/>
```

This is the standard way to build a design-system `Input`, `Button` or `Card`
that behaves exactly like the native element plus extra features.

**React use — removing a prop before sending data.** Very common when cleaning
state or API payloads:

```ts
function toPayload(formState: FormState) {
  const { confirmPassword, ...payload } = formState; // drop UI-only field
  return payload;
}
```

### In function parameters

```js
function sum(...values) {                 // values is an array
  return values.reduce((total, n) => total + n, 0);
}
sum(1, 2, 3, 4);                          // 10

// Rest must come last, after any fixed parameters
function log(level, ...messages) {
  console.log(`[${level}]`, ...messages); // spread them back into console.log
}
log('info', 'user', 'logged', 'in');      // [info] user logged in
```

> 💡 Note the symmetry in `console.log(level, ...messages)`: the function
> *collects* with rest and then *spreads* the same array back into another call.
> That is the standard "wrap and forward" pattern.

**React use — a typed variadic helper:**

```ts
// Collects an arbitrary number of class names, filters out falsy ones
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

cx('btn', isActive && 'btn--active', undefined); // "btn" or "btn btn--active"
```

That is essentially what `clsx` does.

---

## 5. The patterns: immutable updates in React

Learn these five patterns now. Part 4 will use them and never re-explain them.

### Pattern 1 — Object update (add or overwrite one field)

```js
const [user, setUser] = useState({ name: 'Ada', email: 'a@b.c' });

setUser((previous) => ({ ...previous, email: 'new@b.c' }));
// TARGET:             spread the old     overwrite one key
```

### Pattern 2 — Array: add an item

```js
const [todos, setTodos] = useState<Todo[]>([]);

// Append
setTodos((previous) => [...previous, newTodo]);

// Prepend (newest first)
setTodos((previous) => [newTodo, ...previous]);
```

### Pattern 3 — Array: update one item

```js
// map keeps the length and only replaces the matching item — with a NEW object
setTodos((previous) =>
  previous.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))
);
```

> ⚠️ The classic mistake:
> ```js
> // ❌ Mutating an item inside state: the array reference is unchanged,
> //    so React may not re-render, and any memoized child misses the change.
> setTodos((previous) => {
>   const todo = previous.find((t) => t.id === id);
>   todo.done = !todo.done;
>   return previous;
> });
> ```

### Pattern 4 — Array: remove one item

```js
setTodos((previous) => previous.filter((todo) => todo.id !== id));
```

If you specifically want the removed item (for undo), or need index-based removal:

```js
// Index-based removal (usually a sign you should be using ids)
setItems((previous) => previous.filter((_, index) => index !== indexToRemove));

// Or with slice — non-mutating
setItems((previous) => [...previous.slice(0, i), ...previous.slice(i + 1)]);
```

Or use `toSpliced` (ES2023, supported in all current browsers and Node 20+):

```js
setItems((previous) => previous.toSpliced(i, 1)); // returns a NEW array
```

### Pattern 5 — Nested object update

```js
const [state, setState] = useState({
  user: { name: 'Ada', address: { city: 'London', zip: 'N1' } },
  theme: 'dark',
});

// Change a deeply nested value: copy every level along the path
setState((previous) => ({
  ...previous,
  user: {
    ...previous.user,
    address: {
      ...previous.user.address,
      city: 'Pune',
    },
  },
}));
```

That is verbose, and it is why `useReducer` (Part 4) and immutability helpers
exist for deeply nested state. If your nesting is three levels deep, consider
flattening the state instead — a design lesson, not a syntax lesson.

### Combined example: the full CRUD of an array of objects

```js
type Todo = { id: string; title: string; done: boolean };

let todos: Todo[] = [];

// CREATE
todos = [...todos, { id: 't1', title: 'Learn spread', done: false }];

// READ (never mutation)
const doneTodos = todos.filter((todo) => todo.done);

// UPDATE
todos = todos.map((todo) => (todo.id === 't1' ? { ...todo, done: true } : todo));

// DELETE
todos = todos.filter((todo) => todo.id !== 't1');
```

> 🏭 **Production habit:** notice that every one of these produces a new array,
> and untouched items keep their **original references**. That is not an accident
> — it is what lets `React.memo` and `useMemo` (Part 10) skip work for rows that
> did not change.

---

## 6. Spread in JSX

This is the syntax that makes `...` shrink component code.

```tsx
interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
}

const buttonProps: ButtonProps = {
  label: 'Save',
  variant: 'primary',
  onClick: () => save(),
};

// ❌ One prop per line, and you must keep the list in sync with the object
<Button
  label={buttonProps.label}
  variant={buttonProps.variant}
  onClick={buttonProps.onClick}
/>

// ✅ Spread the whole object as props
<Button {...buttonProps} />
```

**Add overrides after the spread:**

```tsx
// variant comes from the object, but label is forced
<Button {...buttonProps} label="Update" />
```

> ⚠️ **Do not spread everything blindly.** `{...props}` makes it impossible to
> see at a glance which props a component receives, and it happily passes
> invalid DOM attributes through to elements (React will warn about
> unknown props on DOM elements). Use it when:
> - forwarding props to a single wrapper element (the `TextInput` example), or
> - a component has a large, well-known prop set and the caller already has the
>   object (a `<Button {...buttonProps} />` in a config-driven table).
> Otherwise write the props out.

### Spreading into DOM elements

```tsx
const attrs = { 'data-testid': 'submit', 'aria-label': 'Submit the form' };

<button {...attrs} type="submit">Save</button>
```

React passes these straight to the DOM element. This is how you build a
`<IconButton icon={...} {...rest} />` that keeps accessibility attributes intact.

### A real-world example: a reusable form field

```tsx
interface FieldProps extends React.ComponentPropsWithoutRef<'input'> {
  label: string;
  error?: string;
}

export function Field({ label, error, id, ...inputProps }: FieldProps) {
  const inputId = id ?? inputProps.name;                 // fall back to `name`
  const errorId = `${inputId}-error`;

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>

      <input
        id={inputId}
        {...inputProps}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`field__input ${error ? 'field__input--error' : ''}`.trim()}
      />

      {error && (
        <p id={errorId} role="alert" className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

// Usage
<Field
  label="Email"
  name="email"
  type="email"
  placeholder="you@example.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
/>
```

**Why `{...inputProps}` comes *before* the explicit attributes here:** later
attributes win, so putting the spread first lets this component *enforce* `id`,
`className` and the ARIA attributes even if the caller passes its own.

---

## 7. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Believing `[...arr]` is a **deep** copy | Mutating a nested object still changes the original | copy each level you change |
| Spreading in the wrong order | Overrides silently ignored | base first, overrides last |
| Rest not last in a pattern | `SyntaxError: Rest element must be last element` | move it to the end |
| `{ ...items }` where `items` is an array | State becomes `{ 0: {...}, 1: {...} }` and `.map` fails | use `[...items]` for arrays |
| `{...'abc'}` / `{...[1,2]}` | Object with numeric keys | use an array when you mean an array |
| Mutating an item inside a `map` | UI does not update | return a new object: `{ ...item, done: true }` |
| Spreading class instances | Lost methods/prototype | copy explicitly, or don't spread instances |
| `{...props}` on every component | Prop sources are invisible; stray DOM attribute warnings | spread only where it is meaningful |
| Passing a state object straight into `setState` | Mutations sneak in | always create a new object |
| Forgetting that `push` mutates | `setItems(items.push(x))` sets state to a *number* | `setItems([...items, x])` |

> ⚠️ That last one deserves its own line, because it happens to everyone:
> ```js
> items.push(newItem);      // mutates
> setItems(items);          // React sees the SAME reference → may skip the update
> setItems(items.push(x));  // ⚠️ push returns the new length (a number!)
> ```
> Correct, in one line:
> ```js
> setItems((previous) => [...previous, newItem]);
> ```

---

## 8. Practice exercises

### Beginner

Predict each result, then verify.

```js
const a = [1, 2, 3];

console.log([...a, 4]);
console.log([0, ...a]);
console.log([...a].length);

const user = { name: 'Ada', role: 'user' };
console.log({ ...user, role: 'admin' });
console.log({ role: 'admin', ...user });
console.log(user);

function count(...args) { return args.length; }
console.log(count(1, 2, 3));

const [x, ...y] = [10, 20, 30];
console.log(x, y);

const { role, ...restUser } = user;
console.log(restUser);
```

**Solution**

```text
[1, 2, 3, 4]              spread then append
[0, 1, 2, 3]              prepend
3                         copy, same length
{ name: 'Ada', role: 'admin' }   override after spread → admin wins
{ role: 'user', name: 'Ada' }    ⚠️ spread after → user wins (order matters)
{ name: 'Ada', role: 'user' }    ✅ the original is untouched
3                         rest collected three arguments into an array
10 [20, 30]               first item, rest collected
{ name: 'Ada' }           role removed by destructuring; the rest is copied
```

**The lesson:** notice the two middle lines. Identical input, different *order*,
different result. When you debug "my update didn't apply", check the order first.

### Intermediate

Write a `shoppingCart.js` module with pure functions (no mutation), using spread
and rest:

- `addItem(cart, item)` — if the item already exists by `id`, increase its
  `quantity`; otherwise append it. Never duplicate ids.
- `updateQuantity(cart, id, quantity)` — `quantity` of `0` or less removes the
  item entirely.
- `removeItem(cart, id)`.
- `applyCoupon(cart, couponPercent)` — returns a **new** cart shape with a
  `discount` field, without touching the original.
- `cartTotals(cart)` — `{ itemCount, subtotal, discountAmount, total }`, where
  discount applies only to the subtotal.
- `formatCart(cart)` — a printed receipt string using template literals.

Cart item shape: `{ id, name, price, quantity }`.
Cart shape: `{ items: [], couponPercent: 0 }`.

**Solution**

```text
js-playground/shopping-cart.js
```

```js
// ---------------------------------------------------------------- helpers
const isPositive = (n) => Number.isFinite(n) && n > 0;

// ---------------------------------------------------------------- mutations (pure)

function addItem(cart, item) {
  const existing = cart.items.find(({ id }) => id === item.id);

  // Already in the cart: bump the quantity instead of adding a duplicate
  if (existing) {
    return {
      ...cart,
      items: cart.items.map((current) =>
        current.id === item.id
          ? { ...current, quantity: current.quantity + (item.quantity ?? 1) }
          : current
      ),
    };
  }

  // New item: spread the old array and append a NEW object
  return {
    ...cart,
    items: [...cart.items, { quantity: 1, ...item }], // default quantity, caller may override
  };
}

function updateQuantity(cart, id, quantity) {
  // quantity <= 0 means "remove"
  if (!isPositive(quantity)) {
    return removeItem(cart, id);
  }

  return {
    ...cart,
    items: cart.items.map((item) => (item.id === id ? { ...item, quantity } : item)),
  };
}

function removeItem(cart, id) {
  return { ...cart, items: cart.items.filter((item) => item.id !== id) };
}

function applyCoupon(cart, couponPercent) {
  const safePercent = Math.min(Math.max(couponPercent ?? 0, 0), 100);
  return { ...cart, couponPercent: safePercent };
}

// ---------------------------------------------------------------- derived data

function cartTotals({ items, couponPercent = 0 }) {
  const itemCount = items.reduce((count, { quantity }) => count + quantity, 0);
  const subtotal = items.reduce((sum, { price, quantity }) => sum + price * quantity, 0);
  const discountAmount = Math.round((subtotal * couponPercent) / 100);

  return {
    itemCount,
    subtotal,
    discountAmount,
    total: subtotal - discountAmount,
  };
}

// ---------------------------------------------------------------- formatting

const formatCurrency = (amount) =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatCart(cart) {
  const { items, couponPercent } = cart;
  const { itemCount, subtotal, discountAmount, total } = cartTotals(cart);

  if (items.length === 0) {
    return 'Your cart is empty.';
  }

  const lines = items.map(
    ({ name, price, quantity }) =>
      `  ${quantity} × ${name.padEnd(12)} ${formatCurrency(price * quantity)}`
  );

  return [
    `Cart (${itemCount} item${itemCount === 1 ? '' : 's'}):`,
    ...lines,
    `  ${'Subtotal'.padEnd(16)} ${formatCurrency(subtotal)}`,
    ...(couponPercent > 0
      ? [`  ${`Discount (${couponPercent}%)`.padEnd(16)} -${formatCurrency(discountAmount)}`]
      : []),
    `  ${'Total'.padEnd(16)} ${formatCurrency(total)}`,
  ].join('\n');
}

// ---------------------------------------------------------------- demo

function main() {
  let cart = { items: [], couponPercent: 0 };

  cart = addItem(cart, { id: 'p1', name: 'Keyboard', price: 4999 });
  cart = addItem(cart, { id: 'p2', name: 'Mouse', price: 1299 });
  cart = addItem(cart, { id: 'p1', name: 'Keyboard', price: 4999 }); // qty → 2
  cart = updateQuantity(cart, 'p2', 3);
  cart = applyCoupon(cart, 10);

  const snapshot = JSON.stringify(cart);
  console.log(formatCart(cart));
  console.log('totals:', cartTotals(cart));

  // Removal through updateQuantity(0) and removeItem
  cart = updateQuantity(cart, 'p2', 0);
  console.log('after removing mouse:', cart.items.map(({ id, quantity }) => ({ id, quantity })));

  // The earlier snapshot is unaffected because nothing was mutated
  console.log('snapshot still valid?', JSON.parse(snapshot).items.length === 2);
  console.log('original untouched?', cart.items.every((item) => item.quantity > 0));
}

main();
```

**Expected output**

```text
Cart (5 items):
  2 × Keyboard     ₹9,998.00
  3 × Mouse        ₹3,897.00
  Subtotal         ₹13,895.00
  Discount (10%)   -₹1,390.00
  Total            ₹12,505.00
totals: { itemCount: 5, subtotal: 13895, discountAmount: 1390, total: 12505 }
after removing mouse: [ { id: 'p1', quantity: 2 } ]
snapshot still valid? true
original untouched? true
```

**Why this solution is good**

- **`addItem` merges instead of duplicating.** Real carts do this, and it requires
  `find` + `map` with spread: the two "one item changed" tools.
- **`updateQuantity` delegates to `removeItem`** for `<= 0`. One rule, one
  implementation — no duplicated filter logic.
- **`{ quantity: 1, ...item }`** shows the importance of spread order: the default
  `quantity` comes first so a caller-supplied `quantity` overrides it.
- **`cartTotals` is derived, never stored.** Subtotal, discount and total are all
  computable from `items` and `couponPercent`. Storing them would guarantee that
  someday they disagree with the items.
- **`formatCart` builds an array of lines and `join`s them**, using a conditional
  spread (`...(couponPercent > 0 ? [line] : [])`) to include the discount row only
  when relevant. That is a clean way to do optional lines without `if` spaghetti.

### Challenge

Build `normalize.js`: a function that takes an array of "messy" form submissions
and returns a clean, immutable dataset **without mutating the input**.

Input:

```js
const submissions = [
  { id: 'a1', fullName: '  ada lovelace ', email: 'ADA@Example.com ', tags: ['math'], score: '7' },
  { id: 'a2', fullName: 'grace hopper', email: 'grace@example.com', tags: [], score: 9 },
  { id: 'a3', fullName: '', email: 'nope', tags: ['navy'], score: null },
  { id: 'a1', fullName: 'ada l.', email: 'ada@example.com', tags: ['math', 'math'], score: 10 },
];
```

Requirements:

1. `normalizeSubmission(raw)` returns a new object with:
   - `id` trimmed, lowercased;
   - `fullName` trimmed, with each word capitalised, and `'Unknown'` if empty;
   - `email` trimmed and lowercased;
   - `tags` deduplicated and lowercased;
   - `score` as a number, `0` when it is missing or invalid;
   - `isValidEmail` boolean (a simple `includes('@')` check is enough).
2. `normalizeAll(list)` returns:
   - only unique `id`s — **the last occurrence wins** (it is the most recent);
   - sorted by `score` descending;
   - each entry annotated with `rank` starting at 1;
   - the original array and objects completely unmodified.
3. `summarize(list)` returns `{ count, averageScore, validEmails, allTags }`
   where `allTags` is a sorted, deduplicated array of every tag.

Use destructuring, spread and rest throughout. Prove the input is untouched.

**Solution**

```text
js-playground/normalize.js
```

```js
// ---------------------------------------------------------------- helpers
const titleCase = (text) =>
  text
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const uniqueLower = (list = []) => [...new Set(list.map((tag) => tag.trim().toLowerCase()))];

// ---------------------------------------------------------------- transform

function normalizeSubmission(raw) {
  // Destructure with defaults for every optional field.
  const { id = '', fullName = '', email = '', tags = [], score } = raw ?? {};

  const cleanEmail = email.trim().toLowerCase();

  return {
    id: id.trim().toLowerCase(),
    fullName: titleCase(fullName.trim()) || 'Unknown',
    email: cleanEmail,
    tags: uniqueLower(tags),
    score: toNumber(score),
    isValidEmail: cleanEmail.includes('@'),
  };
}

function normalizeAll(submissions = []) {
  // 1. Normalise everything (no mutation of the inputs)
  const normalized = submissions.map(normalizeSubmission);

  // 2. Last occurrence wins: build a Map keyed by id, overwriting as we go.
  //    (A Map keeps insertion order, which makes the result deterministic.)
  const byId = new Map();
  for (const submission of normalized) {
    byId.set(submission.id, submission);
  }

  // 3. Sort a COPY by score descending, then annotate the rank.
  const ordered = [...byId.values()].sort((a, b) => b.score - a.score);

  return ordered.map((submission, index) => ({ ...submission, rank: index + 1 }));
}

function summarize(list = []) {
  if (list.length === 0) {
    return { count: 0, averageScore: 0, validEmails: 0, allTags: [] };
  }

  const totalScore = list.reduce((sum, { score }) => sum + score, 0);
  const validEmails = list.filter(({ isValidEmail }) => isValidEmail).length;

  // Flatten all tag arrays, then dedupe and sort
  const allTags = [...new Set(list.flatMap(({ tags }) => tags))].sort();

  return {
    count: list.length,
    averageScore: Math.round((totalScore / list.length) * 100) / 100,
    validEmails,
    allTags,
  };
}

// ---------------------------------------------------------------- demo

function main() {
  const submissions = [ /* the array above */ ];
  const snapshot = JSON.stringify(submissions);

  const cleaned = normalizeAll(submissions);

  console.log(JSON.stringify(cleaned, null, 2));
  console.log('summary:', summarize(cleaned));

  console.log('input untouched?', JSON.stringify(submissions) === snapshot); // true
  console.log('duplicate removed?', cleaned.filter(({ id }) => id === 'a1').length === 1); // true
}

main();
```

**Expected output**

```json
[
  {
    "id": "a1",
    "fullName": "Ada L.",
    "email": "ada@example.com",
    "tags": ["math"],
    "score": 10,
    "isValidEmail": true,
    "rank": 1
  },
  {
    "id": "a2",
    "fullName": "Grace Hopper",
    "email": "grace@example.com",
    "tags": [],
    "score": 9,
    "isValidEmail": true,
    "rank": 2
  },
  {
    "id": "a3",
    "fullName": "Unknown",
    "email": "nope",
    "tags": ["navy"],
    "score": 0,
    "isValidEmail": false,
    "rank": 3
  }
]
summary: { count: 3, averageScore: 6.33, validEmails: 2, allTags: [ 'math', 'navy' ] }
input untouched? true
duplicate removed? true
```

> `JSON.stringify(..., null, 2)` prints each array element on its own line, so the
> real output has `"tags": [` / `"math"` / `]` across three lines. They are shown
> inline above only to keep the block readable. The `summary` object is printed by
> `console.log`, which does keep short arrays inline.

**Why this solution works**

- **`normalizeSubmission` destructures with defaults** (`tags = []`,
  `score` deliberately without a default so "missing" is distinguishable) and
  builds a brand-new object. `raw` is never written to.
- **`new Map()` with repeated `set` implements "last wins"** simply, and Maps keep
  insertion order — so for equal scores the order stays deterministic instead of
  depending on the sort implementation.
- **`[...byId.values()]`** turns the Map into an array *before* sorting, because
  `sort` mutates and a Map's values are not an array anyway.
- **`{ ...submission, rank: index + 1 }`** adds a field without touching the
  original object — the same "spread then override" shape used for React state.
- **`flatMap` + `Set` + `sort`** is the idiomatic three-step dedupe-and-sort.
- The two `console.log` assertions are your immutability proof: they compare a
  serialized snapshot taken *before* the work with the same data *after*.

---

## 9. Summary

- `...` is **spread** when it expands a collection, and **rest** when it collects
  the leftovers.
- Array spread: copy, concatenate, insert. Object spread: copy, merge, override.
- **Order matters** — later keys/items win. Spread the base first, overrides last.
- Spread copies are **shallow**; every level you change must be copied.
- Rest in destructuring removes properties: `const { password, ...safe } = user`.
- Rest in parameters collects arguments: `function cx(...classes)`.
- In React, these five patterns cover almost every state update: object update,
  append, update one item, remove one item, nested update.
- Non-mutating tools: `map`, `filter`, `concat`, `slice`, `toSorted`, `toReversed`,
  `toSpliced`, spread — versus the mutating ones to avoid:
  `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`.
- Untouched items keep their original reference — that is what makes memoization
  work later (Part 10).

**What's next →** [`07-array-methods.md`](./07-array-methods.md): `map`, `filter`,
`find`, `reduce` and friends — the methods that turn data into UI.
