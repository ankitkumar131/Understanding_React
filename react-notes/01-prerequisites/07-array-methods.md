# 07 — Array Methods (`map`, `filter`, `find`, `reduce`, …)

> **Part 1 · Prerequisites · File 7 of 11**
>
> **Why this file exists:** in React, you will essentially never write a `for`
> loop. Lists become UIs through `map`. Derived values come from `filter`,
> `reduce` and `find`. This file teaches those methods until they are automatic,
> because every list, table, dropdown and dashboard you build depends on them.

---

## 1. Three ways to iterate, and when each is right

```js
const numbers = [1, 2, 3, 4];

// 1. for...of — when you want to DO something for each item (side effects)
for (const n of numbers) {
  console.log(n);
}

// 2. forEach — the same thing, as a method (still side effects)
numbers.forEach((n) => {
  console.log(n);
});

// 3. map — when you want to TRANSFORM the array into a new array
const doubled = numbers.map((n) => n * 2); // [2, 4, 6, 8]
```

The decision rule:

| I want to… | Use | Returns |
| --- | --- | --- |
| run code for each item (log, save, send) | `for...of` or `forEach` | `undefined` (forEach) |
| transform each item | **`map`** | a new array of the same length |
| keep only some items | **`filter`** | a new array, same or shorter |
| find one item | **`find`** | the item, or `undefined` |
| find one item's position | `findIndex` | the index, or `-1` |
| check a condition across items | `some` / `every` / `includes` | `true` / `false` |
| boil the array down to one value | **`reduce`** | anything you want |
| sort / reverse without mutating | `toSorted` / `toReversed` | a new array |

> 🔍 **Why React code has no loops:** JSX expects *values*. You cannot put a `for`
> loop inside `{ }` in JSX — it is a statement, not an expression. But `map`
> **returns** an array of elements, which React knows how to render. That single
> fact is why `map` is the most-used method in every React codebase.

**The callback signature** (true for `map`, `filter`, `forEach`, `find`, `some`,
`every`, `findIndex`):

```js
array.method((element, index, wholeArray) => { /* ... */ });
```

- `element` — the current item (name it meaningfully: `todo`, `user`, `product`)
- `index` — its position (use it only when you really need it — see keys in
  section 6)
- `wholeArray` — the array being iterated (rarely needed)

---

## 2. `map` — transform every item

`map` returns a **new array of exactly the same length**, where each element is
whatever your callback returned.

```js
const prices = [100, 250, 400];

const withTax = prices.map((price) => Math.round(price * 1.18));
console.log(withTax);  // [118, 295, 472]
console.log(prices);   // [100, 250, 400] ✅ unchanged

const users = [
  { first: 'Ada', last: 'Lovelace' },
  { first: 'Grace', last: 'Hopper' },
];

const fullNames = users.map(({ first, last }) => `${first} ${last}`);
console.log(fullNames); // ['Ada Lovelace', 'Grace Hopper']

// With the index (rare — but useful for numbering)
const numbered = users.map((user, index) => `${index + 1}. ${user.first}`);
console.log(numbered); // ['1. Ada', '2. Grace']
```

### `map` is the list-rendering tool

```tsx
const products = [
  { id: 'p1', name: 'Keyboard', price: 4999 },
  { id: 'p2', name: 'Mouse', price: 1299 },
];

function ProductList() {
  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>
          {product.name} — ₹{product.price.toLocaleString('en-IN')}
        </li>
      ))}
    </ul>
  );
}

// Renders:
// <ul>
//   <li>Keyboard — ₹4,999</li>
//   <li>Mouse — ₹1,299</li>
// </ul>
```

Read that JSX carefully: `{products.map(...)}` is a JavaScript expression that
produces an **array of `<li>` elements**, and React renders arrays of elements by
placing them side by side. Part 3 explains `key`; for now, know that it must be a
**stable, unique identifier** (an id, not an index) and that omitting it produces
a console warning.

### Common `map` mistakes

```js
// ❌ Forgetting to return (braces without return → array of undefined)
[1, 2, 3].map((n) => {
  n * 2;                  // no return!
});                       // [undefined, undefined, undefined]

// ✅ Either add return…
[1, 2, 3].map((n) => {
  return n * 2;
});

// ✅ …or use the concise body
[1, 2, 3].map((n) => n * 2);

// ❌ Returning JSX with braces and forgetting the return (very common in React)
// {items.map((item) => { <li>{item.name}</li> })}   // renders nothing

// ✅ Concise arrow returns the JSX
// {items.map((item) => <li key={item.id}>{item.name}</li>)}
```

> 💡 **Rule of thumb:** in JSX, if you open a `{` after `=>`, you must write
> `return` before the JSX. The parenthesised concise form
> `(item) => ( <li>…</li> )` avoids the problem entirely, which is why you see it
> in almost every React codebase.

### `map` does not skip holes, and it always keeps the length

```js
[1, 2, 3].map((n) => (n > 1 ? n : null)); // [null, 2, 3] — still length 3
```

If you want a shorter array, that is `filter`'s job. `map` + `filter` chained is
the standard "clean then transform" pattern:

```js
const visible = products.filter((p) => p.price < 5000).map((p) => p.name);
```

---

## 3. `filter` — keep some items

`filter` returns a **new array containing only the items for which the callback
returned a truthy value**.

```js
const numbers = [1, 2, 3, 4, 5, 6];
const even = numbers.filter((n) => n % 2 === 0); // [2, 4, 6]
const greaterThanThree = numbers.filter((n) => n > 3); // [4, 5, 6]

const products = [
  { id: 'p1', name: 'Keyboard', price: 4999, inStock: true },
  { id: 'p2', name: 'Mouse', price: 1299, inStock: false },
  { id: 'p3', name: 'Monitor', price: 18999, inStock: true },
];

const inStock = products.filter(({ inStock }) => inStock);
const affordable = products.filter(({ price }) => price < 5000);
const both = products.filter(({ inStock, price }) => inStock && price < 5000);
console.log(both.map(({ name }) => name)); // ['Keyboard']

// Case-insensitive search — the most common real-world filter
const query = 'KEy';
const matches = products.filter(({ name }) => name.toLowerCase().includes(query.toLowerCase()));
```

### Truthiness traps in `filter`

```js
const values = [0, 1, '', 'text', null, undefined, false, [], {}, NaN];

values.filter(Boolean);          // [1, 'text', [], {}] — removes ALL falsy values
values.filter((v) => v != null); // [0, 1, '', 'text', false, [], {}, NaN] — removes only null/undefined
```

`filter(Boolean)` is a neat idiom, but be careful: it also removes valid `0` and
`''` values. If `0` is meaningful (a price, a count), use the explicit check.

### Removing one item (the "delete" operation)

```js
const remaining = products.filter(({ id }) => id !== 'p2');
console.log(remaining.map(({ id }) => id)); // ['p1', 'p3']
```

That one-liner is how you delete a row in every React list you will ever build.

---

## 4. `find`, `findIndex`, `includes`, `some`, `every`

```js
const users = [
  { id: 1, name: 'Ada', role: 'admin' },
  { id: 2, name: 'Grace', role: 'user' },
  { id: 3, name: 'Alan', role: 'user' },
];

// find: the first matching ITEM (or undefined)
const grace = users.find(({ name }) => name === 'Grace');
console.log(grace);            // { id: 2, name: 'Grace', role: 'user' }
console.log(grace?.id);        // 2  ← ?. because find may return undefined

const nobody = users.find(({ id }) => id === 99);
console.log(nobody);           // undefined
console.log(nobody?.name);     // undefined (no crash)

// findIndex: the position (or -1)
console.log(users.findIndex(({ id }) => id === 3)); // 2
console.log(users.findIndex(({ id }) => id === 9)); // -1

// includes: is this primitive in the array?
console.log([1, 2, 3].includes(2));           // true
console.log(['a', 'b'].includes('c'));        // false
// ⚠️ includes compares by reference for objects, so it will NOT find an equal-but-different object
console.log(users.includes({ id: 1, name: 'Ada', role: 'admin' })); // false

// some: did ANY item pass?
console.log(users.some(({ role }) => role === 'admin'));  // true
console.log(users.some(({ name }) => name === 'Zed'));    // false

// every: did ALL items pass?
console.log(users.every(({ role }) => role === 'user'));  // false
console.log(users.every(({ id }) => id > 0));             // true

// Empty arrays are special: some → false, every → true (vacuously)
console.log([].some(() => true));   // false
console.log([].every(() => false)); // true  ⚠️ surprising but mathematically consistent
```

**React uses for each:**

```tsx
// find: load the item for a detail page from a list already in memory
const product = products.find(({ id }) => id === productId);
if (!product) return <NotFound />;

// findIndex: you need the position (e.g. to insert next to it)
const index = todos.findIndex(({ id }) => id === draggedId);

// some: is any field dirty? should the Save button be enabled?
const hasErrors = fields.some((field) => field.error !== null);

// every: is the form complete?
const isComplete = fields.every((field) => field.value !== '');

// includes: has this tag been selected already?
const isSelected = selectedTags.includes(tag);
```

---

## 5. `reduce` — boil an array down to one value

`reduce` is the least obvious and the most powerful. Its signature:

```js
array.reduce((accumulator, currentValue, index, array) => { /* return new accumulator */ }, initialValue);
```

Think of it as a loop with a "running total" that can be **any type** — a number,
a string, an object, even another array.

```js
const numbers = [1, 2, 3, 4];

// Sum
const sum = numbers.reduce((total, n) => total + n, 0); // 10

// Product
const product = numbers.reduce((acc, n) => acc * n, 1); // 24

// Max
const max = numbers.reduce((acc, n) => Math.max(acc, n), -Infinity); // 4

// Build a string
const sentence = ['React', 'is', 'fun'].reduce((acc, word) => `${acc} ${word}`, '').trim();
console.log(sentence); // "React is fun"
```

> ⚠️ **Always pass an initial value.** Without it, `reduce` uses the first element
> as the accumulator and starts from the second — which silently breaks on empty
> arrays (`TypeError: Reduce of empty array with no initial value`) and produces
> surprising types.

### `reduce` into an object (the killer use case)

```js
const todos = [
  { id: 1, title: 'Learn reduce', done: true },
  { id: 2, title: 'Build app', done: false },
  { id: 3, title: 'Ship it', done: false },
];

// Count by status
const stats = todos.reduce(
  (acc, { done }) => {
    const key = done ? 'done' : 'active';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  },
  { done: 0, active: 0 }
);
console.log(stats); // { done: 1, active: 2 }

// Group items by a field — one of the most useful transformations there is
const products = [
  { id: 'p1', name: 'Keyboard', category: 'input' },
  { id: 'p2', name: 'Mouse', category: 'input' },
  { id: 'p3', name: 'Monitor', category: 'display' },
];

const byCategory = products.reduce((acc, product) => {
  const { category } = product;
  acc[category] = [...(acc[category] ?? []), product];
  return acc;
}, {});

console.log(byCategory);
// { input: [Keyboard, Mouse], display: [Monitor] }

// Index by id — an O(1) lookup table instead of repeated find() calls
const byId = products.reduce((acc, product) => {
  acc[product.id] = product;
  return acc;
}, {});
console.log(byId.p2.name); // "Mouse"
```

> 🏭 **Why `byId` matters:** if a list component needs to look up items by id
> inside a loop, `find` inside `map` makes it O(n²). Building a lookup object once
> makes it O(n). You will use this in Part 10 when optimizing.
> Modern alternative: `Object.fromEntries(products.map((p) => [p.id, p]))`.

### Other `reduce` patterns you will actually need

```js
// Sum a computed value (cart total)
const cart = [
  { price: 4999, quantity: 2 },
  { price: 1299, quantity: 3 },
];
const total = cart.reduce((sum, { price, quantity }) => sum + price * quantity, 0);
console.log(total); // 13895

// Flatten an array of arrays (or use flat())
const nested = [[1, 2], [3], [4, 5]];
const flat = nested.reduce((acc, arr) => [...acc, ...arr], []); // [1,2,3,4,5]
const flat2 = nested.flat();                                    // [1,2,3,4,5] ✅ simpler

// Deduplicate by a key (keep the first)
const seen = new Set();
const unique = products.reduce((acc, product) => {
  if (seen.has(product.id)) return acc;
  seen.add(product.id);
  return [...acc, product];
}, []);
```

---

## 6. Sorting, reversing and slicing without mutating

```js
const scores = [40, 100, 1, 5, 25, 10];

// ❌ sort mutates AND compares as strings by default
const bad = [...scores].sort();
console.log(bad);    // [1, 10, 100, 25, 40, 5]  😖
console.log(scores); // unchanged here only because we copied first

// ✅ numeric ascending
const ascending = [...scores].sort((a, b) => a - b);
console.log(ascending); // [1, 5, 10, 25, 40, 100]

// ✅ numeric descending
const descending = [...scores].sort((a, b) => b - a);
console.log(descending); // [100, 40, 25, 10, 5, 1]

// ✅ Strings: use localeCompare for correct alphabetical order in any language
const names = ['Zoe', 'adam', 'Álvaro', 'bob'];
console.log([...names].sort((a, b) => a.localeCompare(b)));
// ['adam', 'bob', 'Zoe', 'Álvaro'] — locale-aware, case-insensitive-ish

// The modern non-mutating versions (ES2023; supported in current browsers/Node 20+)
const sortedCopy = scores.toSorted((a, b) => a - b);
const reversedCopy = scores.toReversed();
const removed = scores.toSpliced(1, 2); // remove 2 items starting at index 1
console.log(scores);  // [40, 100, 1, 5, 25, 10] ✅ untouched
console.log(removed); // [40, 5, 25, 10]
```

**Sorting objects:**

```js
const users = [
  { name: 'Grace', age: 45 },
  { name: 'Ada', age: 36 },
  { name: 'Alan', age: 41 },
];

const byAge = [...users].sort((a, b) => a.age - b.age);
const byName = [...users].sort((a, b) => a.name.localeCompare(b.name));
console.log(byAge.map(({ name }) => name));  // ['Ada', 'Alan', 'Grace']
console.log(byName.map(({ name }) => name)); // ['Ada', 'Alan', 'Grace']
```

**Multi-key sorting** (sort by priority, then by title):

```js
const PRIORITY = { high: 0, normal: 1, low: 2 };

const sortTodos = (todos, by = 'priority') => {
  const copy = [...todos];

  switch (by) {
    case 'priority':
      return copy.sort(
        (a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.title.localeCompare(b.title)
      );
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return copy; // 'createdAt' — trust the natural order
  }
};
```

The `|| a.title.localeCompare(b.title)` is the multi-key trick: when the first
comparison returns `0` (a tie), the second decides.

> 🔍 **Why "copy first, then sort" is a hard rule in React:** `sort` mutates the
> array in place. If you call it on state, you mutate state without changing the
> reference — the component may not re-render, and memoized children will not
> notice. `[...todos].sort(...)` or `todos.toSorted(...)` avoids the whole class
> of bug.

### Slicing

```js
const letters = ['a', 'b', 'c', 'd', 'e'];

letters.slice(1, 3);   // ['b', 'c']  — start inclusive, end exclusive
letters.slice(2);      // ['c', 'd', 'e']
letters.slice(-2);     // ['d', 'e']  — from the end
letters.at(-1);        // 'e'         — last item, no maths needed

// Pagination — a real use
const page = 2;
const perPage = 2;
const pageItems = letters.slice((page - 1) * perPage, page * perPage);
console.log(pageItems); // ['c', 'd']
```

---

## 7. `flat`, `flatMap`, `Array.from`, `Object.entries`

```js
// flat: remove nesting
[[1, 2], [3, [4]]].flat();     // [1, 2, 3, [4]]
[[1, 2], [3, [4]]].flat(2);    // [1, 2, 3, 4]
[1, [2, [3, [4]]]].flat(Infinity); // [1, 2, 3, 4]

// flatMap: map then flatten one level — perfect when each item yields 0..n results
const orders = [
  { id: 'o1', items: ['keyboard', 'mouse'] },
  { id: 'o2', items: ['monitor'] },
];
const allItems = orders.flatMap(({ items }) => items); // ['keyboard','mouse','monitor']

// flatMap also lets you DROP items by returning []
const tags = ['react', '', '  ', 'ts'];
const clean = tags.flatMap((tag) => (tag.trim() ? [tag.trim()] : [])); // ['react','ts']

// Array.from: build an array from anything iterable or array-like
Array.from({ length: 5 }, (_, i) => i + 1);   // [1, 2, 3, 4, 5]  — a range
Array.from(new Set([1, 1, 2]));               // [1, 2]
Array.from('abc');                            // ['a','b','c']

// Object.entries: turn an object into an array of [key, value] pairs
const totals = { food: 1200, travel: 800, books: 300 };
Object.entries(totals).map(([category, amount]) => `${category}: ₹${amount}`);
// ['food: ₹1200', 'travel: ₹800', 'books: ₹300']

// React use: rendering an OBJECT as a list (you cannot map an object directly)
function TotalsList({ totals }: { totals: Record<string, number> }) {
  return (
    <ul>
      {Object.entries(totals).map(([category, amount]) => (
        <li key={category}>
          {category}: ₹{amount}
        </li>
      ))}
    </ul>
  );
}
```

> ⚠️ **You cannot call `.map` on an object.** `{ a: 1 }.map(...)` throws
> `TypeError: obj.map is not a function`. Convert with `Object.entries`,
> `Object.keys` or `Object.values` first. This is one of the most common React
> errors for beginners who have an object-shaped state.

---

## 8. Chaining: the real power

Most real transformations are a **chain** of small steps. Each step returns a new
array, so the next method can use it.

```js
const products = [
  { id: 'p1', name: 'Keyboard', price: 4999, category: 'input', inStock: true, rating: 4.6 },
  { id: 'p2', name: 'Mouse', price: 1299, category: 'input', inStock: false, rating: 4.2 },
  { id: 'p3', name: 'Monitor', price: 18999, category: 'display', inStock: true, rating: 4.8 },
  { id: 'p4', name: 'Webcam', price: 3499, category: 'video', inStock: true, rating: 3.9 },
];

const result = products
  .filter(({ inStock }) => inStock)                     // 1. only available ones
  .filter(({ price }) => price <= 5000)                 // 2. affordable
  .map((product) => ({                                  // 3. shape for the UI
    ...product,
    label: `${product.name} (₹${product.price.toLocaleString('en-IN')})`,
    stars: '★'.repeat(Math.round(product.rating)),
  }))
  .sort((a, b) => b.rating - a.rating)                  // 4. best first
  .slice(0, 2);                                         // 5. top two

console.log(result.map(({ label, stars }) => `${label} ${stars}`));
// [
//   'Keyboard (₹4,999) ★★★★★',   ← rating 4.6 rounds to 5 stars, so it comes first
//   'Webcam (₹3,499) ★★★★'       ← rating 3.9 rounds to 4 stars
// ]
```

**How to read a chain:** each line starts from the result of the previous one.
Name the intermediate steps when the chain gets long, or when a step needs a
comment:

```js
const inStockProducts = products.filter(({ inStock }) => inStock);
const affordable = inStockProducts.filter(({ price }) => price <= 5000);
const sortedByRating = [...affordable].sort((a, b) => b.rating - a.rating);
const topTwo = sortedByRating.slice(0, 2);
```

> 💡 **Performance note:** a chain of `filter` + `map` + `sort` walks the array
> several times. For lists of a few thousand items that is irrelevant. For
> hundreds of thousands, a single `reduce` (or a `for` loop) is faster — and you
> would only make that change after measuring (Part 10).

---

## 9. The trap: mutating inside a callback

```js
// ❌ This looks fine and is a classic bug
const results = [];
products.forEach((product) => {
  if (product.inStock) results.push(product.name);
});
```

It works, but:

- it is more code than `filter(...).map(...)`,
- the push mutates an external array (side effect), and
- inside React, it is easy to accidentally mutate the state array itself.

```js
// ✅ Prefer producing a value
const results = products.filter(({ inStock }) => inStock).map(({ name }) => name);
```

**The same trap inside `map`:**

```js
// ❌ Mutating the item while mapping: state is silently corrupted
const next = todos.map((todo) => {
  if (todo.id === id) {
    todo.done = true;      // ⚠️ mutates the original object
  }
  return todo;
});

// ✅ Return a NEW object for the changed item
const next2 = todos.map((todo) => (todo.id === id ? { ...todo, done: true } : todo));
```

> 🏭 **Rule to internalise:** *callbacks passed to `map`/`filter`/`reduce` should
> be pure* — they take a value in and return a value out, touching nothing else.
> React's rendering rules (Part 10) depend on this.

---

## 10. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Braces without `return` in `map` | Array becomes `[undefined, undefined]`; nothing renders | add `return`, or use the concise body |
| Using `map` where `filter` is needed | Array has unchanged items (often `null`s) | `filter` before `map` |
| Using `forEach` for rendering a list | Nothing renders — `forEach` returns `undefined` | `map` |
| `.map` on an object | `TypeError: obj.map is not a function` | `Object.entries(obj).map(...)` |
| Forgetting `key` in JSX lists | Console warning; wrong rows update when the list changes | `key={item.id}` |
| Using the index as a key for reorderable lists | State visually sticks to the wrong item; input text jumps | use a stable id |
| `sort()` without a comparator | `[1, 10, 100, 25]` — string ordering | `.sort((a, b) => a - b)` |
| `sort()` on state directly | Mutates state; UI may not update | `[...arr].sort(...)` or `.toSorted(...)` |
| `reduce` without an initial value | Throws on empty arrays; wrong results | always pass the initial value |
| `find` result used without checking | `Cannot read properties of undefined` | `?.` or an early return |
| `filter(Boolean)` on data with `0`/`''` | Valid values disappear | explicit comparison |
| Chaining `find` inside `map` over a large list | Slow (O(n²)) | build a `byId` lookup once |

---

## 11. Practice exercises

### Beginner

Given:

```js
const numbers = [12, 5, 8, 130, 44, 3];
const words = ['banana', 'apple', 'cherry', 'date'];
```

Write one-liners that produce:

1. Each number doubled.
2. Only numbers greater than 10.
3. The sum of all numbers.
4. The largest number.
5. Words sorted alphabetically.
6. Words sorted by length, shortest first.
7. `true`/`false`: are all numbers positive?
8. The first word longer than 5 characters.
9. `'APPLE'` from the `words` array (find it, uppercase it).
10. The words joined with `' | '`.

**Solution**

```js
console.log(numbers.map((n) => n * 2));                     // [24, 10, 16, 260, 88, 6]
console.log(numbers.filter((n) => n > 10));                 // [12, 130, 44]
console.log(numbers.reduce((sum, n) => sum + n, 0));        // 202
console.log(numbers.reduce((max, n) => Math.max(max, n), -Infinity)); // 130
console.log([...words].sort((a, b) => a.localeCompare(b))); // ['apple','banana','cherry','date']
console.log([...words].sort((a, b) => a.length - b.length));// ['date','apple','banana','cherry']
console.log(numbers.every((n) => n > 0));                   // true
console.log(words.find((w) => w.length > 5));               // 'banana'
console.log(words.find((w) => w.startsWith('a'))?.toUpperCase()); // 'APPLE'
console.log(words.join(' | '));                             // 'banana | apple | cherry | date'
```

**Notes**

- `Math.max(...numbers)` would also give `130` and is clearer for that one purpose.
- `[...words].sort(...)` copies first, because `sort` mutates. Since `words` is a
  `const` array, mutation is *allowed* but still a bad habit.
- `words.find(...)?.toUpperCase()` — the `?.` matters because `find` can return
  `undefined` for input you have not memorised.

### Intermediate

Build `analytics.js`: given a list of orders, produce a small dashboard report.
Use `map`, `filter`, `find`, `reduce`, `some`, `every`, `sort` and `flatMap`.

```js
const orders = [
  { id: 'o1', customer: 'Ada', country: 'UK', total: 5998, status: 'paid', items: 2, placedAt: '2026-08-01' },
  { id: 'o2', customer: 'Grace', country: 'US', total: 1299, status: 'refunded', items: 1, placedAt: '2026-08-03' },
  { id: 'o3', customer: 'Ada', country: 'UK', total: 18999, status: 'paid', items: 1, placedAt: '2026-08-10' },
  { id: 'o4', customer: 'Alan', country: 'UK', total: 0, status: 'pending', items: 0, placedAt: '2026-08-12' },
  { id: 'o5', customer: 'Grace', country: 'US', total: 3499, status: 'paid', items: 1, placedAt: '2026-08-15' },
];
```

Implement:

1. `paidOrders(orders)` → only `status === 'paid'`, sorted by `total` descending.
2. `revenueByCountry(orders)` → `{ UK: <sum of paid>, US: <sum of paid> }`.
   Only paid orders count.
3. `topCustomer(orders)` → the customer with the highest paid total
   (return `{ customer, total }` or `null` for an empty list).
4. `averageOrderValue(orders)` → average `total` of paid orders, rounded to 2
   decimals; `0` when there are none.
5. `statusCounts(orders)` → `{ paid: 3, refunded: 1, pending: 1 }`.
6. `hasRefunds(orders)` and `allOrdersHaveItems(orders)` → booleans.
7. `customers(orders)` → sorted, unique list of customer names.
8. `summary(orders)` → an object combining all of the above plus
   `pendingValue` (sum of `total` for pending orders).

Add a `main()` printing each result.

**Solution**

```text
js-playground/analytics.js
```

```js
const isPaid = ({ status }) => status === 'paid';

// 1. filter → copy → sort
const paidOrders = (orders) =>
  orders.filter(isPaid).sort((a, b) => b.total - a.total);

// 2. reduce into an object, only counting paid orders
const revenueByCountry = (orders) =>
  orders.filter(isPaid).reduce((acc, { country, total }) => {
    acc[country] = (acc[country] ?? 0) + total;
    return acc;
  }, {});

// 3. reduce into { customer → total }, then find the maximum
const topCustomer = (orders) => {
  const totals = orders.filter(isPaid).reduce((acc, { customer, total }) => {
    acc[customer] = (acc[customer] ?? 0) + total;
    return acc;
  }, {});

  const entries = Object.entries(totals); // [['Ada', 24997], ['Grace', 3499]]
  if (entries.length === 0) return null;

  // Sort a copy by value (descending) and take the first
  const [customer, total] = [...entries].sort(([, a], [, b]) => b - a)[0];
  return { customer, total };
};

// 4. reduce for the sum, divide by count, round
const averageOrderValue = (orders) => {
  const paid = orders.filter(isPaid);
  if (paid.length === 0) return 0;

  const total = paid.reduce((sum, { total: orderTotal }) => sum + orderTotal, 0);
  return Math.round((total / paid.length) * 100) / 100;
};

// 5. reduce into counts
const statusCounts = (orders) =>
  orders.reduce((acc, { status }) => {
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

// 6. predicates
const hasRefunds = (orders) => orders.some(({ status }) => status === 'refunded');
const allOrdersHaveItems = (orders) => orders.every(({ items }) => items > 0);

// 7. map to names → Set to dedupe → spread → sort
const customers = (orders) => [...new Set(orders.map(({ customer }) => customer))].sort();

// 8. everything together, using computed keys
const summary = (orders) => {
  const pendingValue = orders
    .filter(({ status }) => status === 'pending')
    .reduce((sum, { total }) => sum + total, 0);

  return {
    orderCount: orders.length,
    paidOrders: paidOrders(orders),
    revenueByCountry: revenueByCountry(orders),
    topCustomer: topCustomer(orders),
    averageOrderValue: averageOrderValue(orders),
    statusCounts: statusCounts(orders),
    hasRefunds: hasRefunds(orders),
    allOrdersHaveItems: allOrdersHaveItems(orders),
    customers: customers(orders),
    pendingValue,
  };
};

// ---------------------------------------------------------------- demo

function main() {
  console.log('paid (desc):', paidOrders(orders).map(({ id, total }) => `${id}:${total}`));
  // [ 'o3:18999', 'o1:5998', 'o5:3499' ]

  console.log('revenue by country:', revenueByCountry(orders));
  // { UK: 24997, US: 3499 }

  console.log('top customer:', topCustomer(orders));
  // { customer: 'Ada', total: 24997 }

  console.log('average order value:', averageOrderValue(orders)); // 9498.67
  console.log('status counts:', statusCounts(orders));           // { paid: 3, refunded: 1, pending: 1 }
  console.log('has refunds:', hasRefunds(orders));               // true
  console.log('all have items:', allOrdersHaveItems(orders));    // false (o4 has 0)
  console.log('customers:', customers(orders));                  // [ 'Ada', 'Alan', 'Grace' ]

  console.log('summary:', {
    ...summary(orders),
    paidOrders: summary(orders).paidOrders.length, // keep the log short
  });
}

main();
```

**Expected results**

```text
paid (desc): [ 'o3:18999', 'o1:5998', 'o5:3499' ]
revenue by country: { UK: 24997, US: 3499 }
top customer: { customer: 'Ada', total: 24997 }
average order value: 9498.67
status counts: { paid: 3, refunded: 1, pending: 1 }
has refunds: true
all have items: false
customers: [ 'Ada', 'Alan', 'Grace' ]
summary: {
  orderCount: 5,
  paidOrders: 3,
  revenueByCountry: { UK: 24997, US: 3499 },
  topCustomer: { customer: 'Ada', total: 24997 },
  averageOrderValue: 9498.67,
  statusCounts: { paid: 3, refunded: 1, pending: 1 },
  hasRefunds: true,
  allOrdersHaveItems: false,
  customers: [ 'Ada', 'Alan', 'Grace' ],
  pendingValue: 0
}
```

**Why this solution works**

- **`isPaid` is extracted as a named predicate.** Reused four times, it documents
  intent better than `status === 'paid'` repeated everywhere.
- **`paidOrders` sorts a copy implicitly** — `filter` already returned a new array,
  so sorting it cannot affect the input. (If you had started from the original
  array, you would need `[...orders]`.)
- **`topCustomer` reduces to totals, then sorts entries.** Note `[, a]` in the
  comparator: the entry is `[key, value]`, and we only need the value. Sorting
  `entries` with `a[1] - b[1]` would work too but reads worse.
- **`averageOrderValue` guards the empty case** before dividing — the classic
  divide-by-zero bug in dashboards.
- **`statusCounts` uses a computed key** so new statuses need no code changes.
- **`allOrdersHaveItems` correctly returns `false`** because `o4` has `items: 0` —
  and note that `items: 0` is falsy, so writing `every(({ items }) => items)` would
  also return false here, but it would wrongly fail on any future item where `0`
  meant something else. Explicit comparisons are safer.
- **`pendingValue` is `0`** because the only pending order has `total: 0`.

> 💡 **UI bonus:** in React you would render `Object.entries(revenueByCountry)`
> where the data is an object and `summary.paidOrders.map(...)` where it is an
> array. Array methods compose; objects need converting first.

### Challenge

Build `report.js`: a **text report generator** for a project-management dataset,
using every method from this file. No mutation of the input.

```js
const tasks = [
  { id: 't1', title: 'Design schema', assignee: 'ada', status: 'done', priority: 'high', estimate: 5, spent: 6, labels: ['backend', 'design'] },
  { id: 't2', title: 'Build API', assignee: 'ada', status: 'in-progress', priority: 'high', estimate: 13, spent: 8, labels: ['backend'] },
  { id: 't3', title: 'Write tests', assignee: 'grace', status: 'todo', priority: 'normal', estimate: 8, spent: 0, labels: ['quality'] },
  { id: 't4', title: 'Fix login bug', assignee: 'alan', status: 'in-progress', priority: 'high', estimate: 3, spent: 5, labels: ['bug', 'auth'] },
  { id: 't5', title: 'Docs', assignee: 'grace', status: 'todo', priority: 'low', estimate: 2, spent: 0, labels: ['docs'] },
  { id: 't6', title: 'Review PRs', assignee: 'alan', status: 'done', priority: 'normal', estimate: 4, spent: 4, labels: ['quality'] },
];
```

Requirements — implement each as a small pure function, then a `generateReport()`
that assembles them:

1. `byStatus(tasks)` → `{ todo: [...], 'in-progress': [...], done: [...] }`.
2. `byAssignee(tasks)` → for each assignee: `{ tasks, done, remainingEstimate,
   spent }` — `remainingEstimate` counts only tasks that are **not** done.
3. `allLabels(tasks)` → sorted, deduplicated labels (`flatMap` + `Set`).
4. `overrunning(tasks)` → tasks where `spent > estimate`, sorted by the overrun
   amount descending.
5. `progress(tasks)` → `{ total, done, percentage }` where `percentage` is a whole
   number (`Math.round`).
6. `criticalPath(tasks)` → the highest-priority unfinished tasks, sorted by
   priority then by estimate descending; return the top 3.
7. `estimateAccuracy(tasks)` → `{ estimated, spent, ratio }` over completed tasks
   only; `ratio` rounded to 2 decimals (`0` if nothing is estimated).
8. `formatReport(tasks)` → a printable string such as:

```text
PROJECT REPORT
==============
Progress: 2/6 done (33%)

By assignee:
  ada    2 tasks, 2 done,  13h left, 14h spent
  grace  2 tasks, 0 done,  10h left,  0h spent
  alan   2 tasks, 1 done,   3h left,  9h spent

Labels: auth, backend, bug, design, docs, quality

Overrunning (spent > estimate):
  Fix login bug  (3h → 5h, +2h)

Next up (highest priority):
  1. Build API (high, 13h)
  2. Fix login bug (high, 3h)
  3. Write tests (normal, 8h)
```

Column alignment is expected to differ slightly; the content and the numbers must
be right.

**Solution**

```text
js-playground/report.js
```

```js
// ---------------------------------------------------------------- constants
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

// ---------------------------------------------------------------- selectors

// 1. Group by status using reduce with computed keys
const byStatus = (tasks) =>
  tasks.reduce((acc, task) => {
    const { status } = task;
    acc[status] = [...(acc[status] ?? []), task];
    return acc;
  }, {});

// 2. Group by assignee; accumulate counts and hours in one pass
const byAssignee = (tasks) =>
  tasks.reduce((acc, { assignee, status, estimate, spent }) => {
    const current = acc[assignee] ?? { tasks: 0, done: 0, remainingEstimate: 0, spent: 0 };

    acc[assignee] = {
      ...current,
      tasks: current.tasks + 1,
      done: current.done + (status === 'done' ? 1 : 0),
      remainingEstimate: current.remainingEstimate + (status === 'done' ? 0 : estimate),
      spent: current.spent + spent,
    };
    return acc;
  }, {});

// 3. Every label from every task, deduped and sorted
const allLabels = (tasks) => [...new Set(tasks.flatMap(({ labels }) => labels))].sort();

// 4. Tasks that spent more than estimated, biggest overrun first
const overrunning = (tasks) =>
  tasks
    .filter(({ spent, estimate }) => spent > estimate)
    .map((task) => ({ ...task, overrun: task.spent - task.estimate }))
    .sort((a, b) => b.overrun - a.overrun);

// 5. Simple progress numbers
const progress = (tasks) => {
  const total = tasks.length;
  const done = tasks.filter(({ status }) => status === 'done').length;
  return { total, done, percentage: total === 0 ? 0 : Math.round((done / total) * 100) };
};

// 6. Unfinished tasks, priority first then estimate descending, top 3
const criticalPath = (tasks, limit = 3) =>
  tasks
    .filter(({ status }) => status !== 'done')
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        b.estimate - a.estimate
    )
    .slice(0, limit);

// 7. Estimate accuracy across completed work
const estimateAccuracy = (tasks) => {
  const completed = tasks.filter(({ status }) => status === 'done');
  const estimated = completed.reduce((sum, { estimate }) => sum + estimate, 0);
  const spent = completed.reduce((sum, { spent: hours }) => sum + hours, 0);

  return { estimated, spent, ratio: estimated === 0 ? 0 : Math.round((spent / estimated) * 100) / 100 };
};

// ---------------------------------------------------------------- formatting

const pad = (text, width) => String(text).padEnd(width);
const padStart = (text, width) => String(text).padStart(width);

function formatReport(tasks) {
  const { total, done, percentage } = progress(tasks);
  const assignees = Object.entries(byAssignee(tasks));
  const over = overrunning(tasks);
  const nextUp = criticalPath(tasks);

  const lines = [
    'PROJECT REPORT',
    '==============',
    `Progress: ${done}/${total} done (${percentage}%)`,
    '',
    'By assignee:',
    ...assignees.map(([name, stats]) =>
      `  ${pad(name, 7)}${stats.tasks} tasks, ${stats.done} done, ` +
      `${padStart(`${stats.remainingEstimate}h`, 5)} left, ${padStart(`${stats.spent}h`, 4)} spent`
    ),
    '',
    `Labels: ${allLabels(tasks).join(', ')}`,
    '',
    'Overrunning (spent > estimate):',
    ...(over.length > 0
      ? over.map(
          ({ title, estimate, spent, overrun }) =>
            `  ${pad(title, 16)} (${estimate}h → ${spent}h, +${overrun}h)`
        )
      : ['  none 🎉']),
    '',
    'Next up (highest priority):',
    ...nextUp.map(
      ({ title, priority, estimate }, index) =>
        `  ${index + 1}. ${title} (${priority}, ${estimate}h)`
    ),
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------- demo

function main() {
  const snapshot = JSON.stringify(tasks);
  console.log(formatReport(tasks));

  console.log('\n--- extra checks ---');
  console.log('byStatus keys:', Object.keys(byStatus(tasks)));         // [ 'done', 'in-progress', 'todo' ]
  console.log('accuracy:', estimateAccuracy(tasks));                 // { estimated: 9, spent: 10, ratio: 1.11 }
  console.log('input untouched?', JSON.stringify(tasks) === snapshot); // true
}

main();
```

**Expected report**

```text
PROJECT REPORT
==============
Progress: 2/6 done (33%)

By assignee:
  ada    2 tasks, 1 done,   13h left, 14h spent
  grace  2 tasks, 0 done,   10h left,  0h spent
  alan   2 tasks, 1 done,    3h left,  9h spent

Labels: auth, backend, bug, design, docs, quality

Overrunning (spent > estimate):
  Fix login bug    (3h → 5h, +2h)
  Design schema    (5h → 6h, +1h)

Next up (highest priority):
  1. Build API (high, 13h)
  2. Fix login bug (high, 3h)
  3. Write tests (normal, 8h)
```

Exact spacing will vary with your padding widths; the numbers and the ordering
must be correct.

**Why this solution is good**

- **One pass per question.** Each function answers exactly one question, which
  makes them individually testable (Part 13 tests functions like these).
- **`byAssignee` accumulates four values in one `reduce`** rather than filtering
  the array four times — and it spreads `...current` so it never mutates the
  accumulator's previous value.
- **`overrunning` maps *then* sorts**, adding a derived `overrun` field so the
  comparator is a plain subtraction.
- **`criticalPath` sorts with a multi-key comparator** (`priority`, then
  `estimate`) and slices to 3 — the exact shape of a "top N" feature.
- **`estimateAccuracy` guards division by zero**, the most common maths bug in
  dashboards.
- **The formatter is separate from the data functions.** Deriving numbers and
  presenting them are different jobs; mixing them makes both harder to change.
  This separation is the same principle you will apply to React components:
  compute data in one place, render it in another.

---

## 12. Summary

- `map` transforms (**always** returns an array of the same length) — the
  list-rendering method in React.
- `filter` keeps items; `find` returns the first match or `undefined`;
  `findIndex` returns a position or `-1`.
- `some`/`every`/`includes` answer boolean questions.
- `reduce` turns an array into anything — totals, objects, grouped data. **Always
  pass the initial value.**
- Sorting: always with a comparator for numbers, always on a **copy**
  (`[...arr].sort(...)` or `arr.toSorted(...)`), always `localeCompare` for text.
- `flat`/`flatMap`/`Array.from`/`Object.entries` convert and reshape data.
- Chains are the real power: `filter` → `map` → `sort` → `slice` describes most
  UI data flows.
- Callbacks must be **pure**: no pushing into outer arrays, no mutating items.
- Objects need `Object.entries` (or `.keys`/`.values`) before you can `map` them.
- In JSX, `map` is an expression that returns elements — which is why you never
  write a `for` loop in a component.

**What's next →** [`08-functions.md`](./08-functions.md): functions in depth —
callbacks, closures, scope, `this`, and why React components are just functions.
